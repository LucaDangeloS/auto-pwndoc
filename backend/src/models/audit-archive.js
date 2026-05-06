var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var AuditArchiveSchema = new Schema({
    name:           {type: String, required: true},
    filename:       {type: String, required: true, unique: true},
    originalName:   {type: String, required: true},
    size:           {type: Number, required: true},
    mimeType:       {type: String, required: true},
    uploadedBy:     {type: Schema.Types.ObjectId, ref: 'User'}
}, {timestamps: true});

AuditArchiveSchema.statics.getAll = function() {
    return this.find()
        .select('name filename originalName size mimeType uploadedBy createdAt updatedAt')
        .populate('uploadedBy', 'username firstname lastname')
        .sort({createdAt: -1})
        .exec();
}

AuditArchiveSchema.statics.getOne = function(archiveId) {
    return this.findById(archiveId)
        .select('name filename originalName size mimeType uploadedBy createdAt updatedAt')
        .populate('uploadedBy', 'username firstname lastname')
        .exec()
        .then(row => {
            if (!row) throw({fn: 'NotFound', message: 'Archived audit not found'});
            return row;
        });
}

AuditArchiveSchema.statics.createArchive = function(archive) {
    var query = new AuditArchive(archive);
    return query.save()
        .then(row => ({
            _id: row._id,
            name: row.name,
            filename: row.filename,
            originalName: row.originalName,
            size: row.size,
            mimeType: row.mimeType,
            uploadedBy: row.uploadedBy,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt
        }));
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
