import { api } from 'boot/axios'

const root = auditId => `audits/${auditId}/evidence`

export default {
  list: auditId => api.get(root(auditId)),
  forFinding: (auditId, findingId) => api.get(root(auditId), {params: {finding: findingId}}),
  getOne: (auditId, id) => api.get(`${root(auditId)}/${id}`),
  create: (auditId, data) => api.post(root(auditId), data),
  review: (auditId, id, status, note) => api.put(`${root(auditId)}/${id}/review`, {status, note}),
  promote: (auditId, id) => api.post(`${root(auditId)}/${id}/promote`),
  remove: (auditId, id) => api.delete(`${root(auditId)}/${id}`),
  uploadFile: (auditId, id, file) => {
    const form = new FormData()
    form.append('file', file)
    return api.post(`${root(auditId)}/${id}/files`, form)
  },
  downloadFile: (auditId, id, fileId) => api.get(`${root(auditId)}/${id}/files/${fileId}`, {responseType: 'blob'}),
  deleteFile: (auditId, id, fileId) => api.delete(`${root(auditId)}/${id}/files/${fileId}`)
}
