// Local draft recovery: debounced snapshots of in-progress form edits stored in
// IndexedDB (Dexie). Used as a safety net so unsaved scalar edits survive an
// accidental navigation, tab close, or crash. Rich-text finding fields are
// already persisted by the collaborative editor, so drafts intentionally cover
// only the non-collaborative form state.
import { Dexie } from 'dexie'
import { debounce } from 'lodash'

let db = null
function getDb() {
  if (db) return db
  db = new Dexie('autopwndocDrafts')
  db.version(1).stores({
    // key = `${type}:${id}`; savedAt lets us show how old the draft is
    drafts: '&key, type, savedAt'
  })
  return db
}

class DraftRecoveryService {
  constructor() {
    // One debounced writer per key so rapid edits collapse into a single write
    this._writers = {}
  }

  _key(type, id) {
    return `${type}:${id}`
  }

  // Debounced save of a snapshot for (type, id). `data` should be a plain,
  // serialisable object (call JSON round-trip upstream if unsure).
  save(type, id, data) {
    if (!id) return
    const key = this._key(type, id)
    if (!this._writers[key]) {
      this._writers[key] = debounce((payload) => {
        getDb().drafts.put({ key, type, savedAt: Date.now(), data: payload })
          .catch(err => console.warn('Draft save failed:', err.message || err))
      }, 800)
    }
    // Deep-clone through JSON so Vue proxies/refs are not stored
    let plain
    try { plain = JSON.parse(JSON.stringify(data)) } catch (_) { return }
    this._writers[key](plain)
  }

  async load(type, id) {
    if (!id) return null
    try {
      return await getDb().drafts.get(this._key(type, id)) || null
    } catch (err) {
      console.warn('Draft load failed:', err.message || err)
      return null
    }
  }

  async clear(type, id) {
    if (!id) return
    const key = this._key(type, id)
    if (this._writers[key]) this._writers[key].cancel()
    try { await getDb().drafts.delete(key) } catch (_) { /* noop */ }
  }

  // Housekeeping: drop drafts older than maxAgeMs (default 30 days)
  async purgeOld(maxAgeMs = 30 * 24 * 60 * 60 * 1000) {
    try {
      const cutoff = Date.now() - maxAgeMs
      await getDb().drafts.where('savedAt').below(cutoff).delete()
    } catch (_) { /* noop */ }
  }
}

export default new DraftRecoveryService()
