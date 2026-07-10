<template>
  <div class="draft-diff">
    <div class="row items-center q-gutter-sm q-mb-md">
      <span class="text-body2 text-grey-8">{{ $t('draftDiffView') }}</span>
      <q-btn-toggle
        v-model="splitView"
        no-caps
        dense
        unelevated
        class="view-toggle"
        :options="[
          { label: $t('draftDiffInline'), value: false, icon: 'view_list' },
          { label: $t('draftDiffSideBySide'), value: true, icon: 'view_column' }
        ]"
      />
    </div>

    <div
      v-for="field in diffFields"
      :key="field.key"
      class="draft-field"
    >
      <!-- Inline (unified) view -->
      <template v-if="!splitView">
        <div class="diff-block">
          <div class="diff-block__header">@@ {{ field.label }} @@</div>
          <div class="diff-block__body">
            <div
              v-for="(chunk, i) in field.chunks"
              :key="i"
              class="diff-line"
              :class="{
                'diff-line--removed': chunk.removed,
                'diff-line--added': chunk.added,
                'diff-line--context': !chunk.removed && !chunk.added
              }"
            >
              <span class="diff-line__glyph">{{ chunk.removed ? '-' : chunk.added ? '+' : ' ' }}</span>
              <span class="diff-line__content" v-html="chunk.lineHtml"></span>
            </div>
          </div>
        </div>
      </template>

      <!-- Side-by-side view -->
      <template v-else>
        <div class="draft-field__label">{{ field.label }}</div>
        <div class="row q-col-gutter-md">
          <div class="col-12 col-md-6">
            <div class="text-caption text-grey-7 q-mb-xs">{{ $t('draftDiffCurrent') }}</div>
            <div class="draft-preview" v-html="field.currentHtml"></div>
          </div>
          <div class="col-12 col-md-6">
            <div class="text-caption text-grey-7 q-mb-xs">{{ $t('draftDiffDraft') }}</div>
            <div class="draft-preview" v-html="field.draftHtml"></div>
          </div>
        </div>
      </template>
    </div>

    <div v-if="diffFields.length === 0" class="text-grey-7 q-pa-sm">
      {{ $t('draftDiffNoDifferences') }}
    </div>
  </div>
</template>

<script>
import { diffLines, diffWords } from 'diff'

// Draft snapshots only carry non-collaborative scalar/array fields (rich-text
// fields are owned by the collab editor and excluded), so this diff is purely
// text-based: no HTML/editor rendering needed.
const FIELD_ORDER = [
  'title', 'taxonomies', 'cvssv3', 'cvssv4', 'priority',
  'remediationComplexity', 'status', 'retestStatus', 'scope', 'references'
]

// Map snapshot keys to existing i18n keys; missing ones fall back to humanize().
const FIELD_I18N = {
  title: 'title',
  references: 'references',
  scope: 'scope',
  status: 'status',
  priority: 'priority',
  remediationComplexity: 'remediationComplexity',
  cvssv3: 'draftDiffCvss3',
  cvssv4: 'draftDiffCvss4',
  retestStatus: 'draftDiffRetestStatus',
  taxonomies: 'draftDiffTaxonomies'
}

function htmlEscape(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

export default {
  name: 'DraftDiff',

  props: {
    current: { type: Object, default: () => ({}) },
    draft: { type: Object, default: () => ({}) }
  },

  data: () => ({
    splitView: false
  }),

  computed: {
    diffFields() {
      const current = this.current || {}
      const draft = this.draft || {}
      const keys = Array.from(new Set([...Object.keys(current), ...Object.keys(draft)]))
        .filter(key => !this.$_.isEqual(current[key], draft[key]))
        .sort((a, b) => this.fieldOrder(a) - this.fieldOrder(b) || a.localeCompare(b))

      return keys.map(key => this.createField(key, current[key], draft[key]))
    }
  },

  methods: {
    fieldOrder(key) {
      const index = FIELD_ORDER.indexOf(key)
      return index === -1 ? FIELD_ORDER.length : index
    },

    fieldLabel(key) {
      const i18nKey = FIELD_I18N[key]
      return i18nKey ? this.$t(i18nKey) : this.humanize(key)
    },

    humanize(value) {
      return String(value || '')
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/[-_.]/g, ' ')
        .replace(/\b\w/g, char => char.toUpperCase())
    },

    isEmpty(value) {
      return value === undefined || value === null || value === '' ||
        (Array.isArray(value) && value.length === 0)
    },

    formatValue(value) {
      if (this.isEmpty(value)) return ''
      if (Array.isArray(value)) return value.map(item => this.formatScalar(item)).join('\n')
      return this.formatScalar(value)
    },

    formatScalar(value) {
      if (value === undefined || value === null || value === '') return ''
      if (typeof value === 'boolean') return value ? 'Yes' : 'No'
      if (typeof value === 'object') {
        const preferred = ['name', 'title', 'label', 'value', 'text']
          .find(k => value[k] !== undefined && value[k] !== null && value[k] !== '')
        return preferred ? String(value[preferred]) : JSON.stringify(value)
      }
      return String(value)
    },

    createField(key, currentValue, draftValue) {
      const currentText = this.formatValue(currentValue)
      const draftText = this.formatValue(draftValue)
      return {
        key,
        label: this.fieldLabel(key),
        chunks: this.computeUnifiedChunks(currentText, draftText),
        ...this.computeSplitSides(key, currentText, draftText)
      }
    },

    // GitHub-style unified diff: line-level diff, and for a removed/added pair,
    // an intra-line word diff so only the changed words are highlighted.
    computeUnifiedChunks(currentText, draftText) {
      const a = currentText.endsWith('\n') ? currentText : currentText + '\n'
      const b = draftText.endsWith('\n') ? draftText : draftText + '\n'
      const lineChanges = diffLines(a, b)
      const result = []
      let i = 0

      while (i < lineChanges.length) {
        const curr = lineChanges[i]
        if (curr.removed && i + 1 < lineChanges.length && lineChanges[i + 1].added) {
          const wordChanges = diffWords(
            curr.value.replace(/\n$/, ''),
            lineChanges[i + 1].value.replace(/\n$/, '')
          )
          this.pushIntraLines(result, wordChanges, true)
          this.pushIntraLines(result, wordChanges, false)
          i += 2
        } else {
          curr.value.replace(/\n$/, '').split('\n').forEach(line => {
            result.push({ lineHtml: htmlEscape(line), added: !!curr.added, removed: !!curr.removed })
          })
          i++
        }
      }

      return result
    },

    pushIntraLines(result, wordChanges, isRemovedSide) {
      const markCls = isRemovedSide ? 'diff-word-rem' : 'diff-word-add'
      let currentLine = ''

      wordChanges.forEach(part => {
        if (isRemovedSide ? !!part.added : !!part.removed) return
        const highlighted = isRemovedSide ? !!part.removed : !!part.added
        const segments = part.value.split('\n')
        segments.forEach((segment, idx) => {
          if (idx > 0) {
            result.push({ lineHtml: currentLine, removed: isRemovedSide, added: !isRemovedSide })
            currentLine = ''
          }
          if (segment) {
            const escaped = htmlEscape(segment)
            currentLine += highlighted ? `<mark class="${markCls}">${escaped}</mark>` : escaped
          }
        })
      })

      result.push({ lineHtml: currentLine, removed: isRemovedSide, added: !isRemovedSide })
    },

    // Side-by-side: word-level diff sharing unchanged context on both sides,
    // with removed words highlighted on the current side and added on the draft.
    computeSplitSides(key, currentText, draftText) {
      const unset = `<span class="diff-unset">${this.$t('draftDiffNotSet')}</span>`

      if (this.isEmptyText(currentText) && !this.isEmptyText(draftText)) {
        return { currentHtml: unset, draftHtml: `<mark class="diff-word-add">${htmlEscape(draftText)}</mark>` }
      }
      if (!this.isEmptyText(currentText) && this.isEmptyText(draftText)) {
        return { currentHtml: `<mark class="diff-word-rem">${htmlEscape(currentText)}</mark>`, draftHtml: unset }
      }

      const changes = diffWords(currentText, draftText)
      let currentHtml = ''
      let draftHtml = ''
      changes.forEach(part => {
        const escaped = htmlEscape(part.value)
        if (part.added) {
          draftHtml += `<mark class="diff-word-add">${escaped}</mark>`
        } else if (part.removed) {
          currentHtml += `<mark class="diff-word-rem">${escaped}</mark>`
        } else {
          currentHtml += escaped
          draftHtml += escaped
        }
      })
      return { currentHtml, draftHtml }
    },

    isEmptyText(text) {
      return text === undefined || text === null || text === ''
    }
  }
}
</script>

<style scoped>
.view-toggle {
  border: 1px solid var(--diff-block-border);
  border-radius: 6px;
  overflow: hidden;
}

.draft-diff {
  display: flex;
  flex-direction: column;
  gap: 16px;
  /* Light theme diff palette */
  --diff-block-border: #d0d7de;
  --diff-block-header-bg: #f6f8fa;
  --diff-block-header-color: #57606a;
  --diff-added-line-bg: #e6ffec;
  --diff-removed-line-bg: #ffebe9;
  --diff-context-line-bg: transparent;
  --diff-added-glyph-bg: #ccffd8;
  --diff-added-glyph-color: #1a7f37;
  --diff-removed-glyph-bg: #ffd7d5;
  --diff-removed-glyph-color: #cf222e;
  --diff-context-glyph-color: #6e7781;
  --diff-word-add-bg: #abf2bc;
  --diff-word-rem-bg: #ffc1c0;
  --diff-preview-bg: #f6f8fa;
  --diff-unset-color: #8c959f;
  --diff-fg: #1f2328;
}

/* Dark theme overrides (Quasar toggles body.body--dark) */
:global(.body--dark) .draft-diff {
  --diff-block-border: #30363d;
  --diff-block-header-bg: #161b22;
  --diff-block-header-color: #8b949e;
  --diff-added-line-bg: rgba(46, 160, 67, 0.18);
  --diff-removed-line-bg: rgba(248, 81, 73, 0.18);
  --diff-context-line-bg: transparent;
  --diff-added-glyph-bg: rgba(46, 160, 67, 0.38);
  --diff-added-glyph-color: #3fb950;
  --diff-removed-glyph-bg: rgba(248, 81, 73, 0.38);
  --diff-removed-glyph-color: #f85149;
  --diff-context-glyph-color: #8b949e;
  --diff-word-add-bg: rgba(46, 160, 67, 0.4);
  --diff-word-rem-bg: rgba(248, 81, 73, 0.4);
  --diff-preview-bg: rgba(255, 255, 255, 0.04);
  --diff-unset-color: #8b949e;
  --diff-fg: #e6edf3;
}

.draft-field {
  margin: 0;
}

.draft-field__label {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 6px;
}

/* ---- Inline (unified) view ---- */
.diff-block {
  border: 1px solid var(--diff-block-border);
  border-radius: 6px;
  overflow: hidden;
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  font-size: 12px;
}

.diff-block__header {
  background: var(--diff-block-header-bg);
  border-bottom: 1px solid var(--diff-block-border);
  padding: 4px 10px;
  color: var(--diff-block-header-color);
}

.diff-line {
  display: flex;
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.5;
  min-height: 20px;
  background: var(--diff-context-line-bg);
}

.diff-line--removed { background: var(--diff-removed-line-bg); }
.diff-line--added { background: var(--diff-added-line-bg); }

.diff-line__glyph {
  min-width: 22px;
  padding: 1px 6px;
  text-align: center;
  user-select: none;
  flex-shrink: 0;
  border-right: 1px solid var(--diff-block-border);
  font-weight: bold;
  color: var(--diff-context-glyph-color);
}

.diff-line--removed .diff-line__glyph { color: var(--diff-removed-glyph-color); background: var(--diff-removed-glyph-bg); }
.diff-line--added .diff-line__glyph { color: var(--diff-added-glyph-color); background: var(--diff-added-glyph-bg); }

.diff-line__content {
  flex: 1;
  padding: 1px 8px;
  overflow-wrap: anywhere;
  color: var(--diff-fg);
}

.diff-line__content :deep(mark.diff-word-rem) {
  background: var(--diff-word-rem-bg);
  color: inherit;
  border-radius: 2px;
  padding: 0 1px;
}

.diff-line__content :deep(mark.diff-word-add) {
  background: var(--diff-word-add-bg);
  color: inherit;
  border-radius: 2px;
  padding: 0 1px;
}

/* ---- Side-by-side view ---- */
.draft-preview {
  min-height: 42px;
  max-height: 240px;
  overflow: auto;
  border: 1px solid var(--diff-block-border);
  border-radius: 4px;
  padding: 8px;
  background: var(--diff-preview-bg);
  color: var(--diff-fg);
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 13px;
  line-height: 1.5;
}

.draft-preview :deep(mark.diff-word-rem) {
  background: var(--diff-word-rem-bg);
  color: inherit;
  border-radius: 2px;
  padding: 0 1px;
}

.draft-preview :deep(mark.diff-word-add) {
  background: var(--diff-word-add-bg);
  color: inherit;
  border-radius: 2px;
  padding: 0 1px;
}

.draft-preview :deep(.diff-unset) {
  color: var(--diff-unset-color);
  font-style: italic;
}
</style>
