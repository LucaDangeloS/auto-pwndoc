var mongoose = require('mongoose');
var Schema = mongoose.Schema;

// Custom ACL roles stored in the database. `name` is immutable once created.
// `allows` is a flat permission list (no inheritance) — the built-in `user`
// and `admin` roles stay hardcoded in lib/auth.js.
var RoleSchema = new Schema({
    name: {type: String, unique: true, required: true},
    displayName: {type: String, required: true},
    description: {type: String, default: ''},
    allows: {type: [String], default: []},
    // Only ['user'] or [] — inheriting the built-in user role keeps the custom
    // role in sync with future changes to the core permission set.
    inherits: {type: [String], default: []}
}, {timestamps: true});

var SYSTEM_ROLES = ['admin', 'user'];

RoleSchema.statics.getAll = () => {
    return Role.find().select('name displayName description allows inherits').sort({displayName: 1, name: 1}).lean();
};

RoleSchema.statics.getByName = (name) => {
    return Role.findOne({name: name}).select('name displayName description allows inherits').lean();
};

// Roles from getAll() plus the passed system-role rows, each annotated with a
// `users` count computed in a single aggregation.
RoleSchema.statics.getAllWithUserCounts = async (systemRoles = []) => {
    const User = mongoose.model('User');
    const customRoles = await Role.getAll();
    const knownRoles = ['admin', 'user', ...customRoles.map(role => role.name)];

    // Users with an unknown role effectively act as `user` (ACL fallback)
    const counts = await User.aggregate([
        {
            $project: {
                role: {
                    $cond: [{$in: ['$role', knownRoles]}, '$role', 'user']
                }
            }
        },
        {$group: {_id: '$role', count: {$sum: 1}}}
    ]);
    const countByRole = counts.reduce((acc, entry) => {
        acc[entry._id] = entry.count;
        return acc;
    }, {});

    return [...systemRoles, ...customRoles].map(role => ({...role, users: countByRole[role.name] || 0}));
};

RoleSchema.statics.create = async (role) => {
    try {
        const displayName = (role.displayName || role.name).trim();
        return await new Role({
            name: role.name,
            displayName: displayName,
            description: role.description || '',
            allows: role.allows || [],
            inherits: role.inherits || []
        }).save();
    }
    catch (err) {
        if (err.code === 11000)
            throw({fn: 'BadParameters', message: 'Role already exists'});
        throw err;
    }
};

// Role name is immutable once created; only displayName/description/allows change.
RoleSchema.statics.update = async (name, role) => {
    const displayName = (role.displayName || name).trim();
    const result = await Role.updateOne({name: name}, {$set: {
        displayName: displayName,
        description: role.description || '',
        allows: role.allows || [],
        inherits: role.inherits || []
    }});
    if (result.matchedCount !== 1)
        throw({fn: 'NotFound', message: 'Role not found'});
    return 'Role updated successfully';
};

// Deleting a role resets affected users to the built-in `user` role.
RoleSchema.statics.delete = async (name) => {
    const User = mongoose.model('User');
    const result = await Role.deleteOne({name: name});
    if (result.deletedCount !== 1)
        throw({fn: 'NotFound', message: 'Role not found'});
    await User.updateMany({role: name}, {$set: {role: 'user'}});
    return 'Role deleted successfully';
};

var Role = mongoose.model('Role', RoleSchema);
module.exports = Role;
