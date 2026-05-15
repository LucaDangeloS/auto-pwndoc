import { Dialog, Notify } from 'quasar';

import BasicEditor from 'components/editor';
import Breadcrumb from 'components/breadcrumb'
import CvssCalculatorUnified from 'components/cvss-calculator-unified'
import TextareaArray from 'components/textarea-array'
import CustomFields from 'components/custom-fields'
import TaxonomyPicker from 'components/taxonomy-picker'

import VulnerabilityService from '@/services/vulnerability'
import DataService from '@/services/data'
import UserService from '@/services/user'
import Utils from '@/services/utils'

import { $t } from 'boot/i18n'

export default {
    data: () => {
        return {
            UserService: UserService,
            // Vulnerabilities list
            vulnerabilities: [],
            currentDetailsIndex:0,
            // Loading state
            loading: true,
            languagesLoading: true,
            rows:[],
            // Datatable headers
            dtHeaders: [
                { name: 'title', label: $t('title'), field: 'title', align: 'left', sortable: true },
                { name: 'type', label: $t('type'), field: 'type', align: 'left', sortable: true },
                { name: 'category', label: $t('category'), field: 'category', align: 'left', sortable: true },
                { name: 'updatedAt', label: $t('lastUpdated'), field: 'updatedAt', align: 'left', sortable: true },
                { name: 'action', label: '', field: 'action', align: 'left', sortable: false },
            ],
            // Datatable pagination
            pagination: {
                page: 1,
                rowsPerPage: 25,
                sortBy: 'title'
            },
            rowsPerPageOptions: [
                {label:'25', value:25},
                {label:'50', value:50},
                {label:'100', value:100},
                {label:'All', value:0}
            ],
            filteredRowsCount: 0,
            // Vulnerabilities languages
            languages: [],
            locale: '',
            // Search filter
            search: {title: '', type: '', category: '', updatedAt: '', valid: 0, new: 1, updates: 2},
            // Errors messages
            errors: {title: ''},
            // Selected or New Vulnerability
            currentVulnerability: {
                cvssv3: '',
                cvssv4: '',
                priority: '',
                remediationComplexity: '',
                taxonomies: [],
                details: []
            },
            currentLanguage: "",
            displayFilters: {valid: true, new: true, updates: true},
            dtLanguage: "",
            currentDetailsIndex: 0,
            vulnerabilityId: '',
            vulnUpdates: [],
            currentUpdate: '',
            currentUpdateLocale: '',
            vulnTypes: [],
            // Merge languages
            mergeLanguageLeft: '',
            mergeLanguageRight: '',
            mergeVulnLeft: '',
            mergeVulnRight: '',
            showMappedInMerge: false,
            translationGroups: [],
            relationCandidateLocale: '',
            relationCandidateVuln: '',
            showMappedRelationCandidates: false,
            translatingRelated: false,
            matchingDialog: false,
            matchingScope: 'unmapped',
            matchingThreshold: 0.35,
            matchingStatus: {runId: null, inProgress: false, total: 0, processed: 0, proposals: []},
            selectedMatchingProposals: [],
            matchingPoll: null,
            // Vulnerability categories
            vulnCategories: [],
            currentCategory: null,
            // Custom Fields
            customFields: []
        }
    },

    components: {
        BasicEditor,
        Breadcrumb,
        CvssCalculatorUnified,
        TextareaArray,
        CustomFields,
        TaxonomyPicker
    },

    mounted: function() {
        this.getLanguages()
        this.getVulnTypes()
        this.getVulnerabilities()
        this.getTranslationGroups()
        this.getVulnerabilityCategories()
        this.getCustomFields()
        if (this.$route.query.matching === '1') {
            this.openMatchingDialog();
        }
    },

    beforeUnmount: function() {
        if (this.matchingPoll) clearInterval(this.matchingPoll);
    },

    watch: {
        currentLanguage: function(val, oldVal) {
            this.setCurrentDetails();
            if (this.relationCandidateLocale === val || !this.relationLanguageOptions.some(lang => lang.locale === this.relationCandidateLocale)) {
                this.relationCandidateLocale = this.relationLanguageOptions[0]?.locale || '';
                this.relationCandidateVuln = '';
            }
        }
    },

    computed: {
        lenCurrentTitle: function() {
            return this.currentVulnerability.details[this.currentDetailsIndex].title.length
        },
        vulnTypesLang: function() {
            // Taxonomy is locale-agnostic in the new model; the filter is
            // a no-op kept for callsite compatibility.
            return this.vulnTypes;
        },
        vulnAiContext: function() {
            const detail = this.currentVulnerability.details[this.currentDetailsIndex] || {};
            return {
                findingTitle: detail.title || '',
                locale: this.currentLanguage || ''
            };
        },

        computedVulnerabilities() {
            if (!this.dtLanguage) return [];
            let filtered = this.vulnerabilities.filter(vuln =>
                vuln.details.some(detail => detail.locale === this.dtLanguage && detail.title)
            );
            return filtered;
        },
        filteredVulnerabilitiesLeft() {
            if (!this.mergeLanguageLeft) return [];
            return this.vulnerabilities.filter(
              (vuln) => vuln && vuln.details && this.getVulnTitleLocale(vuln, this.mergeLanguageLeft) && (this.showMappedInMerge || !this.isVulnerabilityMapped(vuln._id))
            );
          },
          filteredVulnerabilitiesRight() {
            if (!this.mergeLanguageRight) return [];
            return this.vulnerabilities.filter(
              (vuln) => vuln && vuln.details && this.getVulnTitleLocale(vuln, this.mergeLanguageRight) && (this.showMappedInMerge || !this.isVulnerabilityMapped(vuln._id))
            );
          },
        currentTranslationGroup: function() {
            if (!this.vulnerabilityId) return null;
            return this.translationGroups.find(group => (group.members || []).some(member => this.memberVulnId(member) === this.vulnerabilityId)) || null;
        },
        currentTranslationMembers: function() {
            return this.currentTranslationGroup ? (this.currentTranslationGroup.members || []).filter(member => member.locale !== this.currentLanguage) : [];
        },
        relationLanguageOptions: function() {
            return this.languages.filter(lang => lang.locale !== this.currentLanguage);
        },
        relationCandidates: function() {
            if (!this.relationCandidateLocale) return [];
            return this.vulnerabilities.filter(vuln => {
                if (vuln._id === this.vulnerabilityId) return false;
                if (!this.getVulnTitleLocale(vuln, this.relationCandidateLocale)) return false;
                if (!this.showMappedRelationCandidates && this.isVulnerabilityMapped(vuln._id)) return false;
                return true;
            });
        },
        vulnCategoriesOptions: function() {
            return this.$_.uniq(this.vulnerabilities.map(vuln => this.getDtCategory(vuln)).filter(Boolean)).sort()
        },

        vulnTypeOptions: function() {
            return this.$_.uniq(this.vulnerabilities.map(vuln => this.getDtType(vuln)).filter(Boolean)).sort()
        }
    },

    methods: {
        // Get available languages
        getLanguages: function() {
            DataService.getLanguages()
            .then((data) => {
                this.languages = data.data.datas;
                if (this.languages.length > 0) {
                    this.dtLanguage = this.languages[0].locale;
                    this.cleanCurrentVulnerability();
                }
            })
            .catch((err) => {
                console.log(err)
            })
            .finally(() => {
                this.languagesLoading = false;
            })
        },

         // Get available custom fields
         getCustomFields: function() {
            DataService.getCustomFields()
            .then((data) => {
                this.customFields = this.$_.cloneDeep(data.data.datas)
            })
            .catch((err) => {
                console.log(err)
            })
        },

        // Get Vulnerabilities types — Phase 3: source from VulnerabilityTaxonomy
        // (locale-agnostic). The shape `[{name, locale}]` is preserved so the
        // existing vulnTypesLang filter and select bindings keep working;
        // locale is set to the audit's current language so the no-op filter
        // matches every entry.
        getVulnTypes: function() {
            DataService.getVulnerabilityTaxonomy()
            .then((data) => {
                var rows = data.data.datas || [];
                var unique = Array.from(new Set(rows.map(r => r.type))).filter(Boolean).sort();
                var locale = this.currentLanguage || this.dtLanguage || '';
                this.vulnTypes = unique.map(t => ({ name: t, locale }));
            })
            .catch((err) => {
                console.log(err)
            })
        },

        // Get available vulnerability "categories" — Phase 3: same source
        // (taxonomy types). Shape preserved as [{name}] so existing markup
        // (`category.name`, `vulnCategoriesOptions`) keeps working.
        getVulnerabilityCategories: function() {
            DataService.getVulnerabilityTaxonomy()
            .then((data) => {
                var rows = data.data.datas || [];
                var unique = Array.from(new Set(rows.map(r => r.type))).filter(Boolean).sort();
                this.vulnCategories = unique.map(t => ({ name: t }));
            })
            .catch((err) => {
                console.log(err)
            })
        },

        getVulnerabilities: function() {
            this.loading = true
            VulnerabilityService.getVulnerabilities()
            .then((data) => {
                this.vulnerabilities = data.data.datas
                this.loading = false
            })
            .catch((err) => {
                console.log(err)
                Notify.create({
                    message: err.response.data.datas,
                    color: 'negative',
                    textColor: 'white',
                    position: 'top-right'
                })
            })
        },

        getTranslationGroups: function() {
            VulnerabilityService.getTranslationGroups()
            .then((data) => {
                this.translationGroups = data.data.datas || [];
            })
            .catch((err) => {
                console.log(err)
            })
        },

        createVulnerability: function() {
            this.cleanErrors();
            var index = this.currentVulnerability.details.findIndex(obj => obj.title !== '');
            if (index < 0)
                this.errors.title = $t('err.titleRequired');
            
            if (this.errors.title)
                return;

            VulnerabilityService.createVulnerabilities([this.currentVulnerability])
            .then(() => {
                this.getVulnerabilities();
                this.$refs.createModal.hide();
                Notify.create({
                    message: $t('msg.vulnerabilityCreatedOk'),
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

        updateVulnerability: function() {
            this.cleanErrors();

            var index = this.currentVulnerability.details.findIndex(obj => obj.title !== '');
            if (index < 0)
                this.errors.title = $t('err.titleRequired');
            
            if (this.errors.title)
                return;
              
            VulnerabilityService.updateVulnerability(this.vulnerabilityId, this.currentVulnerability)
            .then(() => {
                this.getVulnerabilities();
                this.getTranslationGroups();
                this.$refs.editModal.hide();
                this.$refs.updatesModal.hide();
                Notify.create({
                    message: $t('msg.vulnerabilityUpdatedOk'),
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

        acceptUpdate: function(update) {
            if (update.cvssv3 !== undefined) this.currentVulnerability.cvssv3 = update.cvssv3;
            if (update.cvssv4 !== undefined) this.currentVulnerability.cvssv4 = update.cvssv4;
            if (update.priority !== undefined) this.currentVulnerability.priority = update.priority;
            if (update.remediationComplexity !== undefined) this.currentVulnerability.remediationComplexity = update.remediationComplexity;
            if (update.category !== undefined) this.currentVulnerability.category = update.category;

            var index = this.currentVulnerability.details.findIndex(obj => obj.locale === update.locale);
            if (index < 0) {
                this.currentVulnerability.details.push({
                    locale: update.locale,
                    title: update.title,
                    vulnType: update.vulnType,
                    description: update.description,
                    observation: update.observation,
                    remediation: update.remediation,
                    references: update.references,
                    customFields: update.customFields
                });
            } else {
                if (update.title !== undefined) this.currentVulnerability.details[index].title = update.title;
                if (update.vulnType !== undefined) this.currentVulnerability.details[index].vulnType = update.vulnType;
                if (update.description !== undefined) this.currentVulnerability.details[index].description = update.description;
                if (update.observation !== undefined) this.currentVulnerability.details[index].observation = update.observation;
                if (update.remediation !== undefined) this.currentVulnerability.details[index].remediation = update.remediation;
                if (update.references !== undefined) this.currentVulnerability.details[index].references = update.references;
                if (update.customFields !== undefined) this.currentVulnerability.details[index].customFields = update.customFields;
            }

            this.updateVulnerability();
        },

        deleteVulnerability: function(vulnerabilityId) {
            VulnerabilityService.deleteVulnerability(vulnerabilityId)
            .then(() => {
                this.getVulnerabilities();
                Notify.create({
                    message: $t('msg.vulnerabilityDeletedOk'),
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

        confirmDeleteVulnerability: function(row) {
            Dialog.create({
                title: $t('msg.confirmSuppression'),
                message: $t('msg.vulnerabilityWillBeDeleted'),
                ok: {label: $t('btn.confirm'), color: 'negative'},
                cancel: {label: $t('btn.cancel'), color: 'white'}
            })
            .onOk(() => this.deleteVulnerability(row._id))
        },

        getVulnUpdates: function(vulnId) {
            VulnerabilityService.getVulnUpdates(vulnId)
            .then((data) => {
                this.vulnUpdates = data.data.datas;
                this.vulnUpdates.forEach(vuln => {
                    vuln.customFields = Utils.filterCustomFields('vulnerability', this.currentVulnerability.category, this.customFields, vuln.customFields, vuln.locale)
                })
                if (this.vulnUpdates.length > 0) {
                    // Sort by modification date (newest first)
                    this.vulnUpdates.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
                    this.currentUpdate = this.vulnUpdates[0]._id || null;
                    this.currentLanguage = this.vulnUpdates[0].locale || null;
                }
            })
            .catch((err) => {
                console.log(err)
            })
        },

        clone: function(row) {
            this.cleanCurrentVulnerability();
            this.currentVulnerability = this.$_.cloneDeep(row)
            this.setCurrentDetails();
            
            this.vulnerabilityId = row._id;
            this.relationCandidateLocale = this.languages.find(l => l.locale !== this.currentLanguage)?.locale || '';
            this.relationCandidateVuln = '';
            if (this.UserService.isAllowed('vulnerabilities:update'))
                this.getVulnUpdates(this.vulnerabilityId);
        },

        editChangeCategory: function(category) {
            Dialog.create({
                title: $t('msg.confirmCategoryChange'),
                message: $t('msg.categoryChangingNotice'),
                ok: {label: $t('btn.confirm'), color: 'negative'},
                cancel: {label: $t('btn.cancel'), color: 'white'}
            })
            .onOk(() => {
                if (category){
                    this.currentVulnerability.category = category.name
                }
                else {
                    this.currentVulnerability.category = null
                }
                this.setCurrentDetails()
            })
        },

        cleanErrors: function() {
            this.errors.title = '';
        },  

        cleanCurrentVulnerability: function() {
            this.cleanErrors();
            this.currentVulnerability.cvssv3 = '';
            this.currentVulnerability.cvssv4 = '';
            this.currentVulnerability.priority = '';
            this.currentVulnerability.remediationComplexity = '';
            this.currentVulnerability.details = [];
            this.currentLanguage = this.dtLanguage;
            // Phase 3: seed `taxonomies[]` from the legacy "Add to <category>"
            // dropdown so existing UX still primes the picker. Backend's
            // syncVulnTaxonomy keeps both sides consistent on save.
            if (this.currentCategory && this.currentCategory.name) {
                this.currentVulnerability.category = this.currentCategory.name;
                this.currentVulnerability.taxonomies = [{
                    type: this.currentCategory.name,
                    category: '',
                    subcategory: '',
                    code: ''
                }];
            } else {
                this.currentVulnerability.category = null;
                this.currentVulnerability.taxonomies = [];
            }

            this.setCurrentDetails();
        },

        // Create detail if locale doesn't exist else set the currentDetailIndex
        setCurrentDetails: function(value) {
            var index = this.currentVulnerability.details.findIndex(obj => obj.locale === this.currentLanguage);
            if (index < 0) {
                var details = {
                    locale: this.currentLanguage,
                    title: '',
                    vulnType: '',
                    updatedAt: '',
                    description: '',
                    observation: '',
                    remediation: '',
                    references: [],
                    customFields: []
                }
         
                details.customFields = this.$_.cloneDeep(Utils.filterCustomFields('vulnerability', this.currentVulnerability.category, this.customFields, [], this.currentLanguage))
                console.log( details.customFields,'vulnerability', this.currentVulnerability.category, this.customFields, [], this.currentLanguage)
                this.currentVulnerability.details.push(details,)
                index = this.currentVulnerability.details.length - 1;
            }
            else {
                this.currentVulnerability.details[index].customFields = this.$_.cloneDeep(Utils.filterCustomFields('vulnerability', this.currentVulnerability.category, this.customFields, this.currentVulnerability.details[index].customFields, this.currentLanguage))
            }
            this.currentDetailsIndex = index;
     
     
        },

        isTextInCustomFields: function(field) {

            if (this.currentVulnerability.details[this.currentDetailsIndex].customFields) {
                return typeof this.currentVulnerability.details[this.currentDetailsIndex].customFields.find(f => {
                    return f.customField === field.customField._id && f.text === field.text
                }) === 'undefined'
            }
            return false
        },

        getTextDiffInCustomFields: function(field) {
            var result = ''
            if (this.currentVulnerability.details[this.currentDetailsIndex].customFields) {
                this.currentVulnerability.details[this.currentDetailsIndex].customFields.find(f => {
                    if (f.customField === field.customField._id)
                        result = f.text
                })
            }
            return result
        },

        getDtTitle: function(row) {
            var index = row.details.findIndex(obj => obj.locale === this.dtLanguage);
            if (index < 0 || !row.details[index].title)
                return $t('err.notDefinedLanguage');
            else
                return row.details[index].title;         
        },

        getDtType: function(row) {
            const taxonomy = row && Array.isArray(row.taxonomies) && row.taxonomies[0];
            return (taxonomy && taxonomy.type) || row.category || '';
        },

        getDtCategory: function(row) {
            const taxonomy = row && Array.isArray(row.taxonomies) && row.taxonomies[0];
            var index = row.details.findIndex(obj => obj.locale === this.dtLanguage);
            return (taxonomy && taxonomy.category) || (index >= 0 && row.details[index].vulnType) || '';
        },

        getDtSubcategory: function(row) {
            const taxonomy = row && Array.isArray(row.taxonomies) && row.taxonomies[0];
            return (taxonomy && taxonomy.subcategory) || '';
        },

        getDtUpdatedAt: function(row) {
            if (!row.updatedAt) {
                return "Undefined";
            }

            const formattedDate = new Date(row.updatedAt).toLocaleDateString('es-CL');
            return formattedDate;
        },
        
        customSort: function(rows, sortBy, descending) {
            if (rows) {
                var data = [...rows];
        
                if (sortBy === 'type') {
                    (descending)
                        ? data.sort((a, b) => (this.getDtType(b) || '').localeCompare(this.getDtType(a) || ''))
                        : data.sort((a, b) => (this.getDtType(a) || '').localeCompare(this.getDtType(b) || ''));
                } else if (sortBy === 'title') {
                    (descending)
                        ? data.sort((a, b) => (this.getDtTitle(b) || '').localeCompare(this.getDtTitle(a) || ''))
                        : data.sort((a, b) => (this.getDtTitle(a) || '').localeCompare(this.getDtTitle(b) || ''));
                } else if (sortBy === 'updatedAt') {
                    (descending)
                        ? data.sort((a, b) => (this.getDtUpdatedAt(b) || '').localeCompare(this.getDtUpdatedAt(a) || ''))
                        : data.sort((a, b) => (this.getDtUpdatedAt(a) || '').localeCompare(this.getDtUpdatedAt(b) || ''));  
                } else if (sortBy === 'category') {
                    (descending)
                        ? data.sort((a, b) => (this.getDtCategory(b) || '').localeCompare(this.getDtCategory(a) || ''))
                        : data.sort((a, b) => (this.getDtCategory(a) || '').localeCompare(this.getDtCategory(b) || ''));
                }
        
                return data;
            }
        },

        customFilter: function(rows, terms, cols, getCellValue) {
            var result = rows && rows.filter(row => {
                var title = this.getDtTitle(row).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
                var category = this.getDtCategory(row).toLowerCase()
                var type = this.getDtType(row).toLowerCase()
                var updatedAt = this.getDtUpdatedAt(row)
                
                var termTitle = (terms.title || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
                var termCategory = (terms.category || "").toLowerCase()
                var termVulnType = (terms.type || "").toLowerCase()
                var termUpdatedAt = (terms.updatedAt || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")

                return title.indexOf(termTitle) > -1 && 
                    type.indexOf(termVulnType || "") > -1 &&
                    category.indexOf(termCategory || "") > -1 &&
                    updatedAt.indexOf(termUpdatedAt) > -1 &&
                    (row.status === terms.valid || row.status === terms.new || row.status === terms.updates);
            })
            this.filteredRowsCount = result.length;
            return result;
        },

        goToAudits: function(row) {
            var title = this.getDtTitle(row);
            this.$router.push({name: 'audits_by_find', params: {finding: title}});
        },

        getVulnTitleLocale: function(vuln, locale) {
            if (!vuln || !Array.isArray(vuln.details)) {
                return "";
            }
            for (var i = 0; i < vuln.details.length; i++) {
                if (vuln.details[i].locale === locale && vuln.details[i].title) {
                    return vuln.details[i].title;
                }
            }
            return "";
        },

        relationCandidateLabel: function(vuln) {
            const option = vuln && vuln._id ? vuln : this.vulnerabilities.find(item => item._id === vuln);
            return this.getVulnTitleLocale(option, this.relationCandidateLocale) || '-';
        },

        memberVulnId: function(member) {
            const vuln = member && member.vulnerability;
            return vuln && vuln._id ? vuln._id : (vuln || '');
        },

        isVulnerabilityMapped: function(vulnerabilityId) {
            return this.translationGroups.some(group => (group.members || []).some(member => this.memberVulnId(member) === vulnerabilityId));
        },

        languageLabel: function(locale) {
            const lang = this.languages.find(l => l.locale === locale);
            return lang ? lang.language : locale;
        },

        memberTitle: function(member) {
            const vuln = member && member.vulnerability && member.vulnerability.details ? member.vulnerability : this.vulnerabilities.find(v => v._id === this.memberVulnId(member));
            return this.getVulnTitleLocale(vuln, member.locale) || '-';
        },

        memberLastEditedLabel: function(member) {
            if (!member || !member.lastEditedAt) return '-';
            return new Date(member.lastEditedAt).toLocaleString();
        },
        

        mergeVulnerabilities: function() {
            VulnerabilityService.relateTranslation(this.mergeVulnLeft, {
                baseLocale: this.mergeLanguageLeft,
                targetVulnId: this.mergeVulnRight,
                targetLocale: this.mergeLanguageRight
            })
            .then(() => {
                this.getVulnerabilities();
                this.getTranslationGroups();
                this.mergeVulnLeft = '';
                this.mergeVulnRight = '';
                Notify.create({
                    message: $t('msg.vulnerabilityRelationOk'),
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

        relateSelectedVulnerability: function() {
            if (!this.relationCandidateVuln || !this.relationCandidateLocale) return;
            VulnerabilityService.relateTranslation(this.vulnerabilityId, {
                baseLocale: this.currentLanguage,
                targetVulnId: this.relationCandidateVuln,
                targetLocale: this.relationCandidateLocale
            })
            .then(() => {
                this.getTranslationGroups();
                this.relationCandidateVuln = '';
                Notify.create({message: $t('msg.vulnerabilityRelationOk'), color: 'positive', textColor:'white', position: 'top-right'})
            })
            .catch(err => Notify.create({message: err.response.data.datas, color: 'negative', textColor: 'white', position: 'top-right'}))
        },

        unrelateVulnerability: function(member) {
            VulnerabilityService.unrelateTranslation(this.vulnerabilityId, this.memberVulnId(member))
            .then(() => {
                this.getTranslationGroups();
                Notify.create({message: $t('msg.vulnerabilityUnrelatedOk'), color: 'positive', textColor:'white', position: 'top-right'})
            })
            .catch(err => Notify.create({message: err.response.data.datas, color: 'negative', textColor: 'white', position: 'top-right'}))
        },

        setTranslationSource: function(member) {
            VulnerabilityService.setTranslationSource(this.vulnerabilityId, {
                sourceVulnId: this.memberVulnId(member),
                sourceLocale: member.locale
            })
            .then(() => this.getTranslationGroups())
            .catch(err => Notify.create({message: err.response.data.datas, color: 'negative', textColor: 'white', position: 'top-right'}))
        },

        autoTranslateRelated: function() {
            this.translatingRelated = true;
            VulnerabilityService.autoTranslateRelated(this.vulnerabilityId)
            .then((data) => {
                this.getVulnerabilities();
                this.getTranslationGroups();
                Notify.create({message: $t('vulnerabilityAutoTranslateDone', {count: data.data.datas.updated || 0}), color: 'positive', textColor:'white', position: 'top-right'})
            })
            .catch(err => Notify.create({message: err.response.data.datas, color: 'negative', textColor: 'white', position: 'top-right'}))
            .finally(() => { this.translatingRelated = false; })
        },

        openMatchingDialog: function() {
            const threshold = this.$settings && this.$settings.ai && this.$settings.ai.public && this.$settings.ai.public.vulnerabilityProcessing
                ? this.$settings.ai.public.vulnerabilityProcessing.matchThreshold
                : null;
            if (threshold !== null && threshold !== undefined && !Number.isNaN(Number(threshold))) {
                this.matchingThreshold = Number(threshold);
            }
            this.matchingDialog = true;
            this.getMatchingStatus();
        },

        closeMatchingDialog: function() {
            this.matchingDialog = false;
            if (this.matchingPoll) {
                clearInterval(this.matchingPoll);
                this.matchingPoll = null;
            }
        },

        startMatching: function() {
            VulnerabilityService.startMatching({scope: this.matchingScope, threshold: this.matchingThreshold})
            .then((data) => {
                if (data.data.datas && data.data.datas.runId) {
                    this.matchingStatus = Object.assign({}, this.matchingStatus, data.data.datas);
                }
                this.getMatchingStatus().finally(() => this.pollMatchingStatus());
            })
            .catch(err => Notify.create({message: err.response.data.datas, color: 'negative', textColor: 'white', position: 'top-right'}))
        },

        getMatchingStatus: function() {
            return VulnerabilityService.getMatchingStatus(this.matchingStatus.runId)
            .then((data) => {
                this.matchingStatus = data.data.datas;
                this.selectedMatchingProposals = (this.matchingStatus.proposals || []).slice();
            })
        },

        pollMatchingStatus: function() {
            if (this.matchingPoll) clearInterval(this.matchingPoll);
            this.matchingPoll = setInterval(() => {
                this.getMatchingStatus()
                .then(() => {
                    if (!this.matchingStatus.inProgress) {
                        clearInterval(this.matchingPoll);
                        this.matchingPoll = null;
                    }
                });
            }, 1500);
        },

        applyMatchingProposals: function() {
            VulnerabilityService.applyMatchingProposals(this.selectedMatchingProposals, this.matchingStatus.runId)
            .then((data) => {
                this.getTranslationGroups();
                Notify.create({message: $t('vulnerabilityMatchingApplied', {count: data.data.datas.applied || 0}), color: 'positive', textColor:'white', position: 'top-right'})
            })
            .catch(err => Notify.create({message: err.response.data.datas, color: 'negative', textColor: 'white', position: 'top-right'}))
        },

        dblClick: function(row) {
            this.clone(row)
            if (this.UserService.isAllowed('vulnerabilities:update') && row.status === 2)
                this.$refs.updatesModal.show()
            else
                this.$refs.editModal.show()
        }
    }
}
