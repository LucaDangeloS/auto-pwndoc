module.exports = function(app) {
    const fs = require('fs');
    const os = require('os');
    const path = require('path');
    const mongoose = require('mongoose');
    const {pipeline} = require('stream/promises');
    const {receiveFile} = require('../lib/multipart-upload');
    const Response = require('../lib/httpResponse');
    const acl = require('../lib/auth').acl;
    const Guide = mongoose.model('Guide');
    const GuideRevision = mongoose.model('GuideRevision');
    const GuideRun = mongoose.model('GuideRun');
    const Audit = mongoose.model('Audit');
    const Tool = mongoose.model('Tool');
    const mimeByExt = {'.pdf': 'application/pdf', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        '.txt': 'text/plain', '.md': 'text/markdown', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg'};

    function bucket() { return new mongoose.mongo.GridFSBucket(mongoose.connection.db, {bucketName: 'guideFiles'}); }
    function handle(res, err) {
        if (err.fn) return Response.Internal(res, err);
        if (err.name === 'CastError' || err.name === 'ValidationError' || err.code === 11000)
            return Response.BadParameters(res, err.message);
        Response.Internal(res, err);
    }
    function fileName(name) {
        return typeof name === 'string' && name.length > 0 && name.length <= 200 &&
            !/[\/\\\u0000-\u001f\u007f]/.test(name);
    }
    function disposition(name) {
        return `attachment; filename="${name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(name)}`;
    }
    async function payload(body) {
        if (!body || typeof body.title !== 'string' || !body.title.trim()) throw {fn: 'BadParameters', message: 'Guide title is required'};
        if (typeof body.content !== 'string' || body.content.length > 100000) throw {fn: 'BadParameters', message: 'Invalid guide content'};
        if (!Array.isArray(body.steps) || body.steps.length > 100 || body.steps.some(s => typeof s !== 'string' || !s.trim() || s.length > 2000))
            throw {fn: 'BadParameters', message: 'Invalid guide steps'};
        if (body.tags && (!Array.isArray(body.tags) || body.tags.some(s => typeof s !== 'string'))) throw {fn: 'BadParameters', message: 'Invalid tags'};
        if (body.tool && (!mongoose.isValidObjectId(body.tool) || !await Tool.exists({_id: body.tool})))
            throw {fn: 'BadParameters', message: 'Tool not found'};
        if (body.status && !['draft', 'published'].includes(body.status)) throw {fn: 'BadParameters', message: 'Invalid guide status'};
        const references = body.references || [];
        if (!Array.isArray(references) || references.length > 100) throw {fn: 'BadParameters', message: 'Invalid standard references'};
        const normalized = references.map(ref => ({framework: ref?.framework, version: String(ref?.version || '').trim(),
            code: String(ref?.code || '').trim().toUpperCase()}));
        if (normalized.some(ref => !/^\d+\.\d+(?:\.\d+)?$/.test(ref.version) ||
            (ref.framework === 'WSTG' ? !/^WSTG-[A-Z]{4}-\d{2}$/.test(ref.code) :
                ref.framework === 'ASVS' ? !/^\d+\.\d+\.\d+$/.test(ref.code) : true)))
            throw {fn: 'BadParameters', message: 'Invalid standard reference'};
        if (new Set(normalized.map(ref => `${ref.framework}:${ref.version}:${ref.code}`)).size !== normalized.length)
            throw {fn: 'BadParameters', message: 'Duplicate standard reference'};
        return {title: body.title.trim(), summary: String(body.summary || '').trim(), content: body.content,
            steps: body.steps.map(s => s.trim()), tags: [...new Set((body.tags || []).map(s => s.trim()).filter(Boolean))].slice(0, 20),
            references: normalized, tool: body.tool || null, status: body.status || 'draft',
            reviewedAt: body.reviewedAt ? new Date(body.reviewedAt) : null};
    }
    async function auditAccess(req) {
        if (!acl.isTokenAllowed(req.decodedToken, 'audits:read')) throw {fn: 'Forbidden', message: 'Audit access required'};
        return Audit.getAudit(acl.isTokenAllowed(req.decodedToken, 'audits:read-all'), req.params.auditId, req.decodedToken.id);
    }
    async function visibleGuide(req) {
        const row = await Guide.getGuide(req.params.id);
        if (row.status === 'draft' && !acl.isTokenAllowed(req.decodedToken, 'guides:update'))
            throw {fn: 'Forbidden', message: 'Guide is a draft'};
        return row;
    }

    app.get('/api/guides', acl.hasPermission('guides:read'), (req, res) =>
        Guide.list(acl.isTokenAllowed(req.decodedToken, 'guides:update'))
            .then(rows => Response.Ok(res, rows)).catch(err => handle(res, err)));
    app.post('/api/guides', acl.hasPermission('guides:create'), async (req, res) => {
        try { Response.Created(res, await Guide.saveGuide(null, await payload(req.body), req.decodedToken.id)); }
        catch (err) { handle(res, err); }
    });
    app.get('/api/guides/:id', acl.hasPermission('guides:read'), (req, res) =>
        visibleGuide(req).then(row => Response.Ok(res, row)).catch(err => handle(res, err)));
    app.put('/api/guides/:id', acl.hasPermission('guides:update'), async (req, res) => {
        try { Response.Ok(res, await Guide.saveGuide(req.params.id, await payload(req.body), req.decodedToken.id)); }
        catch (err) { handle(res, err); }
    });
    app.delete('/api/guides/:id', acl.hasPermission('guides:delete'), async (req, res) => {
        try {
            const guide = await Guide.getGuide(req.params.id);
            await Guide.deleteOne({_id: guide._id});
            await Promise.all([GuideRevision.deleteMany({guide: guide._id}), GuideRun.deleteMany({guide: guide._id})]);
            for (const attachment of guide.attachments) await bucket().delete(attachment.fileId).catch(() => {});
            Response.Ok(res, 'Guide deleted');
        } catch (err) { handle(res, err); }
    });
    app.get('/api/guides/:id/revisions', acl.hasPermission('guides:read'), async (req, res) => {
        try {
            await visibleGuide(req);
            const filter = {guide: req.params.id};
            if (!acl.isTokenAllowed(req.decodedToken, 'guides:update')) filter.status = 'published';
            Response.Ok(res, await GuideRevision.find(filter).select('version title editedBy createdAt')
                .populate('editedBy', 'username').sort({version: -1}).exec());
        } catch (err) { handle(res, err); }
    });
    app.get('/api/guides/:id/revisions/:version', acl.hasPermission('guides:read'), async (req, res) => {
        try {
            await visibleGuide(req);
            const revision = await GuideRevision.findOne({guide: req.params.id, version: Number(req.params.version)}).exec();
            if (!revision) throw {fn: 'NotFound', message: 'Revision not found'};
            if (revision.status === 'draft' && !acl.isTokenAllowed(req.decodedToken, 'guides:update'))
                throw {fn: 'Forbidden', message: 'Revision is a draft'};
            Response.Ok(res, revision);
        } catch (err) { handle(res, err); }
    });
    app.post('/api/guides/:id/files', acl.hasPermission('guides:update'), async (req, res) => {
        let upload;
        let fileId;
        try {
            const guide = await visibleGuide(req);
            upload = await receiveFile(req, path.join(os.tmpdir(), 'autopwndoc-guide-uploads'), 25 * 1024 * 1024, {maxFields: 0});
            const name = upload.file.originalName;
            const ext = path.extname(name).toLowerCase();
            if (!fileName(name) || !mimeByExt[ext]) throw {fn: 'BadParameters', message: 'Unsupported document type'};
            const header = Buffer.alloc(8);
            const fd = await fs.promises.open(upload.file.path, 'r');
            try { await fd.read(header, 0, 8, 0); } finally { await fd.close(); }
            if ((ext === '.pdf' && header.subarray(0, 5).toString() !== '%PDF-') ||
                (ext === '.docx' && header.subarray(0, 2).toString() !== 'PK') ||
                (ext === '.png' && header.subarray(0, 4).toString('hex') !== '89504e47') ||
                (['.jpg', '.jpeg'].includes(ext) && header.subarray(0, 3).toString('hex') !== 'ffd8ff'))
                throw {fn: 'BadParameters', message: 'Invalid document signature'};
            fileId = new mongoose.Types.ObjectId();
            await pipeline(fs.createReadStream(upload.file.path), bucket().openUploadStreamWithId(fileId, name, {contentType: mimeByExt[ext]}));
            guide.attachments.push({fileId, name, mimeType: mimeByExt[ext], size: upload.file.size, uploadedBy: req.decodedToken.id});
            await guide.save();
            Response.Created(res, guide.attachments[guide.attachments.length - 1]);
        } catch (err) {
            if (fileId) await bucket().delete(fileId).catch(() => {});
            handle(res, err);
        } finally {
            if (upload) await fs.promises.unlink(upload.file.path).catch(() => {});
        }
    });
    app.get('/api/guides/:id/files/:fileId', acl.hasPermission('guides:read'), async (req, res) => {
        try {
            const guide = await visibleGuide(req);
            const attachment = guide.attachments.find(a => String(a._id) === req.params.fileId);
            if (!attachment) throw {fn: 'NotFound', message: 'Document not found'};
            res.setHeader('Content-Type', attachment.mimeType);
            res.setHeader('Content-Disposition', disposition(attachment.name));
            bucket().openDownloadStream(attachment.fileId).on('error', err => {
                if (!res.headersSent) handle(res, err);
                else res.destroy(err);
            }).pipe(res);
        } catch (err) { handle(res, err); }
    });
    app.delete('/api/guides/:id/files/:fileId', acl.hasPermission('guides:update'), async (req, res) => {
        try {
            const guide = await Guide.getGuide(req.params.id);
            const attachment = guide.attachments.find(a => String(a._id) === req.params.fileId);
            if (!attachment) throw {fn: 'NotFound', message: 'Document not found'};
            guide.attachments.pull(attachment._id);
            await guide.save();
            await bucket().delete(attachment.fileId).catch(() => {});
            Response.Ok(res, 'Document deleted');
        } catch (err) { handle(res, err); }
    });
    app.get('/api/guides/:id/runs/:auditId', acl.hasPermission('guides:read'), async (req, res) => {
        try {
            await visibleGuide(req);
            await auditAccess(req);
            const run = await GuideRun.findOne({guide: req.params.id, audit: req.params.auditId}).exec();
            Response.Ok(res, run);
        } catch (err) { handle(res, err); }
    });
    app.post('/api/guides/:id/runs/:auditId', acl.hasPermission('guides:run'), async (req, res) => {
        try {
            if (!acl.isTokenAllowed(req.decodedToken, 'audits:update')) throw {fn: 'Forbidden', message: 'Audit update required'};
            await auditAccess(req);
            Response.Created(res, await GuideRun.getOrCreate(await visibleGuide(req), req.params.auditId, req.decodedToken.id));
        } catch (err) { handle(res, err); }
    });
    app.put('/api/guides/:id/runs/:auditId', acl.hasPermission('guides:run'), async (req, res) => {
        try {
            if (!acl.isTokenAllowed(req.decodedToken, 'audits:update')) throw {fn: 'Forbidden', message: 'Audit update required'};
            await auditAccess(req);
            await visibleGuide(req);
            const run = await GuideRun.findOne({guide: req.params.id, audit: req.params.auditId});
            if (!run) throw {fn: 'NotFound', message: 'Guide run not found'};
            const index = Number(req.body.index);
            if (!Number.isInteger(index) || index < 0 || index >= run.steps.length || typeof req.body.done !== 'boolean')
                throw {fn: 'BadParameters', message: 'Invalid step update'};
            run.steps[index].done = req.body.done;
            run.updatedBy = req.decodedToken.id;
            await run.save();
            Response.Ok(res, run);
        } catch (err) { handle(res, err); }
    });
    app.put('/api/guides/:id/runs/:auditId/coverage/:index', acl.hasPermission('guides:run'), async (req, res) => {
        try {
            if (!acl.isTokenAllowed(req.decodedToken, 'audits:update')) throw {fn: 'Forbidden', message: 'Audit update required'};
            const all = acl.isTokenAllowed(req.decodedToken, 'audits:update-all');
            const audit = await Audit.findById(req.params.auditId).select('creator collaborators').exec();
            if (!audit || (!all && String(audit.creator) !== req.decodedToken.id &&
                !audit.collaborators.some(id => String(id) === req.decodedToken.id)))
                throw {fn: 'NotFound', message: 'Audit not found or insufficient privileges'};
            await visibleGuide(req);
            const run = await GuideRun.findOne({guide: req.params.id, audit: req.params.auditId});
            if (!run) throw {fn: 'NotFound', message: 'Guide run not found'};
            const index = Number(req.params.index);
            const status = req.body?.status;
            const justification = String(req.body?.justification || '').trim();
            if (!Number.isInteger(index) || index < 0 || index >= run.coverage.length ||
                !['pending', 'tested', 'na'].includes(status) || justification.length > 2000 ||
                (status === 'na' && !justification))
                throw {fn: 'BadParameters', message: 'Invalid coverage result'};
            run.coverage[index].status = status;
            run.coverage[index].justification = justification;
            run.coverage[index].updatedBy = req.decodedToken.id;
            run.coverage[index].updatedAt = new Date();
            run.updatedBy = req.decodedToken.id;
            await run.save();
            Response.Ok(res, run);
        } catch (err) { handle(res, err); }
    });
};
