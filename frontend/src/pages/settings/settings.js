import { Notify, Dialog } from 'quasar'

import SettingsService from '@/services/settings'
import UserService from '@/services/user'
import AiService from '@/services/ai'
import SpellcheckService from '@/services/spellcheck'
import { notifyError, notifySuccess } from '@/services/ai-helpers'

import { $t } from 'boot/i18n'
import { rankSearchResults } from '@/services/search-ranking'
import LanguageSelector from '@/components/language-selector';

const REINDEX_POLL_MS = 1500;
const TEST_LAST_RUN_KEY = 'autopwndoc.aiTestLastRun';

const DEFAULT_VISION_REGEX_RULES = [
    { name: 'URLs', pattern: '\\b(?:(?:https?|ftp):\\/\\/|www\\.)[A-Za-z0-9._~:/?#\\[\\]@!$&\'()*+,;=%-]*[A-Za-z0-9_~/#\\]=%-]', flags: 'gi', replacement: '[URL_REDACTED]', enabled: true },
    { name: 'IPv4 addresses', pattern: '\\b(?:\\d{1,3}\\.){3}\\d{1,3}\\b', flags: 'g', replacement: '[IP_REDACTED]', enabled: true },
    { name: 'IPv6 addresses', pattern: '(?<![0-9A-Fa-f:])(?:(?:[0-9A-Fa-f]{1,4}:){7}[0-9A-Fa-f]{1,4}|(?:[0-9A-Fa-f]{1,4}:){1,7}:|(?:[0-9A-Fa-f]{1,4}:){1,6}:[0-9A-Fa-f]{1,4}|(?:[0-9A-Fa-f]{1,4}:){1,5}(?::[0-9A-Fa-f]{1,4}){1,2}|(?:[0-9A-Fa-f]{1,4}:){1,4}(?::[0-9A-Fa-f]{1,4}){1,3}|(?:[0-9A-Fa-f]{1,4}:){1,3}(?::[0-9A-Fa-f]{1,4}){1,4}|(?:[0-9A-Fa-f]{1,4}:){1,2}(?::[0-9A-Fa-f]{1,4}){1,5}|[0-9A-Fa-f]{1,4}:(?:(?::[0-9A-Fa-f]{1,4}){1,6})|:(?:(?::[0-9A-Fa-f]{1,4}){1,7}|:))(?![0-9A-Fa-f:])', flags: 'g', replacement: '[IP_REDACTED]', enabled: true },
    { name: 'Email addresses', pattern: '\\b[A-Za-z0-9._%+\\-]+@[A-Za-z0-9.\\-]+\\.[A-Za-z]{2,}\\b', flags: 'g', replacement: '[EMAIL_REDACTED]', enabled: true },
    { name: 'Domain names', pattern: '\\b(?:[a-zA-Z0-9\\-]+\\.){2,}[a-zA-Z]{2,}\\b', flags: 'g', replacement: '[DOMAIN_REDACTED]', enabled: true },
    { name: 'Common hostnames', pattern: '\\b(?:server|host|dc|ad|ws|pc|laptop|desktop|node|worker|master|slave|db|sql|web|app|api|proxy|vpn|fw|firewall|router|switch|lb)\\d*[-\\w]*', flags: 'gi', replacement: '[HOST_REDACTED]', enabled: true }
];

const DEFAULT_MCP_GUIDANCE = {
    general: `This server edits penetration-test audits. When you create or change finding content, match the style the rest of the report is written in, unless the user explicitly asks for something different.

Use formal, impersonal, technically precise language. Executive and severity prose may be slightly more management-facing. These are defaults to keep new and edited content consistent with the existing report; explicit user instructions always take precedence.`,
    evidence: `Ground every statement in evidence actually present in the audit or finding. Do not invent affected assets, endpoints, software versions, CVEs, credentials, payloads, observed responses, exploitation results, severities, or CVSS values. Use conditional language for consequences that are not explicitly confirmed.

The poc field is the primary evidence field. Always populate it when documenting a finding, and keep it limited to the tested entry point or service, the action performed, and the observable result.`,
    html: `Write finding text fields as valid HTML, never Markdown. This applies to description, poc, observation, remediation, and retestEvidence.

Use <p> for paragraphs, <strong>/<em> for emphasis, <pre><code> for code blocks, <ul>/<ol>/<li> for lists, and <a href="..."> for links. Keep literal commands, requests, payloads, and values inside <code> or <pre><code>.`,
    fieldStyle: `Per-field house style:
- description: ~90-140 words, normally two short paragraphs. Cover the vulnerable condition, why it is insecure, a realistic attack scenario, and the principal potential impact. Do not include reproduction steps or remediation.
- observation: ~45-90 words recording only target-specific conditions actually observed. Do not include generic theory, reproduction steps, or remediation. Leave blank if there is no evidence for it.
- poc: a concise, reproducible sequence with the tested entry point or service, the action performed, and the observable result. Evidence only.
- remediation: one short recommendation paragraph, then 3-5 actionable <li> items ordered from the definitive fix to secure configuration/least privilege, compensating controls, and validation. Recommend a currently supported vendor-fixed release without inventing a version number.
- retestEvidence: state what was retested, the observed result, and whether the original weakness remains reproducible, distinguishing a full correction from a partial mitigation. Never infer pass/fail without explicit retest evidence.`,
    libraryUsage: `Prefer existing library wording before writing a finding from scratch. Use search_similar_vulnerabilities or list_vulnerabilities to find a relevant entry, then apply_vulnerability_to_finding when the library entry matches the finding context. After applying library content, adjust only the target-specific evidence and wording that the user or audit evidence supports.`,
    findingFields: `Finding fields (all optional except title on create):
  title                 (string, plain text) Vulnerability title.
  description           (string, HTML) What the vulnerability is and how it was identified.
  poc                   (string, HTML) Proof of concept: reproduction steps, tool output, payloads, screenshots.
  observation           (string, HTML) Additional analyst notes or context. Leave blank unless the user explicitly asks for it.
  remediation           (string, HTML) Recommended fix or mitigation.
  references            (array of strings) URLs or identifiers such as CVEs, CWEs, or security advisories.
  cvssv3                (string) CVSS 3.1 vector, e.g. "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H".
  cvssv4                (string) CVSS 4.0 vector, e.g. "CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:H/VA:H/SC:N/SI:N/SA:N".
  priority              (integer 1-4) Remediation priority: 1=Low 2=Medium 3=High 4=Urgent.
  remediationComplexity (integer 1-3) Fix effort: 1=Low 2=Medium 3=High.
  status                (integer) 0=Completed 1=In progress (default) 2=For review 3=Improvement needed.
  taxonomies            (array of {type, category, subcategory}) Vulnerability classification.
  retestEvidence        (string, HTML) Retest observations for retest audits: what was retested and the observed result.
  retestStatus          (string) Retest outcome: "ok"=fixed, "ko"=still vulnerable, "partial"=partially mitigated, "unknown"=not retested (default). Never set ok/ko/partial without explicit retest evidence.`
};

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

const EDITOR_PROMPT_ACTIONS = [
    { key: 'generate', label: 'aiPromptSectionGenerate' },
    { key: 'complete', label: 'aiPromptSectionComplete' },
    { key: 'rewrite', label: 'aiPromptSectionRewrite' }
];

const EDITOR_PROMPT_FIELDS = [
    { key: 'description', label: 'fieldDescription', icon: 'description' },
    { key: 'observation', label: 'fieldObservation', icon: 'visibility' },
    { key: 'remediation', label: 'fieldRemediation', icon: 'build' },
    { key: 'poc', label: 'fieldPoc', icon: 'bug_report' },
    { key: 'retestEvidence', label: 'fieldRetestEvidence', icon: 'replay' }
];

const AI_PROMPT_GROUPS = [
    {
        label: 'aiEditorPrompts',
        description: 'aiEditorPromptsDescription',
        targets: EDITOR_PROMPT_FIELDS.map(field => ({
            ...field,
            anonymization: true,
            operations: [
                ...EDITOR_PROMPT_ACTIONS.map(action => ({ label: action.label, prefix: 'field_' + field.key + '_' + action.key })),
                ...(field.key === 'poc' ? [{ label: 'aiPromptSectionFillProofs', prefix: 'fillProofs' }] : [])
            ]
        }))
    },
    {
        label: 'searchSimilarFromProofs',
        description: 'aiProofFindingPromptsDescription',
        targets: [
            { key: 'title', label: 'title', icon: 'title' },
            { key: 'description', label: 'fieldDescription', icon: 'description' },
            { key: 'references', label: 'references', icon: 'link' },
            { key: 'remediation', label: 'fieldRemediation', icon: 'build' },
            { key: 'cvssv3', label: 'CVSS 3.1', icon: 'speed' },
            { key: 'cvssv4', label: 'CVSS 4.0', icon: 'speed' },
            { key: 'poc', label: 'fieldPoc', icon: 'bug_report' }
        ].map(field => ({ ...field, operations: [{ prefix: 'proof_' + field.key }] }))
    },
    {
        label: 'aiOtherPrompts',
        targets: [
            { key: 'executiveSummary', label: 'aiPromptSectionExecutiveSummary', icon: 'summarize' },
            { key: 'severitySummary', label: 'aiPromptSectionSeveritySummary', icon: 'summarize' },
            { key: 'retestSummary', label: 'retestSummary', icon: 'summarize' },
            { key: 'vulnerabilityTranslation', label: 'aiPromptSectionVulnerabilityTranslation', icon: 'translate' },
        ].map(target => ({
            ...target,
            operations: target.key === 'vulnerabilityTranslation' ? [{ prefix: target.key }] :
                EDITOR_PROMPT_ACTIONS.map(action => ({
                    label: action.label,
                    prefix: target.key + (action.key === 'generate' ? '' : action.key[0].toUpperCase() + action.key.slice(1))
                }))
        }))
    }
];

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
                authentication:{enforce2fa:false,sso:{enabled:false,public:{providerId:'oauth2',providerName:'SSO',registrationEnabled:false,autoLinkExistingUsers:false,authorizationUrl:'',tokenUrl:'',userInfoUrl:'',scope:'openid profile email',subjectClaim:'sub',usernameClaim:'preferred_username',firstnameClaim:'given_name',lastnameClaim:'family_name',emailClaim:'email'},private:{clientId:'',clientSecret:''}}},
                mcp:{enabled:false,appUrl:'',guidance:{...DEFAULT_MCP_GUIDANCE}},
                ai:{enabled:false,embeddingEnabled:false,visionEnabled:false,public:{provider:'openai',model:'gpt-4o',temperature:0.7,maxTokens:32000,embeddingProvider:'openai',embeddingModel:'text-embedding-3-small',embeddingMaxDistance:0.8,vulnerabilityProcessing:{autoTranslateOnSave:false,matchThreshold:0.35}},visionPublic:{visionProvider:'openai',visionModel:'gpt-4o',visionTemperature:0.7,visionMaxTokens:32000},private:{apiUrl:'',apiKey:'',systemPrompt:'',userPrompt:'',azure:{deploymentName:'',apiVersion:'2024-06-01'},embeddingApiUrl:'',embeddingApiKey:'',embeddingAzure:{deploymentName:'',apiVersion:'2024-06-01'},visionApiUrl:'',visionApiKey:'',visionAzure:{deploymentName:'',apiVersion:'2024-06-01'},visionAnonymizeLlm:false,visionAnonymizeRegex:false,anonymizeReviewBeforeSend:false,visionAnonymizeRegexRules:DEFAULT_VISION_REGEX_RULES.map(rule => ({...rule})),field_description_generateSystemPrompt:'',field_description_completeSystemPrompt:'',field_description_rewriteSystemPrompt:'',field_observation_generateSystemPrompt:'',field_observation_completeSystemPrompt:'',field_observation_rewriteSystemPrompt:'',field_remediation_generateSystemPrompt:'',field_remediation_completeSystemPrompt:'',field_remediation_rewriteSystemPrompt:'',field_poc_generateSystemPrompt:'',field_poc_completeSystemPrompt:'',field_poc_rewriteSystemPrompt:'',field_retestEvidence_generateSystemPrompt:'',field_retestEvidence_completeSystemPrompt:'',field_retestEvidence_rewriteSystemPrompt:''}},
                report:{enabled:true,public:{chartTheme:{...DEFAULT_CHART_THEME},enableSpellCheck:true},private:{languageToolUrl:''}}
            },
            settingsOrig : {danger:{enabled:false},reviews:{enabled:false},mcp:{enabled:false},ai:{enabled:false}},
            canEdit: false,
            spellcheckTest: { loading: false, result: null },
            dictWords: [],
            newDictWord: '',
            dictLoading: false,
            showApiKey: false,
            showEmbeddingApiKey: false,
            showVisionApiKey: false,
            showSsoClientSecret: false,
            reindexing: false,
            reindexStarted: false,
            activeSection: 'section-general',
            sectionObserver: null,
            scrollingTo: null,
            settingsSections: [
                { id: 'section-general', label: 'generalSettings', children: [] },
                { id: 'section-authentication', label: 'authenticationSettings', children: [
                    { id: 'sub-auth-2fa', label: 'twoFactorEnforcement' },
                    { id: 'sub-auth-sso', label: 'ssoSettings' },
                    { id: 'sub-auth-sso-registration', label: 'ssoRegistration' },
                    { id: 'sub-auth-sso-claims', label: 'ssoClaims' }
                ] },
                { id: 'section-danger', label: 'dangerSettings', children: [
                    { id: 'sub-danger-autodelete', label: 'autoDeleteReport' }
                ] },
                { id: 'section-reports', label: 'reports', children: [
                    { id: 'sub-reports-images-border', label: 'reportsImagesBorder' },
                    { id: 'sub-reports-spellcheck', label: 'spellcheckSettings' },
                    { id: 'sub-reports-dictionary', label: 'spellcheckDictionary' },
                    { id: 'sub-reports-cvss-colors', label: 'cvssColors' },
                    { id: 'sub-reports-remediation-complexity', label: 'remediationColorsComplexity' },
                    { id: 'sub-reports-remediation-priority', label: 'remediationColorsPriority' },
                    { id: 'sub-reports-captions', label: 'captions' },
                    { id: 'sub-reports-chart-theme', label: 'chartTheme' }
                ] },
                { id: 'section-reviews', label: 'reviews', children: [
                    { id: 'sub-reviews-audit-update', label: 'auditUpdateAfterApproval' },
                    { id: 'sub-reviews-mandatory', label: 'mandatoryReview' }
                ] },
                { id: 'section-ai', label: 'aiSettings', children: [
                    { id: 'sub-ai-provider', label: 'aiProvider' },
                    { id: 'sub-ai-embedding', label: 'aiEmbeddingSection' },
                    { id: 'sub-ai-vuln-processing', label: 'aiVulnerabilityProcessing' },
                    { id: 'sub-ai-vision', label: 'aiVisionSection' },
                    { id: 'sub-ai-vision-anon', label: 'aiVisionAnonymization' },
                    { id: 'sub-ai-advanced', label: 'aiAdvancedSettings' }
                ] },
                { id: 'section-api', label: 'apiSettings', children: [
                    { id: 'sub-api-documentation', label: 'apiDocumentationTitle' },
                    { id: 'sub-api-keys', label: 'apiKeysTitle' }
                ] },
                { id: 'section-mcp', label: 'mcpSettings', children: [
                    { id: 'sub-mcp-server', label: 'mcpServer' },
                    { id: 'sub-mcp-api-key', label: 'mcpKeysTitle' },
                    { id: 'sub-mcp-guidance', label: 'mcpGuidanceTitle' },
                    { id: 'sub-mcp-sample-config', label: 'mcpSampleConfig' }
                ] },
                { id: 'section-actions', label: 'saveSettings' }
            ],
            apiKeys: [],
            mcpKeys: [],
            mcpKeyName: '',
            mcpKeyCreating: false,
            newlyCreatedMcpKey: null,
            apiKeyName: '',
            apiKeyCreating: false,
            newlyCreatedKey: null,
            DEFAULT_PROMPTS,
            DEFAULT_MCP_GUIDANCE,
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
                generation: { loading: false, source: null, models: [], search: '', error: '' },
                embedding:  { loading: false, source: null, models: [], search: '', error: '' },
                vision:     { loading: false, source: null, models: [], search: '', error: '' }
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
            aiPromptGroups: AI_PROMPT_GROUPS,
            aiPromptDefaults: {},
            mcpGuidanceFields: [
                { key: 'general', labelKey: 'mcpGuidanceGeneral', icon: 'article' },
                { key: 'evidence', labelKey: 'mcpGuidanceEvidence', icon: 'fact_check' },
                { key: 'html', labelKey: 'mcpGuidanceHtml', icon: 'code' },
                { key: 'fieldStyle', labelKey: 'mcpGuidanceFieldStyle', icon: 'format_align_left' },
                { key: 'libraryUsage', labelKey: 'mcpGuidanceLibraryUsage', icon: 'manage_search' },
                { key: 'findingFields', labelKey: 'mcpGuidanceFindingFields', icon: 'schema' }
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
            ok: {label: $t('btn.confirm'), color: 'negative'},
            cancel: {label: $t('btn.cancel'), color: 'white'}
            })
            .onOk(() => next())
        }
        else
            next()
    },

    computed: {
        // True when any LLM anonymization is active (vision output or per-field
        // generation input), so the shared anonymization prompt is editable.
        anyLlmAnonymization: function() {
            var priv = this.settings && this.settings.ai && this.settings.ai.private;
            if (!priv) return false;
            if (priv.visionAnonymizeLlm) return true;
            return ['description', 'observation', 'remediation', 'poc', 'retestEvidence']
                .some(function(f) { return priv['field_' + f + '_anonymizeLlm']; });
        },
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
        apiDocumentationUrl: function() {
            var appUrl = (this.settings.mcp && this.settings.mcp.appUrl) || window.location.origin;
            return appUrl.replace(/\/$/, '') + '/api-docs';
        },
        ssoCallbackUrl: function() {
            var appUrl = (this.settings.mcp && this.settings.mcp.appUrl) || window.location.origin;
            return appUrl.replace(/\/$/, '') + '/api/auth/sso/callback';
        },
        mcpClaudeConfig: function() {
            return JSON.stringify({
                mcpServers: {
                    autopwndoc: {
                        type: 'http',
                        url: this.mcpEndpointUrl,
                        headers: {
                            'X-API-Key': this.newlyCreatedMcpKey || 'YOUR_API_KEY_HERE'
                        }
                    }
                }
            }, null, 2);
        },
        mcpCurlExample: function() {
            var key = this.newlyCreatedMcpKey || 'YOUR_API_KEY_HERE';
            return `curl -sk ${this.mcpEndpointUrl} \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: ${key}" \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'`;
        }
    },

    mounted: function() {
        if (UserService.isAllowed('settings:read')) {
            this.getSettings()
            this.loadDictionary()
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
                (s.children || []).forEach(function(c) {
                    var childEl = document.getElementById(c.id);
                    if (childEl) self.sectionObserver.observe(childEl);
                });
            });
        },

        // A section's subsections are shown when the section itself or one of its
        // subsections is the active anchor (accordion behaviour).
        isSectionExpanded: function(section) {
            if (this.activeSection === section.id) return true;
            return (section.children || []).some(function(c) { return c.id === this.activeSection; }, this);
        },

        getSettings: function() {
            SettingsService.listApiKeys()
            .then(res => { this.apiKeys = res.data.datas || []; })
            .catch(() => {});

            SettingsService.listMcpKeys()
            .then(res => { this.mcpKeys = res.data.datas || []; })
            .catch(() => {});

            SettingsService.getSettings(true)
            .then((data) => {
                const { aiPromptSettings, ...savedSettings } = data.data.datas;
                this.settings = this.$_.merge(
                    {
                      danger: { enabled: false, public:{nbdaydelete: 0}},
                      report: { enabled: true, public: { chartTheme: { ...DEFAULT_CHART_THEME }, enableSpellCheck: true }, private: { languageToolUrl: '' } },
                      reviews: { enabled: false, public: { minReviewers: 1 } },
                      authentication: { enforce2fa: false, sso: { enabled: false, public: { providerId: 'oauth2', providerName: 'SSO', registrationEnabled: false, autoLinkExistingUsers: false, authorizationUrl: '', tokenUrl: '', userInfoUrl: '', scope: 'openid profile email', subjectClaim: 'sub', usernameClaim: 'preferred_username', firstnameClaim: 'given_name', lastnameClaim: 'family_name', emailClaim: 'email' }, private: { clientId: '', clientSecret: '' } } },
                      mcp: { enabled: false, appUrl: '', guidance: { ...DEFAULT_MCP_GUIDANCE } },
                      ai: { enabled: false, embeddingEnabled: false, visionEnabled: false, public: { provider: 'openai', model: 'gpt-4o', temperature: 0.7, maxTokens: 32000, embeddingProvider: 'openai', embeddingModel: 'text-embedding-3-small', embeddingMaxDistance: 0.8, vulnerabilityProcessing: { autoTranslateOnSave: false, matchThreshold: 0.35 } }, visionPublic: { visionProvider: 'openai', visionModel: 'gpt-4o', visionTemperature: 0.7, visionMaxTokens: 32000 }, private: { apiUrl: '', apiKey: '', systemPrompt: '', userPrompt: '', azure: { deploymentName: '', apiVersion: '2024-06-01' }, embeddingApiUrl: '', embeddingApiKey: '', embeddingAzure: { deploymentName: '', apiVersion: '2024-06-01' }, visionApiUrl: '', visionApiKey: '', visionAzure: { deploymentName: '', apiVersion: '2024-06-01' }, visionAnonymizeLlm: false,  visionAnonymizeRegex: false, anonymizeReviewBeforeSend: false, visionAnonymizeRegexRules: DEFAULT_VISION_REGEX_RULES.map(rule => ({...rule})), field_description_generateSystemPrompt: '', field_description_completeSystemPrompt: '', field_description_rewriteSystemPrompt: '', field_observation_generateSystemPrompt: '', field_observation_completeSystemPrompt: '', field_observation_rewriteSystemPrompt: '', field_remediation_generateSystemPrompt: '', field_remediation_completeSystemPrompt: '', field_remediation_rewriteSystemPrompt: '', field_poc_generateSystemPrompt: '', field_poc_completeSystemPrompt: '', field_poc_rewriteSystemPrompt: '', field_retestEvidence_generateSystemPrompt: '', field_retestEvidence_completeSystemPrompt: '', field_retestEvidence_rewriteSystemPrompt: '' } }
                    },
                    savedSettings
                  );
                  
                const serverRegexRules = savedSettings.ai?.private?.visionAnonymizeRegexRules;
                this.settings.ai.private.visionAnonymizeRegexRules = Array.isArray(serverRegexRules)
                    ? this.$_.cloneDeep(serverRegexRules)
                    : this.$_.cloneDeep(DEFAULT_VISION_REGEX_RULES);
                const { defaults, overrides } = aiPromptSettings;
                this.aiPromptDefaults = defaults;
                for (const [key, override] of Object.entries(overrides)) {
                    this.settings.ai.private[key] = override || null;
                }
                // Resolve old global overrides into their editor fields before clearing the old keys on save.
                for (const prefix of ['generate', 'complete', 'rewrite']) {
                    this.settings.ai.private[prefix + 'SystemPrompt'] = '';
                    this.settings.ai.private[prefix + 'UserPrompt'] = '';
                }
                this.settings.mcp.guidance = this.$_.merge({}, DEFAULT_MCP_GUIDANCE, this.settings.mcp.guidance || {});
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
            const payload = this.$_.cloneDeep(this.settings);
            for (const [key, defaultValue] of Object.entries(this.aiPromptDefaults)) {
                const value = payload.ai.private[key];
                payload.ai.private[key] = value === defaultValue ? '' : (value || '');
            }
            SettingsService.updateSettings(payload)
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

        promptValue: function(key) {
            return this.settings.ai.private[key] ?? this.aiPromptDefaults[key] ?? '';
        },

        promptTags: function(key) {
            const tags = (this.aiPromptDefaults[key] || '').match(/\{\w+\}/g) || [];
            return [...new Set(tags)].join(', ');
        },

        resetPromptToDefault: function(promptKey) {
            this.settings.ai.private[promptKey] = null;
        },

        resetMcpGuidanceToDefault: function(guidanceKey) {
            if (!this.settings.mcp.guidance) this.settings.mcp.guidance = {};
            this.settings.mcp.guidance[guidanceKey] = DEFAULT_MCP_GUIDANCE[guidanceKey] || '';
        },

        addVisionRegexRule: function() {
            this.settings.ai.private.visionAnonymizeRegexRules.push({
                name: '',
                pattern: '',
                flags: 'g',
                replacement: '[REDACTED]',
                enabled: true
            });
        },

        removeVisionRegexRule: function(index) {
            this.settings.ai.private.visionAnonymizeRegexRules.splice(index, 1);
        },

        resetVisionRegexRules: function() {
            this.settings.ai.private.visionAnonymizeRegexRules = this.$_.cloneDeep(DEFAULT_VISION_REGEX_RULES);
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
            AiService.testConnection(type, {ai: this.settings.ai}, controller.signal)
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

        modelOptions: function(type) {
            const list = this.modelLists[type];
            return rankSearchResults(list.models, list.search);
        },

        filterModelOptions: function(type, value, update) {
            update(() => { this.modelLists[type].search = value || ''; });
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

        createMcpKey: function() {
            if (!this.mcpKeyName.trim()) {
                Notify.create({ message: $t('apiKeyNameRequired'), color: 'warning', textColor: 'dark', position: 'top-right' });
                return;
            }
            this.mcpKeyCreating = true;
            SettingsService.createMcpKey(this.mcpKeyName.trim())
            .then((res) => {
                var created = res.data.datas;
                this.newlyCreatedMcpKey = created.key;
                this.mcpKeys.push({
                    id: created.id,
                    name: created.name,
                    creator: created.creator,
                    keyPrefix: created.key.substring(0, 8),
                    createdAt: created.createdAt,
                    lastUsedAt: null
                });
                this.mcpKeyName = '';
                notifySuccess('mcpKeyCreated');
            })
            .catch((err) => { notifyError(err); })
            .finally(() => { this.mcpKeyCreating = false; });
        },

        revokeMcpKey: function(id) {
            Dialog.create({
                title: $t('apiKeyRevoke'),
                message: $t('mcpKeyRevokeConfirm'),
                ok: { label: $t('apiKeyRevoke'), color: 'negative', unelevated: true, noCaps: true },
                cancel: { label: $t('btn.cancel'), color: 'grey-7', flat: true, noCaps: true }
            }).onOk(() => {
                SettingsService.deleteMcpKey(id)
                .then(() => {
                    this.mcpKeys = this.mcpKeys.filter(k => k.id !== id);
                    this.newlyCreatedMcpKey = null;
                    notifySuccess('mcpKeyRevoked');
                })
                .catch((err) => { notifyError(err); });
            });
        },

        claimMcpKey: function(key) {
            SettingsService.claimMcpKey(key.id)
            .then((res) => {
                key.creator = res.data.datas.creator;
                notifySuccess('apiKeyClaimed');
            })
            .catch((err) => { notifyError(err); });
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
                    creator: created.creator,
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

        claimApiKey: function(key) {
            SettingsService.claimApiKey(key.id)
            .then((res) => {
                key.creator = res.data.datas.creator;
                notifySuccess('apiKeyClaimed');
            })
            .catch((err) => { notifyError(err); });
        },

        copyText: function(text) {
            safeClipboard(text)
                .then(() => notifySuccess('copied'))
                .catch(() => notifyError(null, 'copyFailed'));
        },

        testSpellcheckConnection: function() {
            this.spellcheckTest.loading = true;
            this.spellcheckTest.result = null;
            SpellcheckService.testConnection(
                this.settings.report.private.languageToolUrl
            )
            .then((res) => {
                this.spellcheckTest.result = res.data.datas;
            })
            .catch((err) => {
                this.spellcheckTest.result = { reachable: false, isLanguageTool: false, error: err.response?.data?.datas || err.message };
            })
            .finally(() => { this.spellcheckTest.loading = false; });
        },

        loadDictionary: function() {
            this.dictLoading = true;
            SpellcheckService.getWords()
            .then((res) => {
                this.dictWords = (res.data.datas || []).map(e => e.word);
            })
            .catch(() => { /* silent: dictionary is optional */ })
            .finally(() => { this.dictLoading = false; });
        },

        addDictWord: function() {
            var word = (this.newDictWord || '').trim();
            if (!word) return;
            SpellcheckService.addWord(word)
            .then(() => {
                if (!this.dictWords.includes(word)) this.dictWords.push(word);
                this.dictWords.sort((a, b) => a.localeCompare(b));
                this.newDictWord = '';
            })
            .catch((err) => { notifyError(err); });
        },

        removeDictWord: function(word) {
            SpellcheckService.deleteWord(word)
            .then(() => {
                this.dictWords = this.dictWords.filter(w => w !== word);
            })
            .catch((err) => { notifyError(err); });
        },

        unsavedChanges() {
            return !this.$_.isEqual(this.settingsOrig, this.settings);
        }
    }
}
