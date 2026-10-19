import { api } from 'boot/axios'

export default {
  getTools: () => api.get('tools'),
  createTool: data => api.post('tools', data),
  updateTool: (id, data) => api.put(`tools/${id}`, data),
  deleteTool: id => api.delete(`tools/${id}`),
  getLicenses: () => api.get('licenses'),
  createLicense: data => api.post('licenses', data),
  updateLicense: (id, data) => api.put(`licenses/${id}`, data),
  deleteLicense: id => api.delete(`licenses/${id}`)
}
