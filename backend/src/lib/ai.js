var { ChatOpenAI, OpenAIEmbeddings } = require("@langchain/openai");
var { Chroma } = require("@langchain/community/vectorstores/chroma");
var config = require('../config/config.json');
var env = process.env.NODE_ENV || 'dev';

class AiService {
    constructor() {
        this.config = config[env].ai || {};
        this.enabled = this.config.enabled || false;
        this.llm = null;
        this.embeddings = null;
        this.vectorStore = null;

        if (this.enabled) {
            this.init();
        }
    }

    init() {
        try {
            // Initialize LLM (Generation)
            if (this.config.generation) {
                this.llm = new ChatOpenAI({
                    openAIApiKey: this.config.generation.apiKey || 'dummy', // Ollama needs a dummy key
                    configuration: {
                        baseURL: this.config.generation.baseUrl,
                    },
                    modelName: this.config.generation.model,
                    temperature: this.config.generation.temperature || 0.7,
                    streaming: true
                });
            }

            // Initialize Embeddings (Memory)
            if (this.config.embeddings) {
                this.embeddings = new OpenAIEmbeddings({
                    openAIApiKey: this.config.embeddings.apiKey || 'dummy',
                    configuration: {
                        baseURL: this.config.embeddings.baseUrl,
                    },
                    modelName: this.config.embeddings.model
                });
            }

            // Initialize Vector Store
            if (this.config.vectorStore && this.embeddings) {
                this.vectorStore = new Chroma(this.embeddings, {
                    url: this.config.vectorStore.url,
                    collectionName: this.config.vectorStore.collection
                });
            }
            
            console.log('AI Service initialized successfully');
        } catch (error) {
            console.error('Failed to initialize AI Service:', error);
            this.enabled = false;
        }
    }

    isEnabled() {
        return this.enabled && this.llm && this.vectorStore;
    }

    async generate(prompt, context = "") {
        if (!this.isEnabled()) return "AI Service is not enabled or configured.";

        try {
            const systemPrompt = `You are a cybersecurity expert assistant helping to write a penetration testing report.
            Use the following context (similar past findings) to help the user.
            
            Context:
            ${context}
            
            User Request: ${prompt}
            
            Answer:`;

            const response = await this.llm.invoke(systemPrompt);
            return response.content;
        } catch (error) {
            console.error('AI Generation Error:', error);
            throw error;
        }
    }

    async embedAndStore(text, metadata = {}) {
        if (!this.isEnabled()) return;

        try {
            // Ensure metadata is flat and string/number/boolean only for Chroma
            const cleanMetadata = {};
            for (const [key, value] of Object.entries(metadata)) {
                if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
                    cleanMetadata[key] = value;
                } else {
                    cleanMetadata[key] = String(value);
                }
            }

            // We store the text as a document
            // check if document exists? Chroma handles upsert usually if IDs match, but LangChain might just add
            // For simplicity, we just add documents. Ideally we should manage IDs.
            // Using title as ID? Or Mongo ID?
            // LangChain Chroma addDocuments takes ids.
            
            const ids = metadata.id ? [String(metadata.id)] : undefined;

            await this.vectorStore.addDocuments([{
                pageContent: text,
                metadata: cleanMetadata
            }], { ids: ids });
            
            console.log(`Stored embedding for: ${metadata.title}`);
        } catch (error) {
            console.error('AI Embedding Error:', error);
        }
    }

    async searchSimilar(text, k = 3) {
        if (!this.isEnabled()) return [];

        try {
            const results = await this.vectorStore.similaritySearch(text, k);
            return results.map(doc => ({
                content: doc.pageContent,
                metadata: doc.metadata
            }));
        } catch (error) {
            console.error('AI Search Error:', error);
            return [];
        }
    }
}

// Singleton instance
module.exports = new AiService();
