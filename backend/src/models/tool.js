const mongoose = require('mongoose');

const ToolSchema = new mongoose.Schema({
    name: {type: String, required: true, trim: true, maxlength: 160},
    vendor: {type: String, default: '', maxlength: 160},
    edition: {type: String, default: '', maxlength: 120},
    category: {type: String, default: '', maxlength: 100},
    purpose: {type: String, default: '', maxlength: 2000},
    website: {type: String, default: '', maxlength: 500},
    version: {type: String, default: '', maxlength: 100},
    status: {type: String, enum: ['active', 'trial', 'retired'], default: 'active'},
    owner: {type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null},
    tags: [{type: String, maxlength: 50}],
    createdBy: {type: mongoose.Schema.Types.ObjectId, ref: 'User'}
}, {timestamps: true});

ToolSchema.index({name: 1, edition: 1}, {unique: true});
ToolSchema.statics.list = function() {
    return this.find().populate('owner', 'username firstname lastname').sort({name: 1, edition: 1}).exec();
};
ToolSchema.statics.saveTool = async function(id, data) {
    const row = id ? await this.findByIdAndUpdate(id, {$set: data}, {new: true, runValidators: true}) : await this.create(data);
    if (!row) throw {fn: 'NotFound', message: 'Tool not found'};
    return this.findById(row._id).populate('owner', 'username firstname lastname');
};
ToolSchema.statics.removeTool = async function(id) {
    if (await mongoose.model('ToolLicense').exists({tool: id}))
        throw {fn: 'BadParameters', message: 'Tool still has licenses'};
    if (await mongoose.model('Guide').exists({tool: id}))
        throw {fn: 'BadParameters', message: 'Tool still has guides'};
    if (!await this.findByIdAndDelete(id)) throw {fn: 'NotFound', message: 'Tool not found'};
};

module.exports = mongoose.model('Tool', ToolSchema);
