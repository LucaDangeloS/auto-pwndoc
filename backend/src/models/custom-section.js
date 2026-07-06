var mongoose = require('mongoose');
var Schema = mongoose.Schema;
var ObjectId = mongoose.Types.ObjectId;

var ChecklistTaxonomy = {
    type:        {type: String, default: ''},
    category:    {type: String, default: ''},
    subcategory: {type: String, default: ''},
    code:        {type: String, default: ''}
}

var CustomSectionSchema = new Schema({
    field:  {type: String, required: true, unique: true},
    name:   {type: String, required: true, unique: true},
    icon:   String,
    type:   {type: String, enum: ['text', 'checklist'], default: 'text'},
    rows:   [{
        _id: false,
        label: String,
        code: {type: String, default: ''},
        taxonomy: ChecklistTaxonomy,
        level: {type: Number, default: 0},
        path: {type: String, default: ''}
    }]
}, {timestamps: true});

/*
*** Statics ***
*/

CustomSectionSchema.statics.getAll = () => {
    return new Promise((resolve, reject) => {
        CustomSection.find()
        .select('_id field name icon type rows')
        .exec()
        .then(rows => resolve(rows))
        .catch(err => reject(err))
    });
}

CustomSectionSchema.statics.create = (section) => {
    return new Promise((resolve, reject) => {
        new CustomSection(section).save()
        .then(row => resolve(row))
        .catch(err => {
            if (err.code === 11000)
                reject({fn: 'BadParameters', message: 'Custom Section already exists'});
            else
                reject(err);
        })
    })
}

function findDuplicateValue(rows, key) {
    const seen = new Set();
    for (const row of rows) {
        const value = row[key];
        if (!value) continue;
        if (seen.has(value)) return value;
        seen.add(value);
    }
    return null;
}

// Updates provided sections by stable id when available, upserts by field for
// older clients, and deletes any no longer in the list.
CustomSectionSchema.statics.updateAll = (sections) => {
    return new Promise(async (resolve, reject) => {
        try {
            const duplicateField = findDuplicateValue(sections, 'field');
            if (duplicateField)
                return reject({fn: 'BadParameters', message: `Duplicate custom section field: ${duplicateField}`});

            const duplicateName = findDuplicateValue(sections, 'name');
            if (duplicateName)
                return reject({fn: 'BadParameters', message: `Duplicate custom section name: ${duplicateName}`});

            const existing = await CustomSection.find().select('_id field name').lean();
            const existingById = new Map(existing.map(section => [section._id.toString(), section]));
            const existingByField = new Map(existing.map(section => [section.field, section]));
            const existingByName = new Map(existing.map(section => [section.name, section]));
            const idsToKeep = [];
            const fieldsToKeep = [];
            const fieldRenames = [];

            const ops = sections.map(section => {
                const update = Object.assign({}, section);
                const id = update._id && ObjectId.isValid(update._id) ? update._id.toString() : null;
                delete update._id;

                if (id && existingById.has(id)) {
                    const previous = existingById.get(id);
                    idsToKeep.push(previous._id);
                    if (previous.field !== update.field)
                        fieldRenames.push({from: previous.field, to: update.field});

                    return {
                        updateOne: {
                            filter: {_id: previous._id},
                            update: {$set: update}
                        }
                    };
                }

                const previous = existingByField.get(update.field) || existingByName.get(update.name);
                if (previous) {
                    idsToKeep.push(previous._id);
                    if (previous.field !== update.field)
                        fieldRenames.push({from: previous.field, to: update.field});

                    return {
                        updateOne: {
                            filter: {_id: previous._id},
                            update: {$set: update}
                        }
                    };
                }

                fieldsToKeep.push(update.field);
                return {
                    updateOne: {
                        filter: {field: update.field},
                        update: {$set: update},
                        upsert: true
                    }
                };
            });

            if (ops.length > 0)
                await CustomSection.bulkWrite(ops, {ordered: true});

            await CustomSection.deleteMany({
                $and: [
                    idsToKeep.length ? {_id: {$nin: idsToKeep}} : {},
                    fieldsToKeep.length ? {field: {$nin: fieldsToKeep}} : {}
                ]
            });

            if (fieldRenames.length > 0) {
                const AuditType = mongoose.model('AuditType');
                for (const rename of fieldRenames) {
                    await AuditType.updateMany(
                        {sections: rename.from},
                        {$set: {'sections.$': rename.to}}
                    );
                }
            }

            resolve('Sections updated successfully');
        }
        catch (err) {
            if (err.code === 11000) {
                const field = Object.keys(err.keyPattern || err.keyValue || {})[0] || 'field/name';
                const value = err.keyValue && err.keyValue[field] ? `: ${err.keyValue[field]}` : '';
                reject({fn: 'BadParameters', message: `Custom Section ${field} already exists${value}`});
            }
            else reject(err);
        }
    })
}

CustomSectionSchema.statics.delete = (field) => {
    return new Promise((resolve, reject) => {
        CustomSection.deleteOne({field})
        .then(res => {
            if (res.deletedCount === 1)
                resolve('Custom Section deleted');
            else
                reject({fn: 'NotFound', message: 'Custom Section not found'});
        })
        .catch(err => reject(err))
    });
}

/*
*** Methods ***
*/

var CustomSection = mongoose.model('CustomSection', CustomSectionSchema);
CustomSection.syncIndexes();
module.exports = CustomSection;
