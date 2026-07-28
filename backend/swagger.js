const fs = require('fs');
const swaggerAutogen = require('swagger-autogen')({ writeOutputFile: false });
const aiPaths = require('./src/config/swagger-ai-paths');
const userPaths = require('./src/config/swagger-user-paths');

const doc = {
    info: {
        title: 'AutoPwnDoc REST API',
        description: 'Interactive documentation for the AutoPwnDoc REST API. Authenticate requests with an API key in the `X-API-Key` header (or a logged-in browser session). New API keys act as the user who created them, including that user\'s current role and audit ownership. API keys can read taxonomy definitions and assign approved paths to audit findings, but cannot modify the taxonomy catalog. Standard JSON responses use `{ status, datas }`; file-download endpoints return a file instead.',
        version: '1.0.0',
    },
    schemes: ['https', 'http'],
    securityDefinitions: {
        ApiKeyAuth: {
            type: 'apiKey',
            name: 'X-API-Key',
            in: 'header',
            description: 'Create and revoke API keys in Settings > API. Keys act as their creating user and can also be sent as a Bearer token.'
        }
    },
    definitions: {
        ApiResponse: {
            type: 'object',
            required: ['status', 'datas'],
            properties: {
                status: { type: 'string', example: 'success' },
                datas: { type: 'object', description: 'Endpoint response payload.' }
            }
        }
    }
};

const outputFile = './src/config/swagger-output.json';
const endpointsFiles = [
    './src/routes/audit.js',
    './src/routes/audit-archive.js',
    './src/routes/ai.js',
    './src/routes/auth.js',
    './src/routes/backup.js',
    './src/routes/company.js',
    './src/routes/data.js',
    './src/routes/image.js',
    './src/routes/mcp.js',
    './src/routes/role.js',
    './src/routes/settings.js',
    './src/routes/spellcheck.js',
    './src/routes/template.js',
    './src/routes/vulnerability.js'
];

/* NOTE: if you use the express Router, you must pass in the
   'endpointsFiles' only the root file where the route starts,
   such as index.js, app.js, routes.js, ... */

swaggerAutogen(outputFile, endpointsFiles, doc)
    .then(result => {
        if (!result.success) throw new Error('Swagger generation failed');
        result.data.paths = { ...result.data.paths, ...aiPaths, ...userPaths };
        fs.writeFileSync(outputFile, JSON.stringify(result.data, null, 2) + '\n');
        console.log(`Swagger document written with ${Object.keys(result.data.paths).length} paths.`);
    })
    .catch(err => {
        console.error('Swagger generation failed:', err.message);
        process.exitCode = 1;
    });
