const response = {
    200: { description: 'Successful response', schema: { $ref: '#/definitions/ApiResponse' } },
    403: { description: 'The requested AI capability is disabled or unavailable' },
    422: { description: 'Invalid request parameters' }
};

function operation(summary, parameters) {
    return { tags: ['AI'], summary, parameters: parameters || [], responses: response };
}

function body(description, schema) {
    return { name: 'body', in: 'body', required: true, description, schema };
}

const typeBody = body('AI capability to test or list models for.', {
    type: 'object', required: ['type'], properties: { type: { type: 'string', enum: ['generation', 'embedding', 'vision'] } }
});

module.exports = {
    '/api/ai/generate': {
        post: operation('Generate, complete, or rewrite report content', [body('Generation request.', {
            type: 'object', required: ['action'], properties: {
                action: { type: 'string', enum: ['generate', 'complete', 'rewrite', 'fill-proofs', 'executive-summary', 'severity-summary'] },
                text: { type: 'string' }, fieldName: { type: 'string' }, context: { type: 'object' }
            }
        })])
    },
    '/api/ai/anonymize-preview': {
        post: operation('Preview anonymized generation context', [body('Field name(s), text, and generation context.', { type: 'object', properties: { fieldName: { type: 'string' }, fieldNames: { type: 'array', items: { type: 'string' } }, text: { type: 'string' }, context: { type: 'object' }, proofCompletion: { type: 'boolean' } } })])
    },
    '/api/ai/search-similar': {
        post: operation('Search semantically similar vulnerabilities', [body('Search query and optional locale.', { type: 'object', required: ['query'], properties: { query: { type: 'string' }, locale: { type: 'string' } } })])
    },
    '/api/ai/reindex-all': {
        post: operation('Start reindexing the vulnerability embedding collection')
    },
    '/api/ai/reindex-status': {
        get: operation('Get vulnerability embedding reindex progress')
    },
    '/api/ai/list-models': {
        post: operation('List models offered by the configured AI provider', [typeBody])
    },
    '/api/ai/analyze-proofs': {
        post: operation('Analyze proof images and generate supporting finding fields', [body('Proof HTML and optional finding context.', { type: 'object', required: ['pocHtml'], properties: { pocHtml: { type: 'string' }, locale: { type: 'string' }, findingTitle: { type: 'string' }, findingDescription: { type: 'string' }, auditContext: { type: 'object' }, overwriteFilledFields: { type: 'boolean' } } })])
    },
    '/api/ai/analyze-proof-evidence': {
        post: operation('Analyze proof images only', [body('Proof HTML.', { type: 'object', required: ['pocHtml'], properties: { pocHtml: { type: 'string' } } })])
    },
    '/api/ai/complete-proof-fields': {
        post: operation('Generate finding fields from proof evidence', [body('Proof HTML and optional finding context.', { type: 'object', required: ['pocHtml'], properties: { pocHtml: { type: 'string' }, locale: { type: 'string' }, findingTitle: { type: 'string' }, findingDescription: { type: 'string' }, auditContext: { type: 'object' }, visionSummary: { type: 'string' }, overwriteFilledFields: { type: 'boolean' } } })])
    },
    '/api/ai/search-proof-similar': {
        post: operation('Find vulnerabilities similar to analyzed proof evidence', [body('Proof-derived search context.', { type: 'object', properties: { locale: { type: 'string' }, findingTitle: { type: 'string' }, findingDescription: { type: 'string' }, visionSummary: { type: 'string' } } })])
    },
    '/api/ai/test': {
        post: operation('Test the configured generation, embedding, or vision provider', [typeBody])
    }
};
