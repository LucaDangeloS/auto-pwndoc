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
 *   4. Document the change in AGENTS.md under "Migration steps".
 *
 * srcDb  — raw MongoDB Db object connected to the SOURCE (pwndoc-ng) database.
 * dstDb  — raw MongoDB Db object connected to the DESTINATION (autopwndoc) database.
 *          All mongoose models are already registered on this connection; you
 *          can use either the raw Db API or require the models directly.
 */

const mongoose = require('mongoose');

const USER_ID_MAP = new Map();

function idKey(id) {
    return id ? String(id) : '';
}

function remapUserId(id) {
    return USER_ID_MAP.get(idKey(id)) || id;
}

function remapUserArray(ids) {
    return Array.isArray(ids) ? ids.map(remapUserId) : ids;
}

function waitForDestinationDb() {
    if (mongoose.connection.readyState === 1 && mongoose.connection.db) return Promise.resolve(mongoose.connection.db);

    return new Promise((resolve, reject) => {
        const onOpen = () => {
            cleanup();
            if (!mongoose.connection.db) return reject(new Error('Destination database handle is unavailable after connection opened'));
            resolve(mongoose.connection.db);
        };
        const onError = (err) => {
            cleanup();
            reject(err);
        };
        const cleanup = () => {
            mongoose.connection.off('open', onOpen);
            mongoose.connection.off('error', onError);
        };

        mongoose.connection.once('open', onOpen);
        mongoose.connection.once('error', onError);
    });
}

// ─── Migration step definitions ───────────────────────────────────────────────
// Every step must be idempotent. Use $set / $setOnInsert / upsert patterns
// rather than insertOne when the destination might already have data.

const STEPS = [

    // ── Step 1: Copy core collections from pwndoc-ng verbatim ────────────────
    // Users are matched by username so existing destination accounts are never
    // overwritten. Missing source users are inserted with refreshTokens cleared.
    // Other base collections are matched by _id and left untouched if present.
    {
        id: 1,
        name: 'copy-base-collections',
        requiresSource: true,
        async run(srcDb, dstDb) {
            USER_ID_MAP.clear();

            const userDocs = await srcDb.collection('users').find({}).toArray();
            let usersInserted = 0;
            let usersPreserved = 0;

            for (const doc of userDocs) {
                const existing = await dstDb.collection('users').findOne({ username: doc.username });
                if (existing) {
                    USER_ID_MAP.set(idKey(doc._id), existing._id);
                    usersPreserved++;
                    continue;
                }

                const userToInsert = { ...doc, refreshTokens: [] };
                await dstDb.collection('users').insertOne(userToInsert);
                USER_ID_MAP.set(idKey(doc._id), doc._id);
                usersInserted++;
            }

            console.log(`[migration] users: ${usersInserted} inserted, ${usersPreserved} existing preserved (sessions cleared for inserted users)`);

            const COLLECTIONS = [
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

            // Natural unique key per collection (used when _id from source
            // may differ from destination's _id for the same logical record).
            const UNIQUE_KEY = {
                languages:              doc => ({ language: doc.language }),
                audittypes:             doc => ({ name: doc.name }),
                vulnerabilitytypes:     doc => ({ name: doc.name }),
                vulnerabilitycategories: doc => ({ name: doc.name }),
                customsections:         doc => ({ field: doc.field }),
                customfields:           doc => ({ label: doc.label, display: doc.display, displaySub: doc.displaySub }),
            };

            for (const col of COLLECTIONS) {
                const src = srcDb.collection(col);
                const dst = dstDb.collection(col);
                const docs = await src.find({}).toArray();
                if (docs.length === 0) continue;

                const filterFn = UNIQUE_KEY[col] || (doc => ({ _id: doc._id }));
                const ops = docs.map(doc => ({
                    updateOne: {
                        filter: filterFn(doc),
                        update: { $setOnInsert: doc },
                        upsert: true,
                    },
                }));

                let result;
                try {
                    result = await dst.bulkWrite(ops, { ordered: false });
                } catch (err) {
                    // Duplicate key conflicts on non-_id unique indexes: treat as "already existed".
                    const isDupOnly = err.code === 11000 ||
                        (Array.isArray(err.writeErrors) && err.writeErrors.every(e => e.code === 11000));
                    if (!isDupOnly) throw err;
                    const partial = err.result || {};
                    const dupCount = Array.isArray(err.writeErrors) ? err.writeErrors.length : 1;
                    console.log(`[migration] ${col}: ${partial.upsertedCount || 0} inserted, ${(partial.matchedCount || 0) + dupCount} already existed`);
                    continue;
                }
                console.log(`[migration] ${col}: ${result.upsertedCount} inserted, ${result.matchedCount} already existed`);
            }
        },
    },

    // ── Step 2: Copy vulnerabilities ─────────────────────────────────────────
    // Copies the full vulnerabilities collection. The destination schema adds
    // `cvssv4` on the top-level document but that field is simply absent in
    // pwndoc-ng data — Mongoose will treat it as undefined, which is fine.
    {
        id: 2,
        name: 'copy-vulnerabilities',
        requiresSource: true,
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

    // ── Step 3: Copy audits ───────────────────────────────────────────────────
    // Copies the full audits collection. The destination schema adds:
    //   - audit.isRetest (Boolean, default false) — set below for all copied docs
    //   - finding.cvssv4 (String) — absent in source, fine as undefined
    //   - finding.retestEvidence (String) — absent in source, fine as undefined
    //   - finding.retestPassed (Boolean|null) — absent in source, fine as undefined
    {
        id: 3,
        name: 'copy-audits',
        requiresSource: true,
        async run(srcDb, dstDb) {
            const src = srcDb.collection('audits');
            const dst = dstDb.collection('audits');
            const docs = await src.find({}).toArray();
            if (docs.length === 0) {
                console.log('[migration] audits: source empty, nothing to copy');
                return;
            }

            const ops = docs.map(doc => {
                const audit = {
                    ...doc,
                    creator: remapUserId(doc.creator),
                    collaborators: remapUserArray(doc.collaborators),
                    reviewers: remapUserArray(doc.reviewers),
                    approvals: remapUserArray(doc.approvals),
                };

                return {
                    updateOne: {
                        filter: { _id: audit._id },
                        update: { $setOnInsert: audit },
                        upsert: true,
                    },
                };
            });
            const result = await dst.bulkWrite(ops, { ordered: false });
            console.log(`[migration] audits: ${result.upsertedCount} inserted, ${result.matchedCount} already existed`);
        },
    },

    // ── Step 4: Add isRetest field to all migrated audits that lack it ────────
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

    // ── Step 5: Add retestEvidence / retestPassed to all finding subdocuments ─
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

    // ── Step 6: Add cvssv4 field to vulnerability top-level documents ─────────
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

    // ── Step 7: Add cvssv4 field to finding subdocuments in audits ────────────
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

    // ── Step 8: Add executiveSummary object to all audit documents ────────────
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

    // ── Step 9: Add report chart theme settings ───────────────────────────────
    {
        id: 9,
        name: 'add-chartTheme-to-settings',
        async run(_srcDb, dstDb) {
            const col = dstDb.collection('settings');
            const result = await col.updateMany(
                { 'report.public.chartTheme': { $exists: false } },
                {
                    $set: {
                        'report.public.chartTheme': {
                            titleColor: '#000000',
                            titleSize: 16,
                            titleBold: true,
                            legendColor: '#404040',
                            legendSize: 11,
                            legendPosition: 'r',
                            dataLabelColor: '#ffffff',
                            dataLabelSize: 11,
                            dataLabelBold: true,
                            dataLabelMode: 'value',
                            borderEnabled: false,
                            borderColor: '#d9e2f3',
                            borderWidth: 1,
                            plotAreaFill: 'none',
                            view3DRotX: 30,
                            view3DRotY: 30,
                            view3DPerspective: 30,
                            view3DRightAngleAxes: false,
                        },
                    },
                }
            );
            console.log(`[migration] add-chartTheme-to-settings: ${result.modifiedCount} settings documents updated`);
        },
    },

    // ── Step 10: Build VulnerabilityTaxonomy from legacy collections ──────────
    // Folds the orthogonal pwndoc-ng `vulnerabilitytypes` (per-locale strings)
    // and `vulnerabilitycategories` (top-level grouping with sort config) into
    // the new unified taxonomy collection.
    //
    // Mapping rationale: pwndoc-ng's `category` was the closest analog to the
    // new top-level `type`, so legacy categories become type-root rows and
    // carry their sort config forward. Legacy `vulnerabilitytypes` are
    // de-duplicated by name (locale is dropped — taxonomy is English-only)
    // and inserted as type-root rows only when no row already exists.
    {
        id: 10,
        name: 'build-vulnerability-taxonomy',
        async run(_srcDb, dstDb) {
            const taxCol = dstDb.collection('vulnerabilitytaxonomies');
            const catCol = dstDb.collection('vulnerabilitycategories');
            const typeCol = dstDb.collection('vulnerabilitytypes');

            // Ensure unique index exists before bulk upserts.
            try {
                await taxCol.createIndex(
                    { type: 1, category: 1, subcategory: 1 },
                    { name: 'unique_taxonomy_path', unique: true }
                );
            } catch (_) { /* index may already exist */ }

            let fromCategories = 0;
            const cats = await catCol.find({}).toArray();
            for (const c of cats) {
                if (!c.name) continue;
                const r = await taxCol.updateOne(
                    { type: c.name, category: '', subcategory: '' },
                    {
                        $setOnInsert: {
                            type: c.name,
                            category: '',
                            subcategory: '',
                            code: '',
                            sortValue: c.sortValue || 'cvssScore',
                            sortOrder: c.sortOrder || 'desc',
                            sortAuto: c.sortAuto !== undefined ? c.sortAuto : true,
                            createdAt: new Date(),
                            updatedAt: new Date(),
                        },
                    },
                    { upsert: true }
                );
                if (r.upsertedCount) fromCategories++;
            }

            let fromTypes = 0;
            const seenTypeNames = new Set();
            const types = await typeCol.find({}).toArray();
            for (const t of types) {
                if (!t.name) continue;
                if (seenTypeNames.has(t.name)) continue;
                seenTypeNames.add(t.name);
                const r = await taxCol.updateOne(
                    { type: t.name, category: '', subcategory: '' },
                    {
                        $setOnInsert: {
                            type: t.name,
                            category: '',
                            subcategory: '',
                            code: '',
                            sortValue: 'cvssScore',
                            sortOrder: 'desc',
                            sortAuto: true,
                            createdAt: new Date(),
                            updatedAt: new Date(),
                        },
                    },
                    { upsert: true }
                );
                if (r.upsertedCount) fromTypes++;
            }

            console.log(`[migration] build-taxonomy: ${fromCategories} from categories, ${fromTypes} from types (deduped)`);
        },
    },

    // ── Step 11: Backfill vulnerability.taxonomies from legacy fields ─────────
    // Copies each vulnerability's legacy `category` (and falls back to
    // details[].vulnType if category is empty) into the new `taxonomies[]`
    // array as a single type-root entry. Legacy fields are left in place
    // (kept until Phase 2) so existing report templates and finding-edit UI
    // continue to work.
    {
        id: 11,
        name: 'backfill-vulnerability-taxonomies',
        async run(_srcDb, dstDb) {
            const col = dstDb.collection('vulnerabilities');
            const cursor = col.find({
                $or: [
                    { taxonomies: { $exists: false } },
                    { taxonomies: { $size: 0 } },
                ],
            });
            let updated = 0;
            while (await cursor.hasNext()) {
                const v = await cursor.next();
                let typeName = v.category || '';
                if (!typeName && Array.isArray(v.details)) {
                    const d = v.details.find(x => x && x.vulnType);
                    if (d) typeName = d.vulnType;
                }
                const tax = typeName
                    ? [{ type: typeName, category: '', subcategory: '', code: '' }]
                    : [];
                await col.updateOne({ _id: v._id }, { $set: { taxonomies: tax } });
                updated++;
            }
            console.log(`[migration] backfill-vulnerability-taxonomies: ${updated} vulnerabilities updated`);
        },
    },

    // ── Step 12: Backfill audit.findings[i].taxonomies from legacy fields ─────
    // Each finding embeds its taxonomy at the moment of creation. Apply the
    // same precedence as step 11: prefer `category`, fall back to `vulnType`.
    //
    // DB impact: updates `findings` array on all audit documents that have at
    // least one finding without a taxonomies[] entry.
    {
        id: 12,
        name: 'backfill-finding-taxonomies',
        async run(_srcDb, dstDb) {
            const col = dstDb.collection('audits');
            const cursor = col.find({
                'findings.0': { $exists: true },
            });
            let auditsTouched = 0;
            let findingsTouched = 0;
            while (await cursor.hasNext()) {
                const a = await cursor.next();
                let dirty = false;
                const findings = (a.findings || []).map((f) => {
                    if (Array.isArray(f.taxonomies) && f.taxonomies.length > 0) return f;
                    const typeName = f.category || f.vulnType || '';
                    const tax = typeName
                        ? [{ type: typeName, category: '', subcategory: '', code: '' }]
                        : [];
                    if (!Array.isArray(f.taxonomies) || f.taxonomies.length !== tax.length) {
                        dirty = true;
                        findingsTouched++;
                        return { ...f, taxonomies: tax };
                    }
                    return f;
                });
                if (dirty) {
                    await col.updateOne({ _id: a._id }, { $set: { findings } });
                    auditsTouched++;
                }
            }
            console.log(`[migration] backfill-finding-taxonomies: ${findingsTouched} findings updated across ${auditsTouched} audits`);
        },
    },

    // ── Step 13: Drop clients collection ─────────────────────────────────────
    // The Client concept has been removed from autopwndoc. Drop the collection
    // from the destination DB and unset the client field on all audits.
    {
        id: 13,
        name: 'drop-clients',
        async run(_srcDb, dstDb) {
            const collections = await dstDb.listCollections({ name: 'clients' }).toArray();
            if (collections.length > 0) {
                await dstDb.collection('clients').drop();
                console.log('[migration] drop-clients: clients collection dropped');
            } else {
                console.log('[migration] drop-clients: clients collection did not exist, nothing to drop');
            }
            const result = await dstDb.collection('audits').updateMany(
                { client: { $exists: true } },
                { $unset: { client: '' } }
            );
            console.log(`[migration] drop-clients: client field unset on ${result.modifiedCount} audits`);
        },
    },

    // ── Step 14: Migrate custom sections to the new type-aware schema ────────
    // CustomSection model gained `type` ('text'|'checklist') and `rows[]` in
    // the custom-sections revamp. Existing docs pre-date this field.
    //
    // DB impact (customsections collection):
    //   Sets type='text' and rows=[] on every document that lacks `type`.
    //
    // DB impact (audits collection):
    //   For every audit section subdocument:
    //     - Sets `type` to 'text' if missing (all pre-revamp sections were text).
    //     - Initialises `rows` to [] if missing.
    //     - Drops the legacy `customFields` subdocument array from sections
    //       (sections are now self-contained; the generic CustomField system
    //       was never correctly wired for sections and the data is unusable).
    {
        id: 14,
        name: 'custom-sections-type-revamp',
        async run(_srcDb, dstDb) {
            // 1. CustomSection template documents
            const sectionCol = dstDb.collection('customsections');
            const r1 = await sectionCol.updateMany(
                { type: { $exists: false } },
                { $set: { type: 'text', rows: [] } }
            );
            console.log(`[migration] custom-sections-type-revamp: ${r1.modifiedCount} customsections backfilled`);

            // 2. Embedded audit sections
            const auditCol = dstDb.collection('audits');
            const cursor = auditCol.find({ 'sections.0': { $exists: true } });
            let auditsTouched = 0;
            while (await cursor.hasNext()) {
                const a = await cursor.next();
                const sections = (a.sections || []).map(s => {
                    // eslint-disable-next-line no-unused-vars
                    const { customFields, ...rest } = s;
                    return {
                        ...rest,
                        type: rest.type || 'text',
                        rows: rest.rows || [],
                    };
                });
                await auditCol.updateOne({ _id: a._id }, { $set: { sections } });
                auditsTouched++;
            }
            console.log(`[migration] custom-sections-type-revamp: ${auditsTouched} audit section arrays updated`);
        },
    },

    // ── Step 15: Remove retired French and Chinese language options ─────────
    // autopwndoc now exposes English, Spanish, and German as supported UI/report
    // languages. Remove legacy French/Chinese rows from migrated or existing DBs
    // so selectors no longer offer unsupported locales.
    {
        id: 15,
        name: 'remove-retired-locales',
        async run(_srcDb, dstDb) {
            const retiredLocales = ['fr', 'fr-FR', 'zh', 'zh-CN'];
            const retiredLanguageNames = ['French', 'Français', 'Francais', 'Chinese', 'Chinese (Simplified)', '中文'];
            const result = await dstDb.collection('languages').deleteMany({
                $or: [
                    { locale: { $in: retiredLocales } },
                    { language: { $in: retiredLanguageNames } },
                ],
            });
            console.log(`[migration] remove-retired-locales: ${result.deletedCount} language rows removed`);
        },
    },

    // ── Step 16: Remove obsolete WSTG general custom-field remnants ─────────
    // Earlier checklist experiments left two generic CustomField rows on the
    // audit General page ("WSTG Checklist" and "wstg"). They are not part of
    // the durable audit model and should not appear on existing or future
    // audits.
    {
        id: 16,
        name: 'remove-wstg-general-custom-field-remnants',
        async run(_srcDb, dstDb) {
            const customFieldCol = dstDb.collection('customfields');
            const remnantFields = await customFieldCol.find({
                display: 'general',
                label: { $in: ['WSTG Checklist', 'wstg'] },
            }).project({_id: 1, label: 1}).toArray();

            if (remnantFields.length === 0) {
                console.log('[migration] remove-wstg-general-custom-field-remnants: no custom fields found');
                return;
            }

            const ids = remnantFields.map(field => field._id);
            const labels = remnantFields.map(field => field.label);
            const pullMatch = {$or: [
                {customField: {$in: ids}},
                {'customField._id': {$in: ids}},
                {'customField.label': {$in: labels}},
            ]};
            const deleteResult = await customFieldCol.deleteMany({_id: {$in: ids}});
            const auditResult = await dstDb.collection('audits').updateMany({}, {
                $pull: {
                    customFields: pullMatch,
                    'findings.$[].customFields': pullMatch,
                },
            });
            const vulnResult = await dstDb.collection('vulnerabilities').updateMany({}, {
                $pull: {'details.$[].customFields': pullMatch},
            });
            const updateResult = await dstDb.collection('vulnerabilityupdates').updateMany({}, {
                $pull: {customFields: pullMatch},
            });

            console.log(
                `[migration] remove-wstg-general-custom-field-remnants: ${deleteResult.deletedCount} customfields removed, ` +
                `${auditResult.modifiedCount} audits cleaned, ${vulnResult.modifiedCount} vulnerabilities cleaned, ` +
                `${updateResult.modifiedCount} vulnerability updates cleaned`
            );
        },
    },

    // ── Step 17: Clean embedded WSTG custom-field copies ────────────────────
    // Step 16 deletes the source CustomField rows. Databases that already ran
    // the first version of that step can still have embedded audit copies
    // because audit custom fields are stored as mixed snapshots, not only
    // ObjectId refs. This pass removes those orphaned snapshots by label.
    {
        id: 17,
        name: 'remove-embedded-wstg-general-custom-field-copies',
        async run(_srcDb, dstDb) {
            const labels = ['WSTG Checklist', 'wstg'];
            const knownIds = [
                new mongoose.Types.ObjectId('69ff65003358ec1c5776ae0d'),
                new mongoose.Types.ObjectId('6a0095990d8d2846272c012d'),
            ];
            const pullMatch = {$or: [
                {customField: {$in: knownIds}},
                {'customField._id': {$in: knownIds}},
                {'customField.label': {$in: labels}},
            ]};

            const auditResult = await dstDb.collection('audits').updateMany({}, {
                $pull: {
                    customFields: pullMatch,
                    'findings.$[].customFields': pullMatch,
                },
            });
            const vulnResult = await dstDb.collection('vulnerabilities').updateMany({}, {
                $pull: {'details.$[].customFields': pullMatch},
            });
            const updateResult = await dstDb.collection('vulnerabilityupdates').updateMany({}, {
                $pull: {customFields: pullMatch},
            });

            console.log(
                `[migration] remove-embedded-wstg-general-custom-field-copies: ` +
                `${auditResult.modifiedCount} audits cleaned, ${vulnResult.modifiedCount} vulnerabilities cleaned, ` +
                `${updateResult.modifiedCount} vulnerability updates cleaned`
            );
        },
    },

];

// ─── Runner ───────────────────────────────────────────────────────────────────

async function runMigration() {
    const migrateFrom = process.env.MIGRATE_FROM;

    // Always run destination-only steps (schema migrations like the taxonomy
    // backfill) on backend startup. Source-dependent steps (marked
    // `requiresSource: true`) only run when MIGRATE_FROM is set; otherwise
    // they're deferred until the next startup with MIGRATE_FROM populated.

    let dstDb;
    try {
        dstDb = await waitForDestinationDb();
    } catch (err) {
        console.error('[migration] Could not get destination database:', err.message);
        return;
    }

    let srcConn = null;
    let srcDb = null;
    if (migrateFrom) {
        console.log(`[migration] MIGRATE_FROM is set — connecting to source: ${migrateFrom}`);
        try {
            srcConn = await mongoose.createConnection(migrateFrom, {
                serverSelectionTimeoutMS: 8000,
            }).asPromise();
            srcDb = srcConn.db;
        } catch (err) {
            console.error('[migration] Could not connect to source database:', err.message);
            console.error('[migration] Source-dependent steps will be skipped.');
        }
    }

    // Ensure the tracking collection exists and has an index on step id.
    const migrationsCol = dstDb.collection('_migrations');
    await migrationsCol.createIndex({ id: 1 }, { unique: true });

    let appliedCount = 0;
    let skippedCount = 0;
    let deferredCount = 0;

    for (const step of STEPS) {
        const already = await migrationsCol.findOne({ id: step.id });
        if (already) {
            skippedCount++;
            continue;
        }

        if (step.requiresSource && !srcDb) {
            // Need source but don't have it — defer; will retry next startup.
            deferredCount++;
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
            if (srcConn) await srcConn.close();
            return;
        }
    }

    if (srcConn) await srcConn.close();

    if (appliedCount > 0 || deferredCount > 0) {
        const tail = deferredCount ? `, ${deferredCount} deferred (need MIGRATE_FROM)` : '';
        console.log(`[migration] Done. ${appliedCount} steps applied, ${skippedCount} already up to date${tail}.`);
    }
}

module.exports = { runMigration };
