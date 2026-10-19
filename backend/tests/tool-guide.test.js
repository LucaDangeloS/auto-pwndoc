module.exports = function(request, app) {
  describe('Tool and guide management', () => {
    const mongoose = require('mongoose');
    const fs = require('fs');
    const path = require('path');
    const tar = require('tar');
    let token;
    let toolId;
    let guideId;
    let auditId;
    let guideFileId;

    beforeAll(async () => {
      const User = mongoose.model('User');
      const password = require('bcrypt').hashSync('Admin123', 10);
      await User.updateOne({username: 'admin'}, {$set: {password, role: 'admin', enabled: true},
        $setOnInsert: {firstname: 'Admin', lastname: 'Tester'}}, {upsert: true});
      const response = await request(app).post('/api/users/token').send({username: 'admin', password: 'Admin123'});
      if (response.status === 200) token = response.body.datas.token;
      if (!token) throw new Error('Test admin login failed');
    });
    const auth = req => req.set('Cookie', [`token=JWT ${token}`]);

    it('creates a tool and validates seat assignments and calendar dates', async () => {
      let response = await auth(request(app).post('/api/tools')).send({name: 'Burp Suite', edition: 'Professional', vendor: 'PortSwigger'});
      expect(response.status).toBe(201);
      toolId = response.body.datas._id;
      response = await auth(request(app).post('/api/licenses')).send({tool: toolId, label: 'Team license', seats: 1,
        assignedTo: [new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId()], expiresOn: '2027-12-31'});
      expect(response.status).toBe(422);
      response = await auth(request(app).post('/api/licenses')).send({tool: toolId, label: 'Team license', seats: 2,
        expiresOn: '2027-12-31', purchasedOn: '2026-10-07'});
      expect(response.status).toBe(201);
      expect(response.body.datas.tool.name).toBe('Burp Suite');
      expect(response.body.datas.expiresOn.startsWith('2027-12-31')).toBe(true);
    });

    it('writes and versions a guide, uploads and downloads a document', async () => {
      let response = await auth(request(app).post('/api/guides')).send({title: 'Web assessment', content: 'Preparation notes', steps: ['Set scope', 'Record evidence'], tool: toolId, status: 'published'});
      expect(response.status).toBe(201);
      guideId = response.body.datas._id;
      response = await auth(request(app).put(`/api/guides/${guideId}`)).send({title: 'Web assessment', content: 'Updated notes',
        steps: ['Set scope', 'Record evidence'], references: [{framework: 'WSTG', version: '4.2', code: 'WSTG-INFO-02'},
          {framework: 'ASVS', version: '5.0.0', code: '1.2.5'}], tool: toolId, status: 'published'});
      expect(response.status).toBe(200);
      expect(response.body.datas.version).toBe(2);
      expect(response.body.datas.references).toHaveLength(2);
      response = await auth(request(app).get(`/api/guides/${guideId}/revisions/1`));
      expect(response.body.datas.content).toBe('Preparation notes');
      expect(response.body.datas.references).toHaveLength(0);
      response = await auth(request(app).get(`/api/guides/${guideId}/revisions/2`));
      expect(response.body.datas.references[0].code).toBe('WSTG-INFO-02');
      response = await auth(request(app).post(`/api/guides/${guideId}/files`)).attach('file', Buffer.from('Checklist notes'), 'checklist.md');
      expect(response.status).toBe(201);
      const fileId = response.body.datas._id;
      guideFileId = fileId;
      response = await auth(request(app).get(`/api/guides/${guideId}/files/${fileId}`));
      expect(response.status).toBe(200);
      expect(response.text || response.body.toString()).toBe('Checklist notes');
    });

    it('hides draft guides and documents from ordinary users', async () => {
      const User = mongoose.model('User');
      const username = `guide-reader-${Date.now()}`;
      await new User({username, password: require('bcrypt').hashSync('Admin123', 10),
        firstname: 'Guide', lastname: 'Reader', role: 'user'}).save();
      let response = await request(app).post('/api/users/token').send({username, password: 'Admin123'});
      expect(response.status).toBe(200);
      const readerToken = response.body.datas.token;
      const reader = req => req.set('Cookie', [`token=JWT ${readerToken}`]);
      response = await auth(request(app).post('/api/guides')).send({title: 'Private draft', content: 'Internal notes', steps: ['Prepare'], status: 'draft'});
      expect(response.status).toBe(201);
      const draftId = response.body.datas._id;
      response = await reader(request(app).get('/api/guides'));
      expect(response.status).toBe(200);
      expect(response.body.datas.some(item => item._id === draftId)).toBe(false);
      response = await reader(request(app).get(`/api/guides/${draftId}`));
      expect(response.status).toBe(403);
      response = await reader(request(app).get(`/api/guides/${draftId}/revisions`));
      expect(response.status).toBe(403);
      response = await reader(request(app).get(`/api/guides/${guideId}`));
      expect(response.status).toBe(200);
      response = await auth(request(app).put(`/api/guides/${draftId}`)).send({title: 'Private draft', content: 'Released', steps: ['Prepare'], status: 'published'});
      expect(response.status).toBe(200);
      response = await reader(request(app).get(`/api/guides/${draftId}/revisions`));
      expect(response.body.datas.map(item => item.version)).toEqual([2]);
      response = await reader(request(app).get(`/api/guides/${draftId}/revisions/1`));
      expect(response.status).toBe(403);
    });

    it('keeps checklist steps tied to the version used for an audit', async () => {
      const user = await mongoose.model('User').findOne({username: 'admin'});
      const audit = await new (mongoose.model('Audit'))({name: 'Guide test audit', language: 'en', creator: user._id}).save();
      auditId = audit._id;
      let response = await auth(request(app).post(`/api/guides/${guideId}/runs/${auditId}`));
      expect(response.status).toBe(201);
      expect(response.body.datas.guideVersion).toBe(2);
      expect(response.body.datas.coverage.map(ref => ref.status)).toEqual(['pending', 'pending']);
      response = await auth(request(app).put(`/api/guides/${guideId}/runs/${auditId}`)).send({index: 0, done: true});
      expect(response.status).toBe(200);
      expect(response.body.datas.steps[0].done).toBe(true);
      response = await auth(request(app).put(`/api/guides/${guideId}/runs/${auditId}/coverage/0`))
        .send({status: 'tested', justification: 'Request checked'});
      expect(response.status).toBe(200);
      expect(response.body.datas.coverage[0].justification).toBe('Request checked');
      response = await auth(request(app).put(`/api/guides/${guideId}/runs/${auditId}/coverage/1`))
        .send({status: 'na', justification: ''});
      expect(response.status).toBe(422);
      response = await auth(request(app).put(`/api/guides/${guideId}/runs/${auditId}/coverage/1`))
        .send({status: 'na', justification: 'No applicable control in this engagement'});
      expect(response.status).toBe(200);
      response = await auth(request(app).get(`/api/guides/${guideId}/runs/${auditId}`));
      expect(response.body.datas.coverage.map(ref => ref.status)).toEqual(['tested', 'na']);
    });

    it('backs up archived PDFs in a downloadable bundle and restores a missing file', async () => {
      const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF');
      let response = await auth(request(app).post('/api/audit-archives')).field('name', 'Old report')
        .field('company', '').field('tags', '[]').attach('file', pdf, {filename: 'old-report.pdf', contentType: 'application/pdf'});
      expect(response.status).toBe(201);
      const archiveId = response.body.datas._id;
      const filename = response.body.datas.filename;
      response = await auth(request(app).post('/api/backups')).send({name: 'tool-guide-test'});
      expect(response.status).toBe(201);
      expect(response.body.datas.format).toBe('bundle');
      const slug = response.body.datas.slug;
      const bundlePath = path.join(__dirname, '..', 'backups', `${slug}.tgz`);
      const entries = [];
      await tar.t({file: bundlePath, onReadEntry: entry => entries.push(entry.path)});
      expect(entries).toContain(`audit-archives/${filename}`);
      const livePath = path.join(__dirname, '..', 'audit-archives', filename);
      await fs.promises.unlink(livePath);
      response = await auth(request(app).post(`/api/backups/${slug}/restore`));
      expect(response.status).toBe(200);
      expect(fs.existsSync(livePath)).toBe(true);
      response = await auth(request(app).get(`/api/audit-archives/${archiveId}/file`));
      expect(response.status).toBe(200);
      response = await auth(request(app).get(`/api/guides/${guideId}/files/${guideFileId}`));
      expect(response.status).toBe(200);
      await auth(request(app).delete(`/api/backups/${slug}`));
    });
  });
};
