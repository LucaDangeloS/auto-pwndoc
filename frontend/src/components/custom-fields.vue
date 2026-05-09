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
                    </template>
                    <template v-slot:control>
                        <div class="full-width">
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
                                            <div class="text-body2">{{ row.label }}</div>
                                            <div v-if="row.taxonomy && (row.taxonomy.type || row.taxonomy.category || row.taxonomy.subcategory)" class="text-caption text-grey-6">
                                                {{ [row.taxonomy.type, row.taxonomy.category, row.taxonomy.subcategory].filter(Boolean).join(' › ') }}
                                            </div>
                                        </td>
                                        <td>
                                            <span v-if="row.code" class="text-caption text-mono">{{ row.code }}</span>
                                            <span v-else class="text-grey-5">—</span>
                                        </td>
                                        <td class="text-center">
                                            <q-btn-toggle
                                                v-model="row.status"
                                                @update:model-value="eventPropagation"
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
                                                @update:model-value="eventPropagation"
                                                :readonly="readonly"
                                                dense outlined
                                                :placeholder="$t('addNote')"
                                            />
                                        </td>
                                    </tr>
                                    <tr v-if="!Array.isArray(field.text) || field.text.length === 0">
                                        <td colspan="4" class="text-grey-6 text-italic q-pa-sm">{{ $t('msg.checklistEmpty') }}</td>
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
      BasicEditor
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
    color: rgba(0,0,0,0.6);
    text-transform: uppercase;
    letter-spacing: 0.4px;
}
.text-mono {
    font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
}
</style>