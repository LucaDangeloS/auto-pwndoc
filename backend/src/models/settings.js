var mongoose = require('mongoose');//.set('debug', true);
var Schema = mongoose.Schema;
var fs = require('fs');
var _ = require('lodash');
var Utils = require('../lib/utils.js');
var { DEFAULT_MCP_GUIDANCE } = require('../lib/mcp-guidance');

// https://stackoverflow.com/questions/25822289/what-is-the-best-way-to-store-color-hex-values-in-mongodb-mongoose
const colorValidator = (v) => (/^#([0-9a-f]{3}){1,2}$/i).test(v);
const optionalFillValidator = (v) => v === 'none' || colorValidator(v);

const SettingSchema = new Schema({
    report: { 
        enabled: {type: Boolean, default: true},
        public: {
            cvssColors: {
                noneColor: { type: String, default: "#4a86e8", validate: [colorValidator, 'Invalid color'] },
                lowColor: { type: String, default: "#008000", validate: [colorValidator, 'Invalid color'] },
                mediumColor: { type: String, default: "#f9a009", validate: [colorValidator, 'Invalid color'] },
                highColor: { type: String, default: "#fe0000", validate: [colorValidator, 'Invalid color'] },
                criticalColor: { type: String, default: "#212121", validate: [colorValidator, 'Invalid color'] }
            },
            chartTheme: {
                titleColor: { type: String, default: "#000000", validate: [colorValidator, 'Invalid color'] },
                titleSize: { type: Number, default: 16, min: 6, max: 72 },
                titleBold: { type: Boolean, default: true },
                legendColor: { type: String, default: "#404040", validate: [colorValidator, 'Invalid color'] },
                legendSize: { type: Number, default: 11, min: 6, max: 36 },
                legendPosition: { type: String, enum: ['r', 'b', 't', 'l', 'tr'], default: 'r' },
                dataLabelColor: { type: String, default: "#ffffff", validate: [colorValidator, 'Invalid color'] },
                dataLabelSize: { type: Number, default: 11, min: 6, max: 36 },
                dataLabelBold: { type: Boolean, default: true },
                dataLabelMode: { type: String, enum: ['value', 'percent', 'both', 'none'], default: 'percent' },
                borderEnabled: { type: Boolean, default: false },
                borderColor: { type: String, default: "#d9e2f3", validate: [colorValidator, 'Invalid color'] },
                borderWidth: { type: Number, default: 1, min: 0, max: 6 },
                plotAreaFill: { type: String, default: "none", validate: [optionalFillValidator, 'Invalid fill color'] },
                view3DRotX: { type: Number, default: 30, min: -90, max: 90 },
                view3DRotY: { type: Number, default: 30, min: 0, max: 359 },
                view3DPerspective: { type: Number, default: 30, min: 0, max: 100 },
                view3DRightAngleAxes: { type: Boolean, default: false },
                pieExplosion: { type: Number, default: 0, min: 0, max: 100 }
            },
            remediationColorsComplexity: {
                lowColor: { type: String, default: "#4472c4", validate: [colorValidator, 'Invalid color'] },
                mediumColor: { type: String, default: "#ffc000", validate: [colorValidator, 'Invalid color'] },
                highColor: { type: String, default: "#FF2F2F", validate: [colorValidator, 'Invalid color'] }
            },
            remediationColorsPriority: {
                lowColor: { type: String, default: "#4472c4", validate: [colorValidator, 'Invalid color'] },
                mediumColor: { type: String, default: "#ffc000", validate: [colorValidator, 'Invalid color'] },
                highColor: { type: String, default: "#ff2f2f", validate: [colorValidator, 'Invalid color'] },
                urgentColor: { type: String, default: "#C00000", validate: [colorValidator, 'Invalid color'] }
            },
            captions: {
                type: [{type: String, unique: true}],
                default: ['Figure']
            },
            extendCvssTemporalEnvironment: { 
                type: Boolean, 
                default: false 
            },
            defaultCvssVersion: {
                type: String,
                enum: ['3.1', '4.0'],
                default: '3.1'
            },
            enableSpellCheck: { type: Boolean, default: true }
        },
        private: {
            imageBorder: { type: Boolean, default: false },
            imageBorderColor: { type: String, default: "#000000", validate: [colorValidator, 'Invalid color'] },
            languageToolUrl: { type: String, default: 'http://languagetool:8010' }
        }
     },
    reviews: {
        enabled: { type: Boolean, default: false },
        public: {
            mandatoryReview: { type: Boolean, default: false },
            minReviewers: { type: Number, default: 1, min: 1, max: 100, validate: [Number.isInteger, 'Invalid integer'] }
        },
        private: {
            removeApprovalsUponUpdate: { type: Boolean, default: false }
        }
    },
    danger: { 
      enabled: { type: Boolean, default: false },
      public: {
        nbdaydelete: { type: Number, default: 1, min: 1, max: 365, validate: [Number.isInteger, 'Invalid integer'] }
      },
      private: {}
     },
    mcp: {
      enabled: { type: Boolean, default: false },
      apiKey: { type: String, default: '' },
      apiKeyCreatedAt: { type: Date, default: null },
      guidance: {
        general: { type: String, default: DEFAULT_MCP_GUIDANCE.general },
        evidence: { type: String, default: DEFAULT_MCP_GUIDANCE.evidence },
        html: { type: String, default: DEFAULT_MCP_GUIDANCE.html },
        fieldStyle: { type: String, default: DEFAULT_MCP_GUIDANCE.fieldStyle },
        libraryUsage: { type: String, default: DEFAULT_MCP_GUIDANCE.libraryUsage },
        findingFields: { type: String, default: DEFAULT_MCP_GUIDANCE.findingFields }
      }
    },
    authentication: {
      enforce2fa: { type: Boolean, default: false },
      sso: {
        enabled: { type: Boolean, default: false },
        public: {
          providerId: { type: String, default: 'oauth2' },
          providerName: { type: String, default: 'SSO' },
          registrationEnabled: { type: Boolean, default: false },
          autoLinkExistingUsers: { type: Boolean, default: false },
          authorizationUrl: { type: String, default: '' },
          tokenUrl: { type: String, default: '' },
          userInfoUrl: { type: String, default: '' },
          scope: { type: String, default: 'openid profile email' },
          subjectClaim: { type: String, default: 'sub' },
          usernameClaim: { type: String, default: 'preferred_username' },
          firstnameClaim: { type: String, default: 'given_name' },
          lastnameClaim: { type: String, default: 'family_name' },
          emailClaim: { type: String, default: 'email' }
        },
        private: {
          clientId: { type: String, default: '' },
          clientSecret: { type: String, default: '' }
        }
      }
    },
    api: {
      keys: [{
        name: { type: String, required: true },
        key: { type: String, required: true },
        creator: { type: Schema.Types.ObjectId, ref: 'User', default: null },
        createdAt: { type: Date, default: Date.now },
        lastUsedAt: { type: Date, default: null }
      }]
    },
    ai: {
      enabled: { type: Boolean, default: false },
      embeddingEnabled: { type: Boolean, default: false },
      public: {
        provider: {
          type: String,
          enum: ['openai', 'anthropic', 'ollama', 'azure-openai', 'openai-compatible', 'openwebui'],
          default: 'openai'
        },
        model: { type: String, default: 'gpt-4o' },
        temperature: { type: Number, default: 0.7, min: 0, max: 2 },
        maxTokens: { type: Number, default: 32000, min: 1, max: 128000 },
        embeddingProvider: {
          type: String,
          enum: ['openai', 'anthropic', 'ollama', 'azure-openai', 'openai-compatible', 'openwebui'],
          default: 'openai'
        },
        embeddingModel: { type: String, default: 'text-embedding-3-small' },
        embeddingMaxDistance: { type: Number, default: 0.8, min: 0.01, max: 2 },
        vulnerabilityProcessing: {
          autoTranslateOnSave: { type: Boolean, default: false },
          matchThreshold: { type: Number, default: 0.35, min: 0.01, max: 2 }
        },
      },
      private: {
        apiUrl: { type: String, default: '' },
        apiKey: { type: String, default: '' },
        systemPrompt: { type: String, default: '' },
        userPrompt: { type: String, default: '' },
        azure: {
          deploymentName: { type: String, default: '' },
          apiVersion: { type: String, default: '2024-06-01' }
        },
        embeddingApiUrl: { type: String, default: '' },
        embeddingApiKey: { type: String, default: '' },
        embeddingAzure: {
          deploymentName: { type: String, default: '' },
          apiVersion: { type: String, default: '2024-06-01' }
        },
        visionApiUrl: { type: String, default: '' },
        visionApiKey: { type: String, default: '' },
        visionAzure: {
          deploymentName: { type: String, default: '' },
          apiVersion: { type: String, default: '2024-06-01' }
        },
        visionSystemPrompt: { type: String, default: '' },
        visionAnonymizeLlm: { type: Boolean, default: false },
        visionAnonymizeRegex: { type: Boolean, default: false },
        visionAnonymizeRegexRules: {
          type: [{
            _id: false,
            name: { type: String, required: true, maxlength: 120 },
            pattern: { type: String, required: true, maxlength: 1000 },
            flags: { type: String, default: 'g', maxlength: 10 },
            replacement: { type: String, required: true, maxlength: 200 },
            enabled: { type: Boolean, default: true }
          }],
          default: () => require('../lib/vision-service').DEFAULT_REGEX_RULES.map(rule => ({ ...rule }))
        },
        anonymizationPrompt: {
          type: String,
          default: () => require('../lib/vision-service').DEFAULT_INPUT_ANONYMIZATION_PROMPT
        },
        // When enabled, per-field generation-input anonymization pauses so the
        // user can review/edit the anonymized context before it is sent to the
        // generation model.
        anonymizeReviewBeforeSend: { type: Boolean, default: false },
        generateSystemPrompt: { type: String, default: '' },
        generateUserPrompt: { type: String, default: '' },
        completeSystemPrompt: { type: String, default: '' },
        completeUserPrompt: { type: String, default: '' },
        rewriteSystemPrompt: { type: String, default: '' },
        rewriteUserPrompt: { type: String, default: '' },
        fillProofsSystemPrompt: { type: String, default: '' },
        fillProofsUserPrompt: { type: String, default: '' },
        executiveSummarySystemPrompt: { type: String, default: '' },
        executiveSummaryUserPrompt: { type: String, default: '' },
        severitySummarySystemPrompt: { type: String, default: '' },
        severitySummaryUserPrompt: { type: String, default: '' },
        vulnerabilityTranslationSystemPrompt: { type: String, default: '' },
        vulnerabilityTranslationUserPrompt: { type: String, default: '' },
        field_description_generateSystemPrompt: { type: String, default: '' },
        field_description_generateUserPrompt: { type: String, default: '' },
        field_description_completeSystemPrompt: { type: String, default: '' },
        field_description_completeUserPrompt: { type: String, default: '' },
        field_description_rewriteSystemPrompt: { type: String, default: '' },
        field_description_rewriteUserPrompt: { type: String, default: '' },
        field_observation_generateSystemPrompt: { type: String, default: '' },
        field_observation_generateUserPrompt: { type: String, default: '' },
        field_observation_completeSystemPrompt: { type: String, default: '' },
        field_observation_completeUserPrompt: { type: String, default: '' },
        field_observation_rewriteSystemPrompt: { type: String, default: '' },
        field_observation_rewriteUserPrompt: { type: String, default: '' },
        field_remediation_generateSystemPrompt: { type: String, default: '' },
        field_remediation_generateUserPrompt: { type: String, default: '' },
        field_remediation_completeSystemPrompt: { type: String, default: '' },
        field_remediation_completeUserPrompt: { type: String, default: '' },
        field_remediation_rewriteSystemPrompt: { type: String, default: '' },
        field_remediation_rewriteUserPrompt: { type: String, default: '' },
        field_poc_generateSystemPrompt: { type: String, default: '' },
        field_poc_generateUserPrompt: { type: String, default: '' },
        field_poc_completeSystemPrompt: { type: String, default: '' },
        field_poc_completeUserPrompt: { type: String, default: '' },
        field_poc_rewriteSystemPrompt: { type: String, default: '' },
        field_poc_rewriteUserPrompt: { type: String, default: '' },
        field_retestEvidence_generateSystemPrompt: { type: String, default: '' },
        field_retestEvidence_generateUserPrompt: { type: String, default: '' },
        field_retestEvidence_completeSystemPrompt: { type: String, default: '' },
        field_retestEvidence_completeUserPrompt: { type: String, default: '' },
        field_retestEvidence_rewriteSystemPrompt: { type: String, default: '' },
        field_retestEvidence_rewriteUserPrompt: { type: String, default: '' },
        // Per-field input anonymization: when enabled, the field's input context
        // is redacted before it is sent to the generation model. Regex uses the
        // shared visionAnonymizeRegexRules; llm uses anonymizationPrompt.
        field_description_anonymizeRegex: { type: Boolean, default: false },
        field_description_anonymizeLlm: { type: Boolean, default: false },
        field_observation_anonymizeRegex: { type: Boolean, default: false },
        field_observation_anonymizeLlm: { type: Boolean, default: false },
        field_remediation_anonymizeRegex: { type: Boolean, default: false },
        field_remediation_anonymizeLlm: { type: Boolean, default: false },
        field_poc_anonymizeRegex: { type: Boolean, default: false },
        field_poc_anonymizeLlm: { type: Boolean, default: false },
        field_retestEvidence_anonymizeRegex: { type: Boolean, default: false },
        field_retestEvidence_anonymizeLlm: { type: Boolean, default: false }
      },
      visionEnabled: { type: Boolean, default: false },
      visionPublic: {
        visionProvider: {
          type: String,
          enum: ['openai', 'anthropic', 'ollama', 'azure-openai', 'openai-compatible', 'openwebui'],
          default: 'openai'
        },
        visionModel: { type: String, default: 'gpt-4o' },
        visionTemperature: { type: Number, default: 0.7, min: 0, max: 2 },
        visionMaxTokens: { type: Number, default: 32000, min: 1, max: 128000 }
      }
    }
}, {strict: true});

// Get all settings
SettingSchema.statics.getAll = () => {
    return new Promise((resolve, reject) => {
        const query = Settings.findOneAndUpdate({}, {$setOnInsert: {}}, {new: true, upsert: true, setDefaultsOnInsert: true});
        query.select('-_id -__v');
        query.exec()
            .then(settings => {
                resolve(settings)
            })
            .catch(err => reject(err));
    });
};

// Get public settings
SettingSchema.statics.getPublic = () => {
    return new Promise((resolve, reject) => {
        const query = Settings.findOneAndUpdate({}, {$setOnInsert: {}}, {new: true, upsert: true, setDefaultsOnInsert: true});
        query.select('-_id report.enabled report.public reviews.enabled reviews.public danger.enabled danger.public mcp.enabled authentication.enforce2fa authentication.sso.enabled authentication.sso.public ai.enabled ai.embeddingEnabled ai.public ai.visionEnabled ai.visionPublic ai.private');
        query.exec()
            .then(settings => {
                // Expose only derived anonymization booleans/flags; never the
                // ai.private subtree itself.
                const publicSettings = settings.toObject();
                if (publicSettings.ai) {
                    const priv = publicSettings.ai.private || {};
                    publicSettings.ai.visionAnonymizationEnabled = !!(priv.visionAnonymizeLlm || priv.visionAnonymizeRegex);
                    publicSettings.ai.anonymizeReviewBeforeSend = !!priv.anonymizeReviewBeforeSend;
                    const ANON_FIELDS = ['description', 'observation', 'remediation', 'poc', 'retestEvidence'];
                    publicSettings.ai.anonymizedFields = ANON_FIELDS.filter(f =>
                        priv[`field_${f}_anonymizeRegex`] || priv[`field_${f}_anonymizeLlm`]
                    );
                    delete publicSettings.ai.private;
                }
                resolve(publicSettings);
            })
            .catch(err => reject(err));
    });
};

// Update Settings
SettingSchema.statics.update = (settings) => {
    return new Promise((resolve, reject) => {
        const query = Settings.findOneAndUpdate({}, settings, { new: true, runValidators: true, upsert: true, setDefaultsOnInsert: true });
        query.exec()
            .then(settings => resolve(settings))
            .catch(err => reject(err));
    });
};


// Restore settings to default
SettingSchema.statics.restoreDefaults = () => {
    return new Promise((resolve, reject) => {
        const query = Settings.deleteMany({});
        query.exec()
            .then(_ => {
                const query = new Settings({});
                query.save()
                    .then(_ => resolve("Restored default settings."))
                    .catch(err => reject(err));
            })
            .catch(err => reject(err));
    });
};

const Settings = mongoose.model('Settings', SettingSchema);

// Populate/update settings when server starts
Settings.findOne()
.then((liveSettings) => {
  if (!liveSettings) {
    console.log("Initializing Settings");
    Settings.create({}).catch((err) => {
      if (err && err.code === 11000) return; // duplicate key — another instance already created it
      console.error("Error creating the settings in the database:", err);
    });
  } 
  else {
    var needUpdate = false
    var liveSettingsPaths = Utils.getObjectPaths(liveSettings.toObject())

    liveSettingsPaths.forEach(path => {
        if (!SettingSchema.path(path) && !path.startsWith('_')) {
            needUpdate = true
            _.set(liveSettings, path, undefined)
        }
    })

    if (needUpdate) {
        console.log("Removing unused fields from Settings")
        liveSettings.save().catch(err => console.error("Error saving updated settings:", err));
    }
  }
})
.catch((err) => {
  console.error("Error checking for initial settings in the database:", err);
});

module.exports = Settings;
