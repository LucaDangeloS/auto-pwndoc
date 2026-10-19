<template>
  <q-page padding>
    <div class="row items-center q-gutter-sm q-mb-md">
      <div class="text-h5">{{ $t('evidenceInbox') }}</div>
      <q-space />
      <q-btn flat icon="refresh" :label="$t('clientRefresh')" :loading="loading" @click="load" />
      <q-btn v-if="canCreate" flat color="primary" icon="integration_instructions" :label="$t('evidenceBurpImport')" @click="burpDialog = true" />
      <q-btn v-if="canCreate" color="primary" icon="add" :label="$t('evidenceAdd')" @click="createDialog = true" />
    </div>
    <q-banner class="bg-info text-white q-mb-md">{{ $t('evidenceReviewHint') }}</q-banner>
    <div class="row q-col-gutter-md">
      <div class="col-12 col-md-4">
        <q-select v-model="filter" outlined dense emit-value map-options :options="filterOptions" :label="$t('evidenceStatus')" class="q-mb-sm" />
        <q-list bordered separator>
          <q-item v-for="item in filtered" :key="item._id" clickable :active="selected?._id === item._id" active-class="text-primary" @click="selected = item">
            <q-item-section>
              <q-item-label>{{ item.title }}</q-item-label>
              <q-item-label caption>{{ $t(`evidenceSource_${item.sourceType}`) }} · {{ item.target || $t('evidenceNoTarget') }}</q-item-label>
            </q-item-section>
            <q-item-section side><q-badge :color="statusColor(item.status)">{{ $t(`evidenceStatus_${item.status}`) }}</q-badge></q-item-section>
          </q-item>
          <q-item v-if="!loading && !filtered.length"><q-item-section>{{ $t('evidenceEmpty') }}</q-item-section></q-item>
        </q-list>
      </div>
      <div class="col-12 col-md-8">
        <q-inner-loading :showing="loading"><q-spinner color="primary" size="40px" /></q-inner-loading>
        <q-card v-if="selected" flat bordered>
          <q-card-section class="row items-start q-gutter-sm">
            <div class="col">
              <div class="text-h6">{{ selected.title }}</div>
              <div class="text-caption">{{ $t(`evidenceSource_${selected.sourceType}`) }}<span v-if="selected.sourceId"> · {{ selected.sourceId }}</span> · {{ formatDate(selected.observedAt) }}</div>
              <div v-if="selected.target" class="text-caption">{{ $t('evidenceTarget') }}: {{ selected.target }}</div>
              <div class="text-caption">{{ $t('evidenceSubmittedBy') }}: {{ selected.createdBy?.username }}</div>
            </div>
            <q-badge :color="statusColor(selected.status)">{{ $t(`evidenceStatus_${selected.status}`) }}</q-badge>
          </q-card-section>
          <q-separator />
          <q-card-section v-if="selected.summary"><div class="text-subtitle2 q-mb-xs">{{ $t('evidenceSummary') }}</div><div class="evidence-text">{{ selected.summary }}</div></q-card-section>
          <q-card-section v-if="selected.rawEvidence"><div class="text-subtitle2 q-mb-xs">{{ $t('evidenceRaw') }}</div><pre class="evidence-text q-ma-none">{{ selected.rawEvidence }}</pre></q-card-section>
          <q-card-section>
            <div class="text-subtitle2 q-mb-sm">{{ $t('evidenceFiles') }}</div>
            <q-list separator>
              <q-item v-for="attachment in selected.attachments" :key="attachment._id">
                <q-item-section>{{ attachment.name }} <span class="text-caption">({{ Math.ceil(attachment.size / 1024) }} KB)</span></q-item-section>
                <q-item-section side><div class="row">
                  <q-btn flat round icon="download" color="primary" @click="download(attachment)" />
                  <q-btn v-if="canCreate && selected.status === 'pending'" flat round icon="delete" color="negative" @click="deleteFile(attachment)" />
                </div></q-item-section>
              </q-item>
            </q-list>
            <div v-if="!selected.attachments?.length" class="text-caption">{{ $t('evidenceNoFiles') }}</div>
            <div v-if="canCreate && selected.status === 'pending'" class="row items-center q-gutter-sm q-mt-sm">
              <q-file v-model="file" class="col" outlined dense accept=".pdf,.png,.jpg,.jpeg,.txt,.md,.har,.json" max-file-size="26214400" :label="$t('evidenceChooseFile')" @rejected="rejectedFile" />
              <q-btn color="primary" icon="upload" :label="$t('guideUpload')" :disable="!file" :loading="uploading" @click="upload" />
            </div>
          </q-card-section>
          <q-separator />
          <q-card-section v-if="selected.reviewNote || selected.reviewedBy">
            <div class="text-subtitle2">{{ $t('evidenceReview') }}</div>
            <div v-if="selected.reviewedBy" class="text-caption">{{ selected.reviewedBy.username }} · {{ formatDate(selected.reviewedAt) }}</div>
            <div class="evidence-text">{{ selected.reviewNote }}</div>
          </q-card-section>
          <q-card-actions align="right">
            <q-btn v-if="canDelete && !selected.linkedFinding" flat color="negative" icon="delete" :label="$t('btn.delete')" @click="remove" />
            <q-btn v-if="canReview && selected.status !== 'promoted'" flat color="negative" :label="$t('evidenceReject')" @click="openReview('rejected')" />
            <q-btn v-if="canReview && selected.status !== 'promoted'" color="positive" :label="$t('evidenceAccept')" @click="openReview('accepted')" />
            <q-btn v-if="canPromote && selected.status === 'accepted'" color="primary" icon="post_add" :label="$t('evidencePromote')" :loading="saving" @click="promote" />
            <q-btn v-if="selected.status === 'promoted' && selected.linkedFinding" flat color="primary" icon="open_in_new" :label="$t('evidenceOpenFinding')" :to="`/audits/${auditId}/findings/${selected.linkedFinding}`" />
          </q-card-actions>
        </q-card>
        <q-card v-else flat bordered><q-card-section>{{ $t('evidenceSelect') }}</q-card-section></q-card>
      </div>
    </div>

    <q-dialog v-model="burpDialog"><q-card style="width: 680px; max-width: 95vw">
      <q-card-section class="text-h6">{{ $t('evidenceBurpImport') }}</q-card-section>
      <q-card-section>
        <div class="q-mb-sm">{{ $t('evidenceBurpSetup') }}</div>
        <div class="q-mb-sm">{{ $t('evidenceBurpKey') }}</div>
        <div class="q-mb-sm">{{ $t('evidenceBurpScope') }}</div>
        <pre class="evidence-text q-pa-sm bg-grey-2">npm --prefix integrations/burp-companion ci
npm --prefix integrations/burp-companion run import -- --audit {{ auditId }} --allow-host example.test --dry-run
npm --prefix integrations/burp-companion run import -- --audit {{ auditId }} --allow-host example.test</pre>
        <div class="text-caption">{{ $t('evidenceBurpAfter') }}</div>
      </q-card-section>
      <q-card-actions align="right"><q-btn flat :label="$t('btn.close')" v-close-popup /></q-card-actions>
    </q-card></q-dialog>

    <q-dialog v-model="createDialog"><q-card style="width: 720px; max-width: 95vw"><q-form @submit.prevent="create">
      <q-card-section class="text-h6">{{ $t('evidenceAdd') }}</q-card-section>
      <q-card-section class="row q-col-gutter-sm">
        <q-input class="col-12" v-model="form.title" outlined :label="$t('title')" :rules="[v => !!v || $t('msg.fieldRequired')]" />
        <q-select class="col-12 col-sm-6" v-model="form.sourceType" outlined emit-value map-options :options="sourceOptions" :label="$t('evidenceSource')" />
        <q-input class="col-12 col-sm-6" v-model="form.sourceId" outlined :label="$t('evidenceSourceId')" />
        <q-input class="col-12" v-model="form.target" outlined :label="$t('evidenceTarget')" />
        <q-input class="col-12" v-model="form.observedAt" outlined type="datetime-local" stack-label :label="$t('evidenceObservedAt')" />
        <q-input class="col-12" v-model="form.summary" outlined type="textarea" autogrow :label="$t('evidenceSummary')" />
        <q-input class="col-12" v-model="form.rawEvidence" outlined type="textarea" autogrow :label="$t('evidenceRaw')" />
      </q-card-section>
      <q-card-actions align="right"><q-btn flat :label="$t('btn.cancel')" v-close-popup /><q-btn type="submit" color="primary" :label="$t('btn.save')" :loading="saving" /></q-card-actions>
    </q-form></q-card></q-dialog>

    <q-dialog v-model="reviewDialog"><q-card style="width: 560px; max-width: 95vw">
      <q-card-section class="text-h6">{{ $t('evidenceReview') }}</q-card-section>
      <q-card-section><q-input v-model="reviewNote" outlined type="textarea" autogrow :label="$t('evidenceReviewNote')" /></q-card-section>
      <q-card-actions align="right"><q-btn flat :label="$t('btn.cancel')" v-close-popup /><q-btn color="primary" :label="$t('btn.save')" :loading="saving" @click="saveReview" /></q-card-actions>
    </q-card></q-dialog>
  </q-page>
</template>

<script>
import { Dialog, Notify } from 'quasar'
import EvidenceService from '@/services/evidence'
import UserService from '@/services/user'
import { $t } from '@/boot/i18n'

const blank = () => ({title: '', sourceType: 'manual', sourceId: '', target: '', observedAt: '', summary: '', rawEvidence: ''})
export default {
  data: () => ({items: [], selected: null, loading: false, saving: false, uploading: false,
    filter: 'all', burpDialog: false, createDialog: false, reviewDialog: false, reviewStatus: '', reviewNote: '', file: null, form: blank()}),
  computed: {
    auditId() { return this.$route.params.auditId },
    canCreate() { return UserService.isAllowed('evidence:create') && UserService.isAllowed('audits:update') },
    canReview() { return UserService.isAllowed('evidence:review') },
    canPromote() { return this.canReview && UserService.isAllowed('audits:update') },
    canDelete() { return UserService.isAllowed('evidence:delete') && UserService.isAllowed('audits:update') },
    filtered() { return this.filter === 'all' ? this.items : this.items.filter(item => item.status === this.filter) },
    filterOptions() { return ['all', 'pending', 'accepted', 'rejected', 'promoted'].map(value => ({value, label: $t(`evidenceStatus_${value}`)})) },
    sourceOptions() { return ['manual', 'burp', 'scanner', 'script', 'other'].map(value => ({value, label: $t(`evidenceSource_${value}`)})) }
  },
  mounted() { this.load(this.$route.query.evidence) },
  watch: {
    '$route.params.auditId'() { this.selected = null; this.load(this.$route.query.evidence) },
    '$route.query.evidence'(id) { if (id) { this.filter = 'all'; this.load(id) } }
  },
  methods: {
    error(err) { Notify.create({message: err.response?.data?.datas || err.message, color: 'negative', textColor: 'white', position: 'top-right'}) },
    rejectedFile() { Notify.create({message: $t('evidenceFileRejected'), color: 'negative', textColor: 'white', position: 'top-right'}) },
    statusColor(status) { return {pending: 'warning', accepted: 'positive', rejected: 'negative', promoted: 'info'}[status] || 'grey' },
    formatDate(value) { return value ? new Date(value).toLocaleString() : '' },
    async load(selectId = this.selected?._id) {
      this.loading = true
      try {
        this.items = (await EvidenceService.list(this.auditId)).data.datas || []
        this.selected = this.items.find(item => item._id === selectId) || null
      } catch (err) { this.error(err) } finally { this.loading = false }
    },
    async create() {
      this.saving = true
      try {
        const response = await EvidenceService.create(this.auditId, this.form)
        this.createDialog = false; this.form = blank(); await this.load(response.data.datas._id)
      } catch (err) { this.error(err) } finally { this.saving = false }
    },
    openReview(status) { this.reviewStatus = status; this.reviewNote = this.selected.reviewNote || ''; this.reviewDialog = true },
    async saveReview() {
      this.saving = true
      try { await EvidenceService.review(this.auditId, this.selected._id, this.reviewStatus, this.reviewNote); this.reviewDialog = false; await this.load() }
      catch (err) { this.error(err) } finally { this.saving = false }
    },
    promote() { Dialog.create({message: $t('evidencePromoteConfirm'), cancel: true}).onOk(async () => {
      this.saving = true
      try { await EvidenceService.promote(this.auditId, this.selected._id); await this.load() }
      catch (err) { this.error(err) } finally { this.saving = false }
    }) },
    remove() { Dialog.create({message: $t('evidenceDeleteConfirm'), cancel: true}).onOk(async () => {
      try { await EvidenceService.remove(this.auditId, this.selected._id); this.selected = null; await this.load() }
      catch (err) { this.error(err) }
    }) },
    async upload() {
      if (!this.file) return
      this.uploading = true
      try { await EvidenceService.uploadFile(this.auditId, this.selected._id, this.file); this.file = null; await this.load() }
      catch (err) { this.error(err) } finally { this.uploading = false }
    },
    async download(attachment) {
      try {
        const response = await EvidenceService.downloadFile(this.auditId, this.selected._id, attachment._id)
        const url = URL.createObjectURL(response.data)
        const anchor = document.createElement('a'); anchor.href = url; anchor.download = attachment.name
        document.body.appendChild(anchor); anchor.click(); anchor.remove()
        setTimeout(() => URL.revokeObjectURL(url), 1000)
      } catch (err) { this.error(err) }
    },
    deleteFile(attachment) { Dialog.create({message: $t('evidenceDeleteFileConfirm'), cancel: true}).onOk(async () => {
      try { await EvidenceService.deleteFile(this.auditId, this.selected._id, attachment._id); await this.load() }
      catch (err) { this.error(err) }
    }) }
  }
}
</script>

<style scoped>
.evidence-text { white-space: pre-wrap; overflow-wrap: anywhere; word-break: break-word; }
</style>
