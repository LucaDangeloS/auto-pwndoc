import { Dialog, Notify } from 'quasar'
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs'

import AuditArchiveService from '@/services/audit-archive'
import { $t } from '@/boot/i18n'

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/legacy/build/pdf.worker.mjs', import.meta.url).toString()

const MAX_PDF_SIZE = 200 * 1024 * 1024

export default {
  data() {
    return {
      archives: [],
      loading: false,
      filter: '',
      selectedArchive: null,
      pdfDoc: null,
      pdfBytes: null,
      pdfLoading: false,
      pages: [],
      pageCanvases: {},
      outline: [],
      outlineDrawer: false,
      pdfSearch: '',
      searchIndex: [],
      searchIndexLoading: false,
      renderToken: 0,
      uploadDialog: false,
      uploading: false,
      upload: { name: '', file: null },
      errors: { name: '', file: '' },
    }
  },

  computed: {
    filteredArchives() {
      const needle = (this.filter || '').toLowerCase()
      if (!needle) return this.archives
      return this.archives.filter(archive =>
        archive.name.toLowerCase().includes(needle) ||
        archive.originalName.toLowerCase().includes(needle)
      )
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

  mounted() {
    this.getArchives()
  },

  methods: {
    getArchives() {
      this.loading = true
      AuditArchiveService.getArchives()
        .then(response => { this.archives = response.data.datas })
        .catch(err => this.notifyError(err))
        .finally(() => { this.loading = false })
    },

    openUploadDialog() {
      this.upload = { name: '', file: null }
      this.errors = { name: '', file: '' }
      this.uploadDialog = true
    },

    uploadArchive() {
      this.errors = { name: '', file: '' }
      if (!this.upload.name) this.errors.name = $t('msg.nameRequired')
      if (!this.upload.file) this.errors.file = $t('archivePdfRequired')
      else if (this.upload.file.type !== 'application/pdf' && !/\.pdf$/i.test(this.upload.file.name)) this.errors.file = $t('archivePdfOnly')
      else if (this.upload.file.size > MAX_PDF_SIZE) this.errors.file = $t('archivePdfTooLarge')
      if (this.errors.name || this.errors.file) return

      this.uploading = true
      this.fileToBase64(this.upload.file)
        .then(file => AuditArchiveService.createArchive({
          name: this.upload.name,
          originalName: this.upload.file.name,
          mimeType: this.upload.file.type || 'application/pdf',
          file
        }))
        .then(() => {
          Notify.create({ message: $t('archiveUploadOk'), color: 'positive', textColor: 'white', position: 'top-right' })
          this.uploadDialog = false
          this.getArchives()
        })
        .catch(err => this.notifyError(err))
        .finally(() => { this.uploading = false })
    },

    fileToBase64(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result).split(',').pop())
        reader.onerror = reject
        reader.readAsDataURL(file)
      })
    },

    openArchive(archive) {
      const token = this.renderToken + 1
      this.renderToken = token
      this.selectedArchive = archive
      this.pdfLoading = true
      this.pages = []
      this.outline = []
      this.pageCanvases = {}
      this.pdfSearch = ''
      this.searchIndex = []
      this.searchIndexLoading = false

      AuditArchiveService.getArchiveFile(archive._id)
        .then(async response => {
          this.pdfBytes = response.data
          const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(response.data) })
          this.pdfDoc = await loadingTask.promise
          if (token !== this.renderToken) return
          this.pages = Array.from({ length: this.pdfDoc.numPages }, (_v, i) => i + 1)
          await this.loadOutline()
          this.buildSearchIndex(token)
          this.$nextTick(() => this.renderPages())
        })
        .catch(err => this.notifyError(err))
        .finally(() => { this.pdfLoading = false })
    },

    async loadOutline() {
      const rawOutline = await this.pdfDoc.getOutline()
      if (!rawOutline) return
      this.outline = await this.flattenOutline(rawOutline)
    },

    async flattenOutline(items, level = 0, prefix = '') {
      const result = []
      for (let i = 0; i < items.length; i++) {
        const item = items[i]
        const pageNumber = await this.outlinePageNumber(item.dest)
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
      if (!dest) return null
      const destination = typeof dest === 'string' ? await this.pdfDoc.getDestination(dest) : dest
      if (!destination || !destination[0]) return null
      const pageIndex = await this.pdfDoc.getPageIndex(destination[0])
      return pageIndex + 1
    },

    setPageCanvas(el, pageNumber) {
      if (el) this.pageCanvases[pageNumber] = el
    },

    async renderPages() {
      const token = this.renderToken
      for (const pageNumber of this.pages) {
        if (token !== this.renderToken) return
        const canvas = this.pageCanvases[pageNumber]
        if (!canvas || !this.pdfDoc) continue
        const page = await this.pdfDoc.getPage(pageNumber)
        const parentWidth = this.$refs.pagesContainer ? this.$refs.pagesContainer.clientWidth - 48 : 900
        const viewport = page.getViewport({ scale: 1 })
        const scale = Math.min(parentWidth / viewport.width, 1.5)
        const scaledViewport = page.getViewport({ scale })
        const context = canvas.getContext('2d')
        canvas.width = scaledViewport.width
        canvas.height = scaledViewport.height
        await page.render({ canvasContext: context, viewport: scaledViewport }).promise
      }
    },

    jumpToPage(pageNumber) {
      const canvas = this.pageCanvases[pageNumber]
      if (canvas) canvas.scrollIntoView({ behavior: 'smooth', block: 'start' })
      this.outlineDrawer = false
    },

    async buildSearchIndex(token) {
      this.searchIndexLoading = true
      const index = []
      try {
        for (const pageNumber of this.pages) {
          if (token !== this.renderToken) return
          const page = await this.pdfDoc.getPage(pageNumber)
          const textContent = await page.getTextContent()
          const rawText = textContent.items.map(item => item.str).join(' ').replace(/\s+/g, ' ').trim()
          index.push({ pageNumber, rawText, text: this.normalizePdfText(rawText) })
        }
        if (token === this.renderToken) this.searchIndex = index
      } catch (err) {
        this.notifyError(err)
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
      if (!this.selectedArchive || !this.pdfBytes) return
      const blob = new Blob([this.pdfBytes], { type: 'application/pdf' })
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = this.selectedArchive.originalName
      link.click()
      URL.revokeObjectURL(link.href)
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
            if (this.selectedArchive && this.selectedArchive._id === archive._id) this.selectedArchive = null
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
      Notify.create({
        message: err.response?.data?.datas || err.message || $t('archiveError'),
        color: 'negative',
        textColor: 'white',
        position: 'top-right'
      })
    }
  }
}
