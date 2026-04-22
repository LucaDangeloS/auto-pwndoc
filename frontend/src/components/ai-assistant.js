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
            aiGenerate: (fieldName, aiContext) => ({ editor }) => {
                runAiCommand(editor, 'generate', '', fieldName, aiContext)
                return true
            },

            aiComplete: (fieldName, aiContext) => ({ editor }) => {
                const text = editor.getHTML()
                runAiCommand(editor, 'complete', text, fieldName, aiContext)
                return true
            },

            aiRewrite: (fieldName, aiContext) => ({ editor }) => {
                const { from, to } = editor.state.selection
                const selectedText = editor.state.doc.textBetween(from, to, '\n')
                if (!selectedText.trim()) {
                    const text = editor.getHTML()
                    runAiCommand(editor, 'rewrite', text, fieldName, aiContext)
                } else {
                    runAiCommand(editor, 'rewrite', selectedText, fieldName, aiContext, { from, to })
                }
                return true
            }
        }
    }
})

async function runAiCommand(editor, action, text, fieldName, aiContext, selectionRange) {
    const ext = editor.extensionManager.extensions.find(e => e.name === 'aiAssistant')
    if (ext) ext.storage.loading = true

    try {
        const payload = {
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

        editor.setEditable(false)

        const response = await AiService.generate(payload)
        const html = response.data && response.data.datas ? response.data.datas.html : ''

        if (!html) throw new Error('Empty response from AI')

        editor.setEditable(true)

        if (action === 'generate') {
            editor.commands.setContent(html)
        } else if (action === 'complete') {
            editor.commands.focus('end')
            editor.commands.insertContent(html)
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
    }
}
