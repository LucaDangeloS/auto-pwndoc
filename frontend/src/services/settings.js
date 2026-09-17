import { api } from 'boot/axios'

export default {
  getSettings() {
    return api.get(`settings`)
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

  rotateMcpKey() {
    return api.post(`settings/mcp/rotate-key`)
  },

  claimMcpKey() {
    return api.post(`settings/mcp/claim-key`)
  },

  clearMcpKey() {
    return api.delete(`settings/mcp/key`)
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
