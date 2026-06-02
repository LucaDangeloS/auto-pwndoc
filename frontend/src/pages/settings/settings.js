import { Notify, Dialog } from 'quasar'

import SettingsService from '@/services/settings'
import UserService from '@/services/user'
import AiService from '@/services/ai'
import { notifyError, notifySuccess } from '@/services/ai-helpers'

import { $t } from 'boot/i18n'
import LanguageSelector from '@/components/language-selector';

const REINDEX_POLL_MS = 1500;
const TEST_LAST_RUN_KEY = 'autopwndoc.aiTestLastRun';

function safeClipboard(text) {
    if (navigator.clipboard && window.isSecureContext) {
        return navigator.clipboard.writeText(text);
    }
    // Fallback for insecure HTTP contexts
    return new Promise((resolve, reject) => {
        try {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.select();
            const ok = document.execCommand('copy');
            document.body.removeChild(textarea);
            if (ok) resolve(); else reject(new Error('copy failed'));
        } catch (err) {
            reject(err);
        }
    });
}

function loadLastTestRuns() {
    try {
        const raw = localStorage.getItem(TEST_LAST_RUN_KEY);
        return raw ? JSON.parse(raw) : { generation: null, embedding: null, vision: null };
    } catch (_) {
        return { generation: null, embedding: null, vision: null };
    }
}
function persistLastTestRuns(map) {
    try { localStorage.setItem(TEST_LAST_RUN_KEY, JSON.stringify(map)); } catch (_) { /* noop */ }
}

const DEFAULT_PROMPTS = {
    generateSystemPrompt: `You are a cybersecurity expert writing professional penetration test reports.
Generate clear, technical content for the "{fieldName}" section of a finding titled "{findingTitle}".
The content should be in HTML format using only simple tags: <p>, <ul>, <li>, <strong>, <em>, <code>.
Do not include any markdown, backticks, or code fences. Output only the HTML fragment, no wrapping document tags.
Reply exclusively in {language}.`,

    generateUserPrompt: `Finding title: "{findingTitle}"
Field to generate: {fieldName}
{similarVulnsBlock}
Write the {fieldName} content for this finding. Reply in {language}.`,

    completeSystemPrompt: `You are a cybersecurity expert writing professional penetration test reports.
Continue the "{fieldName}" section of the finding titled "{findingTitle}" naturally, maintaining the same technical tone and style.
Output only the continuation as an HTML fragment using: <p>, <ul>, <li>, <strong>, <em>, <code>.
Do not repeat the existing content. Do not include markdown or code fences.
Reply exclusively in {language}.`,

    completeUserPrompt: `Finding title: "{findingTitle}"
Field: {fieldName}
{similarVulnsBlock}
Existing content:
{text}

Continue from where the content ends. Reply in {language}.`,

    rewriteSystemPrompt: `You are a cybersecurity expert writing professional penetration test reports.
Rewrite the "{fieldName}" section of the finding titled "{findingTitle}" to be clearer, more concise, and more professional.
Output only the rewritten content as an HTML fragment using: <p>, <ul>, <li>, <strong>, <em>, <code>.
Do not include markdown or code fences.
Reply exclusively in {language}.`,

    rewriteUserPrompt: `Finding title: "{findingTitle}"
Field: {fieldName}
Content to rewrite:
{text}

Reply in {language}.`,

    fillProofsSystemPrompt: `You are a cybersecurity expert writing professional penetration test reports.
You will receive a proof-of-concept analysis of screenshots and evidence, along with the selected vulnerability details.
Your task is to write the Proof of Concept (poc) section that narrates the exploitation steps demonstrated in the images.

Rules:
- Output an HTML fragment using only: <p>, <ul>, <li>, <strong>, <em>, <code>, <img>
- Do NOT use markdown, backticks, or code fences
- Integrate the provided <img> tags at natural, logical positions within the narrative text
- The <img> tags must appear EXACTLY as provided (do not modify src attributes)
- Use the vulnerability title and description as context for accurate technical language
- Write in third person past tense (e.g. "The tester navigated to...", "It was observed that...")
- Be concise but technically precise
Reply exclusively in {language}.`,
    field_description_generateSystemPrompt: '',
    field_description_completeSystemPrompt: '',
    field_description_rewriteSystemPrompt: '',
    field_observation_generateSystemPrompt: '',
    field_observation_completeSystemPrompt: '',
    field_observation_rewriteSystemPrompt: '',
    field_remediation_generateSystemPrompt: '',
    field_remediation_completeSystemPrompt: '',
    field_remediation_rewriteSystemPrompt: '',
    field_poc_generateSystemPrompt: '',
    field_poc_completeSystemPrompt: '',
    field_poc_rewriteSystemPrompt: '',
    field_retestEvidence_generateSystemPrompt: '',
    field_retestEvidence_completeSystemPrompt: '',
    field_retestEvidence_rewriteSystemPrompt: '',

    executiveSummarySystemPrompt: `You are a cybersecurity expert writing executive summaries for professional penetration test reports.
Your target audience is management and non-technical stakeholders.
Write a concise, high-level executive summary of the overall security posture of the engagement.
The summary should convey the overall risk, the most critical issues, and the business impact without excessive technical jargon.
Output only an HTML fragment using: <p>, <ul>, <li>, <strong>, <em>.
Do not include markdown, backticks, or code fences.
Reply exclusively in {language}.`,

    severitySummarySystemPrompt: `You are a cybersecurity expert writing penetration test reports.
Summarise the {severity}-severity vulnerabilities found during the engagement in one concise paragraph.
Focus on common patterns, attack vectors, and the collective business impact of this group.
Output only an HTML fragment using: <p>, <ul>, <li>, <strong>, <em>, <code>.
Do not include markdown, backticks, or code fences.
Reply exclusively in {language}.`,

    vulnerabilityTranslationSystemPrompt: `You are a professional technical translator specializing in cybersecurity penetration test reports.
Translate HTML content from {fromLanguage} to {toLanguage}.

Rules:
- Preserve ALL HTML tags exactly as-is (do not modify, add, or remove any tags)
- Only translate the visible text content between tags
- Maintain the same technical terminology and security jargon in {toLanguage}
- Do NOT translate code snippets, commands, URLs, file paths, or technical identifiers
- Do NOT wrap the output in markdown code fences or add any extra markup
- Output only the translated HTML fragment`
};

const DEFAULT_CHART_THEME = {
    titleColor: '#000000',
    titleSize: 16,
    titleBold: true,
    legendColor: '#404040',
    legendSize: 11,
    legendPosition: 'r',
    dataLabelColor: '#ffffff',
    dataLabelSize: 11,
    dataLabelBold: true,
    dataLabelMode: 'percent',
    borderEnabled: false,
    borderColor: '#d9e2f3',
    borderWidth: 1,
    plotAreaFill: 'none',
    view3DRotX: 30,
    view3DRotY: 30,
    view3DPerspective: 30,
    view3DRightAngleAxes: false,
    pieExplosion: 0,
};

export default {
    data: () => {
        return {
            loading: true,
            UserService: UserService,
            settings: {
                danger:{enabled:false,public:{nbdaydelete: 0}},
                reviews:{enabled:false},
                mcp:{enabled:false,apiKey:'',apiKeyCreatedAt:null,appUrl:''},
                ai:{enabled:false,embeddingEnabled:false,visionEnabled:false,public:{provider:'openai',model:'gpt-4o',temperature:0.7,maxTokens:4096,embeddingProvider:'openai',embeddingModel:'text-embedding-3-small',embeddingMaxDistance:0.8,vulnerabilityProcessing:{autoTranslateOnSave:false,matchThreshold:0.35}},visionPublic:{visionProvider:'openai',visionModel:'gpt-4o'},private:{apiUrl:'',apiKey:'',systemPrompt:'',userPrompt:'',azure:{deploymentName:'',apiVersion:'2024-06-01'},embeddingApiUrl:'',embeddingApiKey:'',embeddingAzure:{deploymentName:'',apiVersion:'2024-06-01'},visionApiUrl:'',visionApiKey:'',visionAzure:{deploymentName:'',apiVersion:'2024-06-01'},visionSystemPrompt:'',visionAnonymizeLlm:false,visionAnonymizeRegex:false,generateSystemPrompt:'',generateUserPrompt:'',completeSystemPrompt:'',completeUserPrompt:'',rewriteSystemPrompt:'',rewriteUserPrompt:'',fillProofsSystemPrompt:'',executiveSummarySystemPrompt:'',severitySummarySystemPrompt:'',vulnerabilityTranslationSystemPrompt:'',field_description_generateSystemPrompt:'',field_description_completeSystemPrompt:'',field_description_rewriteSystemPrompt:'',field_observation_generateSystemPrompt:'',field_observation_completeSystemPrompt:'',field_observation_rewriteSystemPrompt:'',field_remediation_generateSystemPrompt:'',field_remediation_completeSystemPrompt:'',field_remediation_rewriteSystemPrompt:'',field_poc_generateSystemPrompt:'',field_poc_completeSystemPrompt:'',field_poc_rewriteSystemPrompt:'',field_retestEvidence_generateSystemPrompt:'',field_retestEvidence_completeSystemPrompt:'',field_retestEvidence_rewriteSystemPrompt:''}},
                report:{enabled:true,public:{chartTheme:{...DEFAULT_CHART_THEME}}}
            },
            settingsOrig : {danger:{enabled:false},reviews:{enabled:false},mcp:{enabled:false},ai:{enabled:false}},
            canEdit: false,
            showApiKey: false,
            showEmbeddingApiKey: false,
            showVisionApiKey: false,
            showMcpApiKey: false,
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
                { id: 'section-api', label: 'apiSettings' },
                { id: 'section-mcp', label: 'mcpSettings' },
                { id: 'section-actions', label: 'saveSettings' }
            ],
            apiKeys: [],
            apiKeyName: '',
            apiKeyCreating: false,
            newlyCreatedKey: null,
            DEFAULT_PROMPTS,
            promptTags: ['{language}','{fieldName}','{findingTitle}','{similarVulnsBlock}','{text}','{auditName}','{severity}','{findingsDigest}','{visionSummary}','{imageRefsBlock}','{vulnDescription}','{fromLanguage}','{toLanguage}','{fromLocale}','{toLocale}'],
            vulnerabilityTranslationPromptHint: 'Tags: {fieldName}, {fromLanguage}, {toLanguage}, {fromLocale}, {toLocale}. User prompt is fixed.',
            aiTest: {
                generation: { loading: false, status: null, response: '', controller: null },
                embedding:  { loading: false, status: null, response: '', controller: null },
                vision:     { loading: false, status: null, response: '', controller: null }
            },
            aiTestLastRun: loadLastTestRuns(),
            saving: false,
            reindexStatus: {
                inProgress: false,
                total: 0,
                processed: 0,
                failed: 0,
                startedAt: null,
                finishedAt: null,
                lastError: null
            },
            _reindexTimer: null,
            modelLists: {
                generation: { loading: false, source: null, models: [], error: '' },
                embedding:  { loading: false, source: null, models: [], error: '' },
                vision:     { loading: false, source: null, models: [], error: '' }
            },
            cvssVersionOptions: [
                { label: 'CVSS 3.1', value: '3.1' },
                { label: 'CVSS 4.0', value: '4.0' }
            ],
            chartLegendPositionOptions: [
                { label: $t('legendPositionRight'), value: 'r' },
                { label: $t('legendPositionBottom'), value: 'b' },
                { label: $t('legendPositionTop'), value: 't' },
                { label: $t('legendPositionLeft'), value: 'l' },
                { label: $t('legendPositionTopRight'), value: 'tr' }
            ],
            chartDataLabelModeOptions: [
                { label: $t('dataLabelValue'), value: 'value' },
                { label: $t('dataLabelPercent'), value: 'percent' },
                { label: $t('dataLabelBoth'), value: 'both' },
                { label: $t('dataLabelNone'), value: 'none' }
            ],
            aiProviderOptions: [
                { label: 'OpenAI', value: 'openai' },
                { label: 'Anthropic', value: 'anthropic' },
                { label: 'Ollama', value: 'ollama' },
                { label: 'Azure OpenAI', value: 'azure-openai' },
                { label: 'OpenAI Compatible', value: 'openai-compatible' },
                { label: 'OpenWebUI', value: 'openwebui' }
            ],
            aiFieldPromptFields: [
                { key: 'description',    labelKey: 'fieldDescription',    icon: 'description' },
                { key: 'observation',    labelKey: 'fieldObservation',     icon: 'visibility' },
                { key: 'remediation',    labelKey: 'fieldRemediation',     icon: 'build' },
                { key: 'poc',            labelKey: 'fieldPoc',             icon: 'bug_report' },
                { key: 'retestEvidence', labelKey: 'fieldRetestEvidence',  icon: 'replay' }
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
                'openai-compatible': 'http://<host>:<port>',
                'openwebui': 'http://<host>:3000/api'
            };
            return defaults[this.settings.ai.public.provider] || '';
        },
        embeddingDefaultUrl: function() {
            var defaults = {
                'openai': 'https://api.openai.com/v1',
                'anthropic': '',
                'ollama': 'http://localhost:11434',
                'azure-openai': 'https://<instance>.openai.azure.com',
                'openai-compatible': 'http://<host>:<port>',
                'openwebui': 'http://<host>:3000/api'
            };
            return defaults[this.settings.ai.public.embeddingProvider] || '';
        },
        visionDefaultUrl: function() {
            var defaults = {
                'openai': 'https://api.openai.com/v1',
                'anthropic': 'https://api.anthropic.com/v1',
                'ollama': 'http://localhost:11434',
                'azure-openai': 'https://<instance>.openai.azure.com',
                'openai-compatible': 'http://<host>:<port>',
                'openwebui': 'http://<host>:3000/api'
            };
            return defaults[(this.settings.ai.visionPublic && this.settings.ai.visionPublic.visionProvider) || 'openai'] || '';
        },
        mcpEndpointUrl: function() {
            var appUrl = (this.settings.mcp && this.settings.mcp.appUrl) || window.location.origin;
            return appUrl.replace(/\/$/, '') + '/api/mcp';
        },
        mcpClaudeConfig: function() {
            return JSON.stringify({
                mcpServers: {
                    autopwndoc: {
                        type: 'http',
                        url: this.mcpEndpointUrl,
                        headers: {
                            'X-API-Key': this.settings.mcp.apiKey || 'YOUR_API_KEY_HERE'
                        }
                    }
                }
            }, null, 2);
        },
        mcpCurlExample: function() {
            var key = this.settings.mcp.apiKey || 'YOUR_API_KEY_HERE';
            return `curl -sk ${this.mcpEndpointUrl} \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: ${key}" \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'`;
        }
    },

    mounted: function() {
        if (UserService.isAllowed('settings:read')) {
            this.getSettings()
            this.canEdit = this.UserService.isAllowed('settings:update');
            document.addEventListener('keydown', this._listener, false)
            // Pick up any reindex that was triggered by a different session
            AiService.reindexStatus()
                .then((res) => {
                    const data = res.data && res.data.datas ? res.data.datas : null;
                    if (!data) return;
                    this.reindexStatus = data;
                    if (data.inProgress) this._startReindexPolling();
                })
                .catch(() => { /* silent */ });
        }
        else {
            this.loading = false
        }
    },

    unmounted: function() {
        document.removeEventListener('keydown', this._listener, false)
        if (this.sectionObserver) this.sectionObserver.disconnect();
        if (this._reindexTimer) {
            clearInterval(this._reindexTimer);
            this._reindexTimer = null;
        }
        Object.keys(this.aiTest).forEach((k) => {
            if (this.aiTest[k] && this.aiTest[k].controller) {
                try { this.aiTest[k].controller.abort(); } catch (_) { /* noop */ }
            }
        });
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
            SettingsService.listApiKeys()
            .then(res => { this.apiKeys = res.data.datas || []; })
            .catch(() => {});

            SettingsService.getSettings()
            .then((data) => {
                this.settings = this.$_.merge(
                    {
                      danger: { enabled: false, public:{nbdaydelete: 0}},
                      report: { enabled: true, public: { chartTheme: { ...DEFAULT_CHART_THEME } } },
                      reviews: { enabled: false, public: { minReviewers: 1 } },
                      mcp: { enabled: false, apiKey: '', apiKeyCreatedAt: null, appUrl: '' },
                      ai: { enabled: false, embeddingEnabled: false, visionEnabled: false, public: { provider: 'openai', model: 'gpt-4o', temperature: 0.7, maxTokens: 4096, embeddingProvider: 'openai', embeddingModel: 'text-embedding-3-small', embeddingMaxDistance: 0.8, vulnerabilityProcessing: { autoTranslateOnSave: false, matchThreshold: 0.35 } }, visionPublic: { visionProvider: 'openai', visionModel: 'gpt-4o' }, private: { apiUrl: '', apiKey: '', systemPrompt: '', userPrompt: '', azure: { deploymentName: '', apiVersion: '2024-06-01' }, embeddingApiUrl: '', embeddingApiKey: '', embeddingAzure: { deploymentName: '', apiVersion: '2024-06-01' }, visionApiUrl: '', visionApiKey: '', visionAzure: { deploymentName: '', apiVersion: '2024-06-01' }, visionSystemPrompt: '', visionAnonymizeLlm: false, visionAnonymizeRegex: false, vulnerabilityTranslationSystemPrompt: '', field_description_generateSystemPrompt: '', field_description_completeSystemPrompt: '', field_description_rewriteSystemPrompt: '', field_observation_generateSystemPrompt: '', field_observation_completeSystemPrompt: '', field_observation_rewriteSystemPrompt: '', field_remediation_generateSystemPrompt: '', field_remediation_completeSystemPrompt: '', field_remediation_rewriteSystemPrompt: '', field_poc_generateSystemPrompt: '', field_poc_completeSystemPrompt: '', field_poc_rewriteSystemPrompt: '', field_retestEvidence_generateSystemPrompt: '', field_retestEvidence_completeSystemPrompt: '', field_retestEvidence_rewriteSystemPrompt: '' } }
                    },
                    data.data.datas
                  );
                  
                const promptFields = ['generateSystemPrompt','generateUserPrompt','completeSystemPrompt','completeUserPrompt','rewriteSystemPrompt','rewriteUserPrompt','fillProofsSystemPrompt','executiveSummarySystemPrompt','severitySummarySystemPrompt','vulnerabilityTranslationSystemPrompt','field_description_generateSystemPrompt','field_description_completeSystemPrompt','field_description_rewriteSystemPrompt','field_observation_generateSystemPrompt','field_observation_completeSystemPrompt','field_observation_rewriteSystemPrompt','field_remediation_generateSystemPrompt','field_remediation_completeSystemPrompt','field_remediation_rewriteSystemPrompt','field_poc_generateSystemPrompt','field_poc_completeSystemPrompt','field_poc_rewriteSystemPrompt','field_retestEvidence_generateSystemPrompt','field_retestEvidence_completeSystemPrompt','field_retestEvidence_rewriteSystemPrompt'];
                promptFields.forEach(k => {
                    if (!this.settings.ai.private[k]) this.settings.ai.private[k] = DEFAULT_PROMPTS[k] || '';
                });
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
            if (this.saving) return;
            var min = 1;
            var max = 99;
            if(this.settings.reviews.public.minReviewers < min || this.settings.reviews.public.minReviewers > max) {
                this.settings.reviews.public.minReviewers = this.settings.reviews.public.minReviewers < min ? min: max;
            }
            this.saving = true;
            SettingsService.updateSettings(this.settings)
            .then((data) => {
                this.settingsOrig = this.$_.cloneDeep(this.settings);
                this.$settings.refresh();
                notifySuccess('msg.settingsUpdatedOk');
            })
            .catch((err) => {
                notifyError(err, 'msg.errorOccurred');
            })
            .finally(() => { this.saving = false; });
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

        resetPromptToDefault: function(promptKey) {
            this.settings.ai.private[promptKey] = DEFAULT_PROMPTS[promptKey] || '';
        },

        colorSwatchStyle: function(value) {
            return { '--settings-color': value || '#ffffff' };
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
            Dialog.create({
                title: $t('aiReindexConfirmTitle'),
                message: $t('aiReindexConfirmMessage'),
                ok: { label: $t('btn.confirm'), color: 'primary', noCaps: true },
                cancel: { label: $t('btn.cancel'), color: 'grey-7', flat: true, noCaps: true }
            }).onOk(() => {
                this.reindexing = true;
                this.reindexStarted = false;
                AiService.reindexAll()
                .then((res) => {
                    this.reindexStarted = true;
                    const data = res.data && res.data.datas ? res.data.datas : {};
                    if (data.status) this.reindexStatus = data.status;
                    notifySuccess(data.alreadyRunning ? 'aiReindexAlreadyRunning' : 'aiReindexStarted');
                    this._startReindexPolling();
                })
                .catch((err) => {
                    notifyError(err, 'aiError');
                })
                .finally(() => { this.reindexing = false; });
            });
        },

        _startReindexPolling: function() {
            if (this._reindexTimer) clearInterval(this._reindexTimer);
            const tick = () => {
                AiService.reindexStatus()
                    .then((res) => {
                        const data = res.data && res.data.datas ? res.data.datas : null;
                        if (!data) return;
                        this.reindexStatus = data;
                        if (!data.inProgress) {
                            clearInterval(this._reindexTimer);
                            this._reindexTimer = null;
                            if (data.processed > 0 || data.failed > 0) {
                                if (data.failed > 0) {
                                    Notify.create({
                                        message: $t('aiReindexFinishedWithFailures', { ok: data.processed, failed: data.failed }),
                                        color: 'warning',
                                        textColor: 'white',
                                        position: 'top-right',
                                        timeout: 6000
                                    });
                                } else {
                                    notifySuccess('aiReindexFinished', { ok: data.processed });
                                }
                            }
                        }
                    })
                    .catch(() => { /* silent */ });
            };
            tick();
            this._reindexTimer = setInterval(tick, REINDEX_POLL_MS);
        },

        testAiConnection: function(type) {
            // Cancel previous test for this type if any
            if (this.aiTest[type].controller) {
                try { this.aiTest[type].controller.abort(); } catch (_) { /* noop */ }
            }
            const controller = new AbortController();
            this.aiTest[type].controller = controller;
            this.aiTest[type].loading = true;
            this.aiTest[type].status = null;
            this.aiTest[type].response = '';
            AiService.testConnection(type, controller.signal)
            .then((res) => {
                const data = res.data.datas;
                this.aiTest[type].status = data.ok ? 'ok' : 'error';
                this.aiTest[type].response = data.response || '';
                this.aiTestLastRun = { ...this.aiTestLastRun, [type]: new Date().toISOString() };
                persistLastTestRuns(this.aiTestLastRun);
            })
            .catch((err) => {
                if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return;
                this.aiTest[type].status = 'error';
                this.aiTest[type].response = err.response?.data?.datas || err.message || $t('aiTestFailed');
                this.aiTestLastRun = { ...this.aiTestLastRun, [type]: new Date().toISOString() };
                persistLastTestRuns(this.aiTestLastRun);
            })
            .finally(() => {
                this.aiTest[type].loading = false;
                this.aiTest[type].controller = null;
            });
        },

        clearAiTestResult: function(type) {
            this.aiTest[type].status = null;
            this.aiTest[type].response = '';
        },

        formatLastTestRun: function(type) {
            const iso = this.aiTestLastRun ? this.aiTestLastRun[type] : null;
            if (!iso) return '';
            try {
                const d = new Date(iso);
                return $t('aiTestLastRunAt', { time: d.toLocaleString() });
            } catch (_) {
                return '';
            }
        },

        loadModelList: function(type) {
            const ml = this.modelLists[type];
            if (ml.loading) return;
            ml.loading = true;
            ml.error = '';
            AiService.listModels(type)
                .then((res) => {
                    const data = res.data && res.data.datas ? res.data.datas : {};
                    ml.source = data.source || 'manual';
                    ml.models = Array.isArray(data.models) ? data.models : [];
                    if (data.ok === false && data.error) ml.error = data.error;
                })
                .catch((err) => {
                    ml.source = 'remote';
                    ml.models = [];
                    ml.error = err.response?.data?.datas || err.message || 'Failed to load models';
                })
                .finally(() => { ml.loading = false; });
        },

        applyDefaultUrlIfEmpty: function(type) {
            if (type === 'generation' && !this.settings.ai.private.apiUrl) {
                this.settings.ai.private.apiUrl = this.aiDefaultUrl || '';
            } else if (type === 'embedding' && !this.settings.ai.private.embeddingApiUrl) {
                this.settings.ai.private.embeddingApiUrl = this.embeddingDefaultUrl || '';
            } else if (type === 'vision' && !this.settings.ai.private.visionApiUrl) {
                this.settings.ai.private.visionApiUrl = this.visionDefaultUrl || '';
            }
        },

        rotateMcpKey: function() {
            Dialog.create({
                title: $t('mcpGenerateKey'),
                message: $t('mcpRotateKeyConfirm'),
                ok: {label: $t('btn.confirm'), color: 'negative'},
                cancel: {label: $t('btn.cancel'), color: 'white'}
            })
            .onOk(() => {
                SettingsService.rotateMcpKey()
                .then((res) => {
                    this.settings.mcp.apiKey = res.data.datas.apiKey;
                    this.settings.mcp.apiKeyCreatedAt = res.data.datas.apiKeyCreatedAt;
                    this.settingsOrig = this.$_.cloneDeep(this.settings);
                    Notify.create({ message: $t('mcpKeyRotated'), color: 'positive', textColor: 'white', position: 'top-right' });
                })
                .catch((err) => {
                    Notify.create({ message: err.response?.data?.datas || err.message, color: 'negative', textColor: 'white', position: 'top-right' });
                });
            });
        },

        clearMcpKey: function() {
            Dialog.create({
                title: $t('mcpClearKeyConfirmTitle'),
                message: $t('mcpClearKeyConfirmMessage'),
                ok: { label: $t('mcpClearKey'), color: 'negative', unelevated: true, noCaps: true },
                cancel: { label: $t('btn.cancel'), color: 'grey-7', flat: true, noCaps: true }
            }).onOk(() => {
                SettingsService.clearMcpKey()
                .then(() => {
                    this.settings.mcp.apiKey = '';
                    this.settings.mcp.apiKeyCreatedAt = null;
                    this.settingsOrig = this.$_.cloneDeep(this.settings);
                    notifySuccess('mcpKeyCleared');
                })
                .catch((err) => {
                    notifyError(err);
                });
            });
        },

        createApiKey: function() {
            if (!this.apiKeyName.trim()) {
                Notify.create({ message: $t('apiKeyNameRequired'), color: 'warning', position: 'top-right' });
                return;
            }
            this.apiKeyCreating = true;
            SettingsService.createApiKey(this.apiKeyName.trim())
            .then((res) => {
                var created = res.data.datas;
                this.newlyCreatedKey = created.key;
                this.apiKeys.push({
                    id: created.id,
                    name: created.name,
                    keyPrefix: created.key.substring(0, 8),
                    createdAt: created.createdAt,
                    lastUsedAt: null
                });
                this.apiKeyName = '';
                notifySuccess('apiKeyCreated');
            })
            .catch((err) => { notifyError(err); })
            .finally(() => { this.apiKeyCreating = false; });
        },

        revokeApiKey: function(id) {
            Dialog.create({
                title: $t('apiKeyRevoke'),
                message: $t('apiKeyRevokeConfirm'),
                ok: { label: $t('apiKeyRevoke'), color: 'negative', unelevated: true, noCaps: true },
                cancel: { label: $t('btn.cancel'), color: 'grey-7', flat: true, noCaps: true }
            }).onOk(() => {
                SettingsService.deleteApiKey(id)
                .then(() => {
                    this.apiKeys = this.apiKeys.filter(k => k.id !== id);
                    if (this.newlyCreatedKey) this.newlyCreatedKey = null;
                    notifySuccess('apiKeyRevoked');
                })
                .catch((err) => { notifyError(err); });
            });
        },

        copyText: function(text) {
            safeClipboard(text)
                .then(() => notifySuccess('copied'))
                .catch(() => notifyError(null, 'copyFailed'));
        },

        unsavedChanges() {
            return !this.$_.isEqual(this.settingsOrig, this.settings);
        }
    }
}
