<template>
  <q-page padding>
    <div class="row items-center q-gutter-sm q-mb-md">
      <q-btn flat icon="arrow_back" :label="$t('companies')" to="/clients" />
      <div class="text-h5">{{ company?.name || $t('clientProfile') }}</div>
      <q-space />
      <q-btn flat icon="refresh" :label="$t('clientRefresh')" :loading="loading" @click="load" />
    </div>
    <q-inner-loading :showing="loading"><q-spinner color="primary" size="40px" /></q-inner-loading>
    <q-banner v-if="error" class="bg-negative text-white q-mb-md">{{ error }}</q-banner>
    <template v-if="company">
      <q-card flat bordered class="q-mb-md">
        <q-card-section class="row items-center q-gutter-md">
          <img v-if="logo" :src="logo" :alt="company.name" style="max-width: 90px; max-height: 70px" />
          <div>
            <div class="text-h6">{{ company.name }}</div>
            <div v-if="company.shortName" class="text-caption">{{ company.shortName }}</div>
            <div v-if="address" class="text-body2">{{ address }}</div>
          </div>
        </q-card-section>
      </q-card>
      <div class="row q-col-gutter-md q-mb-md">
        <div v-for="metric in metrics" :key="metric.label" class="col-6 col-md-3">
          <q-card flat bordered><q-card-section>
            <div class="text-h5">{{ metric.value }}</div>
            <div class="text-caption">{{ metric.label }}</div>
          </q-card-section></q-card>
        </div>
      </div>
      <q-card flat bordered class="q-mb-md">
        <q-card-section class="row items-center">
          <div class="text-h6">{{ $t('clientAudits') }}</div>
          <q-space />
          <q-btn v-if="canReadAudits" flat color="primary" :label="$t('clientAllAudits')" to="/audits" />
        </q-card-section>
        <q-card-section v-if="!canReadAudits" class="text-caption">{{ $t('clientNoAuditAccess') }}</q-card-section>
        <q-card-section v-else-if="!audits.length" class="text-caption">{{ $t('clientNoAudits') }}</q-card-section>
        <q-list v-else separator>
          <q-item v-for="audit in audits" :key="audit._id" clickable :to="`/audits/${audit._id}/general`">
            <q-item-section>
              <q-item-label>{{ audit.name }} <q-badge v-if="audit.isRetest" color="info">{{ $t('clientRetest') }}</q-badge></q-item-label>
              <q-item-label caption>{{ audit.auditType || $t('clientUnspecifiedType') }} · {{ audit.dateEnd || formatDate(audit.createdAt) }} · {{ $t(`clientState_${audit.state}`) }}</q-item-label>
              <q-item-label caption class="q-mt-xs">
                <q-badge v-for="level in severityLevels" :key="level.key" v-show="audit.severity[level.key]" :color="level.color" class="q-mr-xs">
                  {{ $t(level.label) }} {{ audit.severity[level.key] }}
                </q-badge>
                <span v-if="audit.findingCount && audit.severity.unknown">{{ $t('clientUnclassified') }} {{ audit.severity.unknown }}</span>
                <span v-if="!audit.findingCount">{{ $t('clientNoFindings') }}</span>
              </q-item-label>
            </q-item-section>
            <q-item-section side><q-icon name="chevron_right" /></q-item-section>
          </q-item>
        </q-list>
      </q-card>
      <q-card flat bordered>
        <q-card-section class="row items-center">
          <div class="text-h6">{{ $t('clientArchives') }}</div>
          <q-space />
          <q-btn v-if="canReadArchives" flat color="primary" :label="$t('clientOpenArchive')" :to="{path: '/audits-archive', query: {company: company._id}}" />
        </q-card-section>
        <q-card-section v-if="!canReadArchives" class="text-caption">{{ $t('clientNoArchiveAccess') }}</q-card-section>
        <q-card-section v-else-if="!archives.length" class="text-caption">{{ $t('clientNoArchives') }}</q-card-section>
        <q-list v-else separator>
          <q-item v-for="archive in archives" :key="archive._id" clickable :to="{path: '/audits-archive', query: {company: company._id, archive: archive._id}}">
            <q-item-section>
              <q-item-label>{{ archive.name }}</q-item-label>
              <q-item-label caption>{{ archive.auditType || $t('clientUnspecifiedType') }} · {{ formatDate(archive.reportDate || archive.createdAt) }}</q-item-label>
            </q-item-section>
            <q-item-section side><q-icon name="chevron_right" /></q-item-section>
          </q-item>
        </q-list>
      </q-card>
    </template>
  </q-page>
</template>

<script>
import CompanyService from '@/services/company'
import UserService from '@/services/user'

export default {
  data: () => ({company: null, audits: [], archives: [], loading: false, error: ''}),
  computed: {
    canReadAudits() { return UserService.isAllowed('audits:read') },
    canReadArchives() { return UserService.isAllowed('audit-archives:read') },
    logo() { const value = this.company?.logo; return value ? value.startsWith('data:image/') ? value : `data:image/png;base64,${value}` : null },
    address() { return [this.company?.address, this.company?.postalCode, this.company?.city].filter(Boolean).join(', ') },
    metrics() { return [
      {label: this.$t('clientAudits'), value: this.audits.filter(a => !a.isRetest).length},
      {label: this.$t('clientRetests'), value: this.audits.filter(a => a.isRetest).length},
      {label: this.$t('clientArchives'), value: this.archives.length},
      {label: this.$t('clientFindings'), value: this.audits.reduce((sum, audit) => sum + audit.findingCount, 0)}
    ] },
    severityLevels() { return [
      {key: 'critical', label: 'clientCritical', color: 'negative'},
      {key: 'high', label: 'clientHigh', color: 'deep-orange'},
      {key: 'medium', label: 'clientMedium', color: 'warning'},
      {key: 'low', label: 'clientLow', color: 'positive'},
      {key: 'info', label: 'clientInfo', color: 'info'}
    ] }
  },
  mounted() { this.load() },
  watch: {'$route.params.companyId'() { this.load() }},
  methods: {
    async load() {
      this.loading = true; this.error = ''
      try {
        const response = await CompanyService.getOverview(this.$route.params.companyId)
        const overview = response.data.datas
        this.company = overview.company; this.audits = overview.audits; this.archives = overview.archives
      } catch (err) {
        this.company = null; this.audits = []; this.archives = []
        this.error = err.response?.data?.datas || err.message
      } finally { this.loading = false }
    },
    formatDate(value) { if (!value) return ''; const date = new Date(value); return isNaN(date.getTime()) ? value : date.toLocaleDateString() }
  }
}
</script>
