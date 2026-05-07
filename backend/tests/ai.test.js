module.exports = function(request, app) {
    describe('AI endpoints', () => {
        var userToken = '';

        beforeAll(async () => {
            var response = await request(app).post('/api/users/token').send({ username: 'admin', password: 'Admin123' });
            userToken = response.body.datas.token;
        });

        it('GET /api/ai/reindex-status returns the idle tracker shape', async () => {
            var response = await request(app)
                .get('/api/ai/reindex-status')
                .set('Cookie', `token=JWT ${userToken}`);

            expect(response.status).toBe(200);
            expect(response.body.status).toBe('success');
            const data = response.body.datas;
            expect(data).toHaveProperty('inProgress', false);
            expect(data).toHaveProperty('total');
            expect(data).toHaveProperty('processed');
            expect(data).toHaveProperty('failed');
            expect(data).toHaveProperty('startedAt');
            expect(data).toHaveProperty('finishedAt');
            expect(data).toHaveProperty('lastError');
        });

        it('POST /api/ai/list-models rejects an invalid type', async () => {
            var response = await request(app)
                .post('/api/ai/list-models')
                .set('Cookie', `token=JWT ${userToken}`)
                .send({ type: 'invalid' });

            expect(response.status).toBe(422);
            expect(response.body.status).toBe('error');
        });

        it('POST /api/ai/list-models returns a static list for anthropic', async () => {
            // Configure anthropic as the generation provider so list-models hits the static path.
            const settingsResponse = await request(app)
                .get('/api/settings')
                .set('Cookie', `token=JWT ${userToken}`);
            expect(settingsResponse.status).toBe(200);
            const settings = settingsResponse.body.datas;
            settings.ai = settings.ai || {};
            settings.ai.public = settings.ai.public || {};
            const previousProvider = settings.ai.public.provider;
            settings.ai.public.provider = 'anthropic';

            const updateResponse = await request(app)
                .put('/api/settings')
                .set('Cookie', `token=JWT ${userToken}`)
                .send(settings);
            expect(updateResponse.status).toBe(200);

            try {
                const response = await request(app)
                    .post('/api/ai/list-models')
                    .set('Cookie', `token=JWT ${userToken}`)
                    .send({ type: 'generation' });

                expect(response.status).toBe(200);
                expect(response.body.status).toBe('success');
                expect(response.body.datas.source).toBe('static');
                expect(Array.isArray(response.body.datas.models)).toBe(true);
                expect(response.body.datas.models.length).toBeGreaterThan(0);
            } finally {
                settings.ai.public.provider = previousProvider || 'openai';
                await request(app)
                    .put('/api/settings')
                    .set('Cookie', `token=JWT ${userToken}`)
                    .send(settings);
            }
        });

        it('POST /api/ai/test rejects invalid type', async () => {
            var response = await request(app)
                .post('/api/ai/test')
                .set('Cookie', `token=JWT ${userToken}`)
                .send({ type: 'invalid' });

            expect(response.status).toBe(422);
            expect(response.body.status).toBe('error');
        });

        it('POST /api/ai/generate is rejected when AI is disabled', async () => {
            var response = await request(app)
                .post('/api/ai/generate')
                .set('Cookie', `token=JWT ${userToken}`)
                .send({ action: 'generate', text: '', fieldName: 'description', context: {} });

            expect(response.status).toBe(403);
            expect(response.body.status).toBe('error');
        });
    });
};
