<template>
  <q-page padding>
    <div class="row items-center q-mb-md">
      <div class="text-h5">{{ $t('guidesTitle') }}</div>
      <q-space />
      <q-btn v-if="canCreate" icon="add" color="primary" :label="$t('guideAdd')" @click="newGuide" />
    </div>
    <div class="row q-col-gutter-md">
      <div class="col-12 col-md-4">
        <q-input v-model="search" outlined dense clearable :label="$t('search')" class="q-mb-sm" />
        <q-list bordered separator>
          <q-item v-for="item in filteredGuides" :key="item._id" clickable :active="selected?._id === item._id" active-class="text-primary" @click="openGuide(item._id)">
            <q-item-section>
              <q-item-label>{{ item.title }}</q-item-label>
              <q-item-label caption>{{ item.tool?.name || $t('guideGeneral') }} · {{ $t(`guideStatus_${item.status}`) }}</q-item-label>
            </q-item-section>
            <q-item-section side><q-badge color="info">v{{ item.version }}</q-badge></q-item-section>
          </q-item>
          <q-item v-if="!loading && filteredGuides.length === 0"><q-item-section>{{ $t('guidesEmpty') }}</q-item-section></q-item>
        </q-list>
      </div>
      <div class="col-12 col-md-8">
        <q-inner-loading :showing="loading"><q-spinner size="40px" color="primary" /></q-inner-loading>
        <q-card v-if="editing" bordered flat>
          <q-form @submit.prevent="saveGuide">
            <q-card-section class="text-h6">{{ form._id ? $t('guideEdit') : $t('guideAdd') }}</q-card-section>
            <q-card-section class="row q-col-gutter-sm">
              <q-input class="col-12" v-model="form.title" outlined :label="$t('guideTitle')" :rules="[v => !!v || $t('msg.fieldRequired')]" />
              <q-input class="col-12" v-model="form.summary" outlined :label="$t('guideSummary')" />
              <q-select class="col-12 col-sm-6" v-model="form.tool" outlined clearable emit-value map-options :options="toolOptions" :label="$t('toolProduct')" />
              <q-select class="col-12 col-sm-6" v-model="form.status" outlined emit-value map-options :options="statusOptions" :label="$t('guideStatus')" />
              <q-input class="col-12" v-model="tagsText" outlined :label="$t('toolTags')" />
              <q-input class="col-12" v-model="form.content" outlined type="textarea" rows="12" :label="$t('guideContent')" />
              <div class="col-12 text-subtitle1">{{ $t('guideSteps') }}</div>
              <div v-for="(_step, index) in form.steps" :key="index" class="col-12 row items-center q-gutter-sm">
                <q-input class="col" v-model="form.steps[index]" outlined autogrow :label="$t('guideStep', {number: index + 1})" />
                <q-btn flat round icon="delete" color="negative" @click="form.steps.splice(index, 1)" />
              </div>
              <div class="col-12"><q-btn flat color="primary" icon="add" :label="$t('guideAddStep')" @click="form.steps.push('')" /></div>
              <div class="col-12 text-subtitle1 q-mt-sm">{{ $t('guideStandards') }}</div>
              <div v-for="(ref, index) in form.references" :key="index" class="col-12 row q-col-gutter-sm items-start">
                <q-select class="col-12 col-sm-3" v-model="ref.framework" outlined emit-value map-options :options="standardOptions" :label="$t('guideFramework')" />
                <q-input class="col-5 col-sm-2" v-model="ref.version" outlined :label="$t('guideStandardVersion')" :hint="ref.framework === 'WSTG' ? '4.2' : '5.0.0'" />
                <q-input class="col" v-model="ref.code" outlined :label="$t('guideStandardCode')" :hint="ref.framework === 'WSTG' ? 'WSTG-INFO-02' : '1.2.5'" />
                <q-btn flat round icon="delete" color="negative" :aria-label="$t('btn.delete')" @click="form.references.splice(index, 1)" />
              </div>
              <div class="col-12"><q-btn flat color="primary" icon="add" :label="$t('guideAddStandard')" @click="form.references.push({framework: 'WSTG', version: '4.2', code: ''})" /></div>
            </q-card-section>
            <q-card-actions align="right"><q-btn flat :label="$t('btn.cancel')" @click="cancelEdit" /><q-btn type="submit" color="primary" :label="$t('btn.save')" :loading="saving" /></q-card-actions>
          </q-form>
        </q-card>
        <q-card v-else-if="selected" bordered flat>
          <q-card-section class="row items-start">
            <div class="col">
              <div class="text-h5">{{ selected.title }}</div>
              <div class="text-caption">{{ selected.tool?.name || $t('guideGeneral') }} · v{{ selected.version }} · {{ $t(`guideStatus_${selected.status}`) }}</div>
            </div>
            <q-btn v-if="canUpdate" flat color="primary" icon="edit" :label="$t('btn.edit')" @click="editGuide" />
            <q-btn v-if="canDelete" flat color="negative" icon="delete" @click="deleteGuide" />
          </q-card-section>
          <q-card-section v-if="selected.summary">{{ selected.summary }}</q-card-section>
          <q-separator />
          <q-card-section>
            <div class="text-subtitle1 q-mb-sm">{{ $t('guideContent') }}</div>
            <div class="guide-content">{{ selected.content || $t('guideNoContent') }}</div>
          </q-card-section>
          <q-separator />
          <q-card-section>
            <div class="text-subtitle1 q-mb-sm">{{ $t('guideSteps') }}</div>
            <ol class="q-pl-lg"><li v-for="(step, index) in selected.steps" :key="index" class="q-mb-sm">{{ step }}</li></ol>
            <div v-if="!selected.steps?.length" class="text-caption">{{ $t('guideNoSteps') }}</div>
          </q-card-section>
          <q-separator v-if="selected.references?.length" />
          <q-card-section v-if="selected.references?.length">
            <div class="text-subtitle1 q-mb-sm">{{ $t('guideStandards') }}</div>
            <q-chip v-for="ref in selected.references" :key="`${ref.framework}:${ref.version}:${ref.code}`" outline color="primary">
              {{ ref.framework }} {{ ref.version }} · {{ ref.code }}
            </q-chip>
          </q-card-section>
          <q-separator />
          <q-card-section>
            <div class="text-subtitle1 q-mb-sm">{{ $t('guideDocuments') }}</div>
            <q-list separator>
              <q-item v-for="file in selected.attachments" :key="file._id">
                <q-item-section>{{ file.name }} <span class="text-caption">({{ Math.ceil(file.size / 1024) }} KB)</span></q-item-section>
                <q-item-section side><div class="row">
                  <q-btn flat round color="primary" icon="download" @click="download(file)" />
                  <q-btn v-if="canUpdate" flat round color="negative" icon="delete" @click="deleteFile(file)" />
                </div></q-item-section>
              </q-item>
            </q-list>
            <div v-if="!selected.attachments?.length" class="text-caption q-mb-sm">{{ $t('guideNoDocuments') }}</div>
            <div v-if="canUpdate" class="row items-center q-gutter-sm q-mt-sm">
              <q-file v-model="file" outlined dense class="col" accept=".pdf,.docx,.txt,.md,.png,.jpg,.jpeg" max-file-size="26214400" :label="$t('guideChooseDocument')" @rejected="documentRejected" />
              <q-btn color="primary" icon="upload" :label="$t('guideUpload')" :disable="!file" :loading="uploading" @click="upload" />
            </div>
          </q-card-section>
          <q-separator />
          <q-card-section v-if="audits.length && (selected.steps?.length || selected.references?.length)">
            <div class="text-subtitle1 q-mb-sm">{{ $t('guideFollowForAudit') }}</div>
            <div class="row items-center q-gutter-sm">
              <q-select v-model="auditId" class="col" outlined dense clearable emit-value map-options :options="auditOptions" :label="$t('audits')" @update:model-value="loadRun" />
              <q-btn v-if="auditId && !run && canRun" color="primary" :label="$t('guideStartRun')" :loading="runLoading" @click="startRun" />
            </div>
            <div v-if="run" class="q-mt-md">
              <div class="text-caption q-mb-sm">{{ $t('guideRunVersion', {version: run.guideVersion}) }}</div>
              <q-checkbox v-for="(step, index) in run.steps" :key="index" class="full-width" :model-value="step.done" :label="step.text" :disable="!canRun || runLoading" @update:model-value="done => updateStep(index, done)" />
              <div v-if="run.coverage?.length" class="text-subtitle1 q-mt-md q-mb-xs">{{ $t('guideCoverage') }} · {{ coverageCount }}/{{ run.coverage.length }}</div>
              <div v-for="(ref, index) in run.coverage || []" :key="index" class="row q-col-gutter-sm items-center q-mb-sm">
                <div class="col-12 col-sm-4">{{ ref.framework }} {{ ref.version }} · {{ ref.code }}</div>
                <q-select class="col-12 col-sm-3" v-model="coverageDrafts[index].status" outlined dense emit-value map-options
                  :options="coverageOptions" :label="$t('guideCoverageStatus')" :disable="!canRun || runLoading" />
                <q-input class="col-12 col-sm" v-model="coverageDrafts[index].justification" outlined dense
                  :label="$t('guideCoverageNote')" :disable="!canRun || runLoading" />
                <q-btn v-if="canRun" flat color="primary" icon="save" :aria-label="$t('btn.save')"
                  :disable="runLoading || (coverageDrafts[index].status === 'na' && !coverageDrafts[index].justification?.trim())"
                  @click="saveCoverage(index)" />
              </div>
              <div v-if="!run.coverage?.length && selected.references?.length" class="text-caption q-mt-sm">{{ $t('guideCoverageOldRun') }}</div>
            </div>
          </q-card-section>
          <q-separator />
          <q-card-section>
            <div class="text-subtitle1 q-mb-sm">{{ $t('guideHistory') }}</div>
            <q-btn v-for="revision in revisions" :key="revision.version" flat dense color="primary" :label="`v${revision.version}`" @click="viewRevision(revision.version)" />
          </q-card-section>
        </q-card>
        <q-card v-else bordered flat><q-card-section>{{ $t('guideSelect') }}</q-card-section></q-card>
      </div>
    </div>
    <q-dialog v-model="revisionDialog"><q-card style="width: 700px; max-width: 95vw">
      <q-card-section class="text-h6">{{ $t('guideHistory') }} · v{{ revision?.version }}</q-card-section>
      <q-card-section><div class="text-subtitle1">{{ revision?.title }}</div><div class="guide-content q-mt-md">{{ revision?.content }}</div><ol><li v-for="(step, i) in revision?.steps || []" :key="i">{{ step }}</li></ol></q-card-section>
      <q-card-actions align="right"><q-btn flat :label="$t('btn.close')" v-close-popup /></q-card-actions>
    </q-card></q-dialog>
  </q-page>
</template>

<script>
import { Dialog, Notify } from 'quasar'
import GuideService from '@/services/guide'
import ToolService from '@/services/tool'
import AuditService from '@/services/audit'
import UserService from '@/services/user'
import { $t } from '@/boot/i18n'

const blank = () => ({title: '', summary: '', content: '', steps: [], references: [], tags: [], tool: null, status: 'draft'})
export default {
  data: () => ({guides: [], tools: [], audits: [], selected: null, form: blank(), editing: false, search: '', tagsText: '',
    loading: true, saving: false, uploading: false, file: null, revisions: [], revision: null, revisionDialog: false,
    auditId: null, run: null, runLoading: false, coverageDrafts: []}),
  computed: {
    canCreate() { return UserService.isAllowed('guides:create') },
    canUpdate() { return UserService.isAllowed('guides:update') },
    canDelete() { return UserService.isAllowed('guides:delete') },
    canRun() { return UserService.isAllowed('guides:run') && UserService.isAllowed('audits:update') },
    filteredGuides() { const q = this.search?.toLowerCase() || ''; return this.guides.filter(g => [g.title, g.summary, g.tool?.name, ...(g.tags || [])].some(v => v?.toLowerCase().includes(q))) },
    toolOptions() { return this.tools.map(t => ({label: t.name, value: t._id})) },
    auditOptions() { return this.audits.map(a => ({label: a.name, value: a._id})) },
    statusOptions() { return ['draft', 'published'].map(value => ({value, label: $t(`guideStatus_${value}`)})) },
    standardOptions() { return ['WSTG', 'ASVS'].map(value => ({value, label: value})) },
    coverageOptions() { return ['pending', 'tested', 'na'].map(value => ({value, label: $t(`guideCoverage_${value}`)})) },
    coverageCount() { return (this.run?.coverage || []).filter(ref => ref.status !== 'pending').length }
  },
  async mounted() {
    await this.load()
    const requestedAudit = this.$route.query.audit
    if (typeof requestedAudit === 'string' && this.audits.some(audit => audit._id === requestedAudit))
      this.auditId = requestedAudit
  },
  methods: {
    error(err) { Notify.create({message: err.response?.data?.datas || err.message, color: 'negative', textColor: 'white', position: 'top-right'}) },
    documentRejected() { Notify.create({message: $t('guideDocumentRejected'), color: 'negative', textColor: 'white', position: 'top-right'}) },
    async load() {
      this.loading = true
      try {
        this.guides = (await GuideService.getGuides()).data.datas || []
        this.tools = (await ToolService.getTools()).data.datas || []
        if (UserService.isAllowed('audits:read')) this.audits = (await AuditService.getAudits()).data.datas || []
      } catch (err) { this.error(err) } finally { this.loading = false }
    },
    async openGuide(id) {
      this.editing = false; this.loading = true; this.run = null
      try {
        this.selected = (await GuideService.getGuide(id)).data.datas
        this.revisions = (await GuideService.getRevisions(id)).data.datas || []
        if (this.auditId) await this.loadRun()
      } catch (err) { this.error(err) } finally { this.loading = false }
    },
    newGuide() { this.selected = null; this.form = blank(); this.tagsText = ''; this.editing = true },
    editGuide() { this.form = {...this.selected, tool: this.selected.tool?._id || null, steps: [...this.selected.steps],
      references: (this.selected.references || []).map(ref => ({framework: ref.framework, version: ref.version, code: ref.code})),
      tags: [...this.selected.tags]}; this.tagsText = this.form.tags.join(', '); this.editing = true },
    cancelEdit() { this.editing = false },
    async saveGuide() {
      this.saving = true
      try {
        const data = {...this.form, steps: this.form.steps.map(s => s.trim()).filter(Boolean), tags: this.tagsText.split(',').map(s => s.trim()).filter(Boolean)}
        const response = data._id ? await GuideService.updateGuide(data._id, data) : await GuideService.createGuide(data)
        this.editing = false; await this.load(); await this.openGuide(response.data.datas._id)
      } catch (err) { this.error(err) } finally { this.saving = false }
    },
    deleteGuide() { Dialog.create({message: $t('guideDeleteConfirm'), cancel: true}).onOk(async () => { try { await GuideService.deleteGuide(this.selected._id); this.selected = null; await this.load() } catch (err) { this.error(err) } }) },
    async upload() {
      if (!this.file) return
      this.uploading = true
      try { await GuideService.uploadFile(this.selected._id, this.file); this.file = null; await this.openGuide(this.selected._id) }
      catch (err) { this.error(err) } finally { this.uploading = false }
    },
    async download(file) {
      try {
        const response = await GuideService.downloadFile(this.selected._id, file._id)
        const url = URL.createObjectURL(response.data)
        const a = document.createElement('a'); a.href = url; a.download = file.name; document.body.appendChild(a); a.click(); a.remove()
        setTimeout(() => URL.revokeObjectURL(url), 1000)
      } catch (err) { this.error(err) }
    },
    deleteFile(file) { Dialog.create({message: $t('guideDeleteDocumentConfirm'), cancel: true}).onOk(async () => { try { await GuideService.deleteFile(this.selected._id, file._id); await this.openGuide(this.selected._id) } catch (err) { this.error(err) } }) },
    async viewRevision(version) { try { this.revision = (await GuideService.getRevision(this.selected._id, version)).data.datas; this.revisionDialog = true } catch (err) { this.error(err) } },
    setRun(run) { this.run = run; this.coverageDrafts = (run?.coverage || []).map(ref => ({status: ref.status, justification: ref.justification || ''})) },
    async loadRun() { this.setRun(null); if (!this.auditId) return; try { this.setRun((await GuideService.getRun(this.selected._id, this.auditId)).data.datas) } catch (err) { this.error(err) } },
    async startRun() { this.runLoading = true; try { this.setRun((await GuideService.startRun(this.selected._id, this.auditId)).data.datas) } catch (err) { this.error(err) } finally { this.runLoading = false } },
    async updateStep(index, done) { this.runLoading = true; try { this.run = (await GuideService.updateStep(this.selected._id, this.auditId, index, done)).data.datas } catch (err) { this.error(err) } finally { this.runLoading = false } },
    async saveCoverage(index) {
      this.runLoading = true
      try { const draft = this.coverageDrafts[index]; this.setRun((await GuideService.updateCoverage(this.selected._id, this.auditId,
        index, draft.status, draft.justification)).data.datas) }
      catch (err) { this.error(err) } finally { this.runLoading = false }
    }
  }
}
</script>

<style scoped>
.guide-content { white-space: pre-wrap; overflow-wrap: anywhere; }
</style>
