var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var AuditArchiveSchema = new Schema({
    name:           {type: String, required: true},
    filename:       {type: String, required: true, unique: true},
    originalName:   {type: String, required: true},
    size:           {type: Number, required: true},
    mimeType:       {type: String, required: true},
    company:        {type: Schema.Types.ObjectId, ref: 'Company', default: null, index: true},
    reportDate:     {type: Date, default: null},
    auditType:      {type: String, default: ''},
    tags:           [{type: String}],
    notes:          {type: String, default: ''},
    uploadedBy:     {type: Schema.Types.ObjectId, ref: 'User'}
}, {timestamps: true});

var PUBLIC_FIELDS = 'name filename originalName size mimeType company reportDate auditType tags notes uploadedBy createdAt updatedAt';
var EDITABLE_FIELDS = ['name', 'company', 'reportDate', 'auditType', 'tags', 'notes'];

function populated(query) {
    return query
        .select(PUBLIC_FIELDS)
        .populate('uploadedBy', 'username firstname lastname')
        .populate('company', 'name shortName logo');
}

AuditArchiveSchema.statics.EDITABLE_FIELDS = EDITABLE_FIELDS;

AuditArchiveSchema.statics.getAll = function(filters = {}) {
    var query = {};
    if (filters.company === 'none') query.company = null;
    else if (filters.company) query.company = filters.company;
    if (filters.tag) query.tags = filters.tag;
    return populated(this.find(query))
        .sort({reportDate: -1, createdAt: -1})
        .exec();
}

AuditArchiveSchema.statics.getOne = function(archiveId) {
    return populated(this.findById(archiveId))
        .exec()
        .then(row => {
            if (!row) throw({fn: 'NotFound', message: 'Archived audit not found'});
            return row;
        });
}

AuditArchiveSchema.statics.createArchive = function(archive) {
    var query = new AuditArchive(archive);
    return query.save()
        .then(row => AuditArchive.getOne(row._id));
}

AuditArchiveSchema.statics.assertCanModify = function(archiveId, userId, isAllowedAll) {
    return this.findById(archiveId).select('uploadedBy').exec()
        .then(row => {
            if (!row) throw({fn: 'NotFound', message: 'Archived audit not found'});
            if (!isAllowedAll && String(row.uploadedBy) !== String(userId))
                throw({fn: 'Forbidden', message: 'Insufficient privileges'});
            return row;
        });
}

AuditArchiveSchema.statics.updateArchive = function(archiveId, update) {
    return this.findByIdAndUpdate(archiveId, {$set: update}, {new: true, runValidators: true}).exec()
        .then(row => {
            if (!row) throw({fn: 'NotFound', message: 'Archived audit not found'});
            return AuditArchive.getOne(row._id);
        });
}

AuditArchiveSchema.statics.bulkUpdate = function(archiveIds, update) {
    return this.updateMany({_id: {$in: archiveIds}}, {$set: update}).exec()
        .then(result => ({matched: result.matchedCount, modified: result.modifiedCount}));
}

AuditArchiveSchema.statics.deleteArchive = function(archiveId) {
    return this.findByIdAndDelete(archiveId).exec()
        .then(row => {
            if (!row) throw({fn: 'NotFound', message: 'Archived audit not found'});
            return row;
        });
}

var AuditArchive = mongoose.model('AuditArchive', AuditArchiveSchema);
module.exports = AuditArchive;
