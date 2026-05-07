import { Extension } from '@tiptap/core'
import { Dialog } from 'quasar'
import AiService from '@/services/ai'
import { sanitizeHtml, isAbortError, notifyError, extractErrorMessage } from '@/services/ai-helpers'
import { $t } from '@/boot/i18n'

export const AiAssistantExtension = Extension.create({
    name: 'aiAssistant',

    addStorage() {
        return {
            loading: false,
            controller: null,
            currentAction: null
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
                    confirmAndRewriteWhole(editor, fieldName, aiContext, options)
                } else {
                    runAiCommand(editor, 'rewrite', selectedText, fieldName, aiContext, { from, to }, options)
                }
                return true
            },

            aiCancel: () => ({ editor }) => {
                cancelAiCommand(editor)
                return true
            }
        }
    }
})

function getStorage(editor) {
    if (!editor) return null
    const ext = editor.extensionManager.extensions.find(e => e.name === 'aiAssistant')
    return ext ? ext.storage : null
}

function confirmAndRewriteWhole(editor, fieldName, aiContext, options) {
    Dialog.create({
        title: $t('aiRewriteWholeTitle'),
        message: $t('aiRewriteWholeMessage'),
        ok: { label: $t('aiRewrite'), color: 'purple', noCaps: true },
        cancel: { label: $t('btn.cancel'), color: 'grey-7', flat: true, noCaps: true }
    }).onOk(() => {
        const text = editor.getHTML()
        runAiCommand(editor, 'rewrite', text, fieldName, aiContext, null, options)
    })
}

async function runAiCommand(editor, action, text, fieldName, aiContext, selectionRange, options) {
    const storage = getStorage(editor)
    if (storage && storage.loading) {
        // already running — ignore
        return
    }

    const controller = new AbortController()
    if (storage) {
        storage.loading = true
        storage.controller = controller
        storage.currentAction = action
    }

    editor.setEditable(false)

    try {
        const payload = buildAiPayload(action, text, fieldName, aiContext)
        const html = await requestAiHtml(payload, controller.signal)
        if (!html) throw new Error($t('aiEmptyResponse'))

        const sanitized = sanitizeHtml(html)

        editor.setEditable(true)

        if (options && typeof options.onResult === 'function') {
            options.onResult(buildAiResult(editor, action, sanitized, selectionRange))
        } else {
            applyAiResult(editor, action, sanitized, selectionRange)
        }
    } catch (err) {
        editor.setEditable(true)
        if (isAbortError(err)) {
            // cancelled by user or unmount — silent
            return
        }
        console.error('[AI Assistant]', err)
        const retry = () => runAiCommand(editor, action, text, fieldName, aiContext, selectionRange, options)
        notifyError(err, 'aiError', [
            { label: $t('btn.retry'), color: 'white', noCaps: true, handler: retry }
        ])
    } finally {
        if (storage) {
            storage.loading = false
            storage.controller = null
            storage.currentAction = null
        }
        if (options && typeof options.onDone === 'function') options.onDone()
    }
}

export function cancelAiCommand(editor) {
    const storage = getStorage(editor)
    if (!storage || !storage.controller) return
    try { storage.controller.abort() } catch (_) { /* noop */ }
    storage.controller = null
    storage.loading = false
    storage.currentAction = null
    try { editor.setEditable(true) } catch (_) { /* noop */ }
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

async function requestAiHtml(payload, signal) {
    const response = await AiService.generate(payload, signal)
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
    const safe = sanitizeHtml(html)
    if (action === 'generate') {
        editor.commands.setContent(safe)
    } else if (action === 'complete') {
        editor.commands.setContent(safe)
    } else if (action === 'rewrite') {
        if (selectionRange) {
            editor.chain().focus()
                .deleteRange(selectionRange)
                .insertContentAt(selectionRange.from, safe)
                .run()
        } else {
            editor.commands.setContent(safe)
        }
    }
}
