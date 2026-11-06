module.exports = function(request, app) {
  describe('Audit Archive Suite Tests', () => {
    var userToken = '';
    var archiveId = '';
    var validPdf = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF').toString('base64');

    beforeAll(async () => {
      var response = await request(app).post('/api/users/token').send({username: 'admin', password: 'Admin123'});
      userToken = response.body.datas.token;
    });

    it('Get archive list when empty', async () => {
      var response = await request(app).get('/api/audit-archives')
        .set('Cookie', [`token=JWT ${userToken}`]);

      expect(response.status).toBe(200);
      expect(response.body.datas).toHaveLength(0);
    });

    it('Upload a valid archived PDF', async () => {
      var response = await request(app).post('/api/audit-archives')
        .set('Cookie', [`token=JWT ${userToken}`])
        .send({
          name: 'Legacy External Pentest',
          originalName: 'legacy-report.pdf',
          mimeType: 'application/pdf',
          file: validPdf
        });

      expect(response.status).toBe(201);
      expect(response.body.datas._id).toBeDefined();
      expect(response.body.datas.filename).toMatch(/\.pdf$/);
      archiveId = response.body.datas._id;
    });

    it('Reject archive upload with unsafe name', async () => {
      var response = await request(app).post('/api/audit-archives')
        .set('Cookie', [`token=JWT ${userToken}`])
        .send({
          name: '../../evil',
          originalName: 'evil.pdf',
          mimeType: 'application/pdf',
          file: validPdf
        });

      expect(response.status).toBe(422);
    });

    it('Reject archive upload with non-PDF mime type', async () => {
      var response = await request(app).post('/api/audit-archives')
        .set('Cookie', [`token=JWT ${userToken}`])
        .send({
          name: 'Not PDF',
          originalName: 'not-pdf.txt',
          mimeType: 'text/plain',
          file: validPdf
        });

      expect(response.status).toBe(422);
    });

    it('Reject archive upload with invalid PDF signature', async () => {
      var response = await request(app).post('/api/audit-archives')
        .set('Cookie', [`token=JWT ${userToken}`])
        .send({
          name: 'Fake PDF',
          originalName: 'fake.pdf',
          mimeType: 'application/pdf',
          file: Buffer.from('not a pdf').toString('base64')
        });

      expect(response.status).toBe(422);
    });

    it('List uploaded archived PDFs', async () => {
      var response = await request(app).get('/api/audit-archives')
        .set('Cookie', [`token=JWT ${userToken}`]);

      expect(response.status).toBe(200);
      expect(response.body.datas).toHaveLength(1);
      expect(response.body.datas[0].name).toBe('Legacy External Pentest');
    });

    it('Stream archived PDF file', async () => {
      var response = await request(app).get(`/api/audit-archives/${archiveId}/file`)
        .set('Cookie', [`token=JWT ${userToken}`]);

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('application/pdf');
      expect(response.headers['content-disposition']).toContain('inline');
    });

    it('Download archived PDF file as an attachment', async () => {
      var response = await request(app).get(`/api/audit-archives/${archiveId}/file?download=1`)
        .set('Cookie', [`token=JWT ${userToken}`]);

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('application/pdf');
      expect(response.headers['content-disposition']).toContain('attachment');
      expect(response.headers['content-disposition']).toContain('legacy-report.pdf');
    });

    it('Delete archived PDF', async () => {
      var response = await request(app).delete(`/api/audit-archives/${archiveId}`)
        .set('Cookie', [`token=JWT ${userToken}`]);

      expect(response.status).toBe(200);

      response = await request(app).get('/api/audit-archives')
        .set('Cookie', [`token=JWT ${userToken}`]);
      expect(response.body.datas).toHaveLength(0);
    });

    describe('Archive metadata and company organisation', () => {
      var companyId = '';
      var orgArchiveId = '';
      var plainUserToken = '';

      beforeAll(async () => {
        await request(app).post('/api/companies')
          .set('Cookie', [`token=JWT ${userToken}`])
          .send([{name: 'Archive Client'}]);
        var response = await request(app).get('/api/companies')
          .set('Cookie', [`token=JWT ${userToken}`]);
        companyId = response.body.datas.find(c => c.name === 'Archive Client')._id;

        response = await request(app).post('/api/users/token').send({username: 'user2', password: 'User1234'});
        plainUserToken = response.body.datas.token;
      });

      it('Upload with punctuation in name and client metadata', async () => {
        var response = await request(app).post('/api/audit-archives')
          .set('Cookie', [`token=JWT ${userToken}`])
          .send({
            name: 'ACME, S.L. - Pentest v1.2 & retest',
            originalName: 'informe año.pdf',
            mimeType: 'application/pdf',
            file: validPdf,
            company: companyId,
            reportDate: '2025-03-14',
            auditType: 'Web',
            tags: ['external', 'external', ' web ']
          });

        expect(response.status).toBe(201);
        expect(response.body.datas.company.name).toBe('Archive Client');
        expect(response.body.datas.tags).toEqual(['external', 'web']);
        orgArchiveId = response.body.datas._id;
      });

      it('Reject upload with unknown company', async () => {
        var response = await request(app).post('/api/audit-archives')
          .set('Cookie', [`token=JWT ${userToken}`])
          .send({name: 'Orphan', originalName: 'o.pdf', mimeType: 'application/pdf', file: validPdf, company: 'deadbeefdeadbeefdeadbeef'});

        expect(response.status).toBe(422);
      });

      it('Encode non-ASCII download filenames with RFC 5987', async () => {
        var response = await request(app).get(`/api/audit-archives/${orgArchiveId}/file?download=1`)
          .set('Cookie', [`token=JWT ${userToken}`]);

        expect(response.headers['content-disposition']).toContain("filename*=UTF-8''informe%20a%C3%B1o.pdf");
      });

      it('Filter archives by company', async () => {
        var response = await request(app).get(`/api/audit-archives?company=${companyId}`)
          .set('Cookie', [`token=JWT ${userToken}`]);
        expect(response.body.datas).toHaveLength(1);

        response = await request(app).get('/api/audit-archives?company=none')
          .set('Cookie', [`token=JWT ${userToken}`]);
        expect(response.body.datas).toHaveLength(0);
      });

      it('Block deleting a company that has archived reports', async () => {
        var response = await request(app).delete(`/api/companies/${companyId}`)
          .set('Cookie', [`token=JWT ${userToken}`]);
        expect(response.status).toBe(422);
      });

      it('Forbid non-owners from editing or deleting an archive', async () => {
        var response = await request(app).put(`/api/audit-archives/${orgArchiveId}`)
          .set('Cookie', [`token=JWT ${plainUserToken}`])
          .send({name: 'Hijacked'});
        expect(response.status).toBe(403);

        response = await request(app).delete(`/api/audit-archives/${orgArchiveId}`)
          .set('Cookie', [`token=JWT ${plainUserToken}`]);
        expect(response.status).toBe(403);
      });

      it('Update archive metadata', async () => {
        var response = await request(app).put(`/api/audit-archives/${orgArchiveId}`)
          .set('Cookie', [`token=JWT ${userToken}`])
          .send({name: 'Renamed report', notes: 'Final version', reportDate: null});

        expect(response.status).toBe(200);
        expect(response.body.datas.name).toBe('Renamed report');
        expect(response.body.datas.notes).toBe('Final version');
        expect(response.body.datas.reportDate).toBeNull();
      });

      it('Reject metadata update with path separators in name', async () => {
        var response = await request(app).put(`/api/audit-archives/${orgArchiveId}`)
          .set('Cookie', [`token=JWT ${userToken}`])
          .send({name: '../evil'});
        expect(response.status).toBe(422);
      });

      it('Bulk unassign company', async () => {
        var response = await request(app).put('/api/audit-archives/bulk')
          .set('Cookie', [`token=JWT ${userToken}`])
          .send({archiveIds: [orgArchiveId], company: null});
        expect(response.status).toBe(200);

        response = await request(app).get('/api/audit-archives?company=none')
          .set('Cookie', [`token=JWT ${userToken}`]);
        expect(response.body.datas).toHaveLength(1);
      });

      afterAll(async () => {
        await request(app).delete(`/api/audit-archives/${orgArchiveId}`)
          .set('Cookie', [`token=JWT ${userToken}`]);
        await request(app).delete(`/api/companies/${companyId}`)
          .set('Cookie', [`token=JWT ${userToken}`]);
      });
    });
  });
}
