<template>
<div>
    <component :is="customElement" v-for="(computedField,idx) of computedFields" :key="idx">
        <div class="row q-col-gutter-md">
            <div v-for="(field,idx2) of computedField" :key="idx2" :class="`col-12 col-md-${field.customField.size||12} offset-md-${field.customField.offset||0}`">
                <q-field 
                :ref="`field-${idx}-${idx2}`"
                v-if="field.customField.fieldType === 'text'" 
                label-slot 
                stack-label 
                borderless
                :class="(isTextInCustomFields(field))?'bg-diffbackground':null"
                class="basic-editor"
                :hint="field.customField.description"
                hide-bottom-space
                :rules="(field.customField.required)? [val => !!val || 'Field is required']: []"
                lazy-rules="ondemand"
                :modelValue="field.text"
                >
                    <template v-slot:control>
                        <basic-editor 
                        v-if="diff"
                        v-model="field.text"
                        v-on:editorchange="eventPropagation"
                        :idUnique="field.customField._id+'-custom-'+idUnique"
                        :diff="getTextDiffInCustomFields(field)"
                        :editable=false
                        :collab="collab"
                        /> 
                        <basic-editor 
                        v-else
                        :idUnique="field.customField._id+'-custom-'+idUnique"
                        v-on:editorchange="eventPropagation"
                        ref="basiceditor_custom" 
                        v-model="field.text" 
                        :noSync="noSyncEditor"
                        :editable="!readonly"
                        :collab="collab"
                        /> 
                    </template>

                    <template v-slot:label>
                        {{field.customField.label}} <span v-if="field.customField.required" class="text-red">*</span>
                        <template-hint v-if="showTemplateHints" :template-var="customFieldTemplateVar(field)" class="q-ml-xs" />
                    </template>
                </q-field>

                <q-input
                :ref="`field-${idx}-${idx2}`"
                v-if="field.customField.fieldType === 'input'"
                :label='field.customField.label'
                stack-label
                v-model="field.text"
                :readonly="readonly"
                :bg-color="(isTextInCustomFields(field))?'diffbackground':null"
                :hint="field.customField.description"
                hide-bottom-space
                :rules="(field.customField.required)? [val => !!val || 'Field is required']: []"
                lazy-rules="ondemand"
                outlined
                >
                    <template v-slot:label>
                        {{field.customField.label}} <span v-if="field.customField.required" class="text-red">*</span>
                        <template-hint v-if="showTemplateHints" :template-var="customFieldTemplateVar(field)" class="q-ml-xs" />
                    </template>
                </q-input>

                <q-input
                :ref="`field-${idx}-${idx2}`"
                v-if="field.customField.fieldType === 'date'"
                :label='field.customField.label'
                stack-label
                v-model="field.text"
                :readonly="readonly"
                :bg-color="(isTextInCustomFields(field))?'diffbackground':null"
                :hint="field.customField.description"
                hide-bottom-space
                :rules="(field.customField.required)? [val => !!val || 'Field is required']: []"
                lazy-rules="ondemand"
                outlined
                >
                    <template v-slot:append>
                        <q-icon name="event" class="cursor-pointer">
                        <q-popup-proxy ref="qDateProxyField" transition-show="scale" transition-hide="scale">
                            <q-date :readonly="readonly" first-day-of-week="1" mask="YYYY-MM-DD" v-model="field.text" @update:modelValue="$refs.qDateProxyField.forEach(e => e.hide())" />
                        </q-popup-proxy>
                        </q-icon>
                    </template>
                    <template v-slot:label>
                        {{field.customField.label}} <span v-if="field.customField.required" class="text-red">*</span>
                        <template-hint v-if="showTemplateHints" :template-var="customFieldTemplateVar(field)" class="q-ml-xs" />
                    </template>
                </q-input>

                <q-select
                :ref="`field-${idx}-${idx2}`"
                v-if="field.customField.fieldType === 'select'"
                :label="field.customField.label"
                stack-label
                v-model="field.text"
                :options="field.customField.options.filter(e => e.locale === locale)"
                option-value="value"
                option-label="value"
                emit-value
                clearable
                options-sanitize
                outlined 
                :readonly="readonly"
                :bg-color="(isTextInCustomFields(field))?'diffbackground':null"
                :hint="field.customField.description"
                hide-bottom-space
                :rules="(field.customField.required)? [val => !!val || 'Field is required']: []"
                lazy-rules="ondemand"
                >
                     <template v-slot:label>
                        {{field.customField.label}} <span v-if="field.customField.required" class="text-red">*</span>
                        <template-hint v-if="showTemplateHints" :template-var="customFieldTemplateVar(field)" class="q-ml-xs" />
                    </template>
                </q-select>

                <q-select
                :ref="`field-${idx}-${idx2}`"
                v-if="field.customField.fieldType === 'select-multiple'"
                :label="field.customField.label"
                stack-label
                v-model="field.text"
                :options="field.customField.options.filter(e => e.locale === locale)"
                option-value="value"
                option-label="value"
                emit-value
                multiple
                use-chips
                clearable
                options-sanitize
                outlined 
                :readonly="readonly"
                :bg-color="(isTextInCustomFields(field))?'diffbackground':null"
                :hint="field.customField.description"
                hide-bottom-space
                :rules="(field.customField.required)? [val => !!val || 'Field is required', val => val && val.length > 0 || 'Field is required']: []"
                lazy-rules="ondemand"
                >
                     <template v-slot:label>
                        {{field.customField.label}} <span v-if="field.customField.required" class="text-red">*</span>
                        <template-hint v-if="showTemplateHints" :template-var="customFieldTemplateVar(field)" class="q-ml-xs" />
                    </template>
                     <template v-slot:selected-item="scope">
                        <q-chip
                        dense
                        removable
                        @remove="scope.removeAtIndex(scope.index)"
                        :tabindex="scope.tabindex"
                        color="blue-grey-5"
                        text-color="white"
                        :disable="readonly"
                        >
                            {{scope.opt}}
                        </q-chip>
                    </template>
                </q-select>

                <q-field
                :ref="`field-${idx}-${idx2}`"
                v-if="field.customField.fieldType === 'checkbox'"
                :label="field.customField.label"
                stack-label
                :modelValue="field.text"
                :hint="field.description"
                hide-bottom-space
                outlined
                :readonly="readonly"
                :bg-color="(isTextInCustomFields(field))?'diffbackground':null"
                :rules="(field.customField.required)? [val => !!val || 'Field is required', val => val && val.length > 0 || 'Field is required']: []"
                lazy-rules="ondemand"
                >
                    <template v-slot:control>
                        <q-option-group
                        type="checkbox"
                        v-model="field.text"
                        :options="getOptionsGroup(field.customField.options)"
                        :disable="readonly"
                        />
                    </template>
                    <template v-slot:label>
                        {{field.customField.label}} <span v-if="field.customField.required" class="text-red">*</span>
                        <template-hint v-if="showTemplateHints" :template-var="customFieldTemplateVar(field)" class="q-ml-xs" />
                    </template>
                </q-field>

                
                <q-field
                :ref="`field-${idx}-${idx2}`"
                v-if="field.customField.fieldType === 'radio'"
                :label="field.customField.label"
                stack-label
                :modelValue="field.text"
                :hint="field.description"
                hide-bottom-space
                outlined
                :readonly="readonly"
                :bg-color="(isTextInCustomFields(field))?'diffbackground':null"
                :rules="(field.customField.required)? [val => !!val || 'Field is required']: []"
                lazy-rules="ondemand"
                >
                    <template v-slot:control>
                        <q-option-group
                        type="radio"
                        v-model="field.text"
                        :options="getOptionsGroup(field.customField.options)"
                        :disable="readonly"
                        />
                    </template>
                    <template v-slot:label>
                        {{field.customField.label}} <span v-if="field.customField.required" class="text-red">*</span>
                        <template-hint v-if="showTemplateHints" :template-var="customFieldTemplateVar(field)" class="q-ml-xs" />
                    </template>
                </q-field>

                <q-field
                :ref="`field-${idx}-${idx2}`"
                v-if="field.customField.fieldType === 'checklist'"
                label-slot
                stack-label
                borderless
                :hint="field.customField.description"
                hide-bottom-space
                >
                    <template v-slot:label>
                        {{ field.customField.label }} <span v-if="field.customField.required" class="text-red">*</span>
                        <template-hint v-if="showTemplateHints" :template-var="customFieldTemplateVar(field)" class="q-ml-xs" />
                    </template>
                    <template v-slot:control>
                        <div class="custom-field-checklist full-width">
                            <table class="checklist-table full-width">
                                <thead>
                                    <tr>
                                        <th class="text-left">{{ $t('item') }}</th>
                                        <th class="text-left" style="width: 90px">{{ $t('code') }}</th>
                                        <th class="text-center" style="width: 240px">{{ $t('status') }}</th>
                                        <th class="text-left">{{ $t('note') }}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr v-for="(row, rIdx) in (Array.isArray(field.text) ? field.text : [])" :key="rIdx">
                                        <td>
                                            <div class="row items-start no-wrap">
                                                <q-icon :name="row.auto ? 'auto_mode' : 'edit_note'" :color="row.auto ? 'info' : 'grey'" size="sm" class="q-mr-sm q-mt-xs">
                                                    <q-tooltip>{{ row.auto ? $t('checklistAutoManaged') : $t('checklistManualManaged') }}</q-tooltip>
                                                </q-icon>
                                                <div>
                                                    <div class="text-body2 text-weight-medium">{{ row.label }}</div>
                                                    <q-badge v-if="row.auto" color="info" text-color="white" :label="$t('checklistAutoBadge')" class="q-mt-xs" />
                                                </div>
                                            </div>
                                            <div v-if="row.taxonomy && (row.taxonomy.type || row.taxonomy.category || row.taxonomy.subcategory)" class="checklist-table__meta text-caption">
                                                {{ [row.taxonomy.type, row.taxonomy.category, row.taxonomy.subcategory].filter(Boolean).join(' › ') }}
                                            </div>
                                        </td>
                                        <td>
                                            <span v-if="row.code" class="text-caption text-mono">{{ row.code }}</span>
                                            <span v-else class="checklist-table__empty">—</span>
                                        </td>
                                        <td class="text-center">
                                            <q-btn-toggle
                                                v-model="row.status"
                                                @update:model-value="value => setChecklistStatus(row, value)"
                                                :disable="readonly"
                                                :options="checklistStatusOptions"
                                                size="sm"
                                                spread no-caps
                                                toggle-color="primary"
                                            />
                                        </td>
                                        <td>
                                            <q-input
                                                v-model="row.note"
                                                @update:model-value="() => { row.auto = false; eventPropagation(); }"
                                                :readonly="readonly"
                                                dense outlined
                                                :placeholder="$t('addNote')"
                                            />
                                        </td>
                                    </tr>
                                    <tr v-if="!Array.isArray(field.text) || field.text.length === 0">
                                        <td colspan="4" class="checklist-table__empty text-italic q-pa-sm">{{ $t('msg.checklistEmpty') }}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </template>
                </q-field>
            </div>
        </div>
    </component>
</div>
</template>

<script>
import { defineComponent } from 'vue';

import BasicEditor from 'components/editor';
import TemplateHint from 'components/template-hint';

export default defineComponent({
  emits: ['editorchange'],
  name: 'custom-fields',

  props: {
      modelValue: Array,
      customElement: {
          type: String,
          default: 'div'
      },
      noSyncEditor: {
          type: Boolean,
          default: false
      },
      diff: {
          type: Array,
          default: null
      },
      readonly: {
          type: Boolean,
          default: false
      },
      locale: {
          type: String,
          default: ''
      },
      collab: {
          type: Boolean,
          default: true
      },
      idUnique: {
          type: String,
          default: ''
      },
      showTemplateHints: {
          type: Boolean,
          default: false
      },
      templateScope: {
          type: String,
          default: ''
      }
  },

  data: function() {
      return {
          checklistStatusOptions: [
              { label: this.$t('untested'), value: 'untested' },
              { label: this.$t('pass'),     value: 'pass',  color: 'positive' },
              { label: this.$t('fail'),     value: 'fail',  color: 'negative' },
              { label: this.$t('na'),       value: 'na',    color: 'grey-7' }
          ]
      }
  },

  components: {
      BasicEditor,
      TemplateHint
  },

  computed: {
       computedFields: function() {
          var result = []
          var tmpArray = []
          this.modelValue.forEach(e => {
              if (e.customField.fieldType === 'space' && e.customField.size === 12) { // full size space creates an empty component as separator
                  result.push(tmpArray)
                  result.push([])
                  tmpArray = []
              }
              else {
                  tmpArray.push(e)
              }
          })
          if (tmpArray.length > 0)
              result.push(tmpArray)
          return result
      }
  },

  methods: {
      isTextInCustomFields: function(field) {
          if (this.diff) {
              return typeof this.diff.find(f => {
                  return f.customField._id === field.customField._id && this.$_.isEqual(f.text, field.text)
              }) === 'undefined'
          }
          return false
      },
      eventPropagation: function(){
          this.$emit('editorchange')
      },
      getTextDiffInCustomFields: function(field) {
          var result = ''
          if (this.diff) {
              this.diff.find(f => {
                  if (f.customField._id === field.customField._id)
                      result = f.text
              })
          }
          return result
      },

      validate: function() {
          Object.keys(this.$refs).forEach(key => key.startsWith('field') && this.$refs[key][0].validate())
      },

      requiredFieldsEmpty: function() {
          this.validate()
          return this.modelValue.some(e => e.customField.fieldType !== 'space' && e.customField.required && (!e.text || e.text.length === 0));
      },

      getOptionsGroup: function(options) {
          return options
          .filter(e => e.locale === this.locale)
          .map(e => {return {label: e.value, value: e.value}})
      },

      setChecklistStatus: function(row, value) {
          row.status = value
          row.auto = false
          this.eventPropagation()
      },

      normalizeTemplateKey: function(label) {
          const key = (label || '')
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase()
          .replace(/\s/g, '')
          return this.templateScope ? key.replace(/[^\w]/g, '_') : key
      },

      customFieldTemplateVar: function(field) {
          const key = this.normalizeTemplateKey(field && field.customField && field.customField.label)
          const prefix = this.templateScope ? `${this.templateScope}.` : ''
          const filter = field && field.customField && field.customField.fieldType === 'text' ? ' | convertHTML' : ''
          return `${prefix}${key}${filter}`
      }
  },
});
</script>

<style>
.checklist-table {
    border-collapse: collapse;
}
.checklist-table th,
.checklist-table td {
    border-bottom: 1px solid rgba(0,0,0,0.08);
    padding: 6px 8px;
    vertical-align: middle;
}
.checklist-table thead th {
    font-weight: 500;
    font-size: 12px;
    color: rgba(0,0,0,0.68);
    text-transform: uppercase;
    letter-spacing: 0.4px;
}
.custom-field-checklist {
    color: rgba(0,0,0,0.87);
}
.checklist-table__meta,
.checklist-table__empty {
    color: rgba(0,0,0,0.56);
}
.body--dark .custom-field-checklist {
    color: rgba(255,255,255,0.88);
}
.body--dark .checklist-table th,
.body--dark .checklist-table td {
    border-bottom-color: rgba(255,255,255,0.14);
}
.body--dark .checklist-table thead th,
.body--dark .checklist-table__meta,
.body--dark .checklist-table__empty {
    color: rgba(255,255,255,0.64);
}
.text-mono {
    font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
}
</style>
