var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var CustomSectionSchema = new Schema({
    field:  {type: String, required: true, unique: true},
    name:   {type: String, required: true, unique: true},
    icon:   String,
    type:   {type: String, enum: ['text', 'checklist'], default: 'text'},
    rows:   [{_id: false, label: String}]
}, {timestamps: true});

/*
*** Statics ***
*/

CustomSectionSchema.statics.getAll = () => {
    return new Promise((resolve, reject) => {
        CustomSection.find()
        .select('-_id field name icon type rows')
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

// Upserts provided sections by field, deletes any no longer in the list.
CustomSectionSchema.statics.updateAll = (sections) => {
    return new Promise((resolve, reject) => {
        const fields = sections.map(s => s.field)
        const ops = sections.map(s => ({
            updateOne: {
                filter: {field: s.field},
                update: {$set: s},
                upsert: true
            }
        }))
        Promise.resolve()
        .then(() => ops.length > 0 ? CustomSection.bulkWrite(ops, {ordered: false}) : null)
        .then(() => CustomSection.deleteMany({field: {$nin: fields}}))
        .then(() => resolve('Sections updated successfully'))
        .catch(err => reject(err))
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
