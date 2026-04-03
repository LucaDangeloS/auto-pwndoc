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
    }
}
