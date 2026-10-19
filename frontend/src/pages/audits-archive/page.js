import { Dialog, Notify } from 'quasar'
import { markRaw } from 'vue'
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs'

import AuditArchiveService from '@/services/audit-archive'
import CompanyService from '@/services/company'
import DataService from '@/services/data'
import UserService from '@/services/user'
import { $t } from '@/boot/i18n'

pdfjsLib.GlobalWorkerOptions.workerPort = new Worker(
  new URL('pdfjs-dist/legacy/build/pdf.worker.min.mjs', import.meta.url),
  { type: 'module' }
)

const MAX_PDF_SIZE = 200 * 1024 * 1024
const MAX_PAGE_SCALE = 1.5
const PAGE_GUTTER = 48
const NO_COMPANY = 'none'

function emptyUpload(company = null) {
  return { entries: [], company, reportDate: '', auditType: '', tags: [] }
}

function toDateInput(value) {
  if (!value) return ''
  const date = new Date(value)
  return isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10)
}

export default {
  data() {
    return {
      archives: [],
      companies: [],
      auditTypes: [],
      loading: false,
      filter: '',
      filterCompany: null,
      filterYear: null,
      filterTag: null,
      expandedGroups: {},
      selectionMode: false,
      selectedIds: [],
      dragActive: false,

      selectedArchive: null,
      pdfDoc: null,
      pdfLoading: false,
      pages: [],
      basePageSize: null,
      containerWidth: 900,
      renderedPages: {},
      outline: [],
      outlineDrawer: false,
      pdfSearch: '',
      searchIndex: [],
      searchIndexLoading: false,
      renderToken: 0,

      uploadDialog: false,
      uploading: false,
      uploadProgress: { index: 0, total: 0, percent: 0 },
      upload: emptyUpload(),
      uploadErrors: { files: '' },

      editDialog: false,
      saving: false,
      editForm: {},
      editErrors: { name: '' },

      bulkDialog: false,
      bulkCompany: null,
    }
  },

  computed: {
    canCreate() {
      return UserService.isAllowed('audit-archives:create')
    },

    canCreateCompany() {
      return UserService.isAllowed('companies:create')
    },

    companyOptions() {
      return this.companies
        .map(company => ({ label: company.name, value: company._id }))
        .sort((a, b) => a.label.localeCompare(b.label))
    },

    companyFilterOptions() {
      return [{ label: $t('archiveNoCompany'), value: NO_COMPANY }, ...this.companyOptions]
    },

    yearOptions() {
      const years = new Set(this.archives.map(archive => this.archiveYear(archive)))
      return [...years].sort((a, b) => b - a)
    },

    tagOptions() {
      const tags = new Set(this.archives.flatMap(archive => archive.tags || []))
      return [...tags].sort((a, b) => a.localeCompare(b))
    },

    auditTypeOptions() {
      const types = new Set([
        ...this.auditTypes.map(type => type.name),
        ...this.archives.map(archive => archive.auditType)
      ].filter(Boolean))
      return [...types].sort((a, b) => a.localeCompare(b))
    },

    hasActiveFilters() {
      return !!(this.filter || this.filterCompany || this.filterYear || this.filterTag)
    },

    filteredArchives() {
      const needle = (this.filter || '').toLowerCase()
      return this.archives.filter(archive => {
        if (this.filterCompany && this.companyKey(archive) !== this.filterCompany) return false
        if (this.filterYear && this.archiveYear(archive) !== this.filterYear) return false
        if (this.filterTag && !(archive.tags || []).includes(this.filterTag)) return false
        if (!needle) return true
        return [archive.name, archive.originalName, archive.company?.name, archive.auditType, archive.notes, ...(archive.tags || [])]
          .some(value => value && value.toLowerCase().includes(needle))
      })
    },

    groups() {
      const groups = {}
      for (const archive of this.filteredArchives) {
        const key = this.companyKey(archive)
        if (!groups[key]) {
          groups[key] = {
            key,
            company: archive.company || null,
            label: archive.company?.name || $t('archiveNoCompany'),
            count: 0,
            years: {}
          }
        }
        const group = groups[key]
        const year = this.archiveYear(archive)
        if (!group.years[year]) group.years[year] = []
        group.years[year].push(archive)
        group.count++
      }

      return Object.values(groups)
        .map(group => ({
          ...group,
          years: Object.keys(group.years)
            .sort((a, b) => b - a)
            .map(year => ({
              year,
              archives: group.years[year].sort((a, b) => this.archiveTime(b) - this.archiveTime(a))
            }))
        }))
        .sort((a, b) => {
          if (a.key === NO_COMPANY) return 1
          if (b.key === NO_COMPANY) return -1
          return a.label.localeCompare(b.label)
        })
    },

    selectedCount() {
      return this.selectedIds.length
    },

    pageScale() {
      if (!this.basePageSize) return 1
      return Math.min((this.containerWidth - PAGE_GUTTER) / this.basePageSize.width, MAX_PAGE_SCALE)
    },

    placeholderStyle() {
      if (!this.basePageSize) return {}
      return {
        width: `${Math.floor(this.basePageSize.width * this.pageScale)}px`,
        height: `${Math.floor(this.basePageSize.height * this.pageScale)}px`
      }
    },

    pdfSearchResults() {
      const needle = this.normalizePdfText(this.pdfSearch)
      if (!needle) return []
      return this.searchIndex
        .filter(page => page.text.includes(needle))
        .map(page => ({
          pageNumber: page.pageNumber,
          snippet: this.buildSearchSnippet(page.rawText, needle)
        }))
    }
  },

  created() {
    // Non-reactive viewer state
    this.pageWrappers = {}
    this.pageCanvases = {}
    this.pageTextLayers = {}
    this.renderTasks = {}
    this.pageObserver = null
    this.resizeTimer = null
  },

  mounted() {
    if (typeof this.$route.query.company === 'string') this.filterCompany = this.$route.query.company
    this.loadData()
    window.addEventListener('resize', this.onResize)
  },

  beforeUnmount() {
    window.removeEventListener('resize', this.onResize)
    clearTimeout(this.resizeTimer)
    this.renderToken++
    this.destroyViewer()
  },

  methods: {
    loadData() {
      this.loading = true
      Promise.all([
        AuditArchiveService.getArchives().then(response => { this.archives = response.data.datas }),
        CompanyService.getCompanies().then(response => { this.companies = response.data.datas }).catch(() => { this.companies = [] }),
        DataService.getAuditTypes().then(response => { this.auditTypes = response.data.datas }).catch(() => { this.auditTypes = [] })
      ])
        .then(() => {
          const archive = this.archives.find(item => item._id === this.$route.query.archive)
          if (archive) this.openArchive(archive)
        })
        .catch(err => this.notifyError(err))
        .finally(() => { this.loading = false })
    },

    getArchives() {
      return AuditArchiveService.getArchives()
        .then(response => {
          this.archives = response.data.datas
          const ids = new Set(this.archives.map(archive => archive._id))
          this.selectedIds = this.selectedIds.filter(id => ids.has(id))
          if (this.selectedArchive) {
            const fresh = this.archives.find(archive => archive._id === this.selectedArchive._id)
            if (fresh) this.selectedArchive = fresh
          }
        })
        .catch(err => this.notifyError(err))
    },

    getCompanies() {
      return CompanyService.getCompanies()
        .then(response => { this.companies = response.data.datas })
    },

    companyLogo(company) {
      const logo = company?.logo
      if (typeof logo !== 'string' || !logo) return null
      if (logo.startsWith('data:image/')) return logo
      return /^[A-Za-z0-9+/=\s]+$/.test(logo) ? `data:image/png;base64,${logo}` : null
    },

    companyKey(archive) {
      return archive.company?._id || NO_COMPANY
    },

    archiveTime(archive) {
      return new Date(archive.reportDate || archive.createdAt).getTime() || 0
    },

    // reportDate is a calendar date stored as UTC midnight
    archiveYear(archive) {
      return archive.reportDate
        ? new Date(archive.reportDate).getUTCFullYear()
        : new Date(archive.createdAt).getFullYear()
    },

    archiveDate(archive) {
      if (archive.reportDate) return new Date(archive.reportDate).toLocaleDateString(undefined, { timeZone: 'UTC' })
      return this.formatDate(archive.createdAt)
    },

    isGroupExpanded(key) {
      if (this.hasActiveFilters) return true
      if (key in this.expandedGroups) return this.expandedGroups[key]
      return this.groups.length <= 5
    },

    setGroupExpanded(key, value) {
      this.expandedGroups = { ...this.expandedGroups, [key]: value }
    },

    clearFilters() {
      this.filter = ''
      this.filterCompany = null
      this.filterYear = null
      this.filterTag = null
    },

    canModify(archive) {
      if (!archive) return false
      const ownerId = archive.uploadedBy?._id || archive.uploadedBy
      return {
        update: UserService.isAllowed('audit-archives:update') &&
          (UserService.isAllowed('audit-archives:update-all') || String(ownerId) === String(UserService.user.id)),
        delete: UserService.isAllowed('audit-archives:delete') &&
          (UserService.isAllowed('audit-archives:delete-all') || String(ownerId) === String(UserService.user.id))
      }
    },

    // Companies

    createCompany(name, done) {
      const value = (name || '').trim()
      if (!value) return done()
      const existing = this.companies.find(company => company.name.toLowerCase() === value.toLowerCase())
      if (existing) return done(existing._id, 'add-unique')
      CompanyService.createCompanies([{ name: value }])
        .then(() => this.getCompanies())
        .then(() => {
          const created = this.companies.find(company => company.name === value)
          Notify.create({ message: $t('archiveCompanyCreated'), color: 'positive', textColor: 'white', position: 'top-right' })
          done(created ? created._id : undefined, 'add-unique')
        })
        .catch(err => {
          this.notifyError(err)
          done()
        })
    },

    // Upload

    openUploadDialog(files = []) {
      if (!this.canCreate) return
      this.upload = emptyUpload(this.filterCompany && this.filterCompany !== NO_COMPANY ? this.filterCompany : null)
      this.uploadErrors = { files: '' }
      this.uploadProgress = { index: 0, total: 0, percent: 0 }
      this.addUploadFiles(files)
      this.uploadDialog = true
    },

    addUploadFiles(files) {
      const list = Array.from(files || [])
      for (const file of list) {
        if (this.upload.entries.some(entry => entry.file === file)) continue
        this.upload.entries.push({
          file,
          name: file.name.replace(/\.pdf$/i, ''),
          error: this.validateUploadFile(file)
        })
      }
    },

    onUploadRejected(rejected) {
      const names = rejected.map(entry => entry.file?.name).filter(Boolean).join(', ')
      Notify.create({ message: `${$t('archivePdfOnly')}${names ? `: ${names}` : ''}`, color: 'warning', textColor: 'dark', position: 'top-right' })
    },

    removeUploadEntry(index) {
      this.upload.entries.splice(index, 1)
    },

    validateUploadFile(file) {
      if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) return $t('archivePdfOnly')
      if (file.size > MAX_PDF_SIZE) return $t('archivePdfTooLarge')
      return ''
    },

    onDragOver() {
      if (this.canCreate) this.dragActive = true
    },

    onDrop(event) {
      this.dragActive = false
      if (!this.canCreate) return
      const files = Array.from(event.dataTransfer?.files || [])
      if (files.length) this.openUploadDialog(files)
    },

    async uploadArchives() {
      this.uploadErrors = { files: '' }
      if (this.upload.entries.length === 0) {
        this.uploadErrors.files = $t('archivePdfRequired')
        return
      }
      this.upload.entries.forEach(entry => {
        if (!entry.error && !entry.name.trim()) entry.error = $t('msg.nameRequired')
      })
      if (this.upload.entries.some(entry => entry.error)) return

      this.uploading = true
      let failed = 0
      const pending = [...this.upload.entries]
      for (let i = 0; i < pending.length; i++) {
        const entry = pending[i]
        this.uploadProgress = { index: i + 1, total: pending.length, percent: 0 }
        try {
          await AuditArchiveService.createArchive({
            name: entry.name.trim(),
            file: entry.file,
            company: this.upload.company || null,
            reportDate: this.upload.reportDate || null,
            auditType: this.upload.auditType || '',
            tags: this.upload.tags
          }, event => {
            if (event.total) this.uploadProgress.percent = Math.round((event.loaded / event.total) * 100)
          })
          this.upload.entries.splice(this.upload.entries.indexOf(entry), 1)
        } catch (err) {
          failed++
          entry.error = err.response?.data?.datas || err.message || $t('archiveError')
        }
      }
      this.uploading = false

      await this.getArchives()
      if (failed === 0) {
        Notify.create({ message: $t('archiveUploadOk'), color: 'positive', textColor: 'white', position: 'top-right' })
        this.uploadDialog = false
      } else {
        Notify.create({ message: $t('archiveUploadPartial'), color: 'warning', textColor: 'dark', position: 'top-right' })
      }
    },

    // Edit metadata

    openEditDialog(archive) {
      this.editForm = {
        _id: archive._id,
        name: archive.name,
        company: archive.company?._id || null,
        reportDate: toDateInput(archive.reportDate),
        auditType: archive.auditType || '',
        tags: [...(archive.tags || [])],
        notes: archive.notes || ''
      }
      this.editErrors = { name: '' }
      this.editDialog = true
    },

    saveArchive() {
      this.editErrors = { name: '' }
      if (!this.editForm.name || !this.editForm.name.trim()) {
        this.editErrors.name = $t('msg.nameRequired')
        return
      }
      this.saving = true
      const { _id, ...payload } = this.editForm
      AuditArchiveService.updateArchive(_id, { ...payload, reportDate: payload.reportDate || null })
        .then(() => {
          Notify.create({ message: $t('archiveUpdateOk'), color: 'positive', textColor: 'white', position: 'top-right' })
          this.editDialog = false
          return this.getArchives()
        })
        .catch(err => this.notifyError(err))
        .finally(() => { this.saving = false })
    },

    // Bulk selection

    toggleSelectionMode() {
      this.selectionMode = !this.selectionMode
      if (!this.selectionMode) this.selectedIds = []
    },

    toggleSelected(archive) {
      const index = this.selectedIds.indexOf(archive._id)
      if (index === -1) this.selectedIds.push(archive._id)
      else this.selectedIds.splice(index, 1)
    },

    toggleGroupSelected(group, value) {
      const ids = group.years.flatMap(year => year.archives.map(archive => archive._id))
      if (value) this.selectedIds = [...new Set([...this.selectedIds, ...ids])]
      else this.selectedIds = this.selectedIds.filter(id => !ids.includes(id))
    },

    groupSelectionState(group) {
      const ids = group.years.flatMap(year => year.archives.map(archive => archive._id))
      const selected = ids.filter(id => this.selectedIds.includes(id)).length
      if (selected === 0) return false
      return selected === ids.length ? true : null
    },

    onArchiveClick(archive) {
      if (this.selectionMode) this.toggleSelected(archive)
      else this.openArchive(archive)
    },

    openBulkDialog() {
      this.bulkCompany = null
      this.bulkDialog = true
    },

    applyBulkCompany() {
      this.saving = true
      AuditArchiveService.bulkUpdateArchives(this.selectedIds, { company: this.bulkCompany || null })
        .then(() => {
          Notify.create({ message: $t('archiveBulkOk'), color: 'positive', textColor: 'white', position: 'top-right' })
          this.bulkDialog = false
          this.selectionMode = false
          this.selectedIds = []
          return this.getArchives()
        })
        .catch(err => this.notifyError(err))
        .finally(() => { this.saving = false })
    },

    // PDF viewer

    destroyViewer() {
      if (this.pageObserver) {
        this.pageObserver.disconnect()
        this.pageObserver = null
      }
      Object.values(this.renderTasks).forEach(task => task.cancel())
      this.renderTasks = {}
      this.pageWrappers = {}
      this.pageCanvases = {}
      this.pageTextLayers = {}
      if (this.pdfDoc) this.pdfDoc.destroy()
      this.pdfDoc = null
    },

    openArchive(archive) {
      const token = this.renderToken + 1
      this.renderToken = token
      this.destroyViewer()
      this.selectedArchive = archive
      this.pdfLoading = true
      this.pages = []
      this.basePageSize = null
      this.renderedPages = {}
      this.outline = []
      this.pdfSearch = ''
      this.searchIndex = []
      this.searchIndexLoading = false
      // On stacked layouts the viewer sits below the list
      if (this.$q.screen.lt.md) this.$nextTick(() => this.$refs.viewerCard?.$el.scrollIntoView({ behavior: 'smooth', block: 'start' }))

      AuditArchiveService.getArchiveFile(archive._id)
        .then(async response => {
          if (token !== this.renderToken) return
          const doc = await pdfjsLib.getDocument({ data: new Uint8Array(response.data) }).promise
          if (token !== this.renderToken) {
            doc.destroy()
            return
          }
          this.pdfDoc = markRaw(doc)
          const firstPage = await doc.getPage(1)
          const viewport = firstPage.getViewport({ scale: 1 })
          if (token !== this.renderToken) return
          this.basePageSize = { width: viewport.width, height: viewport.height }
          this.updateContainerWidth()
          this.pages = Array.from({ length: doc.numPages }, (_v, i) => i + 1)
          this.buildSearchIndex(token)
          this.$nextTick(() => this.observePages())
          await this.loadOutline(token)
        })
        .catch(err => {
          if (token === this.renderToken) this.notifyError(err)
        })
        .finally(() => {
          if (token === this.renderToken) this.pdfLoading = false
        })
    },

    async loadOutline(token) {
      const rawOutline = await this.pdfDoc.getOutline()
      if (!rawOutline || token !== this.renderToken) return
      const outline = await this.flattenOutline(rawOutline)
      if (token === this.renderToken) this.outline = outline
    },

    async flattenOutline(items, level = 0, prefix = '') {
      const result = []
      for (let i = 0; i < items.length; i++) {
        const item = items[i]
        const pageNumber = await this.outlinePageNumber(item.dest).catch(() => null)
        if (pageNumber) {
          result.push({ key: `${prefix}${i}`, title: item.title, pageNumber, level })
        }
        if (item.items && item.items.length) {
          result.push(...await this.flattenOutline(item.items, level + 1, `${prefix}${i}-`))
        }
      }
      return result
    },

    async outlinePageNumber(dest) {
      if (!dest || !this.pdfDoc) return null
      const destination = typeof dest === 'string' ? await this.pdfDoc.getDestination(dest) : dest
      if (!destination || !destination[0]) return null
      const pageIndex = await this.pdfDoc.getPageIndex(destination[0])
      return pageIndex + 1
    },

    setPageWrapper(el, pageNumber) {
      if (el) this.pageWrappers[pageNumber] = el
    },

    setPageCanvas(el, pageNumber) {
      if (el) this.pageCanvases[pageNumber] = el
    },

    setPageTextLayer(el, pageNumber) {
      if (el) this.pageTextLayers[pageNumber] = el
    },

    updateContainerWidth() {
      const container = this.$refs.pagesContainer
      if (container && container.clientWidth) this.containerWidth = container.clientWidth
    },

    // Pages are rendered lazily as they approach the viewport so large reports
    // do not rasterise hundreds of canvases up front.
    observePages() {
      if (this.pageObserver) this.pageObserver.disconnect()
      const root = this.$refs.pagesContainer
      if (!root || !this.pdfDoc) return
      this.updateContainerWidth()
      this.pageObserver = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) this.renderPage(Number(entry.target.dataset.page))
        })
      }, { root, rootMargin: '800px 0px' })
      Object.values(this.pageWrappers).forEach(el => this.pageObserver.observe(el))
    },

    async renderPage(pageNumber) {
      const token = this.renderToken
      if (!this.pdfDoc || this.renderedPages[pageNumber]) return
      const canvas = this.pageCanvases[pageNumber]
      if (!canvas) return
      this.renderedPages = { ...this.renderedPages, [pageNumber]: true }

      if (this.renderTasks[pageNumber]) this.renderTasks[pageNumber].cancel()
      try {
        const page = await this.pdfDoc.getPage(pageNumber)
        if (token !== this.renderToken) return
        const viewport = page.getViewport({ scale: 1 })
        const scale = Math.min((this.containerWidth - PAGE_GUTTER) / viewport.width, MAX_PAGE_SCALE)
        const scaledViewport = page.getViewport({ scale })
        canvas.width = scaledViewport.width
        canvas.height = scaledViewport.height
        const task = page.render({ canvasContext: canvas.getContext('2d'), viewport: scaledViewport })
        this.renderTasks[pageNumber] = task
        await task.promise
        delete this.renderTasks[pageNumber]
        if (token !== this.renderToken) return

        const textLayerEl = this.pageTextLayers[pageNumber]
        if (textLayerEl) {
          textLayerEl.innerHTML = ''
          textLayerEl.style.width = `${scaledViewport.width}px`
          textLayerEl.style.height = `${scaledViewport.height}px`
          const textLayer = new pdfjsLib.TextLayer({
            textContentSource: page.streamTextContent(),
            container: textLayerEl,
            viewport: scaledViewport,
          })
          await textLayer.render()
        }
      } catch (err) {
        if (err?.name === 'RenderingCancelledException' || token !== this.renderToken) return
        const { [pageNumber]: _removed, ...rest } = this.renderedPages
        this.renderedPages = rest
        this.notifyError(err)
      }
    },

    onResize() {
      clearTimeout(this.resizeTimer)
      this.resizeTimer = setTimeout(() => {
        if (!this.pdfDoc) return
        const previous = this.containerWidth
        this.updateContainerWidth()
        if (Math.abs(previous - this.containerWidth) < 20) return
        this.renderedPages = {}
        this.$nextTick(() => this.observePages())
      }, 250)
    },

    jumpToPage(pageNumber) {
      const wrapper = this.pageWrappers[pageNumber]
      if (wrapper) wrapper.scrollIntoView({ behavior: 'smooth', block: 'start' })
      this.outlineDrawer = false
    },

    async buildSearchIndex(token) {
      this.searchIndexLoading = true
      const index = []
      try {
        for (const pageNumber of this.pages) {
          if (token !== this.renderToken || !this.pdfDoc) return
          const page = await this.pdfDoc.getPage(pageNumber)
          const textContent = await page.getTextContent()
          const rawText = textContent.items.map(item => item.str).join(' ').replace(/\s+/g, ' ').trim()
          index.push({ pageNumber, rawText, text: this.normalizePdfText(rawText) })
        }
        if (token === this.renderToken) this.searchIndex = index
      } catch (err) {
        if (token === this.renderToken) this.notifyError(err)
      } finally {
        if (token === this.renderToken) this.searchIndexLoading = false
      }
    },

    normalizePdfText(value) {
      return String(value || '').toLowerCase().replace(/\s+/g, ' ').trim()
    },

    buildSearchSnippet(rawText, needle) {
      const text = rawText || ''
      const index = this.normalizePdfText(text).indexOf(needle)
      if (index === -1) return text.slice(0, 160)
      const start = Math.max(index - 60, 0)
      const end = Math.min(index + needle.length + 100, text.length)
      return `${start > 0 ? '...' : ''}${text.slice(start, end)}${end < text.length ? '...' : ''}`
    },

    downloadSelected() {
      if (!this.selectedArchive) return
      const link = document.createElement('a')
      link.href = AuditArchiveService.getArchiveDownloadUrl(this.selectedArchive._id)
      link.download = this.selectedArchive.originalName
      link.style.display = 'none'
      document.body.appendChild(link)
      link.click()
      // Keep the anchor alive while large archives are still streaming. Some
      // browsers cancel an in-flight download when its source node is removed.
      window.setTimeout(() => link.remove(), 60000)
    },

    confirmDelete(archive) {
      Dialog.create({
        title: $t('archiveDeleteConfirm'),
        message: archive.name,
        ok: { label: $t('btn.confirm'), color: 'negative' },
        cancel: { label: $t('btn.cancel'), color: 'white' }
      }).onOk(() => {
        AuditArchiveService.deleteArchive(archive._id)
          .then(() => {
            if (this.selectedArchive && this.selectedArchive._id === archive._id) {
              this.renderToken++
              this.destroyViewer()
              this.selectedArchive = null
            }
            Notify.create({ message: $t('archiveDeleteOk'), color: 'positive', textColor: 'white', position: 'top-right' })
            this.getArchives()
          })
          .catch(err => this.notifyError(err))
      })
    },

    formatDate(date) {
      return date ? new Date(date).toLocaleDateString() : '-'
    },

    formatSize(size) {
      if (!size) return '0 B'
      const units = ['B', 'KB', 'MB', 'GB']
      const index = Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length - 1)
      return `${(size / Math.pow(1024, index)).toFixed(index === 0 ? 0 : 1)} ${units[index]}`
    },

    notifyError(err) {
      const data = err?.response?.data?.datas
      Notify.create({
        message: (typeof data === 'string' && data) || err?.message || $t('archiveError'),
        color: 'negative',
        textColor: 'white',
        position: 'top-right'
      })
    }
  }
}
