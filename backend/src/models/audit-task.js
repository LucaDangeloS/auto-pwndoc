const mongoose = require('mongoose');

const AuditTaskSchema = new mongoose.Schema({
    audit: {type: mongoose.Schema.Types.ObjectId, ref: 'Audit', required: true, index: true},
    title: {type: String, required: true, maxlength: 160},
    description: {type: String, default: '', maxlength: 3000},
    assignee: {type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true},
    dueOn: {type: Date, default: null},
    status: {type: String, enum: ['todo', 'doing', 'done'], default: 'todo'},
    createdBy: {type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true},
    updatedBy: {type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true}
}, {timestamps: true});

AuditTaskSchema.index({assignee: 1, status: 1, dueOn: 1});

AuditTaskSchema.statics.list = function(auditIds, assignee) {
    const query = {audit: {$in: auditIds}};
    if (assignee) query.assignee = assignee;
    return this.find(query).populate('audit', 'name state').populate('assignee', 'username firstname lastname')
        .populate('createdBy', 'username').sort({dueOn: 1, createdAt: -1}).exec();
};

AuditTaskSchema.statics.getOne = async function(auditId, taskId) {
    const row = await this.findOne({_id: taskId, audit: auditId}).populate('audit', 'name state')
        .populate('assignee', 'username firstname lastname').exec();
    if (!row) throw {fn: 'NotFound', message: 'Task not found'};
    return row;
};

module.exports = mongoose.model('AuditTask', AuditTaskSchema);
