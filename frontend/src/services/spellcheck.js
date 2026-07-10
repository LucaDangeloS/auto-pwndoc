import { api } from 'boot/axios'

export default {
  check: function(text, language = 'auto', extraParams = {}) {
    return api.post('spellcheck', { text, language, ...extraParams })
  },

  getCapabilities: function() {
    return api.get('spellcheck/capabilities')
  },

  testConnection: function(url) {
    return api.post('spellcheck/test', { url })
  },

  getWords: function() {
    return api.get('spellcheck/dict')
  },

  addWord: function(word) {
    return api.post('spellcheck/dict', { word: word })
  },

  deleteWord: function(word) {
    return api.delete('spellcheck/dict', { data: { word: word } })
  }
}
