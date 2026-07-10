module.exports = function(app) {
    var Response = require('../lib/httpResponse.js');
    var Role = require('mongoose').model('Role');
    var auth = require('../lib/auth');
    var acl = auth.acl;
    var permissionsCatalog = require('../lib/permissions-catalog');

    const SYSTEM_ROLES = ['admin', 'user'];
    const NAME_PATTERN = /^[a-zA-Z0-9_-]+$/;
    const VALID_PERMISSIONS = new Set(permissionsCatalog.flatten());

    function systemRows() {
        return [
            {name: 'admin', displayName: 'Admin', description: '', allows: '*', inherits: [], system: true},
            {name: 'user', displayName: 'User', description: '', allows: auth.CORE_PERMISSIONS, inherits: [], system: true}
        ];
    }

    function validateMutableRole(res, name) {
        if (!name || typeof name !== 'string' || !NAME_PATTERN.test(name)) {
            Response.BadParameters(res, 'Role name must match /^[a-zA-Z0-9_-]+$/');
            return false;
        }
        if (SYSTEM_ROLES.includes(name)) {
            Response.Forbidden(res, 'System roles cannot be modified');
            return false;
        }
        return true;
    }

    function validateBody(res, body) {
        if (!body.displayName || typeof body.displayName !== 'string' || !body.displayName.trim()) {
            Response.BadParameters(res, 'Role display name is required');
            return false;
        }
        if (!Array.isArray(body.allows)) {
            Response.BadParameters(res, 'allows must be an array');
            return false;
        }
        var invalidPermission = body.allows.find(permission => permission === '*' || !VALID_PERMISSIONS.has(permission));
        if (invalidPermission) {
            Response.BadParameters(res, `Invalid permission: ${invalidPermission}`);
            return false;
        }
        if (body.inherits !== undefined && (!Array.isArray(body.inherits) || body.inherits.some(r => r !== 'user'))) {
            Response.BadParameters(res, "inherits may only contain 'user'");
            return false;
        }
        return true;
    }

    app.get("/api/data/roles", acl.hasPermission('roles:read'), function(req, res) {
        // #swagger.tags = ['Data']

        Role.getAllWithUserCounts(systemRows())
        .then(roles => Response.Ok(res, roles))
        .catch(err => Response.Internal(res, err));
    });

    app.get("/api/data/roles/permissions", acl.hasPermission('roles:read'), function(req, res) {
        // #swagger.tags = ['Data']

        Response.Ok(res, permissionsCatalog.catalog);
    });

    app.post("/api/data/roles", acl.hasPermission('roles:create'), function(req, res) {
        // #swagger.tags = ['Data']

        if (!validateMutableRole(res, req.body.name) || !validateBody(res, req.body))
            return;

        Role.create({
            name: req.body.name,
            displayName: req.body.displayName,
            description: req.body.description,
            allows: req.body.allows,
            inherits: req.body.inherits || []
        })
        .then(async role => {
            await acl.reload();
            Response.Created(res, role);
        })
        .catch(err => Response.Internal(res, err));
    });

    app.put("/api/data/roles/:name", acl.hasPermission('roles:update'), function(req, res) {
        // #swagger.tags = ['Data']

        if (!validateMutableRole(res, req.params.name) || !validateBody(res, req.body))
            return;

        Role.update(req.params.name, {
            displayName: req.body.displayName,
            description: req.body.description,
            allows: req.body.allows,
            inherits: req.body.inherits || []
        })
        .then(async msg => {
            await acl.reload();
            Response.Ok(res, msg);
        })
        .catch(err => Response.Internal(res, err));
    });

    app.delete("/api/data/roles/:name", acl.hasPermission('roles:delete'), function(req, res) {
        // #swagger.tags = ['Data']

        if (!validateMutableRole(res, req.params.name))
            return;

        Role.delete(req.params.name)
        .then(async msg => {
            await acl.reload();
            Response.Ok(res, msg);
        })
        .catch(err => Response.Internal(res, err));
    });
};
