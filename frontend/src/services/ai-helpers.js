import { Notify } from 'quasar'
import DOMPurify from 'dompurify'
import { $t } from 'boot/i18n'

const NOTIFY_DEFAULTS = {
    position: 'top-right',
    textColor: 'white'
}

const ALLOWED_TAGS = [
    'p', 'br', 'span', 'div',
    'strong', 'b', 'em', 'i', 'u', 's', 'mark', 'sub', 'sup',
    'ul', 'ol', 'li',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'blockquote', 'pre', 'code',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
    'a', 'img', 'figure', 'figcaption',
    'hr'
]

const ALLOWED_ATTR = [
    'href', 'rel', 'target', 'title',
    'src', 'alt', 'width', 'height',
    'class', 'style',
    'colspan', 'rowspan',
    'label'
]

export function sanitizeHtml(html) {
    if (!html) return ''
    try {
        return DOMPurify.sanitize(String(html), {
            ALLOWED_TAGS,
            ALLOWED_ATTR,
            FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'link', 'meta'],
            FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus']
        })
    } catch (err) {
        console.warn('[AI helpers] sanitizeHtml failed, returning empty:', err)
        return ''
    }
}

export function notifyError(err, fallbackKey = 'aiError', actions) {
    const message = extractErrorMessage(err) || $t(fallbackKey)
    if (isAbortError(err)) return
    const opts = {
        ...NOTIFY_DEFAULTS,
        message,
        color: 'negative',
        timeout: 6000,
        multiLine: message.length > 80
    }
    if (actions && actions.length > 0) opts.actions = actions
    Notify.create(opts)
}

export function notifyWarning(messageKey, params) {
    Notify.create({
        ...NOTIFY_DEFAULTS,
        message: $t(messageKey, params),
        color: 'warning',
        timeout: 4000
    })
}

export function notifySuccess(messageKey, params) {
    Notify.create({
        ...NOTIFY_DEFAULTS,
        message: $t(messageKey, params),
        color: 'positive',
        timeout: 3000
    })
}

export function notifyInfo(messageKey, params) {
    Notify.create({
        ...NOTIFY_DEFAULTS,
        message: $t(messageKey, params),
        color: 'info',
        timeout: 4000
    })
}

export function isAbortError(err) {
    if (!err) return false
    if (err.name === 'CanceledError' || err.name === 'AbortError') return true
    if (err.code === 'ERR_CANCELED') return true
    if (err.message === 'canceled' || err.message === 'aborted') return true
    return false
}

export function extractErrorMessage(err) {
    if (!err) return ''
    if (typeof err === 'string') return err
    if (err.response && err.response.data && err.response.data.datas) return String(err.response.data.datas)
    if (err.message) return err.message
    return ''
}

export function isAiEnabled(settings) {
    return !!(settings && settings.ai && settings.ai.enabled)
}

export function isEmbeddingEnabled(settings) {
    return isAiEnabled(settings) && !!settings.ai.embeddingEnabled
}

export function isVisionEnabled(settings) {
    return isAiEnabled(settings) && !!settings.ai.visionEnabled
}

export function aiDisabledReason(settings, kind = 'generation') {
    if (!settings || !settings.ai) return $t('aiDisabledReasonGlobal')
    if (!settings.ai.enabled) return $t('aiDisabledReasonGlobal')
    if (kind === 'embedding' && !settings.ai.embeddingEnabled) return $t('aiDisabledReasonEmbedding')
    if (kind === 'vision' && !settings.ai.visionEnabled) return $t('aiDisabledReasonVision')
    return ''
}
