module.exports = function(request, app) {
  describe('Client overview', () => {
    const mongoose = require('mongoose');
    const bcrypt = require('bcrypt');
    let adminToken;
    let readerToken;
    let companyId;
    let visibleAuditId;
    let hiddenAuditId;

    beforeAll(async () => {
      const User = mongoose.model('User');
      const password = bcrypt.hashSync('Admin123', 10);
      const admin = await User.findOneAndUpdate({username: 'admin'},
        {$set: {password, role: 'admin', enabled: true}, $setOnInsert: {firstname: 'Admin', lastname: 'Tester'}},
        {upsert: true, new: true});
      const reader = await new User({username: `overview-reader-${Date.now()}`, password,
        firstname: 'Overview', lastname: 'Reader', role: 'user'}).save();
      adminToken = (await request(app).post('/api/users/token').send({username: admin.username, password: 'Admin123'})).body.datas.token;
      readerToken = (await request(app).post('/api/users/token').send({username: reader.username, password: 'Admin123'})).body.datas.token;
      const company = await new (mongoose.model('Company'))({name: `Overview client ${Date.now()}`}).save();
      companyId = company._id;
      const Audit = mongoose.model('Audit');
      visibleAuditId = (await new Audit({name: 'Visible work', language: 'en', company: companyId,
        creator: reader._id, findings: [{title: 'Finding', status: 0,
          cvssv3: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H'}]}).save())._id;
      hiddenAuditId = (await new Audit({name: 'Other team work', language: 'en', company: companyId, creator: admin._id}).save())._id;
      await new (mongoose.model('AuditArchive'))({name: 'Historical report', filename: `${Date.now()}-overview.pdf`,
        originalName: 'historical.pdf', size: 12, mimeType: 'application/pdf', company: companyId, uploadedBy: admin._id}).save();
    });
    const as = (token, req) => req.set('Cookie', [`token=JWT ${token}`]);

    it('shows only accessible audits with severity and archive metadata', async () => {
      const response = await as(readerToken, request(app).get(`/api/companies/${companyId}/overview`));
      expect(response.status).toBe(200);
      expect(response.body.datas.company.name).toContain('Overview client');
      expect(response.body.datas.audits.map(a => a._id)).toEqual([String(visibleAuditId)]);
      expect(response.body.datas.audits[0].severity.critical).toBe(1);
      expect(response.body.datas.audits[0].progress.completed).toBe(1);
      expect(response.body.datas.archives).toHaveLength(1);
      expect(response.body.datas.archives[0].name).toBe('Historical report');
    });

    it('allows an admin to see all audits and rejects unknown clients', async () => {
      let response = await as(adminToken, request(app).get(`/api/companies/${companyId}/overview`));
      expect(response.status).toBe(200);
      expect(response.body.datas.audits.map(a => a._id)).toEqual(expect.arrayContaining([String(visibleAuditId), String(hiddenAuditId)]));
      response = await as(readerToken, request(app).get(`/api/companies/${new mongoose.Types.ObjectId()}/overview`));
      expect(response.status).toBe(404);
      response = await as(readerToken, request(app).get('/api/companies/invalid/overview'));
      expect(response.status).toBe(422);
    });
  });
};
