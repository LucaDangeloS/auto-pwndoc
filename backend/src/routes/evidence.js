module.exports = function(app, io) {
    const fs = require('fs');
    const os = require('os');
    const path = require('path');
    const mongoose = require('mongoose');
    const {pipeline} = require('stream/promises');
    const {receiveFile} = require('../lib/multipart-upload');
    const Response = require('../lib/httpResponse');
    const acl = require('../lib/auth').acl;
    const Audit = mongoose.model('Audit');
    const EvidenceCandidate = mongoose.model('EvidenceCandidate');
    const Settings = mongoose.model('Settings');
    const mimeByExt = {'.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg', '.txt': 'text/plain', '.md': 'text/markdown', '.har': 'application/json', '.json': 'application/json'};

    function bucket() { return new mongoose.mongo.GridFSBucket(mongoose.connection.db, {bucketName: 'evidenceFiles'}); }
    function handle(res, err) {
        if (err.fn) return Response.Internal(res, err);
        if (err.code === 11000) return Response.BadParameters(res, 'Evidence from this source and target already exists');
        if (err.name === 'CastError' || err.name === 'ValidationError') return Response.BadParameters(res, err.message);
        Response.Internal(res, err);
    }
    async function auditAccess(req, write = false) {
        const permission = write ? 'audits:update' : 'audits:read';
        if (!acl.isTokenAllowed(req.decodedToken, permission)) throw {fn: 'Forbidden', message: 'Audit access required'};
        const all = acl.isTokenAllowed(req.decodedToken, write ? 'audits:update-all' : 'audits:read-all');
        const query = Audit.findById(req.params.auditId).select('_id creator collaborators reviewers state');
        if (!all) query.or(write
            ? [{creator: req.decodedToken.id}, {collaborators: req.decodedToken.id}]
            : [{creator: req.decodedToken.id}, {collaborators: req.decodedToken.id}, {reviewers: req.decodedToken.id}]);
        const audit = await query.exec();
        if (!audit) throw {fn: 'NotFound', message: 'Audit not found or insufficient privileges'};
        return audit;
    }
    function input(body) {
        if (!body || typeof body !== 'object') throw {fn: 'BadParameters', message: 'Evidence body is required'};
        const sourceType = body?.sourceType || 'manual';
        if (!['manual', 'burp', 'scanner', 'script', 'other'].includes(sourceType))
            throw {fn: 'BadParameters', message: 'Invalid evidence source'};
        if (typeof body.title !== 'string' || !body.title.trim() || body.title.length > 180)
            throw {fn: 'BadParameters', message: 'Evidence title is required'};
        for (const [field, limit] of [['sourceId', 300], ['target', 2048], ['summary', 10000], ['rawEvidence', 100000]]) {
            if (body[field] != null && (typeof body[field] !== 'string' || body[field].length > limit))
                throw {fn: 'BadParameters', message: `Invalid ${field}`};
        }
        const observedAt = body.observedAt ? new Date(body.observedAt) : new Date();
        if (isNaN(observedAt.getTime())) throw {fn: 'BadParameters', message: 'Invalid observation date'};
        return {sourceType, sourceId: body.sourceId?.trim() || null, target: body.target?.trim() || '',
            title: body.title.trim(), summary: body.summary || '', rawEvidence: body.rawEvidence || '', observedAt};
    }
    function validName(name) {
        return typeof name === 'string' && name.length > 0 && name.length <= 200 && !/[\/\\\u0000-\u001f\u007f]/.test(name);
    }
    function disposition(name) {
        return `attachment; filename="${name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(name)}`;
    }

    app.get('/api/audits/:auditId/evidence', acl.hasPermission('evidence:read'), async (req, res) => {
        try {
            await auditAccess(req);
            const status = req.query.status;
            if (status && !['pending', 'accepted', 'rejected', 'promoted'].includes(status))
                throw {fn: 'BadParameters', message: 'Invalid evidence status'};
            const findingId = req.query.finding;
            if (findingId && !mongoose.isValidObjectId(findingId))
                throw {fn: 'BadParameters', message: 'Invalid finding ID'};
            Response.Ok(res, await EvidenceCandidate.list(req.params.auditId, status, findingId));
        } catch (err) { handle(res, err); }
    });
    app.post('/api/audits/:auditId/evidence', acl.hasPermission('evidence:create'), async (req, res) => {
        try {
            await auditAccess(req, true);
            Response.Created(res, await EvidenceCandidate.createCandidate(req.params.auditId, input(req.body), req.decodedToken.id));
        } catch (err) { handle(res, err); }
    });
    app.get('/api/audits/:auditId/evidence/:candidateId', acl.hasPermission('evidence:read'), async (req, res) => {
        try {
            await auditAccess(req);
            Response.Ok(res, await EvidenceCandidate.getOne(req.params.auditId, req.params.candidateId));
        } catch (err) { handle(res, err); }
    });
    app.put('/api/audits/:auditId/evidence/:candidateId/review', acl.hasPermission('evidence:review'), async (req, res) => {
        try {
            await auditAccess(req);
            if (!['pending', 'accepted', 'rejected'].includes(req.body?.status) ||
                typeof req.body?.note !== 'string' || req.body.note.length > 5000)
                throw {fn: 'BadParameters', message: 'Invalid review'};
            Response.Ok(res, await EvidenceCandidate.review(req.params.auditId, req.params.candidateId,
                req.body.status, req.body.note, req.decodedToken.id));
        } catch (err) { handle(res, err); }
    });
    app.post('/api/audits/:auditId/evidence/:candidateId/promote', acl.hasPermission('evidence:review'), async (req, res) => {
        try {
            const audit = await auditAccess(req, true);
            const settings = await Settings.getAll();
            if (settings.reviews.enabled && audit.state !== 'EDIT')
                throw {fn: 'Forbidden', message: 'Audit must be in EDIT state'};
            const all = acl.isTokenAllowed(req.decodedToken, 'audits:update-all');
            const result = await EvidenceCandidate.promote(req.params.auditId, req.params.candidateId, req.decodedToken.id, all);
            if (settings.reviews.enabled && settings.reviews.private.removeApprovalsUponUpdate)
                await Audit.updateGeneral(all, req.params.auditId, req.decodedToken.id, {approvals: []});
            io.to(req.params.auditId).emit('updateAudit');
            Response.Ok(res, result);
        } catch (err) { handle(res, err); }
    });
    app.delete('/api/audits/:auditId/evidence/:candidateId', acl.hasPermission('evidence:delete'), async (req, res) => {
        try {
            await auditAccess(req, true);
            const row = await EvidenceCandidate.getOne(req.params.auditId, req.params.candidateId);
            if (row.linkedFinding) throw {fn: 'Forbidden', message: 'Evidence linked to a finding cannot be deleted'};
            const deleted = await EvidenceCandidate.deleteOne({_id: row._id, linkedFinding: null});
            if (!deleted.deletedCount) throw {fn: 'Forbidden', message: 'Evidence promotion is in progress'};
            for (const attachment of row.attachments) await bucket().delete(attachment.fileId).catch(() => {});
            Response.Ok(res, 'Evidence deleted');
        } catch (err) { handle(res, err); }
    });
    app.post('/api/audits/:auditId/evidence/:candidateId/files', acl.hasPermission('evidence:create'), async (req, res) => {
        let upload;
        let fileId;
        try {
            await auditAccess(req, true);
            const candidate = await EvidenceCandidate.getOne(req.params.auditId, req.params.candidateId);
            if (candidate.status !== 'pending') throw {fn: 'Forbidden', message: 'Reviewed evidence cannot be changed'};
            upload = await receiveFile(req, path.join(os.tmpdir(), 'autopwndoc-evidence-uploads'), 25 * 1024 * 1024, {maxFields: 0});
            const name = upload.file.originalName;
            const ext = path.extname(name).toLowerCase();
            if (!validName(name) || !mimeByExt[ext]) throw {fn: 'BadParameters', message: 'Unsupported evidence file'};
            const header = Buffer.alloc(5);
            const fd = await fs.promises.open(upload.file.path, 'r');
            try { await fd.read(header, 0, 5, 0); } finally { await fd.close(); }
            if ((ext === '.pdf' && header.toString() !== '%PDF-') ||
                (ext === '.png' && header.subarray(0, 4).toString('hex') !== '89504e47') ||
                (['.jpg', '.jpeg'].includes(ext) && header.subarray(0, 3).toString('hex') !== 'ffd8ff'))
                throw {fn: 'BadParameters', message: 'Invalid evidence file signature'};
            fileId = new mongoose.Types.ObjectId();
            await pipeline(fs.createReadStream(upload.file.path), bucket().openUploadStreamWithId(fileId, name, {contentType: mimeByExt[ext]}));
            const attachment = {_id: new mongoose.Types.ObjectId(), fileId, name, mimeType: mimeByExt[ext],
                size: upload.file.size, uploadedBy: req.decodedToken.id, createdAt: new Date()};
            const updated = await EvidenceCandidate.updateOne({_id: candidate._id, status: 'pending'}, {$push: {attachments: attachment}});
            if (!updated.modifiedCount) throw {fn: 'Forbidden', message: 'Reviewed evidence cannot be changed'};
            Response.Created(res, attachment);
        } catch (err) {
            if (fileId) await bucket().delete(fileId).catch(() => {});
            handle(res, err);
        } finally {
            if (upload) await fs.promises.unlink(upload.file.path).catch(() => {});
        }
    });
    app.get('/api/audits/:auditId/evidence/:candidateId/files/:fileId', acl.hasPermission('evidence:read'), async (req, res) => {
        try {
            await auditAccess(req);
            const candidate = await EvidenceCandidate.getOne(req.params.auditId, req.params.candidateId);
            const attachment = candidate.attachments.find(item => String(item._id) === req.params.fileId);
            if (!attachment) throw {fn: 'NotFound', message: 'Evidence file not found'};
            res.setHeader('Content-Type', attachment.mimeType);
            res.setHeader('Content-Disposition', disposition(attachment.name));
            bucket().openDownloadStream(attachment.fileId).on('error', err => {
                if (!res.headersSent) handle(res, err);
                else res.destroy(err);
            }).pipe(res);
        } catch (err) { handle(res, err); }
    });
    app.delete('/api/audits/:auditId/evidence/:candidateId/files/:fileId', acl.hasPermission('evidence:create'), async (req, res) => {
        try {
            await auditAccess(req, true);
            const candidate = await EvidenceCandidate.getOne(req.params.auditId, req.params.candidateId);
            if (candidate.status !== 'pending') throw {fn: 'Forbidden', message: 'Reviewed evidence cannot be changed'};
            const attachment = candidate.attachments.find(item => String(item._id) === req.params.fileId);
            if (!attachment) throw {fn: 'NotFound', message: 'Evidence file not found'};
            const updated = await EvidenceCandidate.updateOne({_id: candidate._id, status: 'pending', 'attachments._id': attachment._id},
                {$pull: {attachments: {_id: attachment._id}}});
            if (!updated.modifiedCount) throw {fn: 'Forbidden', message: 'Reviewed evidence cannot be changed'};
            await bucket().delete(attachment.fileId).catch(() => {});
            Response.Ok(res, 'Evidence file deleted');
        } catch (err) { handle(res, err); }
    });
};
