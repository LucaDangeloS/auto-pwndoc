module.exports = function(request, app) {
  describe('Team dashboard and audit tasks', () => {
    const mongoose = require('mongoose');
    const bcrypt = require('bcrypt');
    let authorToken, reviewerToken, outsiderToken, adminToken, auditId, reviewerId, taskId;
    const auth = (token, req) => req.set('Cookie', [`token=JWT ${token}`]);

    beforeAll(async () => {
      const User = mongoose.model('User');
      const password = bcrypt.hashSync('Admin123', 10);
      const suffix = Date.now();
      const author = await new User({username: `dashboard-author-${suffix}`, password, firstname: 'Dash', lastname: 'Author', role: 'user'}).save();
      const reviewer = await new User({username: `dashboard-reviewer-${suffix}`, password, firstname: 'Dash', lastname: 'Reviewer', role: 'user'}).save();
      const outsider = await new User({username: `dashboard-outsider-${suffix}`, password, firstname: 'Dash', lastname: 'Outsider', role: 'user'}).save();
      reviewerId = reviewer._id;
      const admin = await User.findOneAndUpdate({username: 'admin'},
        {$set: {password, role: 'admin', enabled: true}, $setOnInsert: {firstname: 'Admin', lastname: 'Tester'}},
        {upsert: true, new: true});
      const login = async username => {
        const response = await request(app).post('/api/users/token').send({username, password: 'Admin123'});
        expect(response.status).toBe(200);
        return response.body.datas.token;
      };
      [authorToken, reviewerToken, outsiderToken, adminToken] = await Promise.all([
        login(author.username), login(reviewer.username), login(outsider.username), login(admin.username)]);
      auditId = (await new (mongoose.model('Audit'))({name: `Dashboard audit ${suffix}`, language: 'en', creator: author._id,
        reviewers: [reviewer._id], findings: [{title: 'Needs review', status: 2}]}).save())._id;
    });

    it('restricts task creation to audit writers and active audit members', async () => {
      const auditList = await auth(authorToken, request(app).get('/api/audits'));
      expect(auditList.status).toBe(200);
      expect(auditList.body.datas.find(audit => audit._id === String(auditId)).reviewers[0]._id).toBe(String(reviewerId));
      const body = {title: 'Check authorization', assignee: reviewerId, dueOn: '2026-12-31'};
      let response = await auth(outsiderToken, request(app).post(`/api/audits/${auditId}/tasks`)).send(body);
      expect(response.status).toBe(404);
      response = await auth(authorToken, request(app).post(`/api/audits/${auditId}/tasks`))
        .send({...body, assignee: new mongoose.Types.ObjectId()});
      expect(response.status).toBe(422);
      response = await auth(authorToken, request(app).post(`/api/audits/${auditId}/tasks`)).send(body);
      expect(response.status).toBe(201);
      taskId = response.body.datas._id;
      expect(response.body.datas.assignee._id).toBe(String(reviewerId));
    });

    it('lets the assignee update status while protecting task fields', async () => {
      let response = await auth(reviewerToken, request(app).put(`/api/audits/${auditId}/tasks/${taskId}`))
        .send({status: 'doing'});
      expect(response.status).toBe(200);
      expect(response.body.datas.status).toBe('doing');
      response = await auth(reviewerToken, request(app).put(`/api/audits/${auditId}/tasks/${taskId}`))
        .send({title: 'Changed', assignee: reviewerId, status: 'done'});
      expect(response.status).toBe(422);
      response = await auth(outsiderToken, request(app).get(`/api/audits/${auditId}/tasks`));
      expect(response.status).toBe(404);
    });

    it('returns only visible work in the dashboard and cleans tasks on audit deletion', async () => {
      let response = await auth(reviewerToken, request(app).get('/api/dashboard'));
      expect(response.status).toBe(200);
      expect(response.body.datas.tasks.map(task => task._id)).toContain(taskId);
      expect(response.body.datas.stats.findingsForReview).toBeGreaterThanOrEqual(1);
      response = await auth(outsiderToken, request(app).get('/api/dashboard'));
      expect(response.status).toBe(200);
      expect(response.body.datas.tasks.map(task => task._id)).not.toContain(taskId);
      expect(response.body.datas.audits.map(audit => audit._id)).not.toContain(String(auditId));
      response = await auth(adminToken, request(app).delete(`/api/audits/${auditId}`));
      expect(response.status).toBe(200);
      expect(await mongoose.model('AuditTask').countDocuments({audit: auditId})).toBe(0);
    });
  });
};
