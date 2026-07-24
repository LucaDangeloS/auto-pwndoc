const response = {
    200: { description: 'Successful response', schema: { $ref: '#/definitions/ApiResponse' } },
    401: { description: 'Authentication failed' },
    403: { description: 'Permission denied' }
};

function operation(summary, parameters) {
    return {
        tags: ['Users'],
        summary,
        parameters: parameters || [],
        responses: response
    };
}

const pathParameter = (name, description) => ({
    name,
    in: 'path',
    required: true,
    type: 'string',
    description
});

const bodyParameter = (description, schema) => ({
    name: 'body',
    in: 'body',
    required: true,
    description,
    schema
});

module.exports = {
    '/api/users/checktoken': {
        get: operation('Validate the current authentication token')
    },
    '/api/users/refreshtoken': {
        get: operation('Refresh the authenticated user session'),
        delete: operation('Log out the current user')
    },
    '/api/users/token': {
        post: operation('Sign in and create a session', [bodyParameter('Credentials and optional TOTP code.', {
            type: 'object', required: ['username', 'password'], properties: {
                username: { type: 'string' }, password: { type: 'string', format: 'password' }, totpToken: { type: 'string' }
            }
        })])
    },
    '/api/users/init': {
        get: operation('Check whether the application has any users'),
        post: operation('Create the first administrator user', [bodyParameter('Initial administrator details.', {
            type: 'object', required: ['username', 'password', 'firstname', 'lastname'], properties: {
                username: { type: 'string' }, password: { type: 'string', format: 'password' }, firstname: { type: 'string' }, lastname: { type: 'string' }
            }
        })])
    },
    '/api/users': {
        get: operation('List users'),
        post: operation('Create users', [bodyParameter('Array of users to create.', { type: 'array', items: { type: 'object' } })])
    },
    '/api/users/export': {
        get: operation('Export all users')
    },
    '/api/users/reviewers': {
        get: operation('List users eligible to review audits')
    },
    '/api/users/me': {
        get: operation('Get the authenticated user profile'),
        put: operation('Update the authenticated user profile', [bodyParameter('Profile changes. currentPassword is required.', { type: 'object', properties: { currentPassword: { type: 'string', format: 'password' }, newPassword: { type: 'string', format: 'password' }, username: { type: 'string' }, firstname: { type: 'string' }, lastname: { type: 'string' }, email: { type: 'string', format: 'email' }, phone: { type: 'string' } } })])
    },
    '/api/users/totp': {
        get: operation('Get a TOTP setup QR code'),
        post: operation('Enable TOTP', [bodyParameter('TOTP secret and verification code.', { type: 'object', required: ['totpToken', 'totpSecret'], properties: { totpToken: { type: 'string' }, totpSecret: { type: 'string' } } })]),
        delete: operation('Disable TOTP', [bodyParameter('TOTP verification code.', { type: 'object', required: ['totpToken'], properties: { totpToken: { type: 'string' } } })])
    },
    '/api/users/{username}': {
        get: operation('Get a user by username', [pathParameter('username', 'Username')])
    },
    '/api/users/bulk-status': {
        put: operation('Enable or disable multiple users', [bodyParameter('User ids and the target enabled state.', { type: 'object', required: ['userIds', 'enabled'], properties: { userIds: { type: 'array', items: { type: 'string' } }, enabled: { type: 'boolean' } } })])
    },
    '/api/users/bulk-role': {
        put: operation('Set a role for multiple users', [bodyParameter('User ids and an existing role.', { type: 'object', required: ['userIds', 'role'], properties: { userIds: { type: 'array', items: { type: 'string' } }, role: { type: 'string' } } })])
    },
    '/api/users/bulk-permissions': {
        put: operation('Grant or revoke permissions for multiple users', [bodyParameter('User ids plus one or both permission arrays.', { type: 'object', required: ['userIds'], properties: { userIds: { type: 'array', items: { type: 'string' } }, add: { type: 'array', items: { type: 'string' } }, remove: { type: 'array', items: { type: 'string' } } } })])
    },
    '/api/users/{id}': {
        put: operation('Update a user', [pathParameter('id', 'User id'), bodyParameter('User fields to update.', { type: 'object' })])
    }
};
