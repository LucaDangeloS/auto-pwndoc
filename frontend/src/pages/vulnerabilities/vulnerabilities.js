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
import { extractErrorMessage } from '@/services/ai-helpers'

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
            showOnlySelectedLanguage: false,
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
            // Item 2: when the edit modal is open, switching the language selector
            // to a locale that lives in a linked (related-translation) vulnerability
            // loads that document. These flags scope/guard that behavior.
            editModalActive: false,
            suppressLanguageWatch: false,
            currentVulnerabilitySnapshot: '',
            vulnUpdates: [],
            currentUpdate: '',
            currentUpdateLocale: '',
            // Merge languages
            mergeLanguageLeft: '',
            mergeLanguageRight: '',
            mergeVulnLeft: '',
            mergeVulnRight: '',
            mergeSearchLeft: '',
            mergeSearchRight: '',
            mergeHideTranslated: false,
            relationCandidateLocale: '',
            relationCandidateVuln: '',
            relationCandidateSearch: '',
            translationTargetLocale: '',
            translatingRelated: false,
            translatingLocale: false,
            // Merge metadata conflict dialog: when the two documents disagree on
            // shared fields (CVSS, priority, ...) the user picks per field which
            // value the merged document keeps.
            mergeConflict: {
                active: false,
                baseTitle: '',
                otherTitle: '',
                conflicts: [],   // [{field, baseValue, otherValue}]
                picks: {},       // field -> 'base' | 'other'
                resolve: null
            },
            matchingDialog: false,
            matchingScope: 'unmapped',
            matchingThreshold: 0.35,
            matchingStatus: {runId: null, inProgress: false, total: 0, processed: 0, proposals: []},
            selectedMatchingProposals: [],
            showMatchingHistory: false,
            matchingSort: 'score-desc',
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
        this.getVulnerabilities()
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
            if (this.suppressLanguageWatch) return;
            this.resolveLanguageSelection(val, oldVal);
        },
        // A candidate picked for one language is meaningless for another:
        // keeping it would let "Relate translation" submit a vuln that may not
        // even contain the newly selected locale.
        relationCandidateLocale: function() {
            this.relationCandidateVuln = '';
            this.relationCandidateSearch = '';
        }
    },

    computed: {
        lenCurrentTitle: function() {
            return this.currentVulnerability.details[this.currentDetailsIndex].title.length
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
                || this.hasPendingUpdateForLocale(vuln, this.dtLanguage)
            );
            if (this.showOnlySelectedLanguage) {
                filtered = filtered.filter(vuln => this.vulnerabilityLocales(vuln).length === 1);
            }
            return filtered;
        },
        filteredVulnerabilitiesLeft() {
            if (!this.mergeLanguageLeft) return [];
            const needle = this.normalizeSearch(this.mergeSearchLeft);
            return this.vulnerabilities.filter((vuln) => {
                const title = this.getVulnTitleLocale(vuln, this.mergeLanguageLeft);
                return vuln && vuln.details && vuln._id !== this.mergeVulnRight
                    && title
                    // The right language will be merged INTO the left document, so
                    // it must not already contain it.
                    && (!this.mergeLanguageRight || !this.getVulnTitleLocale(vuln, this.mergeLanguageRight))
                    && (!this.mergeHideTranslated || this.vulnerabilityLocales(vuln).length === 1)
                    && (!needle || this.normalizeSearch(title).includes(needle));
            });
          },
          filteredVulnerabilitiesRight() {
            if (!this.mergeLanguageRight) return [];
            const needle = this.normalizeSearch(this.mergeSearchRight);
            return this.vulnerabilities.filter((vuln) => {
                const title = this.getVulnTitleLocale(vuln, this.mergeLanguageRight);
                return vuln && vuln.details && vuln._id !== this.mergeVulnLeft
                    && title
                    && (!this.mergeHideTranslated || this.vulnerabilityLocales(vuln).length === 1)
                    && (!needle || this.normalizeSearch(title).includes(needle));
            });
          },
        // Languages already stored in details[], plus pending translation
        // proposals that are not committed yet but should still be visible from
        // the original vulnerability.
        currentVulnerabilityLanguages: function() {
            if (!this.vulnerabilityId) return [];
            var languages = (this.currentVulnerability.details || [])
                .filter(detail => detail.locale && detail.title)
                .map(detail => ({
                    locale: detail.locale,
                    title: detail.title,
                    lastEditedAt: detail.lastEditedAt,
                    syncStatus: detail.syncStatus || '',
                    isSource: (this.currentVulnerability.sourceLocale || '') === detail.locale,
                    isCurrent: detail.locale === this.currentLanguage
                }));
            var presentLocales = new Set(languages.map(lang => lang.locale));
            ((this.currentVulnerability && this.currentVulnerability.pendingUpdates) || [])
                .filter(update => update.locale && !presentLocales.has(update.locale))
                .forEach(update => {
                    languages.push({
                        locale: update.locale,
                        title: update.title || '',
                        lastEditedAt: null,
                        syncStatus: 'pending-review',
                        isSource: false,
                        isCurrent: update.locale === this.currentLanguage,
                        isPendingUpdate: true
                    });
                });
            return languages;
        },
        // Locale of the single most recently edited language, so the "Last
        // edited" badge marks only that one.
        mostRecentlyEditedLocale: function() {
            let best = null;
            this.currentVulnerabilityLanguages.forEach(lang => {
                if (!lang.lastEditedAt) return;
                const time = new Date(lang.lastEditedAt).getTime();
                if (!Number.isFinite(time)) return;
                if (!best || time > best.time) best = {time, locale: lang.locale};
            });
            return best ? best.locale : null;
        },
        // Languages that can still be added to the current document (not yet in
        // details[]) — used by both the merge-in flow and auto-translate.
        relationLanguageOptions: function() {
            return this.languages.filter(lang =>
                !this.getVulnTitleLocale(this.currentVulnerability, lang.locale)
                && !this.hasPendingUpdateForLocale(this.currentVulnerability, lang.locale)
            );
        },
        relationCandidates: function() {
            if (!this.relationCandidateLocale) return [];
            return this.vulnerabilities.filter(vuln => {
                if (vuln._id === this.vulnerabilityId) return false;
                if (!this.getVulnTitleLocale(vuln, this.relationCandidateLocale)) return false;
                return true;
            });
        },
        filteredRelationCandidates: function() {
            if (!this.relationCandidateSearch) return this.relationCandidates;
            var needle = this.relationCandidateSearch;
            return this.relationCandidates.filter(vuln => this.getVulnTitleLocale(vuln, this.relationCandidateLocale).toLowerCase().includes(needle));
        },
        missingTranslationLanguageOptions: function() {
            return this.languages.filter(lang =>
                lang.locale !== this.currentLanguage
                && !this.getVulnTitleLocale(this.currentVulnerability, lang.locale)
                && !this.hasPendingUpdateForLocale(this.currentVulnerability, lang.locale)
            );
        },
        vulnCategoriesOptions: function() {
            return this.$_.uniq(this.vulnerabilities.map(vuln => this.getDtCategory(vuln)).filter(Boolean)).sort()
        },

        vulnTypeOptions: function() {
            return this.$_.uniq(this.vulnerabilities.map(vuln => this.getDtType(vuln)).filter(Boolean)).sort()
        },

        visibleMatchingProposals: function() {
            var proposals = this.matchingStatus.proposals || [];
            if (!this.showMatchingHistory) proposals = proposals.filter(proposal => this.isPendingProposal(proposal));
            return this.sortMatchingProposals(proposals);
        },

        pendingMatchingProposals: function() {
            return (this.matchingStatus.proposals || []).filter(proposal => this.isPendingProposal(proposal));
        },

        selectedPendingMatchingProposals: function() {
            return (this.selectedMatchingProposals || []).filter(proposal => this.isPendingProposal(proposal));
        },

        visiblePendingMatchingProposals: function() {
            return this.visibleMatchingProposals.filter(proposal => this.isPendingProposal(proposal));
        },

        allVisiblePendingMatchingSelected: function() {
            var visiblePending = this.visiblePendingMatchingProposals;
            if (!visiblePending.length) return false;
            return visiblePending.every(proposal => this.selectedMatchingProposals.includes(proposal));
        },

        matchingSortOptions: function() {
            return [
                {label: $t('matchingSortBestFirst'), value: 'score-desc'},
                {label: $t('matchingSortWorstFirst'), value: 'score-asc'}
            ];
        }
    },

    methods: {
        notifyError: function(err, fallback) {
            console.error(err);
            Notify.create({
                message: extractErrorMessage(err) || fallback || $t('err.unexpectedError'),
                color: 'negative',
                textColor: 'white',
                position: 'top-right'
            })
        },

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
            return VulnerabilityService.getVulnerabilities()
            .then((data) => {
                this.vulnerabilities = data.data.datas
                if (this.vulnerabilityId) {
                    const current = this.vulnerabilities.find(vuln => vuln._id === this.vulnerabilityId);
                    if (current) this.currentVulnerability = this.$_.cloneDeep(current);
                }
                this.loading = false
            })
            .catch((err) => {
                this.notifyError(err)
            })
        },

        // Re-clone the currently edited vulnerability from a fresh list after a
        // server-side change to its details[] (merge, split, source change).
        refreshCurrentVulnerability: function() {
            return this.getVulnerabilities().then(() => {
                if (!this.vulnerabilityId) return;
                var fresh = this.vulnerabilities.find(v => v._id === this.vulnerabilityId);
                if (!fresh) return;
                this.currentVulnerability = this.$_.cloneDeep(fresh);
                this.setCurrentDetails();
                this.$nextTick(() => { this.snapshotCurrentVulnerability(); });
            });
        },

        createVulnerability: function() {
            this.cleanErrors();
            var index = this.currentVulnerability.details.findIndex(obj => obj.title !== '');
            if (index < 0)
                this.errors.title = $t('err.titleRequired');
            
            if (this.errors.title)
                return;

            VulnerabilityService.createVulnerabilities([this.vulnerabilityPayload(this.currentVulnerability)])
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
                this.notifyError(err)
            })
        },

        cloneAsNewVulnerability: function(row) {
            var sourceDetail = this.detailForLocale(row, this.dtLanguage);
            if (!sourceDetail || !sourceDetail.title) return;

            this.suppressLanguageWatch = true;
            this.cleanCurrentVulnerability();
            var clonedDetail = this.$_.cloneDeep(sourceDetail);
            clonedDetail.title = this.uniqueClonedVulnerabilityTitle(sourceDetail.title);
            delete clonedDetail.lastEditedAt;
            delete clonedDetail.syncStatus;

            this.currentLanguage = this.dtLanguage;
            this.currentVulnerability = {
                cvssv3: row.cvssv3 || '',
                cvssv4: row.cvssv4 || '',
                priority: row.priority || '',
                remediationComplexity: row.remediationComplexity || '',
                taxonomies: this.$_.cloneDeep(row.taxonomies || []),
                details: [clonedDetail]
            };
            this.vulnerabilityId = '';
            this.currentDetailsIndex = 0;
            this.relationCandidateLocale = '';
            this.relationCandidateVuln = '';
            this.translationTargetLocale = '';
            this.$nextTick(() => {
                this.suppressLanguageWatch = false;
                this.setCurrentDetails();
                this.$refs.createModal.show();
            });
        },

        uniqueClonedVulnerabilityTitle: function(title) {
            var base = `${title} (${$t('copySuffix')})`;
            var candidate = base;
            var index = 2;
            while (this.vulnerabilityTitleExists(candidate)) {
                candidate = `${base} ${index}`;
                index++;
            }
            return candidate;
        },

        vulnerabilityTitleExists: function(title) {
            return this.vulnerabilities.some(vuln =>
                (vuln.details || []).some(detail => detail.title === title)
            );
        },

        updateVulnerability: function() {
            this.cleanErrors();

            var index = this.currentVulnerability.details.findIndex(obj => obj.title !== '');
            if (index < 0)
                this.errors.title = $t('err.titleRequired');
            
            if (this.errors.title)
                return;
              
            VulnerabilityService.updateVulnerability(this.vulnerabilityId, this.vulnerabilityPayload(this.currentVulnerability))
            .then(() => {
                this.getVulnerabilities();
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
                this.notifyError(err)
            })
        },

        acceptUpdate: function(update) {
            if (update.cvssv3 !== undefined) this.currentVulnerability.cvssv3 = update.cvssv3;
            if (update.cvssv4 !== undefined) this.currentVulnerability.cvssv4 = update.cvssv4;
            if (update.priority !== undefined) this.currentVulnerability.priority = update.priority;
            if (update.remediationComplexity !== undefined) this.currentVulnerability.remediationComplexity = update.remediationComplexity;
            if (update.taxonomies !== undefined) this.currentVulnerability.taxonomies = update.taxonomies || [];
            else if (update.category !== undefined || update.vulnType !== undefined) {
                this.currentVulnerability.taxonomies = [{
                    type: update.category || '',
                    category: update.vulnType || '',
                    subcategory: '',
                    code: ''
                }];
            }

            var index = this.currentVulnerability.details.findIndex(obj => obj.locale === update.locale);
            if (index < 0) {
                this.currentVulnerability.details.push({
                    locale: update.locale,
                    title: update.title,
                    description: update.description,
                    observation: update.observation,
                    remediation: update.remediation,
                    references: update.references,
                    customFields: update.customFields
                });
            } else {
                if (update.title !== undefined) this.currentVulnerability.details[index].title = update.title;
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
                this.notifyError(err)
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

        getVulnUpdates: function(vulnId, preferredLocale) {
            return VulnerabilityService.getVulnUpdates(vulnId)
            .then((data) => {
                this.vulnUpdates = data.data.datas || [];
                this.vulnUpdates.forEach(vuln => {
                    vuln.customFields = Utils.filterCustomFields('vulnerability', this.currentVulnerabilityType(), this.customFields, vuln.customFields, vuln.locale)
                })
                if (this.vulnUpdates.length > 0) {
                    // Sort by modification date (newest first)
                    this.vulnUpdates.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
                    var selected = preferredLocale
                        ? this.vulnUpdates.find(update => update.locale === preferredLocale)
                        : this.vulnUpdates[0];
                    if (selected) {
                        this.currentUpdate = selected._id || null;
                        this.currentLanguage = selected.locale || null;
                    }
                }
                return this.vulnUpdates;
            })
            .catch((err) => {
                this.notifyError(err);
                return [];
            })
        },

        openVulnerability: function(row) {
            this.clone(row);
            if (!this.UserService.isAllowed('vulnerabilities:update')) {
                this.$refs.editModal.show();
                return;
            }

            if (this.rowStatusForLocale(row, this.dtLanguage) !== 2) {
                this.$refs.editModal.show();
                return;
            }

            this.getVulnUpdates(row._id, this.dtLanguage)
            .then((updates) => {
                if ((updates || []).some(update => update.locale === this.dtLanguage))
                    this.$refs.updatesModal.show();
                else
                    this.$refs.editModal.show();
            })
        },

        clone: function(row) {
            this.suppressLanguageWatch = true;
            this.cleanCurrentVulnerability();
            this.currentVulnerability = this.$_.cloneDeep(row)
            this.setCurrentDetails();
            
            this.vulnerabilityId = row._id;
            this.relationCandidateLocale = this.relationLanguageOptions[0]?.locale || '';
            this.relationCandidateVuln = '';
            this.translationTargetLocale = this.missingTranslationLanguageOptions[0]?.locale || '';
            this.$nextTick(() => { this.suppressLanguageWatch = false; });
        },

        editModalShow: function() {
            this.editModalActive = true;
            // Capture the dirty-check baseline only after the modal is shown and
            // the editors have re-serialized their HTML, so the linked-translation
            // prompt fires on genuine user edits, not on load-time normalization.
            this.$nextTick(() => { this.snapshotCurrentVulnerability(); });
        },

        editModalHide: function() {
            this.editModalActive = false;
            this.cleanCurrentVulnerability();
        },

        // Route a language-selector change: every language of a vulnerability
        // lives in this same document's details[], so switching just selects the
        // matching detail (or an empty editor for a language not yet present).
        resolveLanguageSelection: function(newLocale, oldLocale) {
            this.setCurrentDetails();
            this.afterLanguageResolved();
        },

        setLanguageSilently: function(locale) {
            this.suppressLanguageWatch = true;
            this.currentLanguage = locale;
            this.$nextTick(() => { this.suppressLanguageWatch = false; });
        },

        snapshotCurrentVulnerability: function() {
            try {
                this.currentVulnerabilitySnapshot = JSON.stringify(this.vulnerabilityPayload(this.currentVulnerability));
            } catch (_) {
                this.currentVulnerabilitySnapshot = '';
            }
        },

        hasUnsavedVulnerabilityChanges: function() {
            if (!this.currentVulnerabilitySnapshot) return false;
            try {
                return JSON.stringify(this.vulnerabilityPayload(this.currentVulnerability)) !== this.currentVulnerabilitySnapshot;
            } catch (_) {
                return false;
            }
        },

        afterLanguageResolved: function() {
            if (this.relationCandidateLocale === this.currentLanguage || !this.relationLanguageOptions.some(lang => lang.locale === this.relationCandidateLocale)) {
                this.relationCandidateLocale = this.relationLanguageOptions[0]?.locale || '';
                this.relationCandidateVuln = '';
            }
            if (!this.translationTargetLocale || !this.missingTranslationLanguageOptions.some(lang => lang.locale === this.translationTargetLocale)) {
                this.translationTargetLocale = this.missingTranslationLanguageOptions[0]?.locale || '';
            }
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
                    this.currentVulnerability.taxonomies = [{
                        type: category.name,
                        category: '',
                        subcategory: '',
                        code: ''
                    }];
                }
                else {
                    this.currentVulnerability.taxonomies = [];
                }
                this.setCurrentDetails()
            })
        },

        currentVulnerabilityType: function() {
            const taxonomy = this.currentVulnerability && Array.isArray(this.currentVulnerability.taxonomies) && this.currentVulnerability.taxonomies[0];
            return (taxonomy && taxonomy.type) || '';
        },

        taxonomyDiff: function(update) {
            return !this.$_.isEqual(this.currentVulnerability.taxonomies || [], (update && update.taxonomies) || []);
        },

        vulnerabilityPayload: function(vulnerability) {
            var payload = this.$_.cloneDeep(vulnerability);
            delete payload.category;
            payload.taxonomies = Array.isArray(payload.taxonomies) ? payload.taxonomies : [];
            payload.details = (payload.details || []).map(detail => {
                var clean = this.$_.cloneDeep(detail);
                delete clean.vulnType;
                return clean;
            });
            return payload;
        },

        cleanErrors: function() {
            this.errors.title = '';
        },  

        cleanCurrentVulnerability: function() {
            this.suppressLanguageWatch = true;
            this.currentVulnerabilitySnapshot = '';
            this.cleanErrors();
            this.currentVulnerability.cvssv3 = '';
            this.currentVulnerability.cvssv4 = '';
            this.currentVulnerability.priority = '';
            this.currentVulnerability.remediationComplexity = '';
            this.currentVulnerability.details = [];
            this.vulnUpdates = [];
            this.currentUpdate = '';
            this.currentUpdateLocale = '';
            this.currentLanguage = this.dtLanguage;
            // Phase 3: seed `taxonomies[]` from the legacy "Add to <category>"
            // dropdown so existing UX still primes the picker. Backend's
            // syncVulnTaxonomy keeps both sides consistent on save.
            if (this.currentCategory && this.currentCategory.name) {
                this.currentVulnerability.taxonomies = [{
                    type: this.currentCategory.name,
                    category: '',
                    subcategory: '',
                    code: ''
                }];
            } else {
                this.currentVulnerability.taxonomies = [];
            }

            this.setCurrentDetails();
            this.$nextTick(() => { this.suppressLanguageWatch = false; });
        },

        // Create detail if locale doesn't exist else set the currentDetailIndex
        setCurrentDetails: function(value) {
            var index = this.currentVulnerability.details.findIndex(obj => obj.locale === this.currentLanguage);
            if (index < 0) {
                var details = {
                    locale: this.currentLanguage,
                    title: '',
                    updatedAt: '',
                    description: '',
                    observation: '',
                    remediation: '',
                    references: [],
                    customFields: []
                }
         
                details.customFields = this.$_.cloneDeep(Utils.filterCustomFields('vulnerability', this.currentVulnerabilityType(), this.customFields, [], this.currentLanguage))
                this.currentVulnerability.details.push(details,)
                index = this.currentVulnerability.details.length - 1;
            }
            else {
                this.currentVulnerability.details[index].customFields = this.$_.cloneDeep(Utils.filterCustomFields('vulnerability', this.currentVulnerabilityType(), this.customFields, this.currentVulnerability.details[index].customFields, this.currentLanguage))
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
                return this.pendingUpdateForLocale(row, this.dtLanguage)?.title || $t('err.notDefinedLanguage');
            else
                return row.details[index].title;         
        },

        pendingUpdateForLocale: function(row, locale) {
            return ((row && row.pendingUpdates) || []).find(update => update.locale === locale);
        },

        hasPendingUpdateForLocale: function(row, locale) {
            return !!this.pendingUpdateForLocale(row, locale);
        },

        detailForLocale: function(row, locale) {
            return ((row && row.details) || []).find(detail => detail.locale === locale);
        },

        hasPendingReviewDetailForLocale: function(row, locale) {
            var detail = this.detailForLocale(row, locale);
            return detail && detail.syncStatus === 'pending-review';
        },

        rowStatusForLocale: function(row, locale) {
            if (row && row.status === 1) return 1;
            var selectedLocale = locale || this.dtLanguage;
            if (this.hasPendingUpdateForLocale(row, selectedLocale) || this.hasPendingReviewDetailForLocale(row, selectedLocale)) return 2;
            return 0;
        },

        getDtType: function(row) {
            const taxonomy = row && Array.isArray(row.taxonomies) && row.taxonomies[0];
            return (taxonomy && taxonomy.type) || '';
        },

        getDtCategory: function(row) {
            const taxonomy = row && Array.isArray(row.taxonomies) && row.taxonomies[0];
            return (taxonomy && taxonomy.category) || '';
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

                var localeStatus = this.rowStatusForLocale(row, this.dtLanguage);
                return title.indexOf(termTitle) > -1 && 
                    type.indexOf(termVulnType || "") > -1 &&
                    category.indexOf(termCategory || "") > -1 &&
                    updatedAt.indexOf(termUpdatedAt) > -1 &&
                    (localeStatus === terms.valid || localeStatus === terms.new || localeStatus === terms.updates);
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

        vulnerabilityLocales: function(vuln) {
            if (!vuln || !Array.isArray(vuln.details)) return [];
            return vuln.details
                .filter(detail => detail.locale && detail.title)
                .map(detail => detail.locale);
        },

        normalizeSearch: function(value) {
            return (value || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        },

        relationCandidateLabel: function(vuln) {
            const option = vuln && vuln._id ? vuln : this.vulnerabilities.find(item => item._id === vuln);
            return this.getVulnTitleLocale(option, this.relationCandidateLocale) || '-';
        },

        languageLabel: function(locale) {
            const lang = this.languages.find(l => l.locale === locale);
            return lang ? lang.language : locale;
        },

        filterRelationCandidates: function(val, update) {
            update(() => {
                this.relationCandidateSearch = (val || '').toLowerCase();
            });
        },

        // Switch the edit modal to one of the document's languages.
        viewTranslationMember: function(member) {
            if (member && member.isPendingUpdate) {
                this.getVulnUpdates(this.vulnerabilityId, member.locale)
                .then((updates) => {
                    if ((updates || []).some(update => update.locale === member.locale))
                        this.$refs.updatesModal.show();
                })
                return;
            }
            this.currentLanguage = member.locale;
        },

        memberLastEditedLabel: function(member) {
            if (!member || !member.lastEditedAt) return '-';
            return new Date(member.lastEditedAt).toLocaleString();
        },

        isMostRecentlyEdited: function(member) {
            if (!member || !member.lastEditedAt) return false;
            return this.mostRecentlyEditedLocale === member.locale;
        },

        translationStatusLabel: function(member) {
            switch ((member && member.syncStatus) || '') {
                case 'stale':
                    return $t('translationStatusStale');
                case 'pending-review':
                    return $t('translationStatusPendingReview');
                case 'failed':
                    return $t('translationStatusFailed');
                case 'synced':
                    return $t('translationStatusSynced');
                default:
                    return '';
            }
        },

        translationStatusColor: function(member) {
            switch ((member && member.syncStatus) || '') {
                case 'stale':
                    return 'warning';
                case 'pending-review':
                    return 'info';
                case 'failed':
                    return 'negative';
                default:
                    return 'positive';
            }
        },

        // --- Merge metadata conflict handling -------------------------------
        // Compare the shared (language-independent) fields of two documents and
        // return the list of fields where they differ.
        computeMergeConflicts: function(baseVuln, otherVuln) {
            var fields = ['cvssv3', 'cvssv4', 'priority', 'remediationComplexity', 'taxonomies'];
            var conflicts = [];
            fields.forEach(field => {
                var a = baseVuln ? baseVuln[field] : undefined;
                var b = otherVuln ? otherVuln[field] : undefined;
                var norm = v => JSON.stringify(v === undefined || v === null || v === '' ? null : v);
                if (norm(a) !== norm(b)) conflicts.push({field: field, baseValue: a, otherValue: b});
            });
            return conflicts;
        },

        mergeFieldLabel: function(field) {
            switch (field) {
                case 'cvssv3': return 'CVSS v3';
                case 'cvssv4': return 'CVSS v4';
                case 'priority': return $t('priority');
                case 'remediationComplexity': return $t('remediationComplexity');
                case 'taxonomies': return $t('category');
                default: return field;
            }
        },

        mergeFieldDisplay: function(field, value) {
            if (value === undefined || value === null || value === '') return '-';
            if (field === 'taxonomies') {
                var parts = (Array.isArray(value) ? value : []).map(t => [t.type, t.category, t.subcategory, t.code].filter(Boolean).join(' / '));
                return parts.length ? parts.join(' ; ') : '-';
            }
            return String(value);
        },

        // If the two documents disagree on shared metadata, open the conflict
        // dialog and resolve with the user's picks ({} when nothing differs).
        promptMergeMetadata: function(baseVuln, otherVuln, baseTitle, otherTitle) {
            var conflicts = this.computeMergeConflicts(baseVuln, otherVuln);
            if (conflicts.length === 0) return Promise.resolve({});
            return new Promise((resolve) => {
                var picks = {};
                conflicts.forEach(c => { picks[c.field] = 'base'; });
                this.mergeConflict = {
                    active: true,
                    baseTitle: baseTitle,
                    otherTitle: otherTitle,
                    conflicts: conflicts,
                    picks: picks,
                    resolve: resolve
                };
            });
        },

        confirmMergeConflict: function() {
            var metadata = {};
            this.mergeConflict.conflicts.forEach(c => {
                if (this.mergeConflict.picks[c.field] === 'other') {
                    metadata[c.field] = c.otherValue === undefined ? null : c.otherValue;
                }
            });
            var resolve = this.mergeConflict.resolve;
            this.mergeConflict = {active: false, baseTitle: '', otherTitle: '', conflicts: [], picks: {}, resolve: null};
            if (resolve) resolve(metadata);
        },

        cancelMergeConflict: function() {
            var resolve = this.mergeConflict.resolve;
            this.mergeConflict = {active: false, baseTitle: '', otherTitle: '', conflicts: [], picks: {}, resolve: null};
            if (resolve) resolve(null);
        },

        isPendingProposal: function(proposal) {
            return !proposal || !proposal.status || proposal.status === 'pending';
        },

        matchingScore: function(proposal) {
            var distance = proposal && proposal.distance != null ? Number(proposal.distance) : 1;
            if (!Number.isFinite(distance)) distance = 1;
            var score = Math.max(0, Math.min(1, 1 - distance));
            return Math.round(score * 100);
        },

        sortMatchingProposals: function(proposals) {
            var direction = this.matchingSort === 'score-asc' ? 1 : -1;
            return proposals.slice().sort((a, b) => {
                var scoreDiff = (this.matchingScore(a) - this.matchingScore(b)) * direction;
                if (scoreDiff !== 0) return scoreDiff;
                var distanceA = a && a.distance != null ? Number(a.distance) : Number.MAX_SAFE_INTEGER;
                var distanceB = b && b.distance != null ? Number(b.distance) : Number.MAX_SAFE_INTEGER;
                return distanceA - distanceB;
            });
        },

        toggleAllVisiblePendingMatching: function(selected) {
            var visiblePending = this.visiblePendingMatchingProposals;
            if (selected) {
                var merged = this.selectedMatchingProposals.slice();
                visiblePending.forEach(proposal => {
                    if (!merged.includes(proposal)) merged.push(proposal);
                });
                this.selectedMatchingProposals = merged;
                return;
            }
            this.selectedMatchingProposals = this.selectedMatchingProposals.filter(proposal => !visiblePending.includes(proposal));
        },

        matchingProposalStatusLabel: function(proposal) {
            switch ((proposal && proposal.status) || 'pending') {
                case 'accepted':
                    return $t('matchingProposalStatusAccepted');
                case 'dismissed':
                    return $t('matchingProposalStatusDismissed');
                default:
                    return $t('matchingProposalStatusPending');
            }
        },

        matchingProposalStatusColor: function(proposal) {
            switch ((proposal && proposal.status) || 'pending') {
                case 'accepted':
                    return 'positive';
                case 'dismissed':
                    return 'grey';
                default:
                    return 'primary';
            }
        },
        

        // Relate dialog: physically merge the right language into the left
        // document (with the conflict dialog when shared metadata differs).
        mergeVulnerabilities: function() {
            var left = this.vulnerabilities.find(v => v._id === this.mergeVulnLeft);
            var right = this.vulnerabilities.find(v => v._id === this.mergeVulnRight);
            if (!left || !right) return;
            this.promptMergeMetadata(
                left, right,
                this.getVulnTitleLocale(left, this.mergeLanguageLeft),
                this.getVulnTitleLocale(right, this.mergeLanguageRight)
            )
            .then(metadata => {
                if (metadata === null) return; // user cancelled
                return VulnerabilityService.mergeVulnerability(this.mergeVulnLeft, this.mergeVulnRight, this.mergeLanguageRight, metadata, this.mergeLanguageLeft)
                .then(() => {
                    this.getVulnerabilities();
                    this.mergeVulnLeft = '';
                    this.mergeVulnRight = '';
                    Notify.create({
                        message: $t('msg.vulnerabilityMergeOk'),
                        color: 'positive',
                        textColor:'white',
                        position: 'top-right'
                    })
                })
            })
            .catch((err) => {
                this.notifyError(err)
            })
        },

        // Edit modal: merge the selected vulnerability's language into the
        // currently edited document.
        mergeSelectedVulnerability: function() {
            if (!this.relationCandidateVuln || !this.relationCandidateLocale) return;
            var other = this.vulnerabilities.find(v => v._id === this.relationCandidateVuln);
            if (!other) return;
            this.promptMergeMetadata(
                this.currentVulnerability, other,
                this.getVulnTitleLocale(this.currentVulnerability, this.currentLanguage),
                this.getVulnTitleLocale(other, this.relationCandidateLocale)
            )
            .then(metadata => {
                if (metadata === null) return; // user cancelled
                return VulnerabilityService.mergeVulnerability(this.vulnerabilityId, this.relationCandidateVuln, this.relationCandidateLocale, metadata, this.currentLanguage)
                .then(() => {
                    this.relationCandidateVuln = '';
                    Notify.create({message: $t('msg.vulnerabilityMergeOk'), color: 'positive', textColor:'white', position: 'top-right'})
                    return this.refreshCurrentVulnerability();
                })
            })
            .catch(err => this.notifyError(err))
        },

        // Extract a language back out into its own vulnerability document.
        splitTranslationMember: function(member) {
            Dialog.create({
                title: $t('msg.confirmSplitTitle'),
                message: $t('msg.confirmSplitMessage', {language: this.languageLabel(member.locale)}),
                ok: {label: $t('btn.confirm'), color: 'primary'},
                cancel: {label: $t('btn.cancel'), color: 'white'}
            })
            .onOk(() => {
                VulnerabilityService.splitVulnerabilityLocale(this.vulnerabilityId, member.locale)
                .then(() => {
                    Notify.create({message: $t('msg.vulnerabilitySplitOk'), color: 'positive', textColor:'white', position: 'top-right'})
                    if (this.currentLanguage === member.locale) this.setLanguageSilently(this.currentVulnerabilityLanguages.find(l => l.locale !== member.locale)?.locale || this.currentLanguage);
                    return this.refreshCurrentVulnerability();
                })
                .catch(err => this.notifyError(err))
            })
        },

        setTranslationSource: function(member) {
            VulnerabilityService.setTranslationSource(this.vulnerabilityId, member.locale)
            .then(() => this.refreshCurrentVulnerability())
            .catch(err => this.notifyError(err))
        },

        markTranslationSynced: function(member) {
            if (!member || member.isPendingUpdate) return;
            VulnerabilityService.setTranslationSyncStatus(this.vulnerabilityId, member.locale, 'synced')
            .then(() => this.refreshCurrentVulnerability())
            .catch(err => this.notifyError(err))
        },

        autoTranslateRelated: function() {
            this.translatingRelated = true;
            VulnerabilityService.autoTranslateRelated(this.vulnerabilityId)
            .then((data) => {
                this.refreshCurrentVulnerability().then(() => {
                    this.translationTargetLocale = this.missingTranslationLanguageOptions[0]?.locale || '';
                });
                const result = data.data.datas || {};
                Notify.create({
                    message: result.failed
                        ? $t('vulnerabilityAutoTranslatePartial', {count: result.updated || 0, failed: result.failed})
                        : $t('vulnerabilityAutoTranslateDone', {count: result.updated || 0}),
                    color: result.failed ? 'warning' : 'positive',
                    textColor: result.failed ? 'dark' : 'white',
                    position: 'top-right'
                })
            })
            .catch(err => this.notifyError(err))
            .finally(() => { this.translatingRelated = false; })
        },

        autoTranslateLocale: function() {
            if (!this.translationTargetLocale) return;
            this.translatingLocale = true;
            VulnerabilityService.autoTranslateLocale(this.vulnerabilityId, {
                sourceLocale: this.currentLanguage,
                targetLocale: this.translationTargetLocale
            })
            .then((data) => {
                this.refreshCurrentVulnerability();
                const result = data.data.datas || {};
                Notify.create({
                    message: result.failed
                        ? $t('vulnerabilityAutoTranslatePartial', {count: result.updated || 0, failed: result.failed})
                        : $t('vulnerabilityLocaleAutoTranslateDone', {count: result.updated || 0}),
                    color: result.failed ? 'warning' : 'positive',
                    textColor: result.failed ? 'dark' : 'white',
                    position: 'top-right'
                })
                if (!result.failed) this.translationTargetLocale = '';
            })
            .catch(err => this.notifyError(err))
            .finally(() => { this.translatingLocale = false; })
        },

        openMatchingDialog: function() {
            const threshold = this.$settings && this.$settings.ai && this.$settings.ai.public && this.$settings.ai.public.vulnerabilityProcessing
                ? this.$settings.ai.public.vulnerabilityProcessing.matchThreshold
                : null;
            if (threshold !== null && threshold !== undefined && !Number.isNaN(Number(threshold))) {
                this.matchingThreshold = Number(threshold);
            }
            this.matchingDialog = true;
            this.getMatchingStatus().catch(err => this.notifyError(err));
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
                this.getMatchingStatus()
                    .catch(err => this.notifyError(err))
                    .finally(() => this.pollMatchingStatus());
            })
            .catch(err => this.notifyError(err))
        },

        getMatchingStatus: function() {
            return VulnerabilityService.getMatchingStatus(this.matchingStatus.runId)
            .then((data) => {
                this.matchingStatus = data.data.datas;
                this.selectedMatchingProposals = this.pendingMatchingProposals.slice();
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
                })
                .catch(err => {
                    clearInterval(this.matchingPoll);
                    this.matchingPoll = null;
                    this.notifyError(err);
                });
            }, 1500);
        },

        // Accepting proposals physically merges each target language into its
        // source document. Proposals whose documents disagree on shared
        // metadata go through the conflict dialog one by one; cancelling the
        // dialog skips that proposal.
        applyMatchingProposals: async function() {
            var proposals = this.selectedPendingMatchingProposals.slice();
            var payload = [];
            for (var p of proposals) {
                var source = this.vulnerabilities.find(v => v._id === p.sourceVulnId);
                var target = this.vulnerabilities.find(v => v._id === p.targetVulnId);
                var metadata = {};
                if (source && target) {
                    metadata = await this.promptMergeMetadata(source, target, p.sourceTitle, p.targetTitle);
                    if (metadata === null) continue; // user cancelled -> skip this proposal
                }
                payload.push({
                    sourceVulnId: p.sourceVulnId,
                    sourceLocale: p.sourceLocale,
                    targetVulnId: p.targetVulnId,
                    targetLocale: p.targetLocale,
                    metadata: metadata
                });
            }
            if (payload.length === 0) return;
            VulnerabilityService.applyMatchingProposals(payload, this.matchingStatus.runId)
            .then((data) => {
                const result = data.data.datas || {};
                const applied = Number.isFinite(Number(result.applied)) ? Number(result.applied) : 0;
                const skipped = Number.isFinite(Number(result.skipped)) ? Number(result.skipped) : 0;
                const failed = Number.isFinite(Number(result.failed)) ? Number(result.failed) : 0;
                this.getVulnerabilities();
                this.getMatchingStatus().catch(err => this.notifyError(err));
                Notify.create({
                    message: $t('vulnerabilityMatchingApplied', {
                        count: payload.length,
                        applied,
                        skipped,
                        failed
                    }),
                    color: failed ? 'warning' : 'positive',
                    textColor: failed ? 'dark' : 'white',
                    position: 'top-right'
                })
            })
            .catch(err => this.notifyError(err))
        },

        dblClick: function(row) {
            this.openVulnerability(row)
        }
    }
}
