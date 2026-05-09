const request = require("supertest");

var env = process.env.NODE_ENV || 'dev';
var config = require('../src/config/config.json')[env];

var mongoose = require('mongoose');
if (config.database.name === 'pwndoc') {
    throw new Error('Refusing to run tests against the development database "pwndoc"');
}
var cleanDatabase = mongoose
    .connect(`mongodb://${config.database.server}:${config.database.port}/${config.database.name}`, {})
    .then(() => mongoose.connection.dropDatabase());

const app = require(__dirname+"/../src/app");

beforeAll(async () => {
    await cleanDatabase;
    // Mongoose 8 builds indexes asynchronously after connect — wait for every
    // registered model's indexes to finish building so that subsequent tests
    // (e.g. duplicate-title checks on Vulnerability.details.title) get the
    // expected unique-constraint failures rather than racy 201 inserts.
    await Promise.all(
        Object.values(mongoose.models).map(m => m.syncIndexes().catch(() => {}))
    );
});

// Import tests
require('./unauthenticated.test')(request, app)
require('./auth-default.test')(request, app)
require('./user.test')(request, app)
require('./template.test')(request, app)
require('./audit-archive.test')(request, app)
require('./data.test')(request, app)
require('./company.test')(request, app)
require('./client.test')(request, app)
require('./vulnerability.test')(request, app)
require('./audit.test')(request, app)
require('./settings.test')(request, app)
require('./ai.test')(request, app)
require('./lib.test')()
