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

    analyzeProofs(pocHtml, locale, signal) {
        return api.post('ai/analyze-proofs', { pocHtml, locale }, { signal })
    },

    testConnection(type, signal) {
        return api.post('ai/test', { type }, { signal })
    },

    listModels(type, signal) {
        return api.post('ai/list-models', { type }, { signal })
    }
}
