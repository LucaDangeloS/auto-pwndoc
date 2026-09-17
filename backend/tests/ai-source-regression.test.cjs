'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const aiService = require('../src/lib/ai-service');

const service = fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'ai-service.js'), 'utf8');
const route = fs.readFileSync(path.join(__dirname, '..', 'src', 'routes', 'ai.js'), 'utf8');

assert(
    service.includes('For the description field, use prose paragraphs only') &&
        service.includes('Never use bullet points, numbered lists') &&
        service.includes("selectFieldSystemPrompt('generate', priv, fieldName, fieldKey)") &&
        service.includes('LEGACY_DESCRIPTION_PROMPT_MARKERS'),
    'backend description defaults must require prose instead of lists'
);

const legacyDescriptionPrompt = `Custom-looking prefix. ${'Use a short list only when it materially improves clarity.'}`;
const upgradedDescriptionPrompt = aiService._selectFieldSystemPrompt(
    'generate',
    { field_description_generateSystemPrompt: legacyDescriptionPrompt },
    'description',
    'field_description_generateSystemPrompt'
);
assert(upgradedDescriptionPrompt.includes('never use bullet points or numbered lists'));

const customDescriptionPrompt = 'Write this description in the organization-specific house style.';
assert.strictEqual(
    aiService._selectFieldSystemPrompt(
        'generate',
        { field_description_generateSystemPrompt: customDescriptionPrompt },
        'description',
        'field_description_generateSystemPrompt'
    ),
    customDescriptionPrompt,
    'custom description prompts must not be replaced'
);

assert(
    route.includes("action: 'complete'") &&
        route.includes("fieldName: 'poc'") &&
        route.includes('poc: generatedFields[6]'),
    'proof completion must generate and return the PoC field'
);

assert(
    !route.includes("generateProofFieldMaybe('observation'"),
    'proof completion must not generate Observation'
);

console.log('Backend AI source regression tests passed');
