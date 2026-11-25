import { api } from 'boot/axios'

export default {
  getSettings(includeAiPrompts = false) {
    return api.get('settings', { params: includeAiPrompts ? { includeAiPrompts: 1 } : {} })
  },

  getPublicSettings() {
    return api.get(`settings/public`)
  },

  updateSettings(params) {
    return api.put(`settings`, params)
  },

  exportSettings() {
    return api.get(`settings/export`)
  },

  revertDefaults() {
    return api.put(`settings/revert`)
  },

  listMcpKeys() {
    return api.get(`settings/mcp-keys`)
  },

  createMcpKey(name) {
    return api.post(`settings/mcp-keys`, { name })
  },

  claimMcpKey(id) {
    return api.post(`settings/mcp-keys/${id}/claim`)
  },

  deleteMcpKey(id) {
    return api.delete(`settings/mcp-keys/${id}`)
  },

  listApiKeys() {
    return api.get(`settings/api-keys`)
  },

  createApiKey(name) {
    return api.post(`settings/api-keys`, { name })
  },

  claimApiKey(id) {
    return api.post(`settings/api-keys/${id}/claim`)
  },

  deleteApiKey(id) {
    return api.delete(`settings/api-keys/${id}`)
  }
}
