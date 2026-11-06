const Busboy = require('busboy');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const {pipeline} = require('stream/promises');

function receiveFile(req, directory, maxBytes, options = {}) {
    return new Promise((resolve, reject) => {
        fs.mkdirSync(directory, {recursive: true});
        const tempPath = path.join(directory, `${crypto.randomUUID()}.part`);
        const fields = {};
        let fileInfo = null;
        let fileTask = null;
        let failed = null;
        let settled = false;
        let bytes = 0;
        let limited = false;

        function fail(err) {
            if (!failed) failed = err;
        }

        function finish(err, result) {
            if (settled) return;
            settled = true;
            if (err) fs.promises.unlink(tempPath).catch(() => {});
            if (err) reject(err);
            else resolve(result);
        }

        let parser;
        try {
            parser = Busboy({
                headers: req.headers,
                limits: {files: 1, fields: options.maxFields ?? 12, fieldSize: options.maxFieldSize ?? 8192, fileSize: maxBytes}
            });
        } catch (_err) {
            finish({fn: 'BadParameters', message: 'Expected multipart form data'});
            return;
        }

        parser.on('field', (name, value, info) => {
            if (info.nameTruncated || info.valueTruncated || Object.hasOwn(fields, name))
                fail({fn: 'BadParameters', message: 'Invalid upload fields'});
            else fields[name] = value;
        });
        parser.on('file', (name, stream, info) => {
            if (name !== 'file' || fileInfo) {
                fail({fn: 'BadParameters', message: 'Expected one file'});
                stream.resume();
                return;
            }
            fileInfo = {originalName: info.filename, mimeType: info.mimeType};
            stream.on('data', chunk => { bytes += chunk.length; });
            stream.on('limit', () => { limited = true; });
            fileTask = pipeline(stream, fs.createWriteStream(tempPath, {flags: 'wx'}))
                .catch(err => { fail(err); });
        });
        parser.on('filesLimit', () => fail({fn: 'BadParameters', message: 'Only one file is allowed'}));
        parser.on('fieldsLimit', () => fail({fn: 'BadParameters', message: 'Too many upload fields'}));
        parser.on('error', err => finish({fn: 'BadParameters', message: err.message}));
        req.on('aborted', () => finish({fn: 'BadParameters', message: 'Upload interrupted'}));
        parser.on('close', async () => {
            if (fileTask) await fileTask;
            if (limited) fail({fn: 'BadParameters', message: 'File exceeds the size limit'});
            if (!fileInfo || bytes === 0) fail({fn: 'BadParameters', message: 'File is required'});
            finish(failed, {fields, file: {...fileInfo, path: tempPath, size: bytes}});
        });
        req.pipe(parser);
    });
}

module.exports = {receiveFile};
