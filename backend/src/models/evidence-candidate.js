const mongoose = require('mongoose');

const AttachmentSchema = new mongoose.Schema({
    fileId: {type: mongoose.Schema.Types.ObjectId, required: true},
    name: {type: String, required: true, maxlength: 200},
    mimeType: {type: String, required: true},
    size: {type: Number, required: true},
    uploadedBy: {type: mongoose.Schema.Types.ObjectId, ref: 'User'}
}, {timestamps: true});

const EvidenceCandidateSchema = new mongoose.Schema({
    audit: {type: mongoose.Schema.Types.ObjectId, ref: 'Audit', required: true, index: true},
    sourceType: {type: String, enum: ['manual', 'burp', 'scanner', 'script', 'other'], required: true},
    sourceId: {type: String, default: null, maxlength: 300},
    target: {type: String, default: '', maxlength: 2048},
    title: {type: String, required: true, maxlength: 180},
    summary: {type: String, default: '', maxlength: 10000},
    rawEvidence: {type: String, default: '', maxlength: 100000},
    observedAt: {type: Date, default: Date.now},
    status: {type: String, enum: ['pending', 'accepted', 'rejected', 'promoted'], default: 'pending'},
    reviewNote: {type: String, default: '', maxlength: 5000},
    reviewedBy: {type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null},
    reviewedAt: {type: Date, default: null},
    linkedFinding: {type: mongoose.Schema.Types.ObjectId, default: null},
    promotionStartedAt: {type: Date, default: null},
    createdBy: {type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true},
    attachments: [AttachmentSchema]
}, {timestamps: true});

EvidenceCandidateSchema.index({audit: 1, sourceType: 1, sourceId: 1, target: 1},
    {unique: true, partialFilterExpression: {sourceId: {$type: 'string'}}});

EvidenceCandidateSchema.statics.list = function(auditId, status, findingId) {
    const query = {audit: auditId};
    if (status) query.status = status;
    if (findingId) query.linkedFinding = findingId;
    return this.find(query).populate('createdBy reviewedBy', 'username firstname lastname')
        .sort({createdAt: -1}).exec();
};

EvidenceCandidateSchema.statics.getOne = async function(auditId, candidateId) {
    const row = await this.findOne({_id: candidateId, audit: auditId})
        .populate('createdBy reviewedBy', 'username firstname lastname').exec();
    if (!row) throw {fn: 'NotFound', message: 'Evidence candidate not found'};
    return row;
};

EvidenceCandidateSchema.statics.createCandidate = async function(auditId, data, userId) {
    const row = await this.create({...data, audit: auditId, createdBy: userId});
    return this.getOne(auditId, row._id);
};

EvidenceCandidateSchema.statics.review = async function(auditId, candidateId, status, note, userId) {
    const row = await this.findOneAndUpdate({_id: candidateId, audit: auditId, status: {$ne: 'promoted'}, linkedFinding: null}, {$set: {
        status, reviewNote: note, reviewedBy: status === 'pending' ? null : userId,
        reviewedAt: status === 'pending' ? null : new Date()
    }}, {new: true, runValidators: true}).exec();
    if (!row) throw {fn: 'BadParameters', message: 'Evidence candidate cannot be reviewed'};
    return this.getOne(auditId, row._id);
};

EvidenceCandidateSchema.statics.promote = async function(auditId, candidateId, userId, isAdmin) {
    const Audit = mongoose.model('Audit');
    let row = await this.getOne(auditId, candidateId);
    if (row.status === 'promoted') return row;
    if (row.status !== 'accepted') throw {fn: 'BadParameters', message: 'Accept evidence before creating a finding'};
    if (row.linkedFinding && await Audit.exists({_id: auditId, 'findings._id': row.linkedFinding})) {
        await this.updateOne({_id: row._id}, {$set: {status: 'promoted'}});
        return this.getOne(auditId, candidateId);
    }
    const now = new Date();
    const cutoff = new Date(now.getTime() - 120000);
    const findingId = row.linkedFinding || new mongoose.Types.ObjectId();
    const claimFilter = row.linkedFinding
        ? {_id: row._id, audit: auditId, status: 'accepted', linkedFinding: findingId, promotionStartedAt: {$lte: cutoff}}
        : {_id: row._id, audit: auditId, status: 'accepted', linkedFinding: null};
    const claimed = await this.findOneAndUpdate(claimFilter, {$set: {linkedFinding: findingId, promotionStartedAt: now}}, {new: true});
    if (!claimed) throw {fn: 'BadParameters', message: 'Evidence promotion is already in progress'};

    const escape = require('lodash/escape');
    const html = value => value ? `<p>${escape(value).replace(/\r?\n/g, '<br>')}</p>` : '';
    const provenance = [`Evidence inbox ID: ${row._id}`, `Source: ${row.sourceType}${row.sourceId ? ` (${row.sourceId})` : ''}`,
        `Observed: ${row.observedAt.toISOString()}`, row.target ? `Target: ${row.target}` : ''].filter(Boolean).join('\n');
    const finding = {_id: findingId, title: row.title, description: html(row.summary),
        poc: html(`${provenance}\n\n${row.rawEvidence}`), scope: row.target, status: 2};
    try {
        await Audit.createFinding(isAdmin, auditId, userId, finding);
    } catch (err) {
        if (!await Audit.exists({_id: auditId, 'findings._id': findingId})) {
            await this.updateOne({_id: row._id, linkedFinding: findingId}, {$set: {linkedFinding: null, promotionStartedAt: null}});
            throw err;
        }
    }
    await this.updateOne({_id: row._id, linkedFinding: findingId}, {$set: {status: 'promoted'}});
    return this.getOne(auditId, candidateId);
};

EvidenceCandidateSchema.statics.deleteForAudit = async function(auditId) {
    const rows = await this.find({audit: auditId}).select('attachments.fileId').lean().exec();
    await this.deleteMany({audit: auditId});
    const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {bucketName: 'evidenceFiles'});
    await Promise.all(rows.flatMap(row => row.attachments || []).map(file => bucket.delete(file.fileId).catch(() => {})));
};

module.exports = mongoose.model('EvidenceCandidate', EvidenceCandidateSchema);
