const mongoose = require('mongoose');

const GuideRevisionSchema = new mongoose.Schema({
    guide: {type: mongoose.Schema.Types.ObjectId, ref: 'Guide', required: true, index: true},
    version: {type: Number, required: true},
    title: String,
    summary: String,
    content: String,
    steps: [String],
    references: [{framework: String, version: String, code: String}],
    tags: [String],
    tool: {type: mongoose.Schema.Types.ObjectId, ref: 'Tool', default: null},
    status: String,
    editedBy: {type: mongoose.Schema.Types.ObjectId, ref: 'User'}
}, {timestamps: true});
GuideRevisionSchema.index({guide: 1, version: 1}, {unique: true});
module.exports = mongoose.model('GuideRevision', GuideRevisionSchema);
