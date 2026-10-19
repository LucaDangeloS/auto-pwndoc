import { api } from 'boot/axios'

export default {
  getGuides: () => api.get('guides'),
  getGuide: id => api.get(`guides/${id}`),
  createGuide: data => api.post('guides', data),
  updateGuide: (id, data) => api.put(`guides/${id}`, data),
  deleteGuide: id => api.delete(`guides/${id}`),
  getRevisions: id => api.get(`guides/${id}/revisions`),
  getRevision: (id, version) => api.get(`guides/${id}/revisions/${version}`),
  uploadFile: (id, file) => {
    const form = new FormData()
    form.append('file', file)
    return api.post(`guides/${id}/files`, form)
  },
  downloadFile: (id, fileId) => api.get(`guides/${id}/files/${fileId}`, { responseType: 'blob' }),
  deleteFile: (id, fileId) => api.delete(`guides/${id}/files/${fileId}`),
  getRun: (id, auditId) => api.get(`guides/${id}/runs/${auditId}`),
  startRun: (id, auditId) => api.post(`guides/${id}/runs/${auditId}`),
  updateStep: (id, auditId, index, done) => api.put(`guides/${id}/runs/${auditId}`, {index, done}),
  updateCoverage: (id, auditId, index, status, justification) =>
    api.put(`guides/${id}/runs/${auditId}/coverage/${index}`, {status, justification})
}
