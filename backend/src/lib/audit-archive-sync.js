const fs = require('fs');
const os = require('os');
const path = require('path');
const {promisify} = require('util');
const {execFile} = require('child_process');
const crypto = require('crypto');
const execFileAsync = promisify(execFile);
const officeProfileDir = path.join(os.tmpdir(), 'pwndoc-libreoffice-profile');

const archiveDir = path.join(__dirname, '../../audit-archives');
const pending = new Map();
const inFlight = new Map();
let generationQueue = Promise.resolve();
let pdfQueue = Promise.resolve();

async function compilePdfNow(docxBuffer) {
    const workDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'pwndoc-report-'));
    try {
        const inputPath = path.join(workDir, 'report.docx');
        await fs.promises.writeFile(inputPath, docxBuffer);
        await fs.promises.mkdir(officeProfileDir, {recursive: true});
        const conversion = await execFileAsync('soffice', ['--headless', `-env:UserInstallation=file://${officeProfileDir}`, '--convert-to', 'pdf', '--outdir', workDir, inputPath], {
            timeout: 120000,
            maxBuffer: 1024 * 1024 * 4,
            env: {...process.env, HOME: workDir}
        });
        const outputPath = path.join(workDir, 'report.pdf');
        const pdf = await fs.promises.readFile(outputPath).catch(async err => {
            const files = await fs.promises.readdir(workDir).catch(() => []);
            throw new Error(`LibreOffice did not create report.pdf (files: ${files.join(', ') || 'none'}; stdout: ${(conversion.stdout || '').trim() || 'empty'}; stderr: ${(conversion.stderr || '').trim() || 'empty'}): ${err.message}`);
        });
        if (pdf.length < 5 || pdf.subarray(0, 5).toString() !== '%PDF-') throw new Error('Office converter returned an invalid PDF');
        return pdf;
    } finally {
        await fs.promises.rm(workDir, {recursive: true, force: true});
    }
}

function compilePdf(docxBuffer) {
    const current = pdfQueue.then(() => compilePdfNow(docxBuffer));
    pdfQueue = current.then(() => undefined, () => undefined);
    return current;
}

function generateDoc(audit) {
    const reportGenerator = require('./report-generator');
    const current = generationQueue.then(() => reportGenerator.generateDoc(audit));
    generationQueue = current.then(() => undefined, () => undefined);
    return current;
}

function withAuditLock(auditId, work) {
    const key = String(auditId);
    const previous = inFlight.get(key) || Promise.resolve();
    const current = previous.catch(() => {}).then(work);
    inFlight.set(key, current);
    const clear = () => { if (inFlight.get(key) === current) inFlight.delete(key); };
    current.then(clear, clear);
    return current;
}

async function refreshInternalArchive(audit, docxBuffer) {
    const mongoose = require('mongoose');
    const AuditArchive = mongoose.model('AuditArchive');
    let pdfPath;
    try {
        const pdf = await compilePdf(docxBuffer);
        await fs.promises.mkdir(archiveDir, {recursive: true});
        const filename = `internal-${audit._id}-${crypto.randomBytes(8).toString('hex')}.pdf`;
        pdfPath = path.join(archiveDir, filename);
        await fs.promises.writeFile(pdfPath, pdf, {flag: 'wx'});
        const prior = await AuditArchive.findOne({audit: audit._id, internal: true}).select('filename').lean();
        const archive = await AuditArchive.findOneAndUpdate(
            {audit: audit._id, internal: true},
            {$set: {
                name: audit.name || 'Audit report', filename, originalName: `${audit.name || 'Audit'}.pdf`,
                size: pdf.length, mimeType: 'application/pdf', company: audit.company?._id || audit.company || null,
                reportDate: audit.date_end || audit.updatedAt || new Date(), auditType: audit.auditType || '',
                audit: audit._id, internal: true
            }, $setOnInsert: {tags: [], notes: '', uploadedBy: audit.creator?._id || audit.creator}},
            {upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true}
        ).exec();
        if (prior && prior.filename && prior.filename !== filename) {
            await fs.promises.unlink(path.join(archiveDir, path.basename(prior.filename))).catch(() => {});
        }
        return archive;
    } catch (err) {
        if (pdfPath) await fs.promises.unlink(pdfPath).catch(() => {});
        throw err;
    }
}

async function syncGeneratedReport(audit, docxBuffer) {
    if (!audit || !audit._id || !audit.template || !audit.template.name) return null;
    const mongoose = require('mongoose');
    const AuditArchive = mongoose.model('AuditArchive');
    return withAuditLock(audit._id, async () => {
        const currentArchive = await AuditArchive.findOne({audit: audit._id, internal: true}).select('updatedAt').lean();
        if (currentArchive && currentArchive.updatedAt && audit.updatedAt && currentArchive.updatedAt >= audit.updatedAt)
            return currentArchive;
        return refreshInternalArchive(audit, docxBuffer);
    });
}

async function syncAudit(auditId, {force = false} = {}) {
    const mongoose = require('mongoose');
    const Audit = mongoose.model('Audit');
    const AuditArchive = mongoose.model('AuditArchive');
    return withAuditLock(auditId, async () => {
        try {
            const audit = await Audit.getAudit(true, auditId);
            if (!audit || !audit.template || !audit.template.name) return null;
            const currentArchive = await AuditArchive.findOne({audit: audit._id, internal: true}).select('updatedAt').lean();
            if (!force && currentArchive && currentArchive.updatedAt && audit.updatedAt && currentArchive.updatedAt >= audit.updatedAt)
                return currentArchive;
            const docx = await generateDoc(audit);
            return await refreshInternalArchive(audit, docx);
        } catch (err) {
            console.error(`[audit-archive-sync] Could not refresh internal PDF for audit ${auditId}:`, err && err.stack || err);
            return null;
        }
    });
}

async function regenerateAllInternalArchives() {
    const mongoose = require('mongoose');
    const Audit = mongoose.model('Audit');
    const cursor = Audit.find({template: {$exists: true, $ne: null}}).select('_id').lean().cursor();
    const summary = {total: 0, refreshed: 0, failed: 0};
    for await (const audit of cursor) {
        summary.total++;
        const archive = await syncAudit(audit._id, {force: true});
        if (archive) summary.refreshed++;
        else summary.failed++;
    }
    return summary;
}

async function syncExistingAudits() {
    const mongoose = require('mongoose');
    const Audit = mongoose.model('Audit');
    const AuditArchive = mongoose.model('AuditArchive');
    const cursor = Audit.find({template: {$exists: true, $ne: null}}).select('_id updatedAt').lean().cursor();
    for await (const audit of cursor) {
        try {
            const archive = await AuditArchive.findOne({audit: audit._id, internal: true}).select('updatedAt').lean();
            if (!archive || !archive.updatedAt || !audit.updatedAt || archive.updatedAt < audit.updatedAt) schedule(audit._id);
        } catch (err) {
            console.error(`[audit-archive-sync] Could not check internal PDF for audit ${audit._id}:`, err && err.message || err);
        }
    }
}

function schedule(auditId) {
    if (!auditId) return;
    const key = String(auditId);
    if (pending.has(key)) clearTimeout(pending.get(key));
    pending.set(key, setTimeout(() => {
        pending.delete(key);
        syncAudit(key);
    }, 500));
}

module.exports = {schedule, generateDoc, syncGeneratedReport, syncAudit, syncExistingAudits, regenerateAllInternalArchives};
