const mongoose = require('mongoose');

const ToolLicenseSchema = new mongoose.Schema({
    tool: {type: mongoose.Schema.Types.ObjectId, ref: 'Tool', required: true, index: true},
    label: {type: String, required: true, maxlength: 160},
    type: {type: String, default: '', maxlength: 100},
    seats: {type: Number, min: 1, default: 1},
    assignedTo: [{type: mongoose.Schema.Types.ObjectId, ref: 'User'}],
    purchasedOn: {type: Date, default: null},
    expiresOn: {type: Date, default: null, index: true},
    renewalOwner: {type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null},
    purchaseRef: {type: String, default: '', maxlength: 300},
    notes: {type: String, default: '', maxlength: 2000},
    createdBy: {type: mongoose.Schema.Types.ObjectId, ref: 'User'}
}, {timestamps: true});

ToolLicenseSchema.statics.list = function() {
    return this.find().populate('tool', 'name vendor edition').populate('assignedTo', 'username firstname lastname')
        .populate('renewalOwner', 'username firstname lastname').sort({expiresOn: 1, label: 1}).exec();
};
ToolLicenseSchema.statics.saveLicense = async function(id, data) {
    if (!await mongoose.model('Tool').exists({_id: data.tool}))
        throw {fn: 'BadParameters', message: 'Tool not found'};
    const row = id ? await this.findByIdAndUpdate(id, {$set: data}, {new: true, runValidators: true}) : await this.create(data);
    if (!row) throw {fn: 'NotFound', message: 'License not found'};
    return this.findById(row._id).populate('tool', 'name vendor edition')
        .populate('assignedTo', 'username firstname lastname').populate('renewalOwner', 'username firstname lastname');
};
ToolLicenseSchema.statics.removeLicense = async function(id) {
    if (!await this.findByIdAndDelete(id)) throw {fn: 'NotFound', message: 'License not found'};
};

module.exports = mongoose.model('ToolLicense', ToolLicenseSchema);
