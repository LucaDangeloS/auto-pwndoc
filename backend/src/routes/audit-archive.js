module.exports = function(app) {
    var Response = require('../lib/httpResponse.js');
    var mongoose = require('mongoose');
    var AuditArchive = mongoose.model('AuditArchive');
    var Company = mongoose.model('Company');
    var acl = require('../lib/auth').acl;
    var fs = require('fs');
    var path = require('path');
    var crypto = require('crypto');
    var {receiveFile} = require('../lib/multipart-upload');

    var MAX_PDF_SIZE = 200 * 1024 * 1024;
    var MAX_TAGS = 20;
    var ARCHIVE_DIR = path.join(__basedir, '..', 'audit-archives');
    fs.mkdirSync(ARCHIVE_DIR, {recursive: true});

    function archivePath(filename) {
        return path.join(ARCHIVE_DIR, filename);
    }

    function getFileBuffer(file) {
        if (!file || typeof file !== 'string') return null;
        var payload = file.includes(',') ? file.split(',').pop() : file;
        try {
            return Buffer.from(payload, 'base64');
        } catch (_err) {
            return null;
        }
    }

    // Display names may contain punctuation (v1.2, "ACME, S.L.") but never path
    // separators or control characters; the stored filename is always random.
    function validArchiveName(name) {
        return typeof name === 'string' &&
            name.trim().length > 0 &&
            name.length <= 200 &&
            !/[\/\\\u0000-\u001f\u007f]/.test(name);
    }

    function contentDisposition(type, filename) {
        var fallback = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
        return `${type}; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
    }

    function validPdfRequest(body, buffer) {
        if (!body.name || !body.originalName || !body.mimeType || !body.file) return 'Missing required parameters: name, originalName, mimeType, file';
        if (!validArchiveName(body.name)) return 'Bad name format';
        if (body.mimeType !== 'application/pdf') return 'Only PDF files are allowed';
        if (!/\.pdf$/i.test(body.originalName)) return 'Only .pdf files are allowed';
        if (!buffer || buffer.length === 0) return 'Invalid PDF file';
        if (buffer.length > MAX_PDF_SIZE) return 'PDF file exceeds the 200 MB limit';
        if (buffer.subarray(0, 5).toString('utf8') !== '%PDF-') return 'Invalid PDF signature';
        return null;
    }

    // Validates the editable metadata present in body. Returns {update} or {error}.
    async function parseMetadata(body) {
        var update = {};

        if (body.name !== undefined) {
            if (!validArchiveName(body.name)) return {error: 'Bad name format'};
            update.name = body.name.trim();
        }

        if (body.company !== undefined) {
            if (body.company === null || body.company === '') update.company = null;
            else {
                var companyId = typeof body.company === 'object' ? body.company._id : body.company;
                if (!mongoose.isValidObjectId(companyId)) return {error: 'Invalid company'};
                if (!await Company.exists({_id: companyId})) return {error: 'Company not found'};
                update.company = companyId;
            }
        }

        if (body.reportDate !== undefined) {
            if (body.reportDate === null || body.reportDate === '') update.reportDate = null;
            else {
                var date = new Date(body.reportDate);
                if (isNaN(date.getTime())) return {error: 'Invalid report date'};
                update.reportDate = date;
            }
        }

        if (body.auditType !== undefined) {
            if (body.auditType !== null && typeof body.auditType !== 'string') return {error: 'Invalid audit type'};
            update.auditType = (body.auditType || '').trim().slice(0, 100);
        }

        if (body.tags !== undefined) {
            if (!Array.isArray(body.tags) || !body.tags.every(t => typeof t === 'string')) return {error: 'Tags must be an array of strings'};
            var tags = [...new Set(body.tags.map(t => t.trim().slice(0, 50)).filter(Boolean))];
            if (tags.length > MAX_TAGS) return {error: `A maximum of ${MAX_TAGS} tags is allowed`};
            update.tags = tags;
        }

        if (body.notes !== undefined) {
            if (body.notes !== null && typeof body.notes !== 'string') return {error: 'Invalid notes'};
            update.notes = (body.notes || '').slice(0, 5000);
        }

        return {update};
    }

    function handleError(res, err) {
        if (err.fn === 'NotFound') Response.NotFound(res, err.message);
        else if (err.fn === 'Forbidden') Response.Forbidden(res, err.message);
        else if (err.fn === 'BadParameters') Response.BadParameters(res, err.message);
        else Response.Internal(res, err);
    }

    app.get('/api/audit-archives', acl.hasPermission('audit-archives:read'), function(req, res) {
        var filters = {};
        if (req.query.company === 'none' || mongoose.isValidObjectId(req.query.company)) filters.company = req.query.company;
        if (typeof req.query.tag === 'string' && req.query.tag) filters.tag = req.query.tag;

        AuditArchive.getAll(filters)
        .then(msg => Response.Ok(res, msg))
        .catch(err => Response.Internal(res, err));
    });

    app.post('/api/audit-archives', acl.hasPermission('audit-archives:create'), async function(req, res) {
        if (req.is('multipart/form-data')) {
            var upload;
            var filePath;
            try {
                upload = await receiveFile(req, ARCHIVE_DIR, MAX_PDF_SIZE);
                var body = upload.fields;
                var file = upload.file;
                var header = Buffer.alloc(5);
                var descriptor = fs.openSync(file.path, 'r');
                try { fs.readSync(descriptor, header, 0, 5, 0); }
                finally { fs.closeSync(descriptor); }
                var validation = validPdfRequest({
                    name: body.name,
                    originalName: file.originalName,
                    mimeType: file.mimeType,
                    file: 'multipart'
                }, header);
                if (validation) throw({fn: 'BadParameters', message: validation});
                var tags = body.tags ? JSON.parse(body.tags) : [];
                var metadata = await parseMetadata({...body, tags});
                if (metadata.error) throw({fn: 'BadParameters', message: metadata.error});
                var filename = `${Date.now()}-${crypto.randomBytes(16).toString('hex')}.pdf`;
                filePath = archivePath(filename);
                await fs.promises.rename(file.path, filePath);
                var archive = await AuditArchive.createArchive({
                    ...metadata.update,
                    name: body.name.trim(),
                    filename,
                    originalName: path.win32.basename(file.originalName),
                    size: file.size,
                    mimeType: 'application/pdf',
                    uploadedBy: req.decodedToken.id
                });
                return Response.Created(res, archive);
            } catch (err) {
                if (upload) await fs.promises.unlink(upload.file.path).catch(() => {});
                if (filePath) await fs.promises.unlink(filePath).catch(() => {});
                if (err instanceof SyntaxError) err = {fn: 'BadParameters', message: 'Invalid tags'};
                return handleError(res, err);
            }
        }

        var buffer = getFileBuffer(req.body.file);
        var validationError = validPdfRequest(req.body, buffer);
        if (validationError) {
            Response.BadParameters(res, validationError);
            return;
        }

        var metadata = await parseMetadata({
            company: req.body.company,
            reportDate: req.body.reportDate,
            auditType: req.body.auditType,
            tags: req.body.tags,
            notes: req.body.notes
        }).catch(err => ({error: err.message}));
        if (metadata.error) {
            Response.BadParameters(res, metadata.error);
            return;
        }

        var filename = `${Date.now()}-${crypto.randomBytes(16).toString('hex')}.pdf`;
        var filePath = archivePath(filename);
        var archive = {
            ...metadata.update,
            name: req.body.name.trim(),
            filename: filename,
            originalName: path.basename(req.body.originalName),
            size: buffer.length,
            mimeType: 'application/pdf',
            uploadedBy: req.decodedToken.id
        };

        fs.writeFile(filePath, buffer, function(err) {
            if (err) {
                Response.Internal(res, err);
                return;
            }

            AuditArchive.createArchive(archive)
            .then(data => Response.Created(res, data))
            .catch(err => {
                try { fs.unlinkSync(filePath); } catch (_unlinkErr) {}
                Response.Internal(res, err);
            });
        });
    });

    // Bulk company assignment (registered before the /:archiveId routes)
    app.put('/api/audit-archives/bulk', acl.hasPermission('audit-archives:update'), async function(req, res) {
        var archiveIds = req.body.archiveIds;
        if (!Array.isArray(archiveIds) || archiveIds.length === 0 || !archiveIds.every(id => mongoose.isValidObjectId(id))) {
            Response.BadParameters(res, 'Required parameters: archiveIds');
            return;
        }
        if (req.body.company === undefined) {
            Response.BadParameters(res, 'Required parameters: company');
            return;
        }

        try {
            var metadata = await parseMetadata({company: req.body.company});
            if (metadata.error) throw({fn: 'BadParameters', message: metadata.error});
            var allowedAll = acl.isTokenAllowed(req.decodedToken, 'audit-archives:update-all');
            for (var id of archiveIds)
                await AuditArchive.assertCanModify(id, req.decodedToken.id, allowedAll);
            Response.Ok(res, await AuditArchive.bulkUpdate(archiveIds, metadata.update));
        }
        catch (err) {
            handleError(res, err);
        }
    });

    app.put('/api/audit-archives/:archiveId', acl.hasPermission('audit-archives:update'), async function(req, res) {
        if (!mongoose.isValidObjectId(req.params.archiveId)) {
            Response.NotFound(res, 'Archived audit not found');
            return;
        }

        try {
            var editable = {};
            AuditArchive.EDITABLE_FIELDS.forEach(field => {
                if (req.body[field] !== undefined) editable[field] = req.body[field];
            });
            var metadata = await parseMetadata(editable);
            if (metadata.error) throw({fn: 'BadParameters', message: metadata.error});
            await AuditArchive.assertCanModify(req.params.archiveId, req.decodedToken.id, acl.isTokenAllowed(req.decodedToken, 'audit-archives:update-all'));
            Response.Ok(res, await AuditArchive.updateArchive(req.params.archiveId, metadata.update));
        }
        catch (err) {
            handleError(res, err);
        }
    });

    app.get('/api/audit-archives/:archiveId/file', acl.hasPermission('audit-archives:read'), function(req, res) {
        if (!mongoose.isValidObjectId(req.params.archiveId)) {
            Response.NotFound(res, 'Archived audit not found');
            return;
        }

        AuditArchive.getOne(req.params.archiveId)
        .then(data => {
            var file = archivePath(data.filename);
            if (!fs.existsSync(file)) throw({fn: 'NotFound', message: 'Archived PDF file not found'});
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', contentDisposition(req.query.download === '1' ? 'attachment' : 'inline', data.originalName));
            fs.createReadStream(file).pipe(res);
        })
        .catch(err => handleError(res, err));
    });

    app.delete('/api/audit-archives/:archiveId', acl.hasPermission('audit-archives:delete'), function(req, res) {
        if (!mongoose.isValidObjectId(req.params.archiveId)) {
            Response.NotFound(res, 'Archived audit not found');
            return;
        }

        AuditArchive.assertCanModify(req.params.archiveId, req.decodedToken.id, acl.isTokenAllowed(req.decodedToken, 'audit-archives:delete-all'))
        .then(() => AuditArchive.deleteArchive(req.params.archiveId))
        .then(data => {
            try { fs.unlinkSync(archivePath(data.filename)); } catch (_err) {}
            Response.Ok(res, 'Archived audit deleted successfully');
        })
        .catch(err => handleError(res, err));
    });
}
