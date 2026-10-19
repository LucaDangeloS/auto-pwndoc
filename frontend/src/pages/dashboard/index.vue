<template>
  <q-page padding>
    <div class="row items-center q-gutter-sm q-mb-md">
      <div class="text-h5">{{ $t('dashboardTitle') }}</div>
      <q-space />
      <q-btn flat icon="refresh" :label="$t('clientRefresh')" :loading="loading" @click="load" />
      <q-btn v-if="canCreateTask" color="primary" icon="add_task" :label="$t('dashboardAddTask')" @click="openTask" />
    </div>
    <q-banner v-if="error" class="bg-negative text-white q-mb-md">{{ error }}</q-banner>
    <q-inner-loading :showing="loading"><q-spinner color="primary" size="40px" /></q-inner-loading>
    <div class="row q-col-gutter-md q-mb-md">
      <div v-for="metric in metrics" :key="metric.label" class="col-6 col-sm-4 col-lg-2">
        <q-card flat bordered class="full-height"><q-card-section>
          <div class="text-h5">{{ metric.value }}</div><div class="text-caption">{{ metric.label }}</div>
        </q-card-section></q-card>
      </div>
    </div>
    <div class="row q-col-gutter-md">
      <div class="col-12 col-lg-7">
        <q-card flat bordered class="q-mb-md">
          <q-card-section class="row items-center"><div class="text-h6">{{ $t('dashboardActiveAudits') }}</div><q-space />
            <q-btn flat color="primary" :label="$t('clientAllAudits')" to="/audits" /></q-card-section>
          <q-list separator>
            <q-item v-for="audit in data.audits" :key="audit._id" clickable :to="`/audits/${audit._id}/general`">
              <q-item-section><q-item-label>{{ audit.name }}</q-item-label>
                <q-item-label caption>{{ audit.company?.name || audit.auditType || $t('clientUnspecifiedType') }} · {{ formatDate(audit.date_end || audit.updatedAt) }}</q-item-label>
              </q-item-section><q-item-section side><q-badge :color="audit.state === 'REVIEW' ? 'warning' : 'info'">{{ $t(`clientState_${audit.state}`) }}</q-badge></q-item-section>
            </q-item>
            <q-item v-if="!loading && !data.audits.length"><q-item-section>{{ $t('dashboardNoAudits') }}</q-item-section></q-item>
          </q-list>
        </q-card>
        <q-card v-if="canReadEvidence" flat bordered class="q-mb-md">
          <q-card-section class="text-h6">{{ $t('dashboardPendingEvidence') }}</q-card-section>
          <q-list separator>
            <q-item v-for="item in data.evidence" :key="item._id" clickable :to="{path: `/audits/${item.audit?._id}/evidence`, query: {evidence: item._id}}">
              <q-item-section><q-item-label>{{ item.title }}</q-item-label><q-item-label caption>{{ item.audit?.name }} · {{ $t(`evidenceSource_${item.sourceType}`) }}</q-item-label></q-item-section>
              <q-item-section side><q-icon name="chevron_right" /></q-item-section>
            </q-item>
            <q-item v-if="!loading && !data.evidence.length"><q-item-section>{{ $t('dashboardNoEvidence') }}</q-item-section></q-item>
          </q-list>
        </q-card>
      </div>
      <div class="col-12 col-lg-5">
        <q-card v-if="canReadTasks" flat bordered class="q-mb-md">
          <q-card-section class="text-h6">{{ $t('dashboardMyTasks') }}</q-card-section>
          <q-list separator>
            <q-item v-for="task in data.tasks" :key="task._id">
              <q-item-section><q-item-label>{{ task.title }}</q-item-label>
                <q-item-label caption>{{ task.audit?.name }}<span v-if="task.dueOn"> · {{ formatDate(task.dueOn) }}</span></q-item-label>
              </q-item-section>
              <q-item-section side>
                <q-select :model-value="task.status" dense borderless emit-value map-options :options="taskStatusOptions"
                  :aria-label="$t('dashboardTaskStatus')" :loading="savingTask === task._id" :disable="!canUpdateTask"
                  @update:model-value="status => updateTask(task, status)" />
              </q-item-section>
            </q-item>
            <q-item v-if="!loading && !data.tasks.length"><q-item-section>{{ $t('dashboardNoTasks') }}</q-item-section></q-item>
          </q-list>
        </q-card>
        <q-card v-if="canReadLicenses" flat bordered class="q-mb-md">
          <q-card-section class="row items-center"><div class="text-h6">{{ $t('dashboardLicenses') }}</div><q-space />
            <q-btn flat color="primary" :label="$t('licensesTitle')" :to="{path: '/tools', query: {tab: 'licenses'}}" /></q-card-section>
          <q-list separator>
            <q-item v-for="license in data.licenses" :key="license._id" clickable :to="{path: '/tools', query: {tab: 'licenses'}}">
              <q-item-section><q-item-label>{{ license.tool?.name }} · {{ license.label }}</q-item-label>
                <q-item-label caption>{{ license.renewalOwner?.username || $t('dashboardNoOwner') }}</q-item-label></q-item-section>
              <q-item-section side><q-badge :color="isExpired(license.expiresOn) ? 'negative' : 'warning'" :text-color="isExpired(license.expiresOn) ? 'white' : 'dark'">{{ formatDate(license.expiresOn) }}</q-badge></q-item-section>
            </q-item>
            <q-item v-if="!loading && !data.licenses.length"><q-item-section>{{ $t('dashboardNoLicenses') }}</q-item-section></q-item>
          </q-list>
        </q-card>
        <q-card v-if="canReadGuides" flat bordered>
          <q-card-section class="row items-center"><div class="text-h6">{{ $t('guideCoverage') }}</div><q-space />
            <q-btn flat color="primary" :label="$t('guidesTitle')" to="/guides" /></q-card-section>
          <q-card-section class="row justify-between">
            <div>{{ $t('guideCoverage_pending') }}: {{ data.coverage.pending }}</div>
            <div>{{ $t('guideCoverage_tested') }}: {{ data.coverage.tested }}</div>
            <div>{{ $t('guideCoverage_na') }}: {{ data.coverage.na }}</div>
          </q-card-section>
        </q-card>
      </div>
    </div>
    <q-dialog v-model="taskDialog"><q-card style="width: 600px; max-width: 95vw"><q-form @submit.prevent="saveTask">
      <q-card-section class="text-h6">{{ $t('dashboardAddTask') }}</q-card-section>
      <q-card-section class="row q-col-gutter-sm">
        <q-select class="col-12" v-model="taskForm.audit" outlined emit-value map-options :options="auditOptions" :label="$t('audits')" :rules="[v => !!v || $t('msg.fieldRequired')]" />
        <q-select class="col-12" v-model="taskForm.assignee" outlined emit-value map-options :options="assigneeOptions" :label="$t('dashboardAssignee')" :rules="[v => !!v || $t('msg.fieldRequired')]" />
        <q-input class="col-12" v-model="taskForm.title" outlined :label="$t('title')" :rules="[v => !!v || $t('msg.fieldRequired')]" />
        <q-input class="col-12" v-model="taskForm.description" outlined type="textarea" autogrow :label="$t('description')" />
        <q-input class="col-12" v-model="taskForm.dueOn" outlined type="date" stack-label :label="$t('dashboardDueOn')" />
      </q-card-section>
      <q-card-actions align="right"><q-btn flat :label="$t('btn.cancel')" v-close-popup /><q-btn type="submit" color="primary" :label="$t('btn.save')" :loading="saving" /></q-card-actions>
    </q-form></q-card></q-dialog>
  </q-page>
</template>

<script>
import DashboardService from '@/services/dashboard'
import AuditService from '@/services/audit'
import UserService from '@/services/user'
import { $t } from '@/boot/i18n'

const empty = () => ({stats: {activeAudits: 0, auditsInReview: 0, findingsForReview: 0, myTasks: 0, pendingEvidence: 0},
  audits: [], tasks: [], evidence: [], licenses: [], coverage: {pending: 0, tested: 0, na: 0}})
export default {
  data: () => ({data: empty(), audits: [], loading: false, error: '', taskDialog: false, saving: false, savingTask: null,
    taskForm: {audit: null, assignee: null, title: '', description: '', dueOn: ''}}),
  computed: {
    canReadEvidence() { return UserService.isAllowed('evidence:read') },
    canReadTasks() { return UserService.isAllowed('tasks:read') },
    canUpdateTask() { return UserService.isAllowed('tasks:update') },
    canCreateTask() { return UserService.isAllowed('tasks:create') && UserService.isAllowed('audits:update') },
    canReadLicenses() { return UserService.isAllowed('licenses:read') },
    canReadGuides() { return UserService.isAllowed('guides:read') },
    metrics() { const s = this.data.stats; return [
      {label: $t('dashboardActiveAudits'), value: s.activeAudits}, {label: $t('dashboardReviewAudits'), value: s.auditsInReview},
      {label: $t('dashboardReviewFindings'), value: s.findingsForReview}, {label: $t('dashboardMyTasks'), value: s.myTasks},
      {label: $t('dashboardPendingEvidence'), value: s.pendingEvidence}
    ] },
    auditOptions() { return this.audits.filter(a => a.state !== 'APPROVED' &&
      (UserService.isAllowed('audits:update-all') || a.creator?._id === UserService.user.id ||
        a.collaborators?.some(u => u._id === UserService.user.id)))
      .map(a => ({label: a.name, value: a._id})) },
    assigneeOptions() { const audit = this.audits.find(a => a._id === this.taskForm.audit); if (!audit) return []
      const users = [audit.creator, ...(audit.collaborators || []), ...(audit.reviewers || [])].filter(Boolean)
      return [...new Map(users.map(u => [u._id, {label: u.username, value: u._id}])).values()] },
    taskStatusOptions() { return ['todo', 'doing', 'done'].map(value => ({value, label: $t(`dashboardTask_${value}`)})) }
  },
  mounted() { this.load() },
  watch: {'taskForm.audit'() { this.taskForm.assignee = null }},
  methods: {
    formatDate(value) { if (!value) return ''; const date = new Date(value); return isNaN(date.getTime()) ? value : date.toLocaleDateString() },
    isExpired(value) { return value && value.slice(0, 10) < new Date().toISOString().slice(0, 10) },
    async load() {
      this.loading = true; this.error = ''
      try {
        this.data = (await DashboardService.get()).data.datas
        if (this.canCreateTask) this.audits = (await AuditService.getAudits()).data.datas || []
      } catch (err) { this.error = err.response?.data?.datas || err.message }
      finally { this.loading = false }
    },
    openTask() { this.taskForm = {audit: null, assignee: null, title: '', description: '', dueOn: ''}; this.taskDialog = true },
    async saveTask() {
      this.saving = true
      try { await DashboardService.createTask(this.taskForm.audit, this.taskForm); this.taskDialog = false; await this.load() }
      catch (err) { this.error = err.response?.data?.datas || err.message }
      finally { this.saving = false }
    },
    async updateTask(task, status) {
      this.savingTask = task._id
      try { await DashboardService.updateTaskStatus(task.audit._id, task._id, status); await this.load() }
      catch (err) { this.error = err.response?.data?.datas || err.message }
      finally { this.savingTask = null }
    }
  }
}
</script>
