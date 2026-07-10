var mongoose = require('mongoose');
var Schema = mongoose.Schema;

const SpellingDictionarySchema = new Schema({
    word: {
        type: String,
        unique: true,
        required: true,
        trim: true,
        index: true
    }
});

// Get all words
SpellingDictionarySchema.statics.getAll = () => {
    return SpellingDictionary.find({}).sort({word: 1}).exec();
};

// Create word (upsert - create if not exists, return existing if exists)
SpellingDictionarySchema.statics.create = (word) => {
    return new Promise((resolve, reject) => {
        if (!word || !String(word).trim()) {
            return reject({fn: 'BadParameters', message: 'Word is required'});
        }

        const w = String(word).trim();
        SpellingDictionary.findOneAndUpdate(
            { word: w },
            { word: w },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        ).exec()
        .then((row) => resolve(row))
        .catch((err) => reject(err));
    });
};

// Delete word
SpellingDictionarySchema.statics.delete = (word) => {
    return new Promise((resolve, reject) => {
        if (!word || !String(word).trim()) {
            return reject({fn: 'BadParameters', message: 'Word is required'});
        }

        SpellingDictionary.findOneAndDelete({ word: String(word).trim() }).exec()
        .then((row) => {
            if (!row)
                reject({fn: 'NotFound', message: 'Word not found in dictionary'});
            else
                resolve(row);
        })
        .catch((err) => reject(err));
    });
};

const SpellingDictionary = mongoose.model('SpellingDictionary', SpellingDictionarySchema);
module.exports = SpellingDictionary;
