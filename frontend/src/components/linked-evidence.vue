<template>
  <q-card v-if="loading || error || candidates.length" flat bordered class="q-mt-md">
    <q-card-section class="row items-center q-gutter-sm">
      <div class="text-subtitle2">{{ $t('evidenceLinkedTitle') }}</div>
      <q-space />
      <q-btn flat dense round icon="refresh" :aria-label="$t('clientRefresh')" :loading="loading" @click="load" />
    </q-card-section>
    <q-separator />
    <q-card-section v-if="error" class="text-negative">{{ error }}</q-card-section>
    <q-list v-else separator>
      <q-item v-for="candidate in candidates" :key="candidate._id" class="q-py-md">
        <q-item-section>
          <q-item-label class="text-weight-medium">{{ candidate.title }}</q-item-label>
          <q-item-label caption>
            {{ $t(`evidenceSource_${candidate.sourceType}`) }}
            <span v-if="candidate.sourceId"> · {{ candidate.sourceId }}</span>
            <span v-if="candidate.target"> · {{ candidate.target }}</span>
          </q-item-label>
          <q-item-label v-if="candidate.summary" class="evidence-summary q-mt-sm">{{ candidate.summary }}</q-item-label>
          <div v-if="candidate.attachments?.length" class="row q-gutter-sm q-mt-sm">
            <q-btn v-for="file in candidate.attachments" :key="file._id" outline dense no-caps
              color="primary" icon="download" :label="file.name" :loading="downloading === file._id"
              @click="download(candidate, file)" />
          </div>
        </q-item-section>
        <q-item-section side top>
          <q-btn flat dense round icon="open_in_new" color="primary" :aria-label="$t('evidenceOpenSource')"
            :to="{path: `/audits/${auditId}/evidence`, query: {evidence: candidate._id}}">
            <q-tooltip>{{ $t('evidenceOpenSource') }}</q-tooltip>
          </q-btn>
        </q-item-section>
      </q-item>
    </q-list>
  </q-card>
</template>

<script>
import EvidenceService from '@/services/evidence'

export default {
  props: {auditId: {type: String, required: true}, findingId: {type: String, required: true}},
  data: () => ({candidates: [], loading: false, error: '', downloading: null, loadSequence: 0}),
  mounted() { this.load() },
  watch: {
    auditId() { this.load() },
    findingId() { this.load() }
  },
  methods: {
    async load() {
      const sequence = ++this.loadSequence
      this.loading = true; this.error = ''; this.candidates = []
      try {
        const response = await EvidenceService.forFinding(this.auditId, this.findingId)
        if (sequence === this.loadSequence) this.candidates = response.data.datas || []
      } catch (err) {
        if (sequence === this.loadSequence) this.error = err.response?.data?.datas || err.message
      } finally {
        if (sequence === this.loadSequence) this.loading = false
      }
    },
    async download(candidate, file) {
      this.downloading = file._id; this.error = ''
      try {
        const response = await EvidenceService.downloadFile(this.auditId, candidate._id, file._id)
        const url = URL.createObjectURL(response.data)
        const anchor = document.createElement('a')
        anchor.href = url; anchor.download = file.name; document.body.appendChild(anchor); anchor.click(); anchor.remove()
        setTimeout(() => URL.revokeObjectURL(url), 1000)
      } catch (err) { this.error = err.response?.data?.datas || err.message }
      finally { this.downloading = null }
    }
  }
}
</script>

<style scoped>
.evidence-summary { white-space: pre-wrap; overflow-wrap: anywhere; }
</style>
