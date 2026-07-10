// Catalog of every ACL permission enforceable by the API, grouped for the roles
// management UI. `core: true` marks permissions included in the built-in `user`
// role (see builtInRoles in lib/auth.js — keep both in sync).
const catalog = [
    {
        key: 'audits',
        label: 'Audits',
        permissions: [
            {scope: 'audits:create', core: true},
            {scope: 'audits:read', core: true},
            {scope: 'audits:update', core: true},
            {scope: 'audits:delete', core: true},
            {scope: 'audits:read-all', core: false},
            {scope: 'audits:update-all', core: false},
            {scope: 'audits:review', core: false},
            {scope: 'audits:review-all', core: false},
            {scope: 'audits:comments:create', core: true},
            {scope: 'audits:comments:update', core: true},
            {scope: 'audits:comments:delete', core: true},
            {scope: 'audits:comments:create-all', core: false},
            {scope: 'audits:comments:update-all', core: false},
            {scope: 'audits:comments:delete-all', core: false}
        ]
    },
    {
        key: 'audit-archives',
        label: 'Audit Archives',
        permissions: [
            {scope: 'audit-archives:read', core: true},
            {scope: 'audit-archives:create', core: true},
            {scope: 'audit-archives:delete', core: true}
        ]
    },
    {
        key: 'images',
        label: 'Images',
        permissions: [
            {scope: 'images:create', core: true},
            {scope: 'images:read', core: true},
            {scope: 'images:delete', core: false}
        ]
    },
    {
        key: 'companies',
        label: 'Companies',
        permissions: [
            {scope: 'companies:create', core: true},
            {scope: 'companies:read', core: true},
            {scope: 'companies:update', core: true},
            {scope: 'companies:delete', core: true}
        ]
    },
    {
        key: 'templates',
        label: 'Templates',
        permissions: [
            {scope: 'templates:read', core: true},
            {scope: 'templates:create', core: false},
            {scope: 'templates:update', core: false},
            {scope: 'templates:delete', core: false}
        ]
    },
    {
        key: 'vulnerabilities',
        label: 'Vulnerabilities',
        permissions: [
            {scope: 'vulnerabilities:read', core: true},
            {scope: 'vulnerabilities:create', core: false},
            {scope: 'vulnerabilities:update', core: false},
            {scope: 'vulnerabilities:delete', core: false},
            {scope: 'vulnerabilities:delete-all', core: false},
            {scope: 'vulnerability-updates:create', core: true}
        ]
    },
    {
        key: 'vulnerability-taxonomy',
        label: 'Vulnerability Taxonomy',
        permissions: [
            {scope: 'vulnerability-taxonomy:read', core: true},
            {scope: 'vulnerability-taxonomy:create', core: false},
            {scope: 'vulnerability-taxonomy:update', core: false},
            {scope: 'vulnerability-taxonomy:delete', core: false}
        ]
    },
    {
        key: 'languages',
        label: 'Languages',
        permissions: [
            {scope: 'languages:read', core: true},
            {scope: 'languages:create', core: false},
            {scope: 'languages:update', core: false},
            {scope: 'languages:delete', core: false}
        ]
    },
    {
        key: 'audit-types',
        label: 'Audit Types',
        permissions: [
            {scope: 'audit-types:read', core: true},
            {scope: 'audit-types:create', core: false},
            {scope: 'audit-types:update', core: false},
            {scope: 'audit-types:delete', core: false}
        ]
    },
    {
        key: 'sections',
        label: 'Custom Sections',
        permissions: [
            {scope: 'sections:read', core: true},
            {scope: 'sections:create', core: false},
            {scope: 'sections:update', core: false},
            {scope: 'sections:delete', core: false}
        ]
    },
    {
        key: 'custom-fields',
        label: 'Custom Fields',
        permissions: [
            {scope: 'custom-fields:read', core: true},
            {scope: 'custom-fields:create', core: false},
            {scope: 'custom-fields:update', core: false},
            {scope: 'custom-fields:delete', core: false}
        ]
    },
    {
        key: 'users',
        label: 'Users',
        permissions: [
            {scope: 'users:read', core: true},
            {scope: 'users:read-all', core: false},
            {scope: 'users:create', core: false},
            {scope: 'users:update', core: false}
        ]
    },
    {
        key: 'roles',
        label: 'Roles',
        permissions: [
            {scope: 'roles:read', core: true},
            {scope: 'roles:create', core: false},
            {scope: 'roles:update', core: false},
            {scope: 'roles:delete', core: false}
        ]
    },
    {
        key: 'spellcheck',
        label: 'Spellcheck',
        permissions: [
            {scope: 'spellcheck:read', core: true},
            {scope: 'spellcheck:create', core: true},
            {scope: 'spellcheck:delete', core: false}
        ]
    },
    {
        key: 'settings',
        label: 'Settings',
        permissions: [
            {scope: 'settings:read-public', core: true},
            {scope: 'settings:read', core: false},
            {scope: 'settings:update', core: false}
        ]
    },
    {
        key: 'backups',
        label: 'Backups',
        permissions: [
            {scope: 'backups:read', core: false},
            {scope: 'backups:create', core: false},
            {scope: 'backups:update', core: false},
            {scope: 'backups:delete', core: false}
        ]
    }
];

function flatten() {
    return catalog.reduce((acc, group) => acc.concat(group.permissions.map(p => p.scope)), []);
}

function corePermissions() {
    return catalog.reduce((acc, group) => acc.concat(group.permissions.filter(p => p.core).map(p => p.scope)), []);
}

module.exports = { catalog, flatten, corePermissions };
