/**
 * seed-admin.js
 *
 * Ensures a default administrator account exists so the dev/test stack always
 * boots with usable credentials. The seeder only runs when the users
 * collection is completely empty — existing deployments are never modified.
 *
 * The default credentials are:
 *   username: admin
 *   password: Admin1admin2
 *
 * They can be overridden via DEFAULT_ADMIN_USERNAME / DEFAULT_ADMIN_PASSWORD
 * environment variables when needed.
 *
 * The function exits silently on errors to avoid blocking application start.
 */

const mongoose = require('mongoose');

const DEFAULT_USERNAME = process.env.DEFAULT_ADMIN_USERNAME || 'admin';
const DEFAULT_PASSWORD = process.env.DEFAULT_ADMIN_PASSWORD || 'Admin1admin2';
const DEFAULT_FIRSTNAME = process.env.DEFAULT_ADMIN_FIRSTNAME || 'Admin';
const DEFAULT_LASTNAME = process.env.DEFAULT_ADMIN_LASTNAME || 'Istrator';

function waitForConnection() {
    if (mongoose.connection.readyState === 1) return Promise.resolve();
    return new Promise((resolve, reject) => {
        const cleanup = () => {
            mongoose.connection.off('open', onOpen);
            mongoose.connection.off('error', onError);
        };
        const onOpen = () => { cleanup(); resolve(); };
        const onError = (err) => { cleanup(); reject(err); };
        mongoose.connection.once('open', onOpen);
        mongoose.connection.once('error', onError);
    });
}

async function ensureDefaultAdmin() {
    try {
        await waitForConnection();
        const User = mongoose.model('User');
        const count = await User.countDocuments();
        const reset = String(process.env.RESET_DEFAULT_ADMIN || '').toLowerCase() === 'true';

        if (count === 0) {
            await User.create([{
                username: DEFAULT_USERNAME,
                password: DEFAULT_PASSWORD,
                firstname: DEFAULT_FIRSTNAME,
                lastname: DEFAULT_LASTNAME,
                role: 'admin',
            }]);
            console.log(`[seed-admin] Default admin user '${DEFAULT_USERNAME}' created.`);
            return { seeded: true };
        }

        if (reset) {
            return resetDefaultAdmin();
        }

        return { seeded: false, reason: 'users-exist' };
    } catch (err) {
        console.error('[seed-admin] Failed to ensure default admin:', err && err.message ? err.message : err);
        return { seeded: false, reason: 'error', error: err };
    }
}

async function resetDefaultAdmin() {
    await waitForConnection();
    const User = mongoose.model('User');
    const bcrypt = require('bcrypt');
    const hashed = bcrypt.hashSync(DEFAULT_PASSWORD, 10);
    const result = await User.updateOne(
        { username: DEFAULT_USERNAME },
        { $set: { password: hashed, role: 'admin', enabled: true, refreshTokens: [] } }
    );
    if (result.matchedCount === 0) {
        await User.create([{
            username: DEFAULT_USERNAME,
            password: DEFAULT_PASSWORD,
            firstname: DEFAULT_FIRSTNAME,
            lastname: DEFAULT_LASTNAME,
            role: 'admin',
        }]);
        console.log(`[seed-admin] reset: '${DEFAULT_USERNAME}' was missing — created with default credentials.`);
        return { seeded: true, reason: 'reset-create' };
    }
    console.log(`[seed-admin] reset: '${DEFAULT_USERNAME}' password reset to defaults and sessions cleared.`);
    return { seeded: true, reason: 'reset-update' };
}

module.exports = {
    ensureDefaultAdmin,
    resetDefaultAdmin,
    DEFAULT_USERNAME,
    DEFAULT_PASSWORD,
};
