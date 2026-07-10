module.exports = function(app) {
    const fs = require('fs');
    const path = require('path');
    const mongoose = require('mongoose');
    const { EJSON } = require('bson');

    const Response = require('../lib/httpResponse.js');
    const acl = require('../lib/auth.js').acl;

    const backupPath = path.join(__basedir, '..', 'backups');

    // Collections never overwritten on restore so migration/version state
    // survives a restore.
    const RESTORE_EXCLUDE = ['_migrations'];

    const SLUG_PATTERN = /^[a-zA-Z0-9_.-]+$/;

    function ensureBackupDir() {
        if (!fs.existsSync(backupPath))
            fs.mkdirSync(backupPath, {recursive: true});
    }

    function backupFile(slug) {
        return path.join(backupPath, `${slug}.json`);
    }

    // Parse a backup file. Backups are MongoDB Extended JSON so ObjectIds and
    // Dates round-trip losslessly.
    function readBackup(slug) {
        const raw = fs.readFileSync(backupFile(slug), 'utf8');
        return EJSON.parse(raw, {relaxed: false});
    }

    function readMeta(slug) {
        try {
            const parsed = readBackup(slug);
            const stats = fs.statSync(backupFile(slug));
            return {
                slug: slug,
                name: parsed.name || slug,
                createdAt: parsed.createdAt || null,
                collections: Object.keys(parsed.data || {}),
                documentCount: Object.values(parsed.data || {}).reduce((a, arr) => a + (Array.isArray(arr) ? arr.length : 0), 0),
                sizeBytes: stats.size
            };
        }
        catch (_) {
            return null;
        }
    }

    function makeSlug(name) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        return `${timestamp}_${String(name).replace(/[^a-zA-Z0-9_-]/g, '-')}`.substring(0, 120);
    }

    // List available backups
    app.get("/api/backups", acl.hasPermission('backups:read'), function(req, res) {
        // #swagger.tags = ['Backup']
        try {
            ensureBackupDir();
            const files = fs.readdirSync(backupPath).filter(f => f.endsWith('.json'));
            const backups = files
                .map(f => readMeta(f.replace(/\.json$/, '')))
                .filter(Boolean)
                .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
            Response.Ok(res, backups);
        }
        catch (err) {
            Response.Internal(res, err);
        }
    });

    // Create a full-database backup
    app.post("/api/backups", acl.hasPermission('backups:create'), async function(req, res) {
        // #swagger.tags = ['Backup']
        try {
            ensureBackupDir();
            const name = (req.body.name && String(req.body.name).trim()) || 'backup';
            const slug = makeSlug(name);

            const db = mongoose.connection.db;
            const collections = await db.collections();
            const data = {};
            for (const col of collections) {
                if (col.collectionName.startsWith('system.')) continue;
                data[col.collectionName] = await col.find({}).toArray();
            }

            const payload = {name: name, createdAt: new Date().toISOString(), data: data};
            fs.writeFileSync(backupFile(slug), EJSON.stringify(payload, {relaxed: false}));
            Response.Created(res, readMeta(slug));
        }
        catch (err) {
            Response.Internal(res, err);
        }
    });

    // Download a backup file
    app.get("/api/backups/download/:slug", acl.hasPermission('backups:read'), function(req, res) {
        // #swagger.tags = ['Backup']
        if (!SLUG_PATTERN.test(req.params.slug))
            return Response.BadParameters(res, 'Invalid backup identifier');
        const file = backupFile(req.params.slug);
        if (!fs.existsSync(file))
            return Response.NotFound(res, 'Backup not found');
        try {
            Response.SendFile(res, `${req.params.slug}.json`, fs.readFileSync(file));
        }
        catch (err) {
            Response.Internal(res, err);
        }
    });

    // Upload a backup file (Extended-JSON content in body.content)
    app.post("/api/backups/upload", acl.hasPermission('backups:create'), function(req, res) {
        // #swagger.tags = ['Backup']
        try {
            ensureBackupDir();
            let content = req.body && req.body.content;
            if (typeof content !== 'string')
                return Response.BadParameters(res, 'Missing backup file content');
            const parsed = EJSON.parse(content, {relaxed: false});
            if (!parsed || typeof parsed !== 'object' || !parsed.data || typeof parsed.data !== 'object')
                return Response.BadParameters(res, 'Invalid backup file: missing data');

            const name = (parsed.name && String(parsed.name).trim()) || 'uploaded';
            const slug = makeSlug(name);
            const payload = {name: name, createdAt: parsed.createdAt || new Date().toISOString(), data: parsed.data};
            fs.writeFileSync(backupFile(slug), EJSON.stringify(payload, {relaxed: false}));
            Response.Created(res, readMeta(slug));
        }
        catch (err) {
            Response.Internal(res, err);
        }
    });

    // Restore from a backup: replaces each backed-up collection
    app.post("/api/backups/:slug/restore", acl.hasPermission('backups:update'), async function(req, res) {
        // #swagger.tags = ['Backup']
        if (!SLUG_PATTERN.test(req.params.slug))
            return Response.BadParameters(res, 'Invalid backup identifier');
        if (!fs.existsSync(backupFile(req.params.slug)))
            return Response.NotFound(res, 'Backup not found');
        try {
            const payload = readBackup(req.params.slug);
            const data = payload.data || {};
            const db = mongoose.connection.db;
            let restoredCollections = 0;
            let restoredDocs = 0;

            for (const [name, docs] of Object.entries(data)) {
                if (RESTORE_EXCLUDE.includes(name) || name.startsWith('system.')) continue;
                if (!Array.isArray(docs)) continue;
                const col = db.collection(name);
                await col.deleteMany({});
                if (docs.length > 0) {
                    await col.insertMany(docs, {ordered: false});
                    restoredDocs += docs.length;
                }
                restoredCollections++;
            }

            // Custom roles may have changed — reload the ACL from the DB
            await acl.reload();
            Response.Ok(res, {message: 'Backup restored successfully', collections: restoredCollections, documents: restoredDocs});
        }
        catch (err) {
            Response.Internal(res, err);
        }
    });

    // Delete a backup
    app.delete("/api/backups/:slug", acl.hasPermission('backups:delete'), function(req, res) {
        // #swagger.tags = ['Backup']
        if (!SLUG_PATTERN.test(req.params.slug))
            return Response.BadParameters(res, 'Invalid backup identifier');
        const file = backupFile(req.params.slug);
        if (!fs.existsSync(file))
            return Response.NotFound(res, 'Backup not found');
        try {
            fs.unlinkSync(file);
            Response.Ok(res, 'Backup deleted successfully');
        }
        catch (err) {
            Response.Internal(res, err);
        }
    });
};
