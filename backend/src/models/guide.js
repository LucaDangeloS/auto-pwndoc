const mongoose = require('mongoose');

const AttachmentSchema = new mongoose.Schema({
    fileId: {type: mongoose.Schema.Types.ObjectId, required: true},
    name: {type: String, required: true},
    mimeType: {type: String, required: true},
    size: {type: Number, required: true},
    uploadedBy: {type: mongoose.Schema.Types.ObjectId, ref: 'User'}
}, {timestamps: true});

const StandardRefSchema = new mongoose.Schema({
    framework: {type: String, enum: ['WSTG', 'ASVS'], required: true},
    version: {type: String, required: true, maxlength: 20},
    code: {type: String, required: true, maxlength: 60}
}, {_id: false});

const GuideSchema = new mongoose.Schema({
    title: {type: String, required: true, maxlength: 180},
    summary: {type: String, default: '', maxlength: 1000},
    content: {type: String, default: '', maxlength: 100000},
    steps: [{type: String, maxlength: 2000}],
    references: [StandardRefSchema],
    tags: [{type: String, maxlength: 50}],
    tool: {type: mongoose.Schema.Types.ObjectId, ref: 'Tool', default: null},
    status: {type: String, enum: ['draft', 'published'], default: 'draft'},
    version: {type: Number, default: 1},
    reviewedAt: {type: Date, default: null},
    createdBy: {type: mongoose.Schema.Types.ObjectId, ref: 'User'},
    updatedBy: {type: mongoose.Schema.Types.ObjectId, ref: 'User'},
    attachments: [AttachmentSchema]
}, {timestamps: true});

GuideSchema.statics.list = function(includeDrafts) {
    return this.find(includeDrafts ? {} : {status: 'published'}).select('-content').populate('tool', 'name edition').populate('createdBy', 'username')
        .sort({updatedAt: -1}).exec();
};
GuideSchema.statics.getGuide = async function(id) {
    const row = await this.findById(id).populate('tool', 'name edition').populate('createdBy', 'username')
        .populate('updatedBy', 'username').exec();
    if (!row) throw {fn: 'NotFound', message: 'Guide not found'};
    return row;
};
GuideSchema.statics.saveGuide = async function(id, data, userId) {
    let row;
    if (id) {
        row = await this.findById(id);
        if (!row) throw {fn: 'NotFound', message: 'Guide not found'};
        row.version += 1;
        Object.assign(row, data, {updatedBy: userId});
        await row.save();
    } else {
        row = await this.create({...data, createdBy: userId, updatedBy: userId});
    }
    await mongoose.model('GuideRevision').create({guide: row._id, version: row.version,
        title: row.title, summary: row.summary, content: row.content, steps: row.steps, references: row.references,
        tags: row.tags, tool: row.tool, status: row.status, editedBy: userId});
    return this.getGuide(row._id);
};

module.exports = mongoose.model('Guide', GuideSchema);
