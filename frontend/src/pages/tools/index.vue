<template>
  <q-page padding>
    <div class="row items-center q-mb-md q-gutter-sm">
      <div class="text-h5">{{ $t('toolsTitle') }}</div>
      <q-space />
      <q-btn v-if="tab === 'tools' && canCreateTools" color="primary" icon="add" :label="$t('toolAdd')" @click="openTool()" />
      <q-btn v-if="tab === 'licenses' && canCreateLicenses" color="primary" icon="add" :label="$t('licenseAdd')" @click="openLicense()" />
    </div>
    <q-tabs v-model="tab" align="left" active-color="primary" class="q-mb-md">
      <q-tab v-if="canReadTools" name="tools" :label="$t('toolsTitle')" />
      <q-tab v-if="canReadLicenses" name="licenses" :label="$t('licensesTitle')" />
    </q-tabs>
    <q-inner-loading :showing="loading"><q-spinner size="40px" color="primary" /></q-inner-loading>
    <template v-if="tab === 'tools' && canReadTools">
      <q-input v-model="search" outlined dense clearable debounce="200" :label="$t('search')" class="q-mb-md" />
      <div v-if="!loading && filteredTools.length === 0" class="text-caption">{{ $t('toolsEmpty') }}</div>
      <div class="row q-col-gutter-md">
        <div v-for="tool in filteredTools" :key="tool._id" class="col-12 col-md-6 col-xl-4">
          <q-card bordered flat class="full-height">
            <q-card-section class="row items-start">
              <div class="col">
                <div class="text-h6">{{ tool.name }} <span v-if="tool.edition" class="text-subtitle2">{{ tool.edition }}</span></div>
                <div class="text-caption">{{ tool.vendor }} · {{ tool.category }}</div>
              </div>
              <q-badge :color="tool.status === 'retired' ? 'negative' : tool.status === 'trial' ? 'warning' : 'positive'" :text-color="tool.status === 'trial' ? 'dark' : 'white'">{{ $t(`toolStatus_${tool.status}`) }}</q-badge>
            </q-card-section>
            <q-card-section v-if="tool.purpose">{{ tool.purpose }}</q-card-section>
            <q-card-section class="text-caption">
              <div v-if="tool.version">{{ $t('toolVersion') }}: {{ tool.version }}</div>
              <div v-if="tool.owner">{{ $t('toolOwner') }}: {{ tool.owner.username }}</div>
              <a v-if="tool.website" :href="tool.website" target="_blank" rel="noopener noreferrer">{{ $t('toolWebsite') }}</a>
            </q-card-section>
            <q-card-actions align="right" v-if="canUpdateTools || canDeleteTools">
              <q-btn v-if="canUpdateTools" flat color="primary" icon="edit" :label="$t('btn.edit')" @click="openTool(tool)" />
              <q-btn v-if="canDeleteTools" flat color="negative" icon="delete" @click="removeTool(tool)" />
            </q-card-actions>
          </q-card>
        </div>
      </div>
    </template>
    <template v-else>
      <q-banner v-if="expiring.length" rounded class="bg-warning text-dark q-mb-md">
        {{ $t('licenseExpiringBanner', { count: expiring.length }) }}
      </q-banner>
      <div v-if="!loading && licenses.length === 0" class="text-caption">{{ $t('licensesEmpty') }}</div>
      <div class="row q-col-gutter-md">
        <div v-for="license in licenses" :key="license._id" class="col-12 col-md-6 col-xl-4">
          <q-card bordered flat class="full-height">
            <q-card-section class="row items-start">
              <div class="col">
                <div class="text-h6">{{ license.label }}</div>
                <div class="text-caption">{{ license.tool?.name }} {{ license.tool?.edition }}</div>
              </div>
              <q-badge v-if="license.expiresOn" :color="daysLeft(license) < 0 ? 'negative' : daysLeft(license) <= 90 ? 'warning' : 'positive'" :text-color="daysLeft(license) <= 90 && daysLeft(license) >= 0 ? 'dark' : 'white'">
                {{ daysLeft(license) < 0 ? $t('licenseExpired') : $t('licenseDaysLeft', { days: daysLeft(license) }) }}
              </q-badge>
            </q-card-section>
            <q-card-section class="text-caption">
              <div>{{ $t('licenseSeats') }}: {{ license.assignedTo?.length || 0 }}/{{ license.seats }}</div>
              <div v-if="license.expiresOn">{{ $t('licenseExpires') }}: {{ datePart(license.expiresOn) }}</div>
              <div v-if="license.renewalOwner">{{ $t('licenseRenewalOwner') }}: {{ license.renewalOwner.username }}</div>
              <div v-if="license.purchaseRef">{{ $t('licensePurchaseRef') }}: {{ license.purchaseRef }}</div>
            </q-card-section>
            <q-card-actions align="right" v-if="canUpdateLicenses || canDeleteLicenses">
              <q-btn v-if="canUpdateLicenses" flat color="primary" icon="edit" :label="$t('btn.edit')" @click="openLicense(license)" />
              <q-btn v-if="canDeleteLicenses" flat color="negative" icon="delete" @click="removeLicense(license)" />
            </q-card-actions>
          </q-card>
        </div>
      </div>
    </template>

    <q-dialog v-model="toolDialog">
      <q-card style="width: 680px; max-width: 95vw">
        <q-form @submit.prevent="saveTool">
          <q-card-section class="text-h6">{{ toolForm._id ? $t('toolEdit') : $t('toolAdd') }}</q-card-section>
          <q-card-section class="row q-col-gutter-sm">
            <q-input class="col-12 col-sm-6" v-model="toolForm.name" outlined :label="$t('name')" :rules="[v => !!v || $t('msg.fieldRequired')]" />
            <q-input class="col-12 col-sm-6" v-model="toolForm.vendor" outlined :label="$t('toolVendor')" />
            <q-input class="col-12 col-sm-6" v-model="toolForm.edition" outlined :label="$t('toolEdition')" />
            <q-input class="col-12 col-sm-6" v-model="toolForm.category" outlined :label="$t('toolCategory')" />
            <q-input class="col-12 col-sm-6" v-model="toolForm.version" outlined :label="$t('toolVersion')" />
            <q-select class="col-12 col-sm-6" v-model="toolForm.status" outlined emit-value map-options :options="statusOptions" :label="$t('toolStatus')" />
            <q-select class="col-12 col-sm-6" v-model="toolForm.owner" outlined clearable emit-value map-options :options="userOptions" :label="$t('toolOwner')" />
            <q-input class="col-12 col-sm-6" v-model="toolForm.website" outlined type="url" :label="$t('toolWebsite')" />
            <q-input class="col-12" v-model="toolForm.purpose" outlined type="textarea" autogrow :label="$t('toolPurpose')" />
            <q-input class="col-12" v-model="toolTags" outlined :label="$t('toolTags')" />
          </q-card-section>
          <q-card-actions align="right"><q-btn flat :label="$t('btn.cancel')" v-close-popup /><q-btn type="submit" color="primary" :label="$t('btn.save')" :loading="saving" /></q-card-actions>
        </q-form>
      </q-card>
    </q-dialog>
    <q-dialog v-model="licenseDialog">
      <q-card style="width: 680px; max-width: 95vw">
        <q-form @submit.prevent="saveLicense">
          <q-card-section class="text-h6">{{ licenseForm._id ? $t('licenseEdit') : $t('licenseAdd') }}</q-card-section>
          <q-card-section class="row q-col-gutter-sm">
            <q-select class="col-12 col-sm-6" v-model="licenseForm.tool" outlined emit-value map-options :options="toolOptions" :label="$t('toolProduct')" :rules="[v => !!v || $t('msg.fieldRequired')]" />
            <q-input class="col-12 col-sm-6" v-model="licenseForm.label" outlined :label="$t('name')" :rules="[v => !!v || $t('msg.fieldRequired')]" />
            <q-input class="col-12 col-sm-6" v-model="licenseForm.type" outlined :label="$t('licenseType')" />
            <q-input class="col-12 col-sm-6" v-model.number="licenseForm.seats" outlined type="number" min="1" :label="$t('licenseSeats')" />
            <q-input class="col-12 col-sm-6" v-model="licenseForm.purchasedOn" outlined type="date" stack-label :label="$t('licensePurchased')" />
            <q-input class="col-12 col-sm-6" v-model="licenseForm.expiresOn" outlined type="date" stack-label :label="$t('licenseExpires')" />
            <q-select class="col-12 col-sm-6" v-model="licenseForm.renewalOwner" outlined clearable emit-value map-options :options="userOptions" :label="$t('licenseRenewalOwner')" />
            <q-input class="col-12 col-sm-6" v-model="licenseForm.purchaseRef" outlined :label="$t('licensePurchaseRef')" />
            <q-select class="col-12" v-model="licenseForm.assignedTo" multiple use-chips outlined emit-value map-options :options="userOptions" :label="$t('licenseAssignedTo')" />
            <q-input class="col-12" v-model="licenseForm.notes" outlined type="textarea" autogrow :label="$t('notes')" />
          </q-card-section>
          <q-card-actions align="right"><q-btn flat :label="$t('btn.cancel')" v-close-popup /><q-btn type="submit" color="primary" :label="$t('btn.save')" :loading="saving" /></q-card-actions>
        </q-form>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script>
import { Dialog, Notify } from 'quasar'
import ToolService from '@/services/tool'
import CollaboratorService from '@/services/collaborator'
import UserService from '@/services/user'
import { $t } from '@/boot/i18n'

const blankTool = () => ({name: '', vendor: '', edition: '', category: '', purpose: '', website: '', version: '', status: 'active', owner: null, tags: []})
const blankLicense = () => ({tool: null, label: '', type: '', seats: 1, assignedTo: [], purchasedOn: '', expiresOn: '', renewalOwner: null, purchaseRef: '', notes: ''})
export default {
  data: () => ({tab: 'tools', tools: [], licenses: [], users: [], search: '', loading: true, saving: false,
    toolDialog: false, licenseDialog: false, toolForm: blankTool(), licenseForm: blankLicense(), toolTags: ''}),
  computed: {
    canReadTools() { return UserService.isAllowed('tools:read') },
    canCreateTools() { return UserService.isAllowed('tools:create') },
    canUpdateTools() { return UserService.isAllowed('tools:update') },
    canDeleteTools() { return UserService.isAllowed('tools:delete') },
    canReadLicenses() { return UserService.isAllowed('licenses:read') },
    canCreateLicenses() { return UserService.isAllowed('licenses:create') },
    canUpdateLicenses() { return UserService.isAllowed('licenses:update') },
    canDeleteLicenses() { return UserService.isAllowed('licenses:delete') },
    filteredTools() { const text = this.search?.toLowerCase() || ''; return this.tools.filter(t => [t.name, t.vendor, t.edition, t.category].some(v => v?.toLowerCase().includes(text))) },
    expiring() { return this.licenses.filter(l => l.expiresOn && this.daysLeft(l) <= 90) },
    toolOptions() { return this.tools.map(t => ({label: `${t.name}${t.edition ? ` · ${t.edition}` : ''}`, value: t._id})) },
    userOptions() { return this.users.map(u => ({label: u.username, value: u._id})) },
    statusOptions() { return ['active', 'trial', 'retired'].map(value => ({value, label: $t(`toolStatus_${value}`)})) }
  },
  mounted() {
    if (this.$route.query.tab === 'licenses' && this.canReadLicenses) this.tab = 'licenses'
    else if (this.canReadTools) this.tab = 'tools'
    else if (this.canReadLicenses) this.tab = 'licenses'
    this.load()
  },
  watch: {'$route.query.tab'(tab) {
    if (tab === 'licenses' && this.canReadLicenses) this.tab = 'licenses'
    else if (tab === 'tools' && this.canReadTools) this.tab = 'tools'
  }},
  methods: {
    async load() {
      this.loading = true
      try {
        if (this.canReadTools) this.tools = (await ToolService.getTools()).data.datas || []
        if (this.canReadLicenses) this.licenses = (await ToolService.getLicenses()).data.datas || []
        if (this.canCreateTools || this.canUpdateTools || this.canCreateLicenses || this.canUpdateLicenses) this.users = (await CollaboratorService.getCollabs()).data.datas || []
      } catch (err) { this.error(err) } finally { this.loading = false }
    },
    error(err) { Notify.create({message: err.response?.data?.datas || err.message, color: 'negative', textColor: 'white', position: 'top-right'}) },
    datePart(value) { return value ? value.slice(0, 10) : '' },
    daysLeft(license) { return Math.round((Date.parse(this.datePart(license.expiresOn) + 'T00:00:00Z') - Date.parse(new Date().toISOString().slice(0, 10) + 'T00:00:00Z')) / 86400000) },
    openTool(tool) { this.toolForm = tool ? {...tool, owner: tool.owner?._id || null, tags: [...(tool.tags || [])]} : blankTool(); this.toolTags = this.toolForm.tags.join(', '); this.toolDialog = true },
    async saveTool() {
      this.saving = true
      try {
        const form = {...this.toolForm, tags: this.toolTags.split(',').map(s => s.trim()).filter(Boolean)}
        if (form._id) await ToolService.updateTool(form._id, form)
        else await ToolService.createTool(form)
        this.toolDialog = false; await this.load()
      } catch (err) { this.error(err) } finally { this.saving = false }
    },
    removeTool(tool) { Dialog.create({message: $t('toolDeleteConfirm'), cancel: true}).onOk(async () => { try { await ToolService.deleteTool(tool._id); await this.load() } catch (err) { this.error(err) } }) },
    openLicense(license) { this.licenseForm = license ? {...license, tool: license.tool?._id, assignedTo: (license.assignedTo || []).map(u => u._id), renewalOwner: license.renewalOwner?._id || null, purchasedOn: this.datePart(license.purchasedOn), expiresOn: this.datePart(license.expiresOn)} : blankLicense(); this.licenseDialog = true },
    async saveLicense() {
      this.saving = true
      try {
        if (this.licenseForm._id) await ToolService.updateLicense(this.licenseForm._id, this.licenseForm)
        else await ToolService.createLicense(this.licenseForm)
        this.licenseDialog = false; await this.load()
      } catch (err) { this.error(err) } finally { this.saving = false }
    },
    removeLicense(license) { Dialog.create({message: $t('licenseDeleteConfirm'), cancel: true}).onOk(async () => { try { await ToolService.deleteLicense(license._id); await this.load() } catch (err) { this.error(err) } }) }
  }
}
</script>
