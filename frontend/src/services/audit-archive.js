import { api } from 'boot/axios'

export default {
  getArchives(filters = {}) {
    return api.get('audit-archives', { params: filters })
  },

  createArchive(archive, onUploadProgress) {
    const form = new FormData()
    form.append('file', archive.file)
    for (const [key, value] of Object.entries(archive)) {
      if (key === 'file' || value == null) continue
      form.append(key, Array.isArray(value) ? JSON.stringify(value) : value)
    }
    return api.post('audit-archives', form, { onUploadProgress })
  },

  updateArchive(archiveId, archive) {
    return api.put(`audit-archives/${archiveId}`, archive)
  },

  bulkUpdateArchives(archiveIds, update) {
    return api.put('audit-archives/bulk', { archiveIds, ...update })
  },

  deleteArchive(archiveId) {
    return api.delete(`audit-archives/${archiveId}`)
  },

  getArchiveFile(archiveId) {
    return api.get(`audit-archives/${archiveId}/file`, { responseType: 'arraybuffer' })
  },

  getArchiveDownloadUrl(archiveId) {
    return `${api.defaults.baseURL}/audit-archives/${archiveId}/file?download=1`
  }
}
