import { api } from 'boot/axios'

export default {
  getArchives() {
    return api.get('audit-archives')
  },

  createArchive(archive) {
    return api.post('audit-archives', archive)
  },

  deleteArchive(archiveId) {
    return api.delete(`audit-archives/${archiveId}`)
  },

  getArchiveFile(archiveId) {
    return api.get(`audit-archives/${archiveId}/file`, { responseType: 'arraybuffer' })
  }
}
