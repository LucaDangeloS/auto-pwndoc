module.exports = function(request, app) {
  describe('Evidence inbox', () => {
    const mongoose = require('mongoose');
    const bcrypt = require('bcrypt');
    let adminToken;
    let authorToken;
    let outsiderToken;
    let auditId;
    let candidateId;
    let fileId;
    const auth = (token, req) => req.set('Cookie', [`token=JWT ${token}`]);

    beforeAll(async () => {
      const User = mongoose.model('User');
      const password = bcrypt.hashSync('Admin123', 10);
      const admin = await User.findOneAndUpdate({username: 'admin'},
        {$set: {password, role: 'admin', enabled: true}, $setOnInsert: {firstname: 'Admin', lastname: 'Tester'}},
        {upsert: true, new: true});
      const author = await new User({username: `evidence-author-${Date.now()}`, password,
        firstname: 'Evidence', lastname: 'Author', role: 'user'}).save();
      const outsider = await new User({username: `evidence-outsider-${Date.now()}`, password,
        firstname: 'Evidence', lastname: 'Outsider', role: 'user'}).save();
      const login = async username => (await request(app).post('/api/users/token')
        .send({username, password: 'Admin123'})).body.datas.token;
      [adminToken, authorToken, outsiderToken] = await Promise.all([
        login(admin.username), login(author.username), login(outsider.username)]);
      auditId = (await new (mongoose.model('Audit'))({name: 'Evidence test audit', language: 'en', creator: author._id}).save())._id;
    });

    it('records provenance, deduplicates external IDs, and protects audit access', async () => {
      const body = {sourceType: 'burp', sourceId: 'issue-1', target: 'https://example.test',
        title: 'Unvalidated input', summary: 'Observed response', rawEvidence: '<script>alert(1)</script>'};
      let response = await auth(authorToken, request(app).post(`/api/audits/${auditId}/evidence`)).send(body);
      expect(response.status).toBe(201);
      candidateId = response.body.datas._id;
      expect(response.body.datas.status).toBe('pending');
      response = await auth(authorToken, request(app).post(`/api/audits/${auditId}/evidence`)).send(body);
      expect(response.status).toBe(422);
      response = await auth(outsiderToken, request(app).get(`/api/audits/${auditId}/evidence`));
      expect(response.status).toBe(404);
      response = await auth(authorToken, request(app).get(`/api/audits/${auditId}/evidence`));
      expect(response.status).toBe(200);
      expect(response.body.datas).toHaveLength(1);
    });

    it('streams an attachment and locks it after review', async () => {
      let response = await auth(authorToken, request(app).post(`/api/audits/${auditId}/evidence/${candidateId}/files`))
        .attach('file', Buffer.from('HTTP/1.1 200 OK'), 'response.txt');
      expect(response.status).toBe(201);
      fileId = response.body.datas._id;
      response = await auth(authorToken, request(app).get(`/api/audits/${auditId}/evidence/${candidateId}/files/${fileId}`));
      expect(response.status).toBe(200);
      expect(response.text || response.body.toString()).toBe('HTTP/1.1 200 OK');
      response = await auth(authorToken, request(app).put(`/api/audits/${auditId}/evidence/${candidateId}/review`))
        .send({status: 'accepted', note: 'Verified'});
      expect(response.status).toBe(403);
      response = await auth(adminToken, request(app).put(`/api/audits/${auditId}/evidence/${candidateId}/review`))
        .send({status: 'accepted', note: 'Verified'});
      expect(response.status).toBe(200);
      expect(response.body.datas.reviewNote).toBe('Verified');
      response = await auth(authorToken, request(app).post(`/api/audits/${auditId}/evidence/${candidateId}/files`))
        .attach('file', Buffer.from('later'), 'later.txt');
      expect(response.status).toBe(403);
    });

    it('creates one reviewed finding and escapes untrusted evidence', async () => {
      let response = await auth(adminToken, request(app).post(`/api/audits/${auditId}/evidence/${candidateId}/promote`));
      expect(response.status).toBe(200);
      expect(response.body.datas.status).toBe('promoted');
      const findingId = response.body.datas.linkedFinding;
      const audit = await mongoose.model('Audit').findById(auditId);
      const finding = audit.findings.id(findingId);
      expect(finding).toBeTruthy();
      expect(finding.poc).toContain('&lt;script&gt;');
      expect(finding.poc).toContain(String(candidateId));
      response = await auth(authorToken, request(app).get(`/api/audits/${auditId}/evidence?finding=${findingId}`));
      expect(response.status).toBe(200);
      expect(response.body.datas.map(item => item._id)).toEqual([String(candidateId)]);
      response = await auth(authorToken, request(app).get(`/api/audits/${auditId}/evidence?finding=${new mongoose.Types.ObjectId()}`));
      expect(response.status).toBe(200);
      expect(response.body.datas).toHaveLength(0);
      response = await auth(authorToken, request(app).get(`/api/audits/${auditId}/evidence?finding=invalid`));
      expect(response.status).toBe(422);
      response = await auth(outsiderToken, request(app).get(`/api/audits/${auditId}/evidence?finding=${findingId}`));
      expect(response.status).toBe(404);
      response = await auth(adminToken, request(app).post(`/api/audits/${auditId}/evidence/${candidateId}/promote`));
      expect(response.status).toBe(200);
      expect((await mongoose.model('Audit').findById(auditId)).findings).toHaveLength(1);
      response = await auth(adminToken, request(app).put(`/api/audits/${auditId}/evidence/${candidateId}/review`))
        .send({status: 'rejected', note: 'Changed mind'});
      expect(response.status).toBe(422);
      response = await auth(adminToken, request(app).delete(`/api/audits/${auditId}/evidence/${candidateId}`));
      expect(response.status).toBe(403);
    });

    it('removes candidate metadata and files when its audit is deleted', async () => {
      const candidate = await mongoose.model('EvidenceCandidate').findById(candidateId);
      const gridFileId = candidate.attachments[0].fileId;
      const response = await auth(adminToken, request(app).delete(`/api/audits/${auditId}`));
      expect(response.status).toBe(200);
      expect(await mongoose.model('EvidenceCandidate').countDocuments({audit: auditId})).toBe(0);
      expect(await mongoose.connection.db.collection('evidenceFiles.files').countDocuments({_id: gridFileId})).toBe(0);
    });
  });
};
