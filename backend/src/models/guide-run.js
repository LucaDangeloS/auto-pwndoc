const mongoose = require('mongoose');

const GuideRunSchema = new mongoose.Schema({
    guide: {type: mongoose.Schema.Types.ObjectId, ref: 'Guide', required: true},
    audit: {type: mongoose.Schema.Types.ObjectId, ref: 'Audit', required: true},
    guideVersion: {type: Number, required: true},
    steps: [{text: {type: String, required: true}, done: {type: Boolean, default: false}}],
    coverage: [{
        framework: {type: String, enum: ['WSTG', 'ASVS'], required: true},
        version: {type: String, required: true},
        code: {type: String, required: true},
        status: {type: String, enum: ['pending', 'tested', 'na'], default: 'pending'},
        justification: {type: String, default: '', maxlength: 2000},
        updatedBy: {type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null},
        updatedAt: {type: Date, default: null}
    }],
    createdBy: {type: mongoose.Schema.Types.ObjectId, ref: 'User'},
    updatedBy: {type: mongoose.Schema.Types.ObjectId, ref: 'User'}
}, {timestamps: true});
GuideRunSchema.index({guide: 1, audit: 1}, {unique: true});
GuideRunSchema.statics.getOrCreate = async function(guide, auditId, userId) {
    return this.findOneAndUpdate({guide: guide._id, audit: auditId}, {$setOnInsert: {
        guideVersion: guide.version, steps: guide.steps.map(text => ({text, done: false})),
        coverage: (guide.references || []).map(ref => ({framework: ref.framework, version: ref.version,
            code: ref.code, status: 'pending'})), createdBy: userId, updatedBy: userId
    }}, {upsert: true, new: true, setDefaultsOnInsert: true}).exec();
};
module.exports = mongoose.model('GuideRun', GuideRunSchema);
