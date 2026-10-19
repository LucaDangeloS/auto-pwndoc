import { api } from 'boot/axios'

export default {
  get: () => api.get('dashboard'),
  createTask: (auditId, task) => api.post(`audits/${auditId}/tasks`, task),
  updateTaskStatus: (auditId, taskId, status) => api.put(`audits/${auditId}/tasks/${taskId}`, {status})
}
