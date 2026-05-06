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
    });

    it('Delete archived PDF', async () => {
      var response = await request(app).delete(`/api/audit-archives/${archiveId}`)
        .set('Cookie', [`token=JWT ${userToken}`]);

      expect(response.status).toBe(200);

      response = await request(app).get('/api/audit-archives')
        .set('Cookie', [`token=JWT ${userToken}`]);
      expect(response.body.datas).toHaveLength(0);
    });
  });
}
