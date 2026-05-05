#!/usr/bin/env node
/**
 * reset-default-admin.js
 *
 * Standalone script to reset the documented default admin account back to
 * the default credentials (admin / Admin1admin2). Useful when
 * a migration or a stale database leaves the admin user with an unknown
 * password and the login endpoint keeps returning 401 / "Invalid refreshToken".
 *
 * Usage from the backend container:
 *   docker exec -it autopwndoc-backend npm run reset-admin
 * or directly via node:
 *   node src/lib/reset-default-admin.js
 *
 * The script connects to the same MongoDB instance configured in
 * src/config/config.json for the active NODE_ENV (defaults to dev).
 */

const mongoose = require('mongoose');

const env = process.env.NODE_ENV || 'dev';
const config = require('../config/config.json')[env];

global.__basedir = __dirname.replace(/lib$/, '');

require('../models/user');

const { resetDefaultAdmin, DEFAULT_USERNAME } = require('./seed-admin');

async function main() {
    await mongoose.connect(`mongodb://${config.database.server}:${config.database.port}/${config.database.name}`);
    try {
        const result = await resetDefaultAdmin();
        console.log(`[reset-default-admin] '${DEFAULT_USERNAME}' restored (${result.reason}).`);
    } finally {
        await mongoose.disconnect();
    }
}

main().catch(err => {
    console.error('[reset-default-admin] Failed:', err && err.message ? err.message : err);
    process.exit(1);
});
