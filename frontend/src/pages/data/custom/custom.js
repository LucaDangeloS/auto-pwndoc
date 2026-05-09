import { Dialog, Notify, uid } from 'quasar';
import draggable from 'vuedraggable'
import BasicEditor from 'components/editor';
import CustomFields from 'components/custom-fields'

import DataService from '@/services/data'
import Utils from '@/services/utils'
import UserService from '@/services/user'
import TemplateService from '@/services/template'

import { $t } from '@/boot/i18n'

export default {

    props: {
        // 'custom' (default) shows only Custom Fields + Custom Sections
        // 'vulnerabilities' shows Languages, Vuln Types, Vuln Categories
        // 'audits' shows Audit Types
        section: {
            type: String,
            default: 'custom'
        }
    },

    data: () => {
        return {
            UserService: UserService,
            Utils: Utils,
            templates: [],

            languages: [],
            newLanguage: {locale: "", language: ""},
            editLanguages: [],
            editLanguage: false,

            auditTypes: [],
            newAuditType: {name: "", templates: [], sections: [], hidden: []},
            editAuditTypes: [],
            editAuditType: false,

            customFields: [ ],
            newCustomField: {
                label: "", 
                fieldType: "", 
                display: "general", 
                displaySub: "", 
                size: 12,
                offset: 0,
                required: false,
                description: '',
                text: [],
                options: []
            },
            cfLocale: "",
            cfDisplayOptions: [
                {label: $t('auditGeneral'), value: 'general'},
                {label: $t('auditFinding'), value: 'finding'},
                {label: $t('auditSection'), value: 'section'},
                {label: $t('vulnerability'), value: 'vulnerability'}
            ],
            cfComponentOptions: [
                {label: $t('checkbox'), value: 'checkbox', icon: 'check_box'},
                {label: $t('checklist'), value: 'checklist', icon: 'checklist'},
                {label: $t('date'), value: 'date', icon: 'event'},
                {label: $t('editor'), value: 'text', icon: 'mdi-format-pilcrow'},
                {label: $t('input'), value: 'input', icon: 'title'},
                {label: $t('radio'), value: 'radio', icon: 'radio_button_checked'},
                {label: $t('select'), value: 'select', icon: 'far fa-caret-square-down'},
                {label: $t('selectMultiple'), value: 'select-multiple', icon: 'filter_none'},
                {label: $t('space'), value: 'space', icon: 'space_bar'}
            ],
            newCustomOption: "",

            sections: [],
            newSection: {field: "", name: "", icon: ""},
            editSections: [],
            editSection: false,

            errors: {locale: '', language: '', auditType: '', vulnType: '', vulnCat: '', vulnCatField: '', sectionField: '', sectionName: '', fieldLabel: '', fieldType: ''},

            selectedTab: "languages",

            // Checklist generate-from-taxonomy dialog
            checklistDialog: { open: false, target: null, type: '', includeCategories: true, includeSubcategories: true },
            taxonomyTypes: []
        }
    },

    components: {
        BasicEditor,
        CustomFields,
        draggable
    },

    mounted: function() {
        // Set default tab based on which section this instance is displaying
        if (this.section === 'vulnerabilities') this.selectedTab = 'languages';
        else if (this.section === 'audits') this.selectedTab = 'audit-types';
        else this.selectedTab = 'custom-fields';

        this.getTemplates()
        this.getLanguages()
        this.getAuditTypes()
        this.getTaxonomyTypes()
        this.getSections()
        this.getCustomFields()
    },

    computed: {
        newCustomFieldLangOptions() {
            return this.newCustomField.options.filter(e => e.locale === this.cfLocale)
        }
    },

    methods: {
        getTemplates: function() {
            TemplateService.getTemplates()
            .then((data) => {
                this.templates = data.data.datas;
            })
            .catch((err) => {
                console.log(err)
            })
        },

        requiredFieldsEmpty: function() {
            Object.keys(this.$refs).forEach(key => {
                if (key.startsWith('validate') && this.$refs[key]) {
                    if (Array.isArray(this.$refs[key]))
                        this.$refs[key].forEach(e => e.validate())
                    else
                        this.$refs[key].validate()
                }
            })
            if (this.selectedTab === 'languages')
                return !this.newLanguage.language || !this.newLanguage.locale
            if (this.selectedTab === 'audit-types') 
                return !this.newAuditType.name || this.newAuditType.templates.length !== this.languages.length || this.newAuditType.templates.some(e => !e)
        },

/* ===== LANGUAGES ===== */

        // Get available languages
        getLanguages: function() {
            DataService.getLanguages()
            .then((data) => {
                this.languages = data.data.datas;
                if (this.languages.length > 0) {
                    this.newVulnType.locale = this.languages[0].locale;
                    this.cfLocale = this.languages[0].locale;
                }
            })
            .catch((err) => {
                console.log(err)
            })
        },

        // Create Language
        createLanguage: function() {
            if (this.requiredFieldsEmpty())
                return;

            DataService.createLanguage(this.newLanguage)
            .then((data) => {
                this.newLanguage.locale = "";
                this.newLanguage.language = "";
                this.getLanguages();
                Notify.create({
                    message: 'Language created successfully',
                    color: 'positive',
                    textColor:'white',
                    position: 'top-right'
                })
            })
            .catch((err) => {
                Notify.create({
                    message: err.response.data.datas,
                    color: 'negative',
                    textColor: 'white',
                    position: 'top-right'
                })
            })
        },

        // Update Languages
        updateLanguages: function() {
           const cleanedLanguages = this.editLanguages.map(l => {
               const { _uniqueId, ...rest } = l;
               return rest;
           });
           DataService.updateLanguages(cleanedLanguages)
           .then((data) => {
               this.getLanguages()
               this.editLanguage = false
               Notify.create({
                   message: 'Languages updated successfully',
                   color: 'positive',
                   textColor:'white',
                   position: 'top-right'
               })
           })
           .catch((err) => {
               Notify.create({
                   message: err.response.data.datas,
                   color: 'negative',
                   textColor: 'white',
                   position: 'top-right'
               })
           })
       },

       startEditingLanguages() {
           this.editLanguages = this.$_.cloneDeep(this.languages).map(lang => ({
               ...lang,
               _uniqueId: uid()
           }));
           this.editLanguage = true;
       },

       // Remove Language
        removeLanguage: function(locale) {
            this.editLanguages = this.editLanguages.filter(e => e.locale !== locale)
        },

/* ===== AUDIT TYPES ===== */

        // Get available audit types
        getAuditTypes: function() {
            DataService.getAuditTypes()
            .then((data) => {
                this.auditTypes = data.data.datas;
            })
            .catch((err) => {
                console.log(err)
            })
        },

        // Create Audit type
        createAuditType: function() {
            if (this.requiredFieldsEmpty())
                return

            DataService.createAuditType(this.newAuditType)
            .then((data) => {
                this.newAuditType.name = "";
                this.newAuditType.templates = [];
                this.newAuditType.sections = [];
                this.newAuditType.hidden = [];
                this.getAuditTypes();
                Notify.create({
                    message: 'Audit type created successfully',
                    color: 'positive',
                    textColor:'white',
                    position: 'top-right'
                })
            })
            .catch((err) => {
                Notify.create({
                    message: err.response.data.datas,
                    color: 'negative',
                    textColor: 'white',
                    position: 'top-right'
                })
            })
        },

        // Update Audit Types
        updateAuditTypes: function() {
            const cleanedAuditTypes = this.editAuditTypes.map(at => {
                const { _uniqueId, ...rest } = at;
                return rest;
            });
            DataService.updateAuditTypes(cleanedAuditTypes)
            .then((data) => {
                this.getAuditTypes()
                this.editAuditType = false
                Notify.create({
                    message: 'Audit Types updated successfully',
                    color: 'positive',
                    textColor:'white',
                    position: 'top-right'
                })
            })
            .catch((err) => {
                Notify.create({
                    message: err.response.data.datas,
                    color: 'negative',
                    textColor: 'white',
                    position: 'top-right'
                })
            })
        },

        startEditingAuditTypes() {
            this.editAuditTypes = this.$_.cloneDeep(this.auditTypes).map(at => ({
                ...at,
                _uniqueId: uid()
            }));
            this.editAuditType = true;
        },

        // Remove Audit Type
        removeAuditType: function(auditType) {
            this.editAuditTypes = this.editAuditTypes.filter(e => e.name !== auditType.name)
        },

        getTemplateOptionsLanguage: function(locale) {
            var result = []
            this.templates.forEach(e => result.push({name: e.name, locale: locale, template: e._id}))
            return result
        },

/* ===== TAXONOMY TYPES (used to scope custom fields by display=finding/vulnerability) ===== */

        // Loads unique `type` values from the new VulnerabilityTaxonomy collection.
        // Used by the custom-field create form when display='finding' or
        // display='vulnerability' to scope the field to a particular taxonomy type.
        getTaxonomyTypes: function() {
            DataService.getVulnerabilityTaxonomy()
            .then((data) => {
                var rows = data.data.datas || [];
                this.taxonomyTypes = Array.from(new Set(rows.map(r => r.type))).filter(Boolean).sort();
            })
            .catch((err) => {
                console.log(err)
            })
        },

/* ===== CUSTOM FIELDS ===== */
getFieldValue(field) {
    const localeEntry = field.text.find((e) => e.locale === this.cfLocale);
    if (!localeEntry) {
      // If no entry for the language, create a new one
      const newEntry = { locale: this.cfLocale, value: field.fieldType === 'checkbox' || field.fieldType === 'select-multiple' ? [] : '' };
      field.text.push(newEntry);
      return newEntry.value;
    }
    return localeEntry.value;
  },

  // Update the field value according to the selected language
  setFieldValue(field, newValue) {
    const localeEntry = field.text.find((e) => e.locale === this.cfLocale);
    if (localeEntry) {
      localeEntry.value = newValue;
    } else {
      // Safety: normally unnecessary since getFieldValue already handles this
      field.text.push({ locale: this.cfLocale, value: newValue });
    }
  },

  // Options pour les checkbox/radio/select
  getOptionsGroup(options) {
    return options.filter((e) => e.locale === this.cfLocale).map((e) => ({ label: e.value, value: e.value }));
  },

/* ===== CHECKLIST SEED HELPERS =====
 * The checklist field type stores its rows in field.text[locale].value as
 * an array of {label, code, taxonomy, status, note}. The admin edits the
 * seed as text — one row per line — using either:
 *   Label
 *   Label | Type > Category > Subcategory [CODE]
 *   Type > Category > Subcategory [CODE]   (label derived from path)
 * Lines beginning with # are comments.
 */
  parseChecklistText(text) {
    var lines = String(text || '').split(/\r?\n/);
    var rows = [];
    lines.forEach((raw) => {
      var line = raw.trim();
      if (!line || line.startsWith('#')) return;

      // Optional trailing [CODE]
      var code = '';
      var codeMatch = line.match(/\s*\[([^\]]+)\]\s*$/);
      if (codeMatch) {
        code = codeMatch[1].trim();
        line = line.slice(0, codeMatch.index).trim();
      }

      var label = '';
      var taxonomy = { type: '', category: '', subcategory: '' };
      var pipeIdx = line.indexOf('|');
      if (pipeIdx >= 0) {
        label = line.slice(0, pipeIdx).trim();
        var taxStr = line.slice(pipeIdx + 1).trim();
        var parts = taxStr.split('>').map((p) => p.trim());
        taxonomy.type = parts[0] || '';
        taxonomy.category = parts[1] || '';
        taxonomy.subcategory = parts[2] || '';
      } else if (line.indexOf('>') >= 0) {
        var parts2 = line.split('>').map((p) => p.trim());
        taxonomy.type = parts2[0] || '';
        taxonomy.category = parts2[1] || '';
        taxonomy.subcategory = parts2[2] || '';
        label = parts2.filter(Boolean).slice(1).join(' / ') || taxonomy.type;
      } else {
        label = line;
      }

      if (!label) return;
      rows.push({ label, code, taxonomy, status: 'untested', note: '' });
    });
    return rows;
  },

  serializeChecklistRows(rows) {
    if (!Array.isArray(rows)) return '';
    return rows.map((r) => {
      var line = r.label || '';
      var t = r.taxonomy || {};
      var taxParts = [t.type, t.category, t.subcategory].filter(Boolean);
      if (taxParts.length > 0) line += ' | ' + taxParts.join(' > ');
      if (r.code) line += ' [' + r.code + ']';
      return line;
    }).join('\n');
  },

  getChecklistText(field) {
    var entry = field.text && field.text.find((e) => e.locale === this.cfLocale);
    if (!entry) {
      var fresh = { locale: this.cfLocale, value: [] };
      field.text = field.text || [];
      field.text.push(fresh);
      return '';
    }
    return this.serializeChecklistRows(entry.value);
  },

  setChecklistText(field, text) {
    var rows = this.parseChecklistText(text);
    var entry = field.text && field.text.find((e) => e.locale === this.cfLocale);
    if (entry) entry.value = rows;
    else {
      field.text = field.text || [];
      field.text.push({ locale: this.cfLocale, value: rows });
    }
  },

  openGenerateChecklistDialog(field) {
    DataService.getVulnerabilityTaxonomy()
      .then((res) => {
        var rows = res.data.datas || [];
        this.taxonomyTypes = Array.from(new Set(rows.map((r) => r.type))).filter(Boolean).sort();
        this.checklistDialog = {
          open: true,
          target: field,
          type: this.taxonomyTypes[0] || '',
          includeCategories: true,
          includeSubcategories: true
        };
      })
      .catch((err) => Notify.create({ message: err?.response?.data?.datas || err?.message || 'Failed to load taxonomy', color: 'negative', textColor: 'white', position: 'top-right' }));
  },

  applyGenerateChecklist() {
    var d = this.checklistDialog;
    if (!d.type || !d.target) return;
    DataService.generateChecklistFromTaxonomy({
      type: d.type,
      includeCategories: d.includeCategories,
      includeSubcategories: d.includeSubcategories
    })
      .then((res) => {
        var rows = res.data.datas || [];
        var entry = d.target.text && d.target.text.find((e) => e.locale === this.cfLocale);
        if (entry) entry.value = rows;
        else {
          d.target.text = d.target.text || [];
          d.target.text.push({ locale: this.cfLocale, value: rows });
        }
        this.checklistDialog.open = false;
        Notify.create({ message: $t('msg.checklistGenerated', { count: rows.length }), color: 'positive', textColor: 'white', position: 'top-right' });
      })
      .catch((err) => Notify.create({ message: err?.response?.data?.datas || err?.message || 'Generation failed', color: 'negative', textColor: 'white', position: 'top-right' }));
  },
        // Get available custom fields
        getCustomFields: function() {
            DataService.getCustomFields()
              .then((data) => {
                this.customFields = data.data.datas
                console.log(this.customFields);

              })
              .catch((err) => console.error(err));
          },
          

        // Create custom field
        createCustomField: function() {
            if (this.newCustomField.fieldType !== 'space') {
                this.$refs['select-component'].validate()
                this.$refs['input-label'].validate()

                if (this.$refs['select-component'].hasError || this.$refs['input-label'].hasError)
                    return
            }

            this.newCustomField.position = this.customFields.length
            DataService.createCustomField(this.newCustomField)
            .then((data) => {
                this.newCustomField.label = ""
                this.newCustomField.options = []
                this.getCustomFields()
                Notify.create({
                    message: 'Custom Field created successfully',
                    color: 'positive',
                    textColor:'white',
                    position: 'top-right'
                })
            })
            .catch((err) => {
                Notify.create({
                    message: err.response.data.datas,
                    color: 'negative',
                    textColor: 'white',
                    position: 'top-right'
                })
            })
        },

        // Update Custom Fields
        updateCustomFields: function() {
            var position = 0
            this.customFields.forEach(e => e.position = position++)
            DataService.updateCustomFields(this.customFields)
            .then((data) => {
                this.getCustomFields()
                Notify.create({
                    message: 'Custom Fields updated successfully',
                    color: 'positive',
                    textColor:'white',
                    position: 'top-right'
                })
            })
            .catch((err) => {
                Notify.create({
                    message: err.response.data.datas,
                    color: 'negative',
                    textColor: 'white',
                    position: 'top-right'
                })
            })
        },

         // Delete custom field
         deleteCustomField: function(customField) {
            Dialog.create({
                title: 'Confirm Suppression',
                message: `
                <div class="row">
                    <div class="col-md-2">
                        <i class="material-icons text-warning" style="font-size:42px">warning</i>
                    </div>
                    <div class="col-md-10">
                        Custom Field <strong>${customField.label}</strong> will be permanently deleted.<br>
                        This field will be removed from <strong>ALL</strong> Vulnerablities and associated data
                        will be permanently <strong>LOST</strong>!
                    </div>
                </div>
                `,
                ok: {label: $t('btn.confirm'), color: 'negative'},
                cancel: {label: $t('btn.cancel'), color: 'white'},
                html: true,
                style: "width: 600px"
            })
            .onOk(() => {
                DataService.deleteCustomField(customField._id)
                .then((data) => {
                    this.getCustomFields()
                    Notify.create({
                        message: `
                        Custom Field <strong>${customField.label}</strong> deleted successfully.<br>
                        <strong>${data.data.datas.vulnCount}</strong> Vulnerabilities were affected.`,
                        color: 'positive',
                        textColor:'white',
                        position: 'top-right',
                        html: true
                    })
                })
                .catch((err) => {
                    console.log(err)
                    Notify.create({
                        message: err.response.data.datas.msg || err.response.data.datas,
                        color: 'negative',
                        textColor: 'white',
                        position: 'top-right'
                    })
                })
            })
        },

        canDisplayCustomField: function(field) {
            return (
                (this.newCustomField.display === field.display || (this.newCustomField.display === 'finding' && field.display === 'vulnerability')) && 
                (this.newCustomField.displaySub === field.displaySub || field.displaySub === '')
            )
        },

        canDisplayCustomFields: function() {
            return this.customFields.some(field => this.canDisplayCustomField(field))
        },

        // Return the index of the text array that match the selected locale
        // Also push default empty value if index not found
        getFieldLocaleText: function(fieldIdx) {
            var text = this.customFields[fieldIdx].text
            for (var i=0; i<text.length; i++) {
                if (text[i].locale === this.cfLocale)
                    return i
            }
            if (['select-multiple', 'checkbox'].includes(this.customFields[fieldIdx].fieldType))
                text.push({locale: this.cfLocale, value: []})
            else
                text.push({locale: this.cfLocale, value: ""})
            return i
        },

        addCustomFieldOption: function(options) {
            options.push({locale: this.cfLocale, value: this.newCustomOption})
            this.newCustomOption = ""
        },

        removeCustomFieldOption: function(options, option) {
            var index = options.findIndex(e => e.locale === option.locale && e.value === option.value)
            options.splice(index, 1)
        },

        getOptionsGroup: function(options) {
            return options
            .filter(e => e.locale === this.cfLocale)
            .map(e => {return {label: e.value, value: e.value}})
        },

        getFieldLangOptions: function(options) {
            return options.filter(e => e.locale === this.cfLocale)
        },

/* ===== SECTIONS ===== */

        // Get available sections
        getSections: function() {
            DataService.getSections()
            .then((data) => {
                this.sections = data.data.datas;
            })
            .catch((err) => {
                console.log(err)
            })
        },

        // Create section
        createSection: function() {
            this.cleanErrors();
            if (!this.newSection.field)
                this.errors.sectionField = "Field required";
            if (!this.newSection.name)
                this.errors.sectionName = "Name required";
            
            if (this.errors.sectionName || this.errors.sectionField)
                return;

            DataService.createSection(this.newSection)
            .then((data) => {
                this.newSection.field = "";
                this.newSection.name = "";
                this.newSection.icon = ""
                this.getSections();
                Notify.create({
                    message: 'Section created successfully',
                    color: 'positive',
                    textColor:'white',
                    position: 'top-right'
                })
            })
            .catch((err) => {
                Notify.create({
                    message: err.response.data.datas,
                    color: 'negative',
                    textColor: 'white',
                    position: 'top-right'
                })
            })
        },

         // Update Sections
         updateSections: function() {
            Utils.syncEditors(this.$refs)
            DataService.updateSections(this.editSections)
            .then((data) => {
                this.sections = this.editSections
                this.editSection = false
                Notify.create({
                    message: 'Sections updated successfully',
                    color: 'positive',
                    textColor:'white',
                    position: 'top-right'
                })
            })
            .catch((err) => {
                Notify.create({
                    message: err.response.data.datas,
                    color: 'negative',
                    textColor: 'white',
                    position: 'top-right'
                })
            })
        },

        // Remove section
        removeSection: function(index) {
            this.editSections.splice(index, 1)
        },

        cleanErrors: function() {
            this.errors.locale = ''
            this.errors.language = ''
            this.errors.auditType = ''
            this.errors.vulnType = ''
            this.errors.vulnCat = ''
            this.errors.fieldLabel = ''
            this.errors.fieldType = ''
            this.errors.sectionField = ''
            this.errors.sectionName = ''
        }
    }
}