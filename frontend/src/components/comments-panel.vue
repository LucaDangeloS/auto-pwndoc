<template>
  <div class="comments-panel">
    <div class="row items-center q-mb-sm">
      <div class="text-subtitle2">{{ $t('comments') }}</div>
      <q-space />
      <q-toggle v-model="showResolved" :label="$t('commentsShowResolved')" dense size="sm" />
    </div>

    <div v-if="visibleComments.length === 0" class="text-caption text-grey-6 q-py-sm">
      {{ $t('commentsEmpty') }}
    </div>

    <q-card v-for="comment in visibleComments" :key="comment._id" flat bordered class="q-mb-sm" :class="{ 'comment-resolved': comment.resolved }">
      <q-card-section class="q-pa-sm">
        <div class="row items-center no-wrap">
          <q-chip dense size="sm" color="primary" text-color="white" class="q-mr-xs">{{ fieldLabel(comment.fieldName) }}</q-chip>
          <span class="text-caption text-weight-medium">{{ authorName(comment.author) }}</span>
          <q-space />
          <span class="text-caption text-grey-6">{{ formatDate(comment.createdAt) }}</span>
        </div>
        <div class="q-mt-xs comment-text">{{ comment.text }}</div>

        <!-- Replies -->
        <div v-for="reply in comment.replies" :key="reply._id" class="reply-block q-mt-sm q-pl-sm">
          <div class="row items-center no-wrap">
            <span class="text-caption text-weight-medium">{{ authorName(reply.author) }}</span>
            <q-space />
            <span class="text-caption text-grey-6">{{ formatDate(reply.createdAt) }}</span>
          </div>
          <div class="comment-text">{{ reply.text }}</div>
        </div>

        <!-- Reply input -->
        <div v-if="canUpdate && replyingTo === comment._id" class="q-mt-sm">
          <q-input v-model="replyText" dense outlined autofocus type="textarea" autogrow :placeholder="$t('commentsReplyPlaceholder')" @keyup.ctrl.enter="submitReply(comment)" />
          <div class="row justify-end q-gutter-xs q-mt-xs">
            <q-btn flat dense no-caps size="sm" :label="$t('btn.cancel')" @click="replyingTo = null; replyText = ''" />
            <q-btn unelevated dense no-caps size="sm" color="secondary" :label="$t('commentsReply')" :disable="!replyText.trim()" @click="submitReply(comment)" />
          </div>
        </div>

        <div class="row items-center q-gutter-xs q-mt-xs">
          <q-btn v-if="canUpdate && replyingTo !== comment._id" flat dense no-caps size="sm" icon="reply" :label="$t('commentsReply')" @click="replyingTo = comment._id; replyText = ''" />
          <q-btn v-if="canUpdate" flat dense no-caps size="sm" :icon="comment.resolved ? 'unpublished' : 'check_circle'" :label="comment.resolved ? $t('commentsReopen') : $t('commentsResolve')" @click="toggleResolved(comment)" />
          <q-space />
          <q-btn v-if="canDelete" flat dense round size="sm" icon="delete" color="negative" @click="removeComment(comment)" />
        </div>
      </q-card-section>
    </q-card>

    <!-- New comment -->
    <q-card v-if="canCreate" flat bordered class="q-mt-sm">
      <q-card-section class="q-pa-sm">
        <q-select v-if="fieldOptions.length > 1" v-model="newFieldName" :options="fieldOptions" emit-value map-options dense outlined :label="$t('commentsField')" class="q-mb-xs" />
        <q-input v-model="newText" dense outlined type="textarea" autogrow :placeholder="$t('commentsAddPlaceholder')" @keyup.ctrl.enter="submitComment" />
        <div class="row justify-end q-mt-xs">
          <q-btn unelevated dense no-caps size="sm" color="secondary" icon="add_comment" :label="$t('commentsAdd')" :disable="!newText.trim() || !newFieldName" @click="submitComment" />
        </div>
      </q-card-section>
    </q-card>
  </div>
</template>

<script>
import { Notify } from 'quasar';
import AuditService from '@/services/audit';
import UserService from '@/services/user';
import { $t } from '@/boot/i18n';

export default {
  name: 'CommentsPanel',
  props: {
    auditId: { type: String, required: true },
    // Either findingId or sectionId identifies the target thread scope
    findingId: { type: String, default: null },
    sectionId: { type: String, default: null },
    comments: { type: Array, default: () => [] },
    // [{ value: 'description', label: 'Description' }, ...]
    fieldOptions: { type: Array, default: () => [] },
  },
  emits: ['refresh'],
  data() {
    return {
      showResolved: false,
      newText: '',
      newFieldName: this.fieldOptions.length ? this.fieldOptions[0].value : 'general',
      replyingTo: null,
      replyText: '',
    };
  },
  computed: {
    currentUserId() {
      return UserService.user && UserService.user.id;
    },
    canCreate() { return UserService.isAllowed('audits:comments:create'); },
    canUpdate() { return UserService.isAllowed('audits:comments:update'); },
    canDelete() { return UserService.isAllowed('audits:comments:delete'); },
    scopeComments() {
      return (this.comments || []).filter(c => {
        if (this.findingId) return String(c.findingId) === String(this.findingId);
        if (this.sectionId) return String(c.sectionId) === String(this.sectionId);
        return false;
      });
    },
    visibleComments() {
      return this.scopeComments.filter(c => this.showResolved || !c.resolved);
    },
  },
  watch: {
    fieldOptions(val) {
      if (val.length && !val.find(o => o.value === this.newFieldName)) this.newFieldName = val[0].value;
    },
  },
  methods: {
    authorName(author) {
      if (!author) return '';
      if (typeof author === 'string') return author;
      const name = [author.firstname, author.lastname].filter(Boolean).join(' ');
      return name || author.username || '';
    },
    fieldLabel(value) {
      const opt = this.fieldOptions.find(o => o.value === value);
      return opt ? opt.label : value;
    },
    formatDate(value) {
      if (!value) return '';
      const d = new Date(value);
      return Number.isNaN(d.getTime()) ? '' : `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    },
    _notifyError(err) {
      Notify.create({ message: err.response?.data?.datas || err.message, color: 'negative', textColor: 'white', position: 'top-right' });
    },
    submitComment() {
      if (!this.newText.trim()) return;
      const payload = { fieldName: this.newFieldName, text: this.newText.trim() };
      if (this.findingId) payload.findingId = this.findingId;
      else if (this.sectionId) payload.sectionId = this.sectionId;
      AuditService.createComment(this.auditId, payload)
        .then(() => { this.newText = ''; this.$emit('refresh'); })
        .catch(this._notifyError);
    },
    submitReply(comment) {
      if (!this.replyText.trim()) return;
      const replies = (comment.replies || []).map(r => ({ author: (r.author && r.author._id) || r.author, text: r.text }));
      replies.push({ author: this.currentUserId, text: this.replyText.trim() });
      AuditService.updateComment(this.auditId, comment._id, { replies })
        .then(() => { this.replyingTo = null; this.replyText = ''; this.$emit('refresh'); })
        .catch(this._notifyError);
    },
    toggleResolved(comment) {
      AuditService.updateComment(this.auditId, comment._id, { resolved: !comment.resolved })
        .then(() => this.$emit('refresh'))
        .catch(this._notifyError);
    },
    removeComment(comment) {
      AuditService.deleteComment(this.auditId, comment._id)
        .then(() => this.$emit('refresh'))
        .catch(this._notifyError);
    },
  },
};
</script>

<style scoped>
.comment-text {
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 0.9em;
}
.comment-resolved {
  opacity: 0.6;
}
.reply-block {
  border-left: 2px solid var(--q-primary);
}
</style>
