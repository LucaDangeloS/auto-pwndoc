import { api } from 'boot/axios'

export default {
  getBackups: function() {
    return api.get('backups')
  },

  createBackup: function(name) {
    return api.post('backups', { name })
  },

  downloadBackup: function(slug) {
    return api.get(`backups/download/${slug}`, { responseType: 'blob' })
  },

  uploadBackup: function(content) {
    return api.post('backups/upload', { content })
  },

  uploadBundle: function(file) {
    const form = new FormData()
    form.append('file', file)
    return api.post('backups/upload-bundle', form)
  },

  restoreBackup: function(slug) {
    return api.post(`backups/${slug}/restore`)
  },

  deleteBackup: function(slug) {
    return api.delete(`backups/${slug}`)
  }
}
