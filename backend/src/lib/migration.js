/**
 * migration.js
 *
 * Runs at backend startup when the MIGRATE_FROM environment variable is set.
 * MIGRATE_FROM must be a full MongoDB URI pointing to the source database
 * (e.g. the original pwndoc-ng instance).
 *
 * The migration is split into numbered, named steps. Each step is tracked in
 * the `_migrations` collection of the *destination* database. A step that has
 * already been applied is skipped, making the whole process idempotent — safe
 * to run on every restart.
 *
 * How to add a new migration step when the schema changes:
 *   1. Add a new object to the STEPS array below.
 *   2. Give it a unique numeric `id` (next integer) and a descriptive `name`.
 *   3. Implement the `run(srcDb, dstDb)` async function.
 *   4. Document the change in the migration steps below.
 *
 * srcDb  — raw MongoDB Db object connected to the SOURCE (pwndoc-ng) database.
 * dstDb  — raw MongoDB Db object connected to the DESTINATION (autopwndoc) database.
 *          All mongoose models are already registered on this connection; you
 *          can use either the raw Db API or require the models directly.
 */

const mongoose = require('mongoose');

// Migration step definitions
// Every step must be idempotent. Use $set / $setOnInsert / upsert patterns
// rather than insertOne when the destination might already have data.

const STEPS = [

    // Step 1: Copy core collections from pwndoc-ng verbatim
    // Copies users, clients, companies, templates, languages, audit-types,
    // vulnerability-types, vulnerability-categories, custom-sections,
    // custom-fields, and images.
    //
    // Users are matched by username (not _id) so that a pre-seeded admin user
    // in the destination is updated with the source credentials rather than
    // duplicated. refreshTokens are always cleared on import — old sessions from
    // the source instance are invalid in the new one.
    //
    // All other collections are matched by _id; documents already present are
    // left untouched so repeated runs are safe.
    {
        id: 1,
        name: 'copy-base-collections',
        async run(srcDb, dstDb) {
            const NON_USER_COLLECTIONS = [
                'clients',
                'companies',
                'templates',
                'languages',
                'audittypes',
                'vulnerabilitytypes',
                'vulnerabilitycategories',
                'customsections',
                'customfields',
                'images',
            ];

            for (const col of NON_USER_COLLECTIONS) {
                const src = srcDb.collection(col);
                const dst = dstDb.collection(col);
                const docs = await src.find({}).toArray();
                if (docs.length === 0) continue;

                const ops = docs.map(doc => ({
                    updateOne: {
                        filter: { _id: doc._id },
                        update: { $setOnInsert: doc },
                        upsert: true,
                    },
                }));
                const result = await dst.bulkWrite(ops, { ordered: false });
                console.log(`[migration] ${col}: ${result.upsertedCount} inserted, ${result.matchedCount} already existed`);
            }

            // Users — match by username, overwrite with source data, clear sessions
            const srcUsers = await srcDb.collection('users').find({}).toArray();
            if (srcUsers.length > 0) {
                const ops = srcUsers.map(doc => {
                    const { refreshTokens: _dropped, ...rest } = doc;
                    return {
                        updateOne: {
                            filter: { username: doc.username },
                            update: { $set: { ...rest, refreshTokens: [] } },
                            upsert: true,
                        },
                    };
                });
                const result = await dstDb.collection('users').bulkWrite(ops, { ordered: false });
                console.log(`[migration] users: ${result.upsertedCount} inserted, ${result.matchedCount} merged (sessions cleared)`);
            }
        },
    },

    // Step 2: Copy vulnerabilities
    // Copies the full vulnerabilities collection. The destination schema adds
    // `cvssv4` on the top-level document but that field is simply absent in
    // pwndoc-ng data — Mongoose will treat it as undefined, which is fine.
    {
        id: 2,
        name: 'copy-vulnerabilities',
        async run(srcDb, dstDb) {
            const src = srcDb.collection('vulnerabilities');
            const dst = dstDb.collection('vulnerabilities');
            const docs = await src.find({}).toArray();
            if (docs.length === 0) {
                console.log('[migration] vulnerabilities: source empty, nothing to copy');
                return;
            }

            const ops = docs.map(doc => ({
                updateOne: {
                    filter: { _id: doc._id },
                    update: { $setOnInsert: doc },
                    upsert: true,
                },
            }));
            const result = await dst.bulkWrite(ops, { ordered: false });
            console.log(`[migration] vulnerabilities: ${result.upsertedCount} inserted, ${result.matchedCount} already existed`);
        },
    },

    // Step 3: Copy audits
    // Copies the full audits collection. The destination schema adds:
    //   - audit.isRetest (Boolean, default false) — set below for all copied docs
    //   - finding.cvssv4 (String) — absent in source, fine as undefined
    //   - finding.retestEvidence (String) — absent in source, fine as undefined
    //   - finding.retestPassed (Boolean|null) — absent in source, fine as undefined
    {
        id: 3,
        name: 'copy-audits',
        async run(srcDb, dstDb) {
            const src = srcDb.collection('audits');
            const dst = dstDb.collection('audits');
            const docs = await src.find({}).toArray();
            if (docs.length === 0) {
                console.log('[migration] audits: source empty, nothing to copy');
                return;
            }

            const ops = docs.map(doc => ({
                updateOne: {
                    filter: { _id: doc._id },
                    update: { $setOnInsert: doc },
                    upsert: true,
                },
            }));
            const result = await dst.bulkWrite(ops, { ordered: false });
            console.log(`[migration] audits: ${result.upsertedCount} inserted, ${result.matchedCount} already existed`);
        },
    },

    // Step 4: Add isRetest field to all migrated audits that lack it
    // pwndoc-ng audits have no isRetest field. Set it to false for all documents
    // where it is missing so the application logic works correctly.
    {
        id: 4,
        name: 'add-isRetest-to-audits',
        async run(_srcDb, dstDb) {
            const col = dstDb.collection('audits');
            const result = await col.updateMany(
                { isRetest: { $exists: false } },
                { $set: { isRetest: false } }
            );
            console.log(`[migration] add-isRetest: ${result.modifiedCount} audits updated`);
        },
    },

    // Step 5: Add retestEvidence / retestPassed to all finding subdocuments
    // Subdocument arrays need an update with arrayFilters to touch each element.
    {
        id: 5,
        name: 'add-retest-fields-to-findings',
        async run(_srcDb, dstDb) {
            const col = dstDb.collection('audits');
            // retestEvidence
            const r1 = await col.updateMany(
                { 'findings.retestEvidence': { $exists: false } },
                { $set: { 'findings.$[f].retestEvidence': '' } },
                { arrayFilters: [{ 'f.retestEvidence': { $exists: false } }] }
            );
            // retestPassed
            const r2 = await col.updateMany(
                { 'findings.retestPassed': { $exists: false } },
                { $set: { 'findings.$[f].retestPassed': null } },
                { arrayFilters: [{ 'f.retestPassed': { $exists: false } }] }
            );
            console.log(`[migration] add-retest-fields: retestEvidence set on ${r1.modifiedCount} audits, retestPassed set on ${r2.modifiedCount} audits`);
        },
    },

    // Step 6: Add cvssv4 field to vulnerability top-level documents
    // pwndoc-ng vulnerabilities have no cvssv4. Set it to '' for all documents
    // where it is missing.
    {
        id: 6,
        name: 'add-cvssv4-to-vulnerabilities',
        async run(_srcDb, dstDb) {
            const col = dstDb.collection('vulnerabilities');
            const result = await col.updateMany(
                { cvssv4: { $exists: false } },
                { $set: { cvssv4: '' } }
            );
            console.log(`[migration] add-cvssv4: ${result.modifiedCount} vulnerabilities updated`);
        },
    },

    // Step 7: Add cvssv4 field to finding subdocuments in audits
    {
        id: 7,
        name: 'add-cvssv4-to-findings',
        async run(_srcDb, dstDb) {
            const col = dstDb.collection('audits');
            const result = await col.updateMany(
                { 'findings.cvssv4': { $exists: false } },
                { $set: { 'findings.$[f].cvssv4': '' } },
                { arrayFilters: [{ 'f.cvssv4': { $exists: false } }] }
            );
            console.log(`[migration] add-cvssv4-to-findings: ${result.modifiedCount} audits updated`);
        },
    },

    // Step 8: Add executiveSummary object to all audit documents
    // Audits created before this feature have no executiveSummary subdocument.
    // Set it to the default empty object for all documents that lack the field.
    {
        id: 8,
        name: 'add-executive-summary-to-audits',
        async run(_srcDb, dstDb) {
            const col = dstDb.collection('audits');
            const result = await col.updateMany(
                { executiveSummary: { $exists: false } },
                {
                    $set: {
                        executiveSummary: {
                            overallRisk: '',
                            summary: '',
                            criticalSummary: '',
                            highSummary: '',
                            mediumSummary: '',
                            lowSummary: '',
                            informativeSummary: '',
                        },
                    },
                }
            );
            console.log(`[migration] add-executive-summary: ${result.modifiedCount} audits updated`);
        },
    },

];

// Runner

async function runMigration() {
    const migrateFrom = process.env.MIGRATE_FROM;
    if (!migrateFrom) return; // migration not requested

    console.log(`[migration] MIGRATE_FROM is set — connecting to source: ${migrateFrom}`);

    let srcConn;
    try {
        srcConn = await mongoose.createConnection(migrateFrom, {
            serverSelectionTimeoutMS: 8000,
        }).asPromise();
    } catch (err) {
        console.error('[migration] Could not connect to source database:', err.message);
        console.error('[migration] Migration aborted — destination database is untouched.');
        return;
    }

    const srcDb = srcConn.db;
    const dstDb = mongoose.connection.db;

    // Ensure the tracking collection exists and has an index on step id.
    const migrationsCol = dstDb.collection('_migrations');
    await migrationsCol.createIndex({ id: 1 }, { unique: true });

    let appliedCount = 0;
    let skippedCount = 0;

    for (const step of STEPS) {
        const already = await migrationsCol.findOne({ id: step.id });
        if (already) {
            skippedCount++;
            continue;
        }

        console.log(`[migration] Running step ${step.id}: ${step.name}`);
        try {
            await step.run(srcDb, dstDb);
            await migrationsCol.insertOne({
                id: step.id,
                name: step.name,
                appliedAt: new Date(),
            });
            appliedCount++;
            console.log(`[migration] Step ${step.id} complete.`);
        } catch (err) {
            console.error(`[migration] Step ${step.id} (${step.name}) FAILED:`, err);
            console.error('[migration] Stopping migration — fix the error and restart.');
            await srcConn.close();
            return;
        }
    }

    await srcConn.close();
    console.log(`[migration] Done. ${appliedCount} steps applied, ${skippedCount} already up to date.`);
}

module.exports = { runMigration };
