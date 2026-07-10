import { api } from 'boot/axios'

export default {
  getCollabs: function() {
    return  api.get(`users`)
  },

  createCollab: function(collab) {
    return  api.post('users', collab)
  },

  updateCollab: function(collabId, collab) {
    return  api.put(`users/${collabId}`, collab)
  },

  bulkStatus: function(userIds, enabled) {
    return api.put('users/bulk-status', { userIds, enabled })
  },

  bulkRole: function(userIds, role) {
    return api.put('users/bulk-role', { userIds, role })
  },

  bulkPermissions: function(userIds, add, remove) {
    return api.put('users/bulk-permissions', { userIds, add, remove })
  },

  deleteCollab: function(collabId) {
    return  api.delete(`users/${collabId}`)
  },

  deleteAllCollab: function() {
    return  api.delete(`users`)
  }
}