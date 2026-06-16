'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const templatePath = path.join(__dirname, '..', 'pages', 'settings', 'settings.html');
const template = fs.readFileSync(templatePath, 'utf8');
const bundleDir = path.join(__dirname, '..', '..', 'dist', 'spa', 'js');

assert(
    !/<template\s+[^>]*v-for\s*=/.test(template),
    'settings.html must put v-for on the rendered component; a bare template v-for breaks the external template render scope'
);
assert(
    /<q-expansion-item\s+[^>]*v-for="field in aiFieldPromptFields"/s.test(template),
    'per-field AI prompt controls must render from aiFieldPromptFields'
);
assert.strictEqual(
    (template.match(/v-model="settings\.ai\.private\.visionSystemPrompt"/g) || []).length,
    1,
    'Vision / Proof Analysis prompt must be rendered exactly once'
);
assert.strictEqual(
    (template.match(/v-model="settings\.ai\.private\.visionAnonymizationPrompt"/g) || []).length,
    1,
    'LLM anonymization prompt must be rendered exactly once'
);

const settingsBundle = fs.readdirSync(bundleDir)
    .filter((name) => name.endsWith('.js'))
    .map((name) => fs.readFileSync(path.join(bundleDir, name), 'utf8'))
    .find((content) => content.includes('aiFieldPromptFields'));

assert(settingsBundle, 'production build must contain the settings component');
assert(
    !settingsBundle.includes('.field.labelKey'),
    'compiled settings render must not read field as an undefined component property'
);
assert(
    /renderList\)\([^)]*\.aiFieldPromptFields/.test(settingsBundle),
    'compiled settings render must iterate over aiFieldPromptFields'
);

console.log('Settings template render regression test passed');
