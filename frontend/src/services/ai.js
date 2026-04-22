import { api } from 'boot/axios'

export default {
    generate: function(payload) {
        return api.post('ai/generate', payload)
    },

    searchSimilar: function(query, locale) {
        return api.post('ai/search-similar', { query, locale })
    },

    reindexAll: function() {
        return api.post('ai/reindex-all', {})
    },

    analyzeProofs: function(pocHtml, locale) {
        return api.post('ai/analyze-proofs', { pocHtml, locale })
    },

    testConnection: function(type) {
        return api.post('ai/test', { type })
    }
}
