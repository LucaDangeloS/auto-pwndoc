import { api } from 'boot/axios'

export default {
  generate: function(prompt, context) {
    return api.post('ai/generate', { prompt: prompt, context: context })
  }
}
