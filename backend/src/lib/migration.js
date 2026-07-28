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
const { DEFAULT_MCP_GUIDANCE } = require('./mcp-guidance');

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

// Migration step definitions
// Every step must be idempotent. Use $set / $setOnInsert / upsert patterns
// rather than insertOne when the destination might already have data.

const STEPS = [

    // Step 1: Copy core collections from pwndoc-ng verbatim
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

    // Step 2: Copy vulnerabilities
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

    // Step 3: Copy audits
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

    // Step 9: Add report chart theme settings
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
                            pieExplosion: 0,
                        },
                    },
                }
            );
            console.log(`[migration] add-chartTheme-to-settings: ${result.modifiedCount} settings documents updated`);
        },
    },

    // Step 10: Build VulnerabilityTaxonomy from legacy collections
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

    // Step 11: Backfill vulnerability.taxonomies from legacy fields
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

    // Step 12: Backfill audit.findings[i].taxonomies from legacy fields
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

    // Step 13: Drop clients collection
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

    // Step 14: Migrate custom sections to the new type-aware schema
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

    // Step 15: Remove retired French and Chinese language options
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

    // Step 16: Remove obsolete WSTG general custom-field remnants
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

    // Step 17: Clean embedded WSTG custom-field copies
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

    // Step 18: Remove legacy classifier storage
    // After taxonomies[] became the canonical classifier, these loose legacy
    // fields are no longer written by the API. Remove stored remnants so future
    // reads and exports are taxonomy-first.
    {
        id: 18,
        name: 'drop-legacy-vulnerability-classifier-fields',
        async run(_srcDb, dstDb) {
            if (process.env.NODE_ENV === 'test') {
                console.log('[migration] drop-legacy-vulnerability-classifier-fields: skipped in test bootstrap');
                return;
            }
            const vulnerabilityCol = dstDb.collection('vulnerabilities');
            const auditCol = dstDb.collection('audits');
            const updateCol = dstDb.collection('vulnerabilityupdates');

            const vulnResult = await vulnerabilityCol.updateMany({}, {
                $unset: {
                    category: '',
                    'details.$[].vulnType': '',
                },
            });

            const auditResult = await auditCol.updateMany({}, {
                $unset: {
                    'findings.$[].category': '',
                    'findings.$[].vulnType': '',
                },
            });

            const updateResult = await updateCol.updateMany({}, {
                $unset: {
                    category: '',
                    vulnType: '',
                },
            });

            console.log(
                `[migration] drop-legacy-vulnerability-classifier-fields: ` +
                `${vulnResult.modifiedCount || 0} vulnerabilities, ${auditResult.modifiedCount || 0} audits, ` +
                `${updateResult.modifiedCount || 0} vulnerability updates cleaned`
            );
        },
    },

    // Step 19: Default severity chart labels to percentages
    {
        id: 19,
        name: 'default-severity-chart-labels-to-percent',
        async run(_srcDb, dstDb) {
            const col = dstDb.collection('settings');
            const result = await col.updateMany(
                {
                    $or: [
                        { 'report.public.chartTheme.dataLabelMode': { $exists: false } },
                        { 'report.public.chartTheme.dataLabelMode': 'value' },
                    ],
                },
                { $set: { 'report.public.chartTheme.dataLabelMode': 'percent' } }
            );
            console.log(`[migration] default-severity-chart-labels-to-percent: ${result.modifiedCount} settings documents updated`);
        },
    },
    // Step 20: Add pie chart explosion setting
    {
        id: 20,
        name: 'add-chart-pie-explosion-setting',
        async run(_srcDb, dstDb) {
            const col = dstDb.collection('settings');
            const result = await col.updateMany(
                { 'report.public.chartTheme.pieExplosion': { $exists: false } },
                { $set: { 'report.public.chartTheme.pieExplosion': 0 } }
            );
            console.log(`[migration] add-chart-pie-explosion-setting: ${result.modifiedCount} settings documents updated`);
        },
    },
    // Step 21: Add configurable vision anonymization regex rules
    {
        id: 21,
        name: 'add-vision-anonymization-regex-rules',
        async run(_srcDb, dstDb) {
            const col = dstDb.collection('settings');
            const rules = [
                { name: 'IPv4 addresses', pattern: '\\b(?:\\d{1,3}\\.){3}\\d{1,3}\\b', flags: 'g', replacement: '[IP_REDACTED]', enabled: true },
                { name: 'IPv6 addresses', pattern: '\\b(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}\\b', flags: 'g', replacement: '[IP_REDACTED]', enabled: true },
                { name: 'Email addresses', pattern: '\\b[A-Za-z0-9._%+\\-]+@[A-Za-z0-9.\\-]+\\.[A-Za-z]{2,}\\b', flags: 'g', replacement: '[EMAIL_REDACTED]', enabled: true },
                { name: 'Domain names', pattern: '\\b(?:[a-zA-Z0-9\\-]+\\.){2,}[a-zA-Z]{2,}\\b', flags: 'g', replacement: '[DOMAIN_REDACTED]', enabled: true },
                { name: 'Common hostnames', pattern: '\\b(?:server|host|dc|ad|ws|pc|laptop|desktop|node|worker|master|slave|db|sql|web|app|api|proxy|vpn|fw|firewall|router|switch|lb)\\d*[-\\w]*', flags: 'gi', replacement: '[HOST_REDACTED]', enabled: true }
            ];
            const result = await col.updateMany(
                { 'ai.private.visionAnonymizeRegexRules': { $exists: false } },
                { $set: { 'ai.private.visionAnonymizeRegexRules': rules } }
            );
            console.log(`[migration] add-vision-anonymization-regex-rules: ${result.modifiedCount} settings documents updated`);
        },
    },
    // Step 22: Extend default vision anonymization to full URLs and compressed IPv6
    {
        id: 22,
        name: 'extend-vision-anonymization-network-rules',
        async run(_srcDb, dstDb) {
            const col = dstDb.collection('settings');
            const urlRule = {
                name: 'URLs',
                pattern: '\\b(?:(?:https?|ftp):\\/\\/|www\\.)[A-Za-z0-9._~:/?#\\[\\]@!$&\'()*+,;=%-]*[A-Za-z0-9_~/#\\]=%-]',
                flags: 'gi',
                replacement: '[URL_REDACTED]',
                enabled: true
            };
            const oldIpv6Pattern = '\\b(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}\\b';
            const ipv6Pattern = '(?<![0-9A-Fa-f:])(?:(?:[0-9A-Fa-f]{1,4}:){7}[0-9A-Fa-f]{1,4}|(?:[0-9A-Fa-f]{1,4}:){1,7}:|(?:[0-9A-Fa-f]{1,4}:){1,6}:[0-9A-Fa-f]{1,4}|(?:[0-9A-Fa-f]{1,4}:){1,5}(?::[0-9A-Fa-f]{1,4}){1,2}|(?:[0-9A-Fa-f]{1,4}:){1,4}(?::[0-9A-Fa-f]{1,4}){1,3}|(?:[0-9A-Fa-f]{1,4}:){1,3}(?::[0-9A-Fa-f]{1,4}){1,4}|(?:[0-9A-Fa-f]{1,4}:){1,2}(?::[0-9A-Fa-f]{1,4}){1,5}|[0-9A-Fa-f]{1,4}:(?:(?::[0-9A-Fa-f]{1,4}){1,6})|:(?:(?::[0-9A-Fa-f]{1,4}){1,7}|:))(?![0-9A-Fa-f:])';

            const urlResult = await col.updateMany(
                { 'ai.private.visionAnonymizeRegexRules': { $not: { $elemMatch: { name: 'URLs' } } } },
                { $push: { 'ai.private.visionAnonymizeRegexRules': { $each: [urlRule], $position: 0 } } }
            );
            const ipv6Result = await col.updateMany(
                {
                    'ai.private.visionAnonymizeRegexRules': {
                        $elemMatch: { name: 'IPv6 addresses', pattern: oldIpv6Pattern }
                    }
                },
                { $set: { 'ai.private.visionAnonymizeRegexRules.$[rule].pattern': ipv6Pattern } },
                { arrayFilters: [{ 'rule.name': 'IPv6 addresses', 'rule.pattern': oldIpv6Pattern }] }
            );

            console.log(
                `[migration] extend-vision-anonymization-network-rules: ` +
                `${urlResult.modifiedCount} URL rules added, ${ipv6Result.modifiedCount} IPv6 rules updated`
            );
        },
    },
    // Step 23: Make the vision LLM anonymization instruction configurable
    {
        id: 23,
        name: 'add-vision-anonymization-prompt',
        async run(_srcDb, dstDb) {
            const col = dstDb.collection('settings');
            const prompt = `IMPORTANT: You must anonymize all sensitive information in your output. Replace the following with [REDACTED]:
- IP addresses (e.g. 192.168.1.1, 10.0.0.1)
- URLs, including schemes, ports, paths, query strings, and fragments
- Domain names and hostnames (e.g. example.com, server01.internal)
- Email addresses
- Usernames and account names
- Passwords or credentials
- API keys or tokens
- Company or product names that could identify the target`;
            const result = await col.updateMany(
                { 'ai.private.visionAnonymizationPrompt': { $exists: false } },
                { $set: { 'ai.private.visionAnonymizationPrompt': prompt } }
            );
            console.log(`[migration] add-vision-anonymization-prompt: ${result.modifiedCount} settings documents updated`);
        },
    },

    // Step 24: Add optional checklist classification metadata
    // Checklist section rows can now be free-form or linked to a taxonomy/code.
    // Existing rows are preserved and receive empty metadata plus auto=false.
    {
        id: 24,
        name: 'add-checklist-row-classification-metadata',
        async run(_srcDb, dstDb) {
            function normalizeTaxonomy(row) {
                const taxonomy = (row && row.taxonomy) || {};
                return {
                    type: taxonomy.type || '',
                    category: taxonomy.category || '',
                    subcategory: taxonomy.subcategory || '',
                    code: taxonomy.code || '',
                };
            }

            const customSectionCol = dstDb.collection('customsections');
            let customSectionsTouched = 0;
            const customSections = await customSectionCol.find({rows: {$exists: true, $type: 'array'}}).toArray();
            for (const section of customSections) {
                const rows = (section.rows || []).map(row => ({
                    ...row,
                    code: row.code || '',
                    taxonomy: normalizeTaxonomy(row),
                }));
                await customSectionCol.updateOne({_id: section._id}, {$set: {rows}});
                customSectionsTouched++;
            }

            const auditCol = dstDb.collection('audits');
            let auditsTouched = 0;
            const audits = await auditCol.find({sections: {$exists: true, $type: 'array'}}).toArray();
            for (const audit of audits) {
                const sections = (audit.sections || []).map(section => {
                    if (section.type !== 'checklist' || !Array.isArray(section.rows)) return section;
                    return {
                        ...section,
                        rows: section.rows.map(row => ({
                            ...row,
                            code: row.code || '',
                            taxonomy: normalizeTaxonomy(row),
                            auto: row.auto === true,
                        })),
                    };
                });
                await auditCol.updateOne({_id: audit._id}, {$set: {sections}});
                auditsTouched++;
            }

            console.log(
                `[migration] add-checklist-row-classification-metadata: ` +
                `${customSectionsTouched} custom sections, ${auditsTouched} audits normalized`
            );
        },
    },

    // Step 25: Add checklist nesting metadata
    // Checklist rows can be nested for methodology/category trees. Existing
    // rows remain top-level and receive a best-effort path.
    {
        id: 25,
        name: 'add-checklist-row-nesting-metadata',
        async run(_srcDb, dstDb) {
            function pathFor(row) {
                if (row.path) return row.path;
                const taxonomy = (row && row.taxonomy) || {};
                return [taxonomy.category, taxonomy.subcategory].filter(Boolean).join(' / ') || row.label || '';
            }

            function normalizeRows(rows) {
                return (rows || []).map(row => ({
                    ...row,
                    level: Math.max(0, parseInt(row.level, 10) || 0),
                    path: pathFor(row),
                }));
            }

            const customSectionCol = dstDb.collection('customsections');
            let customSectionsTouched = 0;
            const customSections = await customSectionCol.find({rows: {$exists: true, $type: 'array'}}).toArray();
            for (const section of customSections) {
                await customSectionCol.updateOne({_id: section._id}, {$set: {rows: normalizeRows(section.rows)}});
                customSectionsTouched++;
            }

            const auditCol = dstDb.collection('audits');
            let auditsTouched = 0;
            const audits = await auditCol.find({sections: {$exists: true, $type: 'array'}}).toArray();
            for (const audit of audits) {
                const sections = (audit.sections || []).map(section => {
                    if (section.type !== 'checklist' || !Array.isArray(section.rows)) return section;
                    return {...section, rows: normalizeRows(section.rows)};
                });
                await auditCol.updateOne({_id: audit._id}, {$set: {sections}});
                auditsTouched++;
            }

            console.log(
                `[migration] add-checklist-row-nesting-metadata: ` +
                `${customSectionsTouched} custom sections, ${auditsTouched} audits normalized`
            );
        },
    },

    // Step 26: Add SSO authentication settings and user link fields
    // Existing users remain local-password accounts until an admin links an SSO
    // identity or the SSO email auto-link option links exactly one matching user.
    {
        id: 26,
        name: 'add-sso-authentication-settings',
        async run(_srcDb, dstDb) {
            const settingsCol = dstDb.collection('settings');
            const defaultSso = {
                enabled: false,
                public: {
                    providerId: 'oauth2',
                    providerName: 'SSO',
                    registrationEnabled: false,
                    autoLinkExistingUsers: false,
                    authorizationUrl: '',
                    tokenUrl: '',
                    userInfoUrl: '',
                    scope: 'openid profile email',
                    subjectClaim: 'sub',
                    usernameClaim: 'preferred_username',
                    firstnameClaim: 'given_name',
                    lastnameClaim: 'family_name',
                    emailClaim: 'email',
                },
                private: {
                    clientId: '',
                    clientSecret: '',
                },
            };
            await settingsCol.updateOne({}, {$setOnInsert: {authentication: {sso: defaultSso}}}, {upsert: true});
            await settingsCol.updateMany({'authentication.sso': {$exists: false}}, {$set: {'authentication.sso': defaultSso}});

            const users = dstDb.collection('users');
            const result = await users.updateMany(
                {sso: {$exists: false}},
                {$set: {sso: {provider: '', subject: '', email: '', linkedAt: null}}}
            );

            console.log(`[migration] add-sso-authentication-settings: ${result.modifiedCount || 0} users initialized`);
        },
    },

    // Step 27: Add enforced 2FA setting and user login timestamp
    // `authentication.enforce2fa` prompts users without TOTP to complete setup
    // after login. `lastLoginAt` records successful interactive logins.
    {
        id: 27,
        name: 'add-enforced-2fa-and-user-login-timestamps',
        async run(_srcDb, dstDb) {
            const settingsCol = dstDb.collection('settings');
            await settingsCol.updateOne(
                {},
                {$setOnInsert: {'authentication.enforce2fa': false}},
                {upsert: true}
            );
            await settingsCol.updateMany(
                {'authentication.enforce2fa': {$exists: false}},
                {$set: {'authentication.enforce2fa': false}}
            );

            const users = dstDb.collection('users');
            const result = await users.updateMany(
                {lastLoginAt: {$exists: false}},
                {$set: {lastLoginAt: null}}
            );

            console.log(`[migration] add-enforced-2fa-and-user-login-timestamps: ${result.modifiedCount || 0} users initialized`);
        },
    },

    // Step 28: Seed DB-backed custom roles from config/roles.json
    // Roles management moved from the static roles.json file to the `roles`
    // collection (model backend/src/models/role.js, managed via /api/data/roles).
    // Existing file-defined roles are seeded once; the file remains only as an
    // ACL fallback for databases that have not run this step yet.
    {
        id: 28,
        name: 'seed-db-roles-from-roles-json',
        async run(_srcDb, dstDb) {
            let fileRoles = {};
            try {
                fileRoles = require('../config/roles.json');
            } catch (_) {
                console.log('[migration] seed-db-roles: no roles.json found, nothing to seed');
                return;
            }

            const rolesCol = dstDb.collection('roles');
            let seeded = 0;
            for (const [name, def] of Object.entries(fileRoles)) {
                if (name === 'user' || name === 'admin') continue;
                const existing = await rolesCol.findOne({name});
                if (existing) continue;
                await rolesCol.insertOne({
                    name,
                    displayName: name.charAt(0).toUpperCase() + name.slice(1),
                    description: '',
                    allows: Array.isArray(def.allows) ? def.allows : [],
                    inherits: Array.isArray(def.inherits) ? def.inherits.filter(r => r === 'user') : [],
                    createdAt: new Date(),
                    updatedAt: new Date()
                });
                seeded++;
            }
            console.log(`[migration] seed-db-roles: ${seeded} roles seeded from roles.json`);
        },
    },

    // Step 29: Replace finding.retestPassed (Boolean|null) with
    // finding.retestStatus (enum 'ok'|'ko'|'partial'|'unknown').
    // true -> 'ok', false -> 'ko', null/missing -> 'unknown'.
    {
        id: 29,
        name: 'replace-retestPassed-with-retestStatus',
        async run(_srcDb, dstDb) {
            const audits = dstDb.collection('audits');

            const rOk = await audits.updateMany(
                { 'findings.retestPassed': true },
                { $set: { 'findings.$[f].retestStatus': 'ok' } },
                { arrayFilters: [{ 'f.retestPassed': true }] }
            );
            const rKo = await audits.updateMany(
                { 'findings.retestPassed': false },
                { $set: { 'findings.$[f].retestStatus': 'ko' } },
                { arrayFilters: [{ 'f.retestPassed': false }] }
            );
            const rUnknown = await audits.updateMany(
                { findings: { $exists: true, $ne: [] } },
                { $set: { 'findings.$[f].retestStatus': 'unknown' } },
                { arrayFilters: [{ 'f.retestStatus': { $exists: false } }] }
            );
            const rUnset = await audits.updateMany(
                { 'findings.retestPassed': { $exists: true } },
                { $unset: { 'findings.$[f].retestPassed': '' } },
                { arrayFilters: [{ 'f.retestPassed': { $exists: true } }] }
            );

            console.log(`[migration] retestStatus: ok on ${rOk.modifiedCount} audits, ko on ${rKo.modifiedCount}, unknown backfill on ${rUnknown.modifiedCount}, retestPassed removed on ${rUnset.modifiedCount}`);
        },
    },

    {
        id: 30,
        name: 'seed-per-field-input-anonymization-settings',
        async run(_srcDb, dstDb) {
            const settingsCol = dstDb.collection('settings');
            const visionService = require('./vision-service');
            const FIELDS = ['description', 'observation', 'remediation', 'poc', 'retestEvidence'];

            const doc = await settingsCol.findOne({});
            if (!doc) {
                console.log('[migration] no settings document yet — schema defaults will apply on first read');
                return;
            }

            const priv = (doc.ai && doc.ai.private) || {};
            const toSet = {};
            if (priv.anonymizationPrompt === undefined) {
                toSet['ai.private.anonymizationPrompt'] = visionService.DEFAULT_INPUT_ANONYMIZATION_PROMPT;
            }
            for (const f of FIELDS) {
                if (priv[`field_${f}_anonymizeRegex`] === undefined) toSet[`ai.private.field_${f}_anonymizeRegex`] = false;
                if (priv[`field_${f}_anonymizeLlm`] === undefined) toSet[`ai.private.field_${f}_anonymizeLlm`] = false;
            }

            if (Object.keys(toSet).length > 0) {
                await settingsCol.updateOne({ _id: doc._id }, { $set: toSet });
                console.log(`[migration] seeded ${Object.keys(toSet).length} per-field input-anonymization settings`);
            } else {
                console.log('[migration] per-field input-anonymization settings already present');
            }
        },
    },

    {
        id: 31,
        name: 'split-ai-model-params-and-raise-max-tokens-default',
        async run(_srcDb, dstDb) {
            const settingsCol = dstDb.collection('settings');

            const doc = await settingsCol.findOne({});
            if (!doc) {
                console.log('[migration] no settings document yet — schema defaults will apply on first read');
                return;
            }

            const pub = (doc.ai && doc.ai.public) || {};
            const visionPub = (doc.ai && doc.ai.visionPublic) || {};
            const toSet = {};

            // Raise the generation maxTokens only when it still holds the old
            // schema default (4096); a custom value is kept as-is.
            if (pub.maxTokens === undefined || pub.maxTokens === 4096) {
                toSet['ai.public.maxTokens'] = 32000;
            }

            // Seed the new per-vision-model generation parameters.
            if (visionPub.visionTemperature === undefined) toSet['ai.visionPublic.visionTemperature'] = 0.7;
            if (visionPub.visionMaxTokens === undefined) toSet['ai.visionPublic.visionMaxTokens'] = 32000;

            if (Object.keys(toSet).length > 0) {
                await settingsCol.updateOne({ _id: doc._id }, { $set: toSet });
                console.log(`[migration] applied ${Object.keys(toSet).length} AI model parameter settings`);
            } else {
                console.log('[migration] AI model parameter settings already present');
            }
        },
    },

    {
        id: 32,
        name: 'seed-anonymize-review-before-send-setting',
        async run(_srcDb, dstDb) {
            const settingsCol = dstDb.collection('settings');

            const doc = await settingsCol.findOne({});
            if (!doc) {
                console.log('[migration] no settings document yet — schema defaults will apply on first read');
                return;
            }

            const priv = (doc.ai && doc.ai.private) || {};
            if (priv.anonymizeReviewBeforeSend === undefined) {
                await settingsCol.updateOne({ _id: doc._id }, { $set: { 'ai.private.anonymizeReviewBeforeSend': false } });
                console.log('[migration] seeded ai.private.anonymizeReviewBeforeSend = false');
            } else {
                console.log('[migration] anonymizeReviewBeforeSend already present');
            }
        },
    },

    {
        id: 33,
        name: 'remove-languagetool-premium-fields',
        async run(_srcDb, dstDb) {
            const settingsCol = dstDb.collection('settings');
            const result = await settingsCol.updateOne(
                {},
                { $unset: { 'report.private.languageToolApiKey': '', 'report.private.languageToolUsername': '' } }
            );
            if (result.modifiedCount > 0) {
                console.log('[migration] removed LanguageTool Premium fields (apiKey, username)');
            } else {
                console.log('[migration] no LanguageTool Premium fields to remove');
            }
        },
    },

    // Step 34: Fold vulnerability translation groups into single documents.
    // The VulnerabilityTranslationGroup collection linked SEPARATE vulnerability
    // documents as translations of each other. The app now uses only pwndoc's
    // native model (one document, one details[] entry per language), so each
    // group is collapsed into its source document:
    //   - the linked document's locale detail physically moves into the source
    //     document's details[] (carrying the member's sync metadata);
    //   - group.sourceLocale becomes document.sourceLocale;
    //   - pending VulnerabilityUpdate proposals follow the moved locale;
    //   - the linked document is deleted once it holds no languages;
    //   - shared-metadata conflicts (e.g. differing CVSS) keep the SOURCE
    //     document's values and are logged for manual review;
    //   - if the source document already holds the linked locale inline, the
    //     linked document's content is preserved as a pending-review update
    //     instead of overwriting anything.
    // Finally the translation-group collection is dropped.
    {
        id: 34,
        name: 'fold-translation-groups-into-documents',
        async run(_srcDb, dstDb) {
            const existing = await dstDb.listCollections({ name: 'vulnerabilitytranslationgroups' }).toArray();
            if (existing.length === 0) {
                console.log('[migration] translation groups: collection absent, nothing to fold');
                return;
            }

            const groupsCol = dstDb.collection('vulnerabilitytranslationgroups');
            const vulnsCol = dstDb.collection('vulnerabilities');
            const updatesCol = dstDb.collection('vulnerabilityupdates');

            const groups = await groupsCol.find({}).toArray();
            const METADATA_FIELDS = ['cvssv3', 'cvssv4', 'priority', 'remediationComplexity', 'taxonomies'];
            let folded = 0;
            let deletedDocs = 0;
            let collisions = 0;
            let skipped = 0;
            const conflicts = [];

            const titleOf = (doc, locale) => {
                const d = (doc.details || []).find(x => x.locale === locale && x.title);
                return d ? d.title : '?';
            };

            for (const group of groups) {
                const members = (group.members || []).filter(m => m.vulnerability);
                const canonicalId = group.sourceVulnerability || (members[0] && members[0].vulnerability);
                const canonical = canonicalId ? await vulnsCol.findOne({ _id: canonicalId }) : null;
                if (!canonical) {
                    skipped++;
                    continue;
                }

                const details = canonical.details || [];
                const canonicalSet = {};
                if (group.sourceLocale) canonicalSet.sourceLocale = group.sourceLocale;

                for (const member of members) {
                    if (String(member.vulnerability) === String(canonical._id)) {
                        // Sync metadata for a locale that already lives in the
                        // canonical document itself.
                        const own = details.find(d => d.locale === member.locale && d.title);
                        if (own) {
                            if (member.lastEditedAt) own.lastEditedAt = member.lastEditedAt;
                            own.syncStatus = member.syncStatus || '';
                        }
                        continue;
                    }

                    const other = await vulnsCol.findOne({ _id: member.vulnerability });
                    if (!other) continue;

                    const detailIdx = (other.details || []).findIndex(d => d.locale === member.locale && d.title);
                    if (detailIdx !== -1) {
                        const movedDetail = other.details[detailIdx];
                        if (member.lastEditedAt) movedDetail.lastEditedAt = member.lastEditedAt;
                        movedDetail.syncStatus = member.syncStatus || '';

                        if (details.some(d => d.locale === member.locale && d.title)) {
                            // Locale collision: canonical already has this language
                            // inline. Keep the inline version, preserve the linked
                            // document's content as a pending-review proposal.
                            collisions++;
                            const creator = canonical.creator || other.creator
                                || (await dstDb.collection('users').findOne({}))._id;
                            await updatesCol.insertOne({
                                vulnerability: canonical._id,
                                creator: creator,
                                cvssv3: other.cvssv3 || undefined,
                                cvssv4: other.cvssv4 || undefined,
                                priority: other.priority || undefined,
                                remediationComplexity: other.remediationComplexity || undefined,
                                references: movedDetail.references || [],
                                taxonomies: other.taxonomies || [],
                                locale: member.locale,
                                title: movedDetail.title,
                                description: movedDetail.description,
                                observation: movedDetail.observation,
                                remediation: movedDetail.remediation,
                                customFields: movedDetail.customFields || [],
                                createdAt: new Date(),
                                updatedAt: new Date(),
                            });
                            canonicalSet.status = 2; // flag: has pending updates
                        } else {
                            for (const field of METADATA_FIELDS) {
                                const a = JSON.stringify(canonical[field] === undefined ? null : canonical[field]);
                                const b = JSON.stringify(other[field] === undefined ? null : other[field]);
                                if (a !== b) {
                                    conflicts.push({
                                        vulnerability: titleOf(canonical, group.sourceLocale) !== '?'
                                            ? titleOf(canonical, group.sourceLocale)
                                            : String(canonical._id),
                                        field: field,
                                        kept: canonical[field],
                                        dropped: other[field],
                                    });
                                }
                            }
                            details.push(movedDetail);
                            await updatesCol.updateMany(
                                { vulnerability: other._id, locale: member.locale },
                                { $set: { vulnerability: canonical._id } }
                            );
                        }
                        other.details.splice(detailIdx, 1);
                    }

                    const remaining = (other.details || []).filter(d => d.locale && d.title);
                    if (remaining.length === 0) {
                        await updatesCol.deleteMany({ vulnerability: other._id });
                        await vulnsCol.deleteOne({ _id: other._id });
                        deletedDocs++;
                    } else {
                        await vulnsCol.updateOne({ _id: other._id }, { $set: { details: other.details } });
                    }
                }

                canonicalSet.details = details;
                await vulnsCol.updateOne({ _id: canonical._id }, { $set: canonicalSet });
                folded++;
            }

            await groupsCol.drop().catch(() => {});

            console.log(`[migration] translation groups folded: ${folded} groups, ${deletedDocs} documents merged away, ${collisions} locale collisions preserved as pending-review updates, ${skipped} skipped (missing source doc)`);
            if (conflicts.length) {
                console.log(`[migration] ${conflicts.length} shared-metadata conflicts kept the source document's value — review manually:`);
                conflicts.forEach(c => {
                    console.log(`[migration]   "${c.vulnerability}" ${c.field}: kept ${JSON.stringify(c.kept)} / dropped ${JSON.stringify(c.dropped)}`);
                });
            }
            console.log('[migration] note: if AI embeddings are enabled, run a vulnerability reindex to purge rows of merged-away documents');
        },
    },

    // Step 35: Ensure every vulnerability document with language details has a
    // valid sourceLocale. Empty or stale values make translation sync fall back
    // to details[] order in some paths and disable stale/synced tracking in
    // others, so normalize them to the first valid language detail.
    {
        id: 35,
        name: 'backfill-vulnerability-source-locale',
        async run(_srcDb, dstDb) {
            const vulnsCol = dstDb.collection('vulnerabilities');
            const cursor = vulnsCol.find({});
            let updated = 0;

            while (await cursor.hasNext()) {
                const vuln = await cursor.next();
                const locales = (vuln.details || [])
                    .filter(detail => detail && detail.locale && detail.title)
                    .map(detail => detail.locale);
                const sourceLocale = locales.includes(vuln.sourceLocale) ? vuln.sourceLocale : (locales[0] || '');

                if ((vuln.sourceLocale || '') !== sourceLocale) {
                    await vulnsCol.updateOne(
                        { _id: vuln._id },
                        { $set: { sourceLocale } }
                    );
                    updated++;
                }
            }

            console.log(`[migration] backfill-vulnerability-source-locale: ${updated} vulnerabilities updated`);
        },
    },

    // Step 36: Backfill editable MCP client guidance fields. These defaults
    // were previously hardcoded in the MCP route and are now stored in settings
    // so administrators can tune the context exposed to MCP clients.
    {
        id: 36,
        name: 'backfill-mcp-guidance-settings',
        async run(_srcDb, dstDb) {
            const settingsCol = dstDb.collection('settings');
            const settings = await settingsCol.findOne({}) || {};
            const guidance = (settings.mcp && settings.mcp.guidance) || {};
            const set = {};

            Object.keys(DEFAULT_MCP_GUIDANCE).forEach(key => {
                if (typeof guidance[key] !== 'string' || !guidance[key].trim()) {
                    set[`mcp.guidance.${key}`] = DEFAULT_MCP_GUIDANCE[key];
                }
            });

            if (Object.keys(set).length) {
                await settingsCol.updateOne({}, { $set: set }, { upsert: true });
            }

            console.log(`[migration] backfill-mcp-guidance-settings: ${Object.keys(set).length} fields initialized`);
        },
    },

    // Step 37: Ensure older settings documents have the API-key container used
    // by owner-bound keys. Existing keys have no reliable historical creator,
    // so they deliberately remain unassigned and preserve legacy behaviour.
    {
        id: 37,
        name: 'initialize-api-key-ownership-container',
        async run(_srcDb, dstDb) {
            const result = await dstDb.collection('settings').updateMany(
                { 'api.keys': { $exists: false } },
                { $set: { 'api.keys': [] } }
            );
            console.log(`[migration] initialize-api-key-ownership-container: ${result.modifiedCount} settings documents initialized`);
        },
    },

];

// Runner

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
