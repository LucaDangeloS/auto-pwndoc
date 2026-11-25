'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const aiService = require('../src/lib/ai-service');

async function testProofWorkflow() {
    const routePath = path.resolve(__dirname, '../src/routes/ai.js');
    const realRequire = createRequire(routePath);
    const route = { exports: null };
    const endpoints = new Map();
    const requests = new Map();
    const settings = { enabled: true, private: {}, public: {} };
    const generated = {
        title: 'Missing Security Header',
        description: '<p>A security header was missing from responses.</p>',
        references: 'https://example.com/vendor-advisory',
        remediation: '<p>Configure the header using the vendor guidance.</p>',
        cvssv3: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:U/C:L/I:N/A:N',
        poc: '<p>The missing header was observed in the response.</p>'
    };
    const dependencies = {
        '../lib/auth': { acl: { hasPermission: () => () => {} } },
        '../lib/ai-service': {
            ...aiService,
            generate: async request => {
                requests.set(request.fieldName, request);
                if (request.fieldName === 'references') await new Promise(resolve => setImmediate(resolve));
                return { html: generated[request.fieldName] };
            }
        },
        '../lib/embedding-service': {},
        '../lib/vision-service': {},
        '../lib/openwebui-provider': {},
        mongoose: { model: () => ({ getAll: async () => ({ ai: settings, toObject: () => ({ ai: settings }) }) }) }
    };
    vm.runInNewContext(fs.readFileSync(routePath, 'utf8'), {
        module: route,
        require: id => dependencies[id] || realRequire(id),
        console,
        Promise
    }, { filename: routePath });
    route.exports({ post: (url, _acl, handler) => endpoints.set(url, handler), get: () => {} });

    async function post(url, body) {
        let response;
        const res = { status: code => ({
            json(data) { response = { code, data }; },
            send(data) { response = { code, data }; }
        }) };
        await endpoints.get(url)({ body }, res);
        assert.equal(response.code, 200);
        return response.data.datas;
    }

    const payload = {
        pocHtml: '<p>A response was inspected.</p><img src="evidence.png">',
        findingTitle: 'Provisional title',
        findingDescription: '<p>Provisional description about the response.</p>',
        findingObservation: '<p>A provisional observation.</p>',
        findingRemediation: '<p>Provisional remediation about the header.</p>',
        findingReferences: ['https://example.com/current-draft'],
        visionSummary: 'The header was absent.'
    };
    const preview = await post('/api/ai/anonymize-preview', { proofCompletion: true, context: payload });
    assert.equal(preview.fields.currentTitle, payload.findingTitle);
    assert.equal(preview.fields.currentReferences, payload.findingReferences[0]);

    const completion = await post('/api/ai/complete-proof-fields', payload);
    const remediation = requests.get('remediation').context;
    assert.equal(remediation.resolvedFindingTitle, generated.title);
    assert.match(remediation.resolvedFindingDescription, /a security header was missing/i);
    assert.equal(remediation.resolvedFindingReferences, generated.references);
    assert.match(remediation.approvedAnonymization.currentRemediation, /provisional remediation/i);
    assert.match(remediation.approvedAnonymization.currentObservation, /provisional observation/i);
    assert.equal(completion.generatedResult.poc, payload.pocHtml + generated.poc);
    assert(!requests.has('observation'));

    requests.clear();
    await post('/api/ai/complete-proof-fields', {
        ...payload,
        findingRemediation: '',
        overwriteFilledFields: false,
        anonymizationReviewed: true,
        approvedAnonymization: { ...preview.fields, currentReferences: 'Reviewed reference' }
    });
    assert(!requests.has('title'));
    assert(!requests.has('description'));
    assert(!requests.has('references'));
    assert.equal(requests.get('remediation').context.resolvedFindingReferences, 'Reviewed reference');
}

async function main() {
    const custom = {
        generateUserPrompt: 'Legacy custom editor prompt',
        field_description_generateUserPrompt: 'Custom description',
        field_poc_completeSystemPrompt: 'Continue this PoC only',
        proof_pocSystemPrompt: 'Continue the finding PoC'
    };
    const { defaults, overrides } = aiService.getPromptSettings(custom);
    for (const action of ['generate', 'complete', 'rewrite']) {
        assert.match(defaults['field_description_' + action + 'SystemPrompt'], /never use bullet points or numbered lists/i);
        assert.match(defaults['field_description_' + action + 'SystemPrompt'], /omit concrete CVE identifiers/i);
        assert.match(defaults['field_poc_' + action + 'SystemPrompt'], /impersonal sentences in the past or present tense/i);
    }
    assert.equal(overrides.field_description_generateUserPrompt, custom.field_description_generateUserPrompt);
    assert.equal(overrides.field_remediation_generateUserPrompt, custom.generateUserPrompt);
    assert.equal(aiService._generationPrompts('complete', 'poc', custom)[0], custom.field_poc_completeSystemPrompt);
    assert.equal(aiService._generationPrompts('proof-completion', 'poc', custom)[0], custom.proof_pocSystemPrompt);
    assert.match(defaults.proof_pocSystemPrompt, /impersonal sentences/i);
    assert.match(defaults.proof_remediationUserPrompt, /Current remediation: \{currentRemediation\}/);
    assert.match(defaults.proof_remediationUserPrompt, /References selected for this result:\n\{findingReferences\}/);
    assert.match(defaults.field_remediation_generateUserPrompt, /\{findingReferences\}/);
    assert.match(aiService._selectFieldSystemPrompt('generate', {
        field_description_generateSystemPrompt: 'Use a short list only when it materially improves clarity.'
    }, 'description'), /never use bullet points/i);

    await testProofWorkflow();
    console.log('AI prompt and proof workflow regression tests passed');
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
