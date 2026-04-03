import { Notify, Dialog } from 'quasar'

import SettingsService from '@/services/settings'
import UserService from '@/services/user'
import AiService from '@/services/ai'

import { $t } from 'boot/i18n'
import LanguageSelector from '@/components/language-selector';

export default {
    data: () => {
        return {
            loading: true,
            UserService: UserService,
            settings: {
                danger:{enabled:false,public:{nbdaydelete: 0}},
                reviews:{enabled:false},
                ai:{enabled:false,embeddingEnabled:false,public:{provider:'openai',model:'gpt-4o',temperature:0.7,maxTokens:4096,embeddingProvider:'openai',embeddingModel:'text-embedding-3-small',embeddingMaxDistance:0.8},private:{apiUrl:'',apiKey:'',systemPrompt:'',userPrompt:'',azure:{deploymentName:'',apiVersion:'2024-06-01'},embeddingApiUrl:'',embeddingApiKey:'',embeddingAzure:{deploymentName:'',apiVersion:'2024-06-01'}}}
            },
            settingsOrig : {danger:{enabled:false},reviews:{enabled:false},ai:{enabled:false}},
            canEdit: false,
            showApiKey: false,
            showEmbeddingApiKey: false,
            reindexing: false,
            reindexStarted: false,
            activeSection: 'section-general',
            sectionObserver: null,
            scrollingTo: null,
            settingsSections: [
                { id: 'section-general', label: 'generalSettings' },
                { id: 'section-danger', label: 'dangerSettings' },
                { id: 'section-reports', label: 'reports' },
                { id: 'section-reviews', label: 'reviews' },
                { id: 'section-ai', label: 'aiSettings' },
                { id: 'section-actions', label: 'saveSettings' }
            ],
            cvssVersionOptions: [
                { label: 'CVSS 3.1', value: '3.1' },
                { label: 'CVSS 4.0', value: '4.0' }
            ],
            aiProviderOptions: [
                { label: 'OpenAI', value: 'openai' },
                { label: 'Anthropic', value: 'anthropic' },
                { label: 'Ollama', value: 'ollama' },
                { label: 'Azure OpenAI', value: 'azure-openai' },
                { label: 'OpenAI Compatible', value: 'openai-compatible' }
            ]
        }
    },
    components: {
        LanguageSelector
    },

    beforeRouteLeave (to, from , next) {
        if (this.unsavedChanges()) {
            Dialog.create({
            title: $t('msg.thereAreUnsavedChanges'),
            message: $t('msg.doYouWantToLeave'),
            ok: {label: $t('btn.comfirm'), color: 'negative'},
            cancel: {label: $t('btn.cancel'), color: 'white'}
            })
            .onOk(() => next())
        }
        else
            next()
    },

    computed: {
        aiDefaultUrl: function() {
            var defaults = {
                'openai': 'https://api.openai.com/v1',
                'anthropic': 'https://api.anthropic.com/v1',
                'ollama': 'http://localhost:11434',
                'azure-openai': 'https://<instance>.openai.azure.com',
                'openai-compatible': ''
            };
            return defaults[this.settings.ai.public.provider] || '';
        },
        embeddingDefaultUrl: function() {
            var defaults = {
                'openai': 'https://api.openai.com/v1',
                'anthropic': '',
                'ollama': 'http://localhost:11434/v1',
                'azure-openai': 'https://<instance>.openai.azure.com',
                'openai-compatible': 'http://<host>:<port>/v1'
            };
            return defaults[this.settings.ai.public.embeddingProvider] || '';
        }
    },

    mounted: function() {
        if (UserService.isAllowed('settings:read')) {
            this.getSettings()
            this.canEdit = this.UserService.isAllowed('settings:update');
            document.addEventListener('keydown', this._listener, false)
        }
        else {
            this.loading = false
        }
    },

    unmounted: function() {
        document.removeEventListener('keydown', this._listener, false)
        if (this.sectionObserver) this.sectionObserver.disconnect();
    },

    methods: {
        _listener: function(e) {
            if ((window.navigator.platform.match("Mac") ? e.metaKey : e.ctrlKey) && e.keyCode == 83) {
                e.preventDefault();
                this.updateSettings();
            }
        },

        scrollTo: function(sectionId) {
            this.activeSection = sectionId;
            this.scrollingTo = sectionId;
            var self = this;
            var el = document.getElementById(sectionId);
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            setTimeout(function() { self.scrollingTo = null; }, 800);
        },

        initSectionObserver: function() {
            var self = this;
            this.sectionObserver = new IntersectionObserver(function(entries) {
                if (self.scrollingTo) return;
                var visible = entries.filter(function(e) { return e.isIntersecting; });
                if (visible.length > 0) {
                    var topmost = visible.reduce(function(a, b) {
                        return a.boundingClientRect.top <= b.boundingClientRect.top ? a : b;
                    });
                    self.activeSection = topmost.target.id;
                }
            }, { rootMargin: '-10% 0px -70% 0px', threshold: 0 });
            this.settingsSections.forEach(function(s) {
                var el = document.getElementById(s.id);
                if (el) self.sectionObserver.observe(el);
            });
        },

        getSettings: function() {
            SettingsService.getSettings()
            .then((data) => {
                this.settings = this.$_.merge(
                    {
                      danger: { enabled: false, public:{nbdaydelete: 0}},
                      reviews: { enabled: false, public: { minReviewers: 1 } },
                      ai: { enabled: false, embeddingEnabled: false, public: { provider: 'openai', model: 'gpt-4o', temperature: 0.7, maxTokens: 4096, embeddingProvider: 'openai', embeddingModel: 'text-embedding-3-small', embeddingMaxDistance: 0.8 }, private: { apiUrl: '', apiKey: '', systemPrompt: '', userPrompt: '', azure: { deploymentName: '', apiVersion: '2024-06-01' }, embeddingApiUrl: '', embeddingApiKey: '', embeddingAzure: { deploymentName: '', apiVersion: '2024-06-01' } } }
                    },
                    data.data.datas
                  );
                  
                this.settingsOrig = this.$_.cloneDeep(this.settings);
                this.loading = false
                this.$nextTick(() => this.initSectionObserver());
            })
            .catch((err) => {
                Notify.create({
                    message: err.response.data.datas,
                    color: 'negative',
                    textColor:'white',
                    position: 'top-right'
                })
            })
        },

        updateSettings: function() {
            var min = 1;
            var max = 99;
            if(this.settings.reviews.public.minReviewers < min || this.settings.reviews.public.minReviewers > max) {
                this.settings.reviews.public.minReviewers = this.settings.reviews.public.minReviewers < min ? min: max;
            }
            SettingsService.updateSettings(this.settings)
            .then((data) => {
                this.settingsOrig = this.$_.cloneDeep(this.settings);
                this.$settings.refresh();
                Notify.create({
                    message: $t('msg.settingsUpdatedOk'),
                    color: 'positive',
                    textColor:'white',
                    position: 'top-right'
                })
            })
            .catch((err) => {
                Notify.create({
                    message: err.message || err.response.data.datas,
                    color: 'negative',
                    textColor:'white',
                    position: 'top-right'
                })
            })
        },

        revertToDefaults: function() {
            Dialog.create({
                title: $t('msg.revertingSettings'),
                message: $t('msg.revertingSettingsConfirm'),
                ok: {label: $t('btn.confirm'), color: 'negative'},
                cancel: {label: $t('btn.cancel'), color: 'white'}
            })
            .onOk(async () => {
                await SettingsService.revertDefaults();
                this.$settings.refresh();
                this.getSettings();
                Notify.create({
                    message: $t('settingsUpdatedOk'),
                    color: 'positive',
                    textColor:'white',
                    position: 'top-right'
                })
            })
        },

        importSettings: function(file) {
            var fileReader = new FileReader();
            fileReader.onloadend = async (e) => {
                try {
                    var settings = JSON.parse(fileReader.result);
                    if (typeof settings === 'object') {
                        Dialog.create({
                            title: $t('msg.importingSettings'),
                            message: $t('msg.importingSettingsConfirm'),
                            ok: {label: $t('btn.confirm'), color: 'negative'},
                            cancel: {label: $t('btn.cancel'), color: 'white'}
                        })
                        .onOk(async () => {
                            await SettingsService.updateSettings(settings);
                            this.getSettings();
                            Notify.create({
                                message: $t('msg.settingsImportedOk'),
                                color: 'positive',
                                textColor:'white',
                                position: 'top-right'
                            })
                        })
                    } else {
                        throw $t('err.jsonMustBeAnObject');
                    }
                }
                catch (err) {
                    console.log(err);
                    var errMsg = $t('err.importingSettingsError')
                    if (err.message) errMsg = $t('err.errorWhileParsingJsonContent',[err.message]);
                    Notify.create({
                        message: errMsg,
                        color: 'negative',
                        textColor: 'white',
                        position: 'top-right'
                    })
                }
            };
            var fileContent = new Blob(file, {type : 'application/json'});
            fileReader.readAsText(fileContent);
        },

        exportSettings: async function() {
            var response = await SettingsService.exportSettings();
            var blob = new Blob([JSON.stringify(response.data)], {type: "application/json"});
            var link = document.createElement('a');
            link.href = window.URL.createObjectURL(blob);
            link.download = decodeURIComponent(response.headers['content-disposition'].split('"')[1]);
            document.body.appendChild(link);
            link.click();
            link.remove();
        },

        reindexAll: function() {
            this.reindexing = true;
            this.reindexStarted = false;
            AiService.reindexAll()
            .then(() => {
                this.reindexStarted = true;
                Notify.create({
                    message: $t('aiReindexStarted'),
                    color: 'positive',
                    textColor: 'white',
                    position: 'top-right'
                });
            })
            .catch((err) => {
                Notify.create({
                    message: err.response?.data?.datas || $t('aiError'),
                    color: 'negative',
                    textColor: 'white',
                    position: 'top-right'
                });
            })
            .finally(() => { this.reindexing = false; });
        },

        unsavedChanges() {
            return JSON.stringify(this.settingsOrig) !== JSON.stringify(this.settings);
        }
    }
}