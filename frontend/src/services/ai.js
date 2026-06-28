import { api } from 'boot/axios'

export default {
    generate(payload, signal) {
        return api.post('ai/generate', payload, { signal })
    },

    searchSimilar(query, locale, signal) {
        return api.post('ai/search-similar', { query, locale }, { signal })
    },

    reindexAll(signal) {
        return api.post('ai/reindex-all', {}, { signal })
    },

    reindexStatus(signal) {
        return api.get('ai/reindex-status', { signal })
    },

    analyzeProofs(payload, signal) {
        const body = typeof payload === 'string' ? { pocHtml: payload } : payload
        return api.post('ai/analyze-proofs', body, { signal })
    },

    analyzeProofEvidence(payload, signal) {
        const body = typeof payload === 'string' ? { pocHtml: payload } : payload
        return api.post('ai/analyze-proof-evidence', body, { signal })
    },

    completeProofFields(payload, signal) {
        return api.post('ai/complete-proof-fields', payload, { signal })
    },

    searchProofSimilar(payload, signal) {
        return api.post('ai/search-proof-similar', payload, { signal })
    },

    testConnection(type, signal) {
        return api.post('ai/test', { type }, { signal })
    },

    listModels(type, signal) {
        return api.post('ai/list-models', { type }, { signal })
    }
}
