const path = require('path');
const mongoose = require('mongoose');

const environment = process.env.NODE_ENV || 'dev';
const config = require('../config/config.json')[environment];
if (!config) throw new Error(`Unknown NODE_ENV: ${environment}`);

global.__basedir = path.resolve(__dirname, '..');

[
    'user', 'audit', 'audit-archive', 'company', 'template', 'vulnerability',
    'vulnerability-matching-run', 'vulnerability-update', 'language', 'audit-type',
    'vulnerability-taxonomy', 'custom-section', 'custom-field', 'image', 'settings',
    'dictionary', 'role', 'audit-task'
].forEach(model => require(`../models/${model}`));

async function main() {
    await mongoose.connect(`mongodb://${config.database.server}:${config.database.port}/${config.database.name}`);
    try {
        const summary = await require('../lib/audit-archive-sync').regenerateAllInternalArchives();
        console.log(`[audit-archive-sync] Regeneration complete: ${summary.refreshed}/${summary.total} refreshed, ${summary.failed} failed`);
        if (summary.failed) process.exitCode = 1;
    } finally {
        await mongoose.disconnect();
    }
}

main().catch(err => {
    console.error('[audit-archive-sync] Regeneration failed:', err && err.stack || err);
    process.exitCode = 1;
});
