module.exports = function(app) {
    var Response = require('../lib/httpResponse.js');
    var AuditArchive = require('mongoose').model('AuditArchive');
    var acl = require('../lib/auth').acl;
    var utils = require('../lib/utils');
    var fs = require('fs');
    var path = require('path');
    var crypto = require('crypto');

    var MAX_PDF_SIZE = 200 * 1024 * 1024;
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

    function validPdfRequest(body, buffer) {
        if (!body.name || !body.originalName || !body.mimeType || !body.file) return 'Missing required parameters: name, originalName, mimeType, file';
        if (!utils.validFilename(body.name)) return 'Bad name format';
        if (body.mimeType !== 'application/pdf') return 'Only PDF files are allowed';
        if (!/\.pdf$/i.test(body.originalName)) return 'Only .pdf files are allowed';
        if (!buffer || buffer.length === 0) return 'Invalid PDF file';
        if (buffer.length > MAX_PDF_SIZE) return 'PDF file exceeds the 200 MB limit';
        if (buffer.subarray(0, 5).toString('utf8') !== '%PDF-') return 'Invalid PDF signature';
        return null;
    }

    app.get('/api/audit-archives', acl.hasPermission('audit-archives:read'), function(req, res) {
        AuditArchive.getAll()
        .then(msg => Response.Ok(res, msg))
        .catch(err => Response.Internal(res, err));
    });

    app.post('/api/audit-archives', acl.hasPermission('audit-archives:create'), function(req, res) {
        var buffer = getFileBuffer(req.body.file);
        var validationError = validPdfRequest(req.body, buffer);
        if (validationError) {
            Response.BadParameters(res, validationError);
            return;
        }

        var filename = `${Date.now()}-${crypto.randomBytes(16).toString('hex')}.pdf`;
        var filePath = archivePath(filename);
        var archive = {
            name: req.body.name,
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

    app.get('/api/audit-archives/:archiveId/file', acl.hasPermission('audit-archives:read'), function(req, res) {
        AuditArchive.getOne(req.params.archiveId)
        .then(data => {
            var file = archivePath(data.filename);
            if (!fs.existsSync(file)) throw({fn: 'NotFound', message: 'Archived PDF file not found'});
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(data.originalName)}"`);
            fs.createReadStream(file).pipe(res);
        })
        .catch(err => {
            if (err.fn === 'NotFound') Response.NotFound(res, err.message);
            else Response.Internal(res, err);
        });
    });

    app.delete('/api/audit-archives/:archiveId', acl.hasPermission('audit-archives:delete'), function(req, res) {
        AuditArchive.deleteArchive(req.params.archiveId)
        .then(data => {
            try { fs.unlinkSync(archivePath(data.filename)); } catch (_err) {}
            Response.Ok(res, 'Archived audit deleted successfully');
        })
        .catch(err => {
            if (err.fn === 'NotFound') Response.NotFound(res, err.message);
            else Response.Internal(res, err);
        });
    });
}
