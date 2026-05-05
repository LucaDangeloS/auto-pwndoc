/*
  Regression test for the default admin login flow.

  Reproduces "Invalid refreshToken" / "Authentication Failed" errors at startup
  by exercising the documented default credentials end-to-end:
    1. The backend seeds the admin account on first boot when the users
       collection is empty.
    2. POST /api/users/token with the documented credentials must return a
       valid JWT token plus a refreshToken cookie.
    3. The refreshToken cookie must be accepted by GET /api/users/refreshtoken.
    4. POST /api/users/token with a wrong password must still return 401.
*/

const { ensureDefaultAdmin, resetDefaultAdmin, DEFAULT_USERNAME, DEFAULT_PASSWORD } = require('../src/lib/seed-admin');

module.exports = function(request, app) {
  describe('Default admin login regression', () => {
    let refreshCookie = '';

    beforeAll(async () => {
      // index.test.js drops the database before requiring the app, but other
      // suites may have created users already. Reset the users collection so
      // this regression boots from a known empty state and exercises the
      // automatic admin seeding path.
      var mongoose = require('mongoose');
      await mongoose.model('User').deleteMany({});
      await ensureDefaultAdmin();
    });

    afterAll(async () => {
      // Leave the database empty so subsequent suites that expect a fresh
      // install (user.test.js → /api/users/init) keep working.
      var mongoose = require('mongoose');
      await mongoose.model('User').deleteMany({});
    });

    it('seeds default admin when the users collection is empty', async () => {
      var response = await request(app).get('/api/users/init');

      expect(response.status).toBe(200);
      // Either init=false (admin was just seeded) or init=true (no other test
      // has run yet but the seeder did its job before this assertion).
      expect(response.body.datas).toBe(false);
    });

    it('logs in with the documented default credentials', async () => {
      var response = await request(app)
        .post('/api/users/token')
        .send({ username: DEFAULT_USERNAME, password: DEFAULT_PASSWORD });

      expect(response.status).toBe(200);
      expect(response.body.datas.token).toBeDefined();
      expect(response.body.datas.refreshToken).toBeDefined();

      var setCookies = response.headers['set-cookie'] || [];
      expect(setCookies.find(c => c.startsWith('token='))).toBeDefined();
      var refresh = setCookies.find(c => c.startsWith('refreshToken='));
      expect(refresh).toBeDefined();
      refreshCookie = refresh.split(';')[0];
    });

    it('accepts the refresh cookie immediately after login', async () => {
      expect(refreshCookie).not.toBe('');
      var response = await request(app)
        .get('/api/users/refreshtoken')
        .set('Cookie', [refreshCookie]);

      expect(response.status).toBe(200);
      expect(response.body.datas.token).toBeDefined();
      expect(response.body.datas.refreshToken).toBeDefined();
    });

    it('rejects login with the wrong password', async () => {
      var response = await request(app)
        .post('/api/users/token')
        .send({ username: DEFAULT_USERNAME, password: 'NotTheRealPassword1!' });

      expect(response.status).toBe(401);
    });

    it('restores default credentials via resetDefaultAdmin when admin password drifts', async () => {
      var mongoose = require('mongoose');
      var bcrypt = require('bcrypt');
      var User = mongoose.model('User');

      await User.updateOne(
        { username: DEFAULT_USERNAME },
        { $set: { password: bcrypt.hashSync('SomethingElse1!', 10), refreshTokens: [] } }
      );

      var bad = await request(app)
        .post('/api/users/token')
        .send({ username: DEFAULT_USERNAME, password: DEFAULT_PASSWORD });
      expect(bad.status).toBe(401);

      await resetDefaultAdmin();

      var ok = await request(app)
        .post('/api/users/token')
        .send({ username: DEFAULT_USERNAME, password: DEFAULT_PASSWORD });
      expect(ok.status).toBe(200);
      expect(ok.body.datas.token).toBeDefined();
    });
  });
};
