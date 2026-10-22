'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repositoryRoot = path.resolve(__dirname, '..', '..');
const dockerfiles = [
    'backend/Dockerfile',
    'backend/Dockerfile.dev',
    'backend/Dockerfile.test',
    'frontend/Dockerfile',
    'frontend/Dockerfile.dev'
];
const patchedVersions = {
    22: [23, 4],
    24: [22, 1],
    26: [12, 1]
};

for (const relativePath of dockerfiles) {
    const contents = fs.readFileSync(path.join(repositoryRoot, relativePath), 'utf8');
    const match = contents.match(/^FROM node:(\d+)\.(\d+)\.(\d+)-alpine\b/m);

    assert(match, `${relativePath} must pin an Alpine Node.js image version`);

    const [, major, minor, patch] = match.map(Number);
    const minimum = patchedVersions[major];

    assert(minimum, `${relativePath} uses an unsupported Node.js release line`);
    assert(
        minor > minimum[0] || (minor === minimum[0] && patch >= minimum[1]),
        `${relativePath} must use Node.js ${major}.${minimum[0]}.${minimum[1]} or later`
    );
}

console.log('All Dockerfiles use Node.js versions patched for CVE-2026-111497');
