import { Extension } from '@tiptap/core'
import { Notify } from 'quasar'
import AiService from '@/services/ai'

const LOADING_CLASS = 'ai-loading'
const LOADING_PLACEHOLDER = `<p class="${LOADING_CLASS}">…</p>`

export const AiAssistantExtension = Extension.create({
    name: 'aiAssistant',

    addStorage() {
        return {
            loading: false
        }
    },

    addCommands() {
        return {
            aiGenerate: (fieldName, aiContext, options) => ({ editor }) => {
                runAiCommand(editor, 'generate', '', fieldName, aiContext, null, options)
                return true
            },

            aiComplete: (fieldName, aiContext, options) => ({ editor }) => {
                const text = editor.getHTML()
                runAiCommand(editor, 'complete', text, fieldName, aiContext, null, options)
                return true
            },

            aiRewrite: (fieldName, aiContext, options) => ({ editor }) => {
                const { from, to } = editor.state.selection
                const selectedText = editor.state.doc.textBetween(from, to, '\n')
                if (!selectedText.trim()) {
                    const text = editor.getHTML()
                    runAiCommand(editor, 'rewrite', text, fieldName, aiContext, null, options)
                } else {
                    runAiCommand(editor, 'rewrite', selectedText, fieldName, aiContext, { from, to }, options)
                }
                return true
            }
        }
    }
})

async function runAiCommand(editor, action, text, fieldName, aiContext, selectionRange, options) {
    const ext = editor.extensionManager.extensions.find(e => e.name === 'aiAssistant')
    if (ext) ext.storage.loading = true

    try {
        const payload = buildAiPayload(action, text, fieldName, aiContext)

        editor.setEditable(false)

        const html = await requestAiHtml(payload)

        if (!html) throw new Error('Empty response from AI')

        editor.setEditable(true)

        if (options && typeof options.onResult === 'function') {
            options.onResult(buildAiResult(editor, action, html, selectionRange))
        } else {
            applyAiResult(editor, action, html, selectionRange)
        }
    } catch (err) {
        editor.setEditable(true)
        console.error('[AI Assistant]', err)
        Notify.create({
            message: err.response?.data?.datas || err.message || 'AI generation failed',
            color: 'negative',
            textColor: 'white',
            position: 'top-right',
            timeout: 4000
        })
    } finally {
        if (ext) ext.storage.loading = false
        if (options && typeof options.onDone === 'function') options.onDone()
    }
}

function buildAiPayload(action, text, fieldName, aiContext) {
    return {
        action,
        text,
        fieldName: fieldName || '',
        context: {
            findingTitle: aiContext && aiContext.findingTitle ? aiContext.findingTitle : '',
            locale: aiContext && aiContext.locale ? aiContext.locale : '',
            auditName: aiContext && aiContext.auditName ? aiContext.auditName : '',
            severity: aiContext && aiContext.severity ? aiContext.severity : '',
            findingsDigest: aiContext && aiContext.findingsDigest ? aiContext.findingsDigest : ''
        }
    }
}

async function requestAiHtml(payload) {
    const response = await AiService.generate(payload)
    return response.data && response.data.datas ? response.data.datas.html : ''
}

function buildAiResult(editor, action, html, selectionRange) {
    const previousHtml = selectionRange ? selectionRangeToHtml(editor, selectionRange) : editor.getHTML()
    const proposedHtml = action === 'complete' && !selectionRange ? `${previousHtml}${html}` : html
    return { action, previousHtml, proposedHtml, selectionRange }
}

function selectionRangeToHtml(editor, selectionRange) {
    const text = editor.state.doc.textBetween(selectionRange.from, selectionRange.to, '\n')
    return `<p>${escapeHtml(text).replace(/\n/g, '<br>')}</p>`
}

function escapeHtml(value) {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;')
}

export function applyAiResult(editor, action, html, selectionRange) {
    if (action === 'generate') {
        editor.commands.setContent(html)
    } else if (action === 'complete') {
        editor.commands.setContent(html)
    } else if (action === 'rewrite') {
        if (selectionRange) {
            editor.chain().focus()
                .deleteRange(selectionRange)
                .insertContentAt(selectionRange.from, html)
                .run()
        } else {
            editor.commands.setContent(html)
        }
    }
}
