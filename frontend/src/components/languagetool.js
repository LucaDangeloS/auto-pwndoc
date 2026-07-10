// This plugin is based on the awesome work of https://github.com/sereneinserenade/tiptap-languagetool
// Spellcheck requests are proxied through the backend (POST /api/spellcheck) which applies
// the shared organization dictionary and holds the LanguageTool endpoint configuration.
import { Extension } from '@tiptap/core'
import { debounce } from 'lodash'
import { Plugin, PluginKey } from 'prosemirror-state'
import { Decoration, DecorationSet } from 'prosemirror-view'
import { Notify } from 'quasar'
import { ref } from 'vue'

import SpellcheckService from '@/services/spellcheck'

export const LanguageToolHelpingWords = {
  LanguageToolTransactionName: 'languageToolTransaction',
  MatchUpdatedTransactionName: 'matchUpdated',
  MatchRangeUpdatedTransactionName: 'matchRangeUpdated',
  LoadingTransactionName: 'languageToolLoading',
  WordIgnoredEventName: 'spellcheck-word-ignored',
}

const updateMatchAndRange = (storage, m, range) => {
  storage.match.value = m || undefined
  storage.matchRange = range || undefined

  const tr = storage.editorView.state.tr
  tr.setMeta(LanguageToolHelpingWords.MatchUpdatedTransactionName, true)
  tr.setMeta(LanguageToolHelpingWords.MatchRangeUpdatedTransactionName, true)
  storage.editorView.dispatch(tr)
}

const createMouseEventsListener = (storage) => (e) => {
  if (!e.target || !storage.editorView) return

  const matchString = e.target.getAttribute('match')?.trim()
  if (!matchString) return

  const { match: m } = JSON.parse(matchString)
  try {
    const from = storage.editorView.posAtDOM(e.target, 0)
    const to = storage.editorView.posAtDOM(e.target, e.target.childNodes.length)
    updateMatchAndRange(storage, m, { from, to })
  } catch (_) {
    // Element no longer in editor DOM (decoration removed mid-flight)
  }
}

const addEventListenersToDecorations = (storage) => {
  if (!storage.editorView || !storage.editorView.dom) return

  // Query only within this editor's DOM element
  const decorations = storage.editorView.dom.querySelectorAll('span.lt')
  decorations.forEach((el) => {
    // Remove old listener to avoid duplicates
    if (el._ltClickHandler) {
      el.removeEventListener('mousedown', el._ltClickHandler)
    }
    // Use mousedown so the match is set before ProseMirror processes the cursor
    // placement — the BubbleMenu only re-evaluates on selection changes, so the
    // match must already be in storage when that transaction fires.
    el._ltClickHandler = (e) => {
      storage._pendingClickActivation = true
      createMouseEventsListener(storage)(e)
    }
    el.addEventListener('mousedown', el._ltClickHandler)
  })
}

const gimmeDecoration = (from, to, match) =>
  Decoration.inline(from, to, {
    class: `lt lt-${match.rule.issueType}`,
    nodeName: 'span',
    match: JSON.stringify({ match }),
  })

const moreThan500Words = (s) => s.trim().split(/\s+/).length >= 500

// Convert a string offset (position in concatenated text) to editor document position
const stringOffsetToEditorPos = (stringOffset, offsetMap) => {
  // Find the segment that contains this offset (search from end for efficiency)
  for (let i = offsetMap.length - 1; i >= 0; i--) {
    if (stringOffset >= offsetMap[i].stringPos) {
      return offsetMap[i].editorPos + (stringOffset - offsetMap[i].stringPos)
    }
  }
  // Fallback to first segment
  return offsetMap[0]?.editorPos + stringOffset
}

// Circuit breaker: stops hammering the backend when LT is unreachable
const _cb = {
  failures: 0,
  openUntil: 0,
  threshold: 3, // consecutive failures before opening
  cooldown: 30000, // ms to wait before retrying
}

const fetchMatchesForChunk = async (text) => {
  if (Date.now() < _cb.openUntil) return []

  try {
    const res = await SpellcheckService.check(text, 'auto', { enabledOnly: false })
    _cb.failures = 0
    return res.data.datas?.matches || []
  } catch (err) {
    // 429 = rate limited — LT is up, don't count as a failure
    if (err.response && err.response.status === 429) return []

    _cb.failures++
    if (_cb.failures >= _cb.threshold) {
      _cb.openUntil = Date.now() + _cb.cooldown
      console.warn(`Spellcheck: service unreachable, pausing checks for ${_cb.cooldown / 1000}s`)
      _cb.failures = 0
    } else {
      console.warn('Spellcheck request failed:', err.message || err)
    }
    return []
  }
}

const getMatchAndSetDecorations = async (storage, doc, text, originalFrom, offsetMap = null) => {
  const matches = await fetchMatchesForChunk(text)

  // If offsetMap is empty or not provided with no originalFrom, we can't place decorations
  const hasValidOffsetMap = offsetMap && offsetMap.length > 0
  if (!hasValidOffsetMap && originalFrom === null) {
    return
  }

  const decorations = []
  for (const match of matches) {
    // Limit suggestions per match if maxSuggestions is set
    if (storage.maxSuggestions && match.replacements?.length > storage.maxSuggestions) {
      match.replacements = match.replacements.slice(0, storage.maxSuggestions)
    }

    let docFrom, docTo
    if (hasValidOffsetMap) {
      // Use offset map to convert string position to editor position
      docFrom = stringOffsetToEditorPos(match.offset, offsetMap)
      docTo = stringOffsetToEditorPos(match.offset + match.length, offsetMap)
    } else {
      // Legacy behavior: simple offset from originalFrom
      docFrom = match.offset + originalFrom
      docTo = docFrom + match.length
    }
    decorations.push(gimmeDecoration(docFrom, docTo, match))
  }

  if (!storage.editorView) return

  // Calculate the range to clear decorations from
  const rangeFrom = hasValidOffsetMap ? offsetMap[0].editorPos : originalFrom
  const rangeTo = hasValidOffsetMap
    ? offsetMap[offsetMap.length - 1].editorPos + offsetMap[offsetMap.length - 1].length
    : originalFrom + text.length

  const toRemove = storage.decorationSet.find(rangeFrom, rangeTo)
  storage.decorationSet = storage.decorationSet.remove(toRemove)
  storage.decorationSet = storage.decorationSet.add(doc, decorations)

  storage.editorView.dispatch(storage.editorView.state.tr.setMeta(LanguageToolHelpingWords.LanguageToolTransactionName, true))

  setTimeout(() => addEventListenersToDecorations(storage), 100)
}

const createDebouncedGetMatchAndSetDecorations = (storage) => {
  return debounce((text, originalFrom) => {
    if (!storage.editorView) return
    const doc = storage.editorView.state.doc
    getMatchAndSetDecorations(storage, doc, text, originalFrom)
  }, 1000)
}

const proofreadAndDecorateWholeDoc = async (storage, doc) => {
  if (!doc || !storage.editorView) return

  let textNodesWithPosition = []
  let index = 0

  doc.descendants((node, pos, parent) => {
    if (node.isText && parent?.type.name !== 'codeBlock') {
      if (textNodesWithPosition[index]) {
        const text = textNodesWithPosition[index].text + node.text
        const from = textNodesWithPosition[index].from
        const to = from + text.length
        textNodesWithPosition[index] = { text, from, to }
      } else {
        const text = node.text
        const from = pos
        const to = pos + text.length
        textNodesWithPosition[index] = { text, from, to }
      }
    } else {
      index += 1
    }
  })

  storage.textNodesWithPosition = textNodesWithPosition.filter(Boolean)

  // If no text to check, exit
  if (storage.textNodesWithPosition.length === 0) return

  // Build finalText with single space separators and track offset mapping
  let finalText = ''
  let currentStringPos = 0
  let offsetMap = [] // Maps string positions to editor positions
  const chunksOf500Words = []

  for (const { text, from } of storage.textNodesWithPosition) {
    // Add single space separator between text nodes (except for the first one)
    if (finalText.length > 0) {
      finalText += ' '
      currentStringPos += 1
    }

    // Record the mapping: position in finalText → position in editor
    offsetMap.push({ stringPos: currentStringPos, editorPos: from, length: text.length })

    finalText += text
    currentStringPos += text.length

    if (moreThan500Words(finalText)) {
      chunksOf500Words.push({
        text: finalText,
        offsetMap: offsetMap,
      })
      // Reset for next chunk
      finalText = ''
      currentStringPos = 0
      offsetMap = []
    }
  }

  // Push remaining text as final chunk (only if we have valid offset mappings)
  if (offsetMap.length > 0) {
    chunksOf500Words.push({
      text: finalText,
      offsetMap: offsetMap,
    })
  }

  const requests = chunksOf500Words.map(({ text, offsetMap }) =>
    getMatchAndSetDecorations(storage, doc, text, null, offsetMap)
  )

  storage.editorView.dispatch(storage.editorView.state.tr.setMeta(LanguageToolHelpingWords.LoadingTransactionName, true))

  Promise.all(requests)
    .then(() => {
      if (storage.editorView) storage.editorView.dispatch(storage.editorView.state.tr.setMeta(LanguageToolHelpingWords.LoadingTransactionName, false))
      storage.proofReadInitially = true
    })
    .catch((err) => {
      console.warn('Spellcheck proofread failed:', err.message || err)
      if (storage.editorView) storage.editorView.dispatch(storage.editorView.state.tr.setMeta(LanguageToolHelpingWords.LoadingTransactionName, false))
    })
}

export const LanguageTool = Extension.create({
  name: 'languagetool',

  addOptions() {
    return {
      language: 'auto',
      automaticMode: true,
      active: true,
      maxSuggestions: 5,
    }
  },

  addStorage() {
    return {
      match: ref(null),
      loading: ref(false),
      matchActivated: false,
      matchRange: null,
      active: this.options.active,
      // Per-instance state
      maxSuggestions: null,
      editorView: null,
      decorationSet: null,
      textNodesWithPosition: [],
      proofReadInitially: false,
      forceFullProofread: false,
      debouncedGetMatchAndSetDecorations: null,
      debouncedProofreadAndDecorate: null,
      _pendingClickActivation: false,
    }
  },

  addCommands() {
    return {
      proofread:
        () =>
        ({ tr }) => {
          proofreadAndDecorateWholeDoc(this.storage, tr.doc)
          return true
        },

      // Adds the currently selected match word to the shared organization dictionary
      ignoreLanguageToolSuggestion:
        () =>
        ({ editor }) => {
          if (!this.storage.matchRange) return false
          const { from, to } = this.storage.matchRange
          const word = editor.state.doc.textBetween(from, to)

          SpellcheckService.addWord(word)
            .then(() => {
              // Notify all editors to remove decorations for this word
              document.dispatchEvent(new CustomEvent(LanguageToolHelpingWords.WordIgnoredEventName, {
                detail: { word: word.toLowerCase() }
              }))
            })
            .catch((err) => {
              Notify.create({
                message: err.response?.data?.datas || 'Failed to add word to dictionary',
                color: 'negative',
                textColor: 'white',
                position: 'top-right'
              })
            })

          return false
        },

      resetLanguageToolMatch:
        () =>
        ({ editor }) => {
          const { dispatch, state } = editor.view
          const tr = state.tr

          this.storage.match.value = null
          this.storage.matchRange = null

          dispatch(
            tr
              .setMeta(LanguageToolHelpingWords.MatchRangeUpdatedTransactionName, true)
              .setMeta(LanguageToolHelpingWords.MatchUpdatedTransactionName, true),
          )

          return false
        },

      removeCurrentMatchDecoration:
        () =>
        ({ editor }) => {
          const range = this.storage.matchRange
          if (!range) return false
          const toRemove = this.storage.decorationSet.find(range.from, range.to)
          if (toRemove.length > 0) {
            this.storage.decorationSet = this.storage.decorationSet.remove(toRemove)
            const { dispatch, state } = editor.view
            dispatch(state.tr.setMeta(LanguageToolHelpingWords.LanguageToolTransactionName, true))
          }
          return true
        },

      toggleLanguageTool:
        () =>
        ({ commands }) => {
          this.storage.active = !this.storage.active

          if (this.storage.active) commands.proofread()
          else commands.resetLanguageToolMatch()

          return false
        },

      getLanguageToolState: () => () => this.storage.active,
    }
  },

  addProseMirrorPlugins() {
    // Store options in storage for access by helper functions
    this.storage.maxSuggestions = this.options.maxSuggestions

    // Compatibility with the profile "disable auto-correction" toggle: re-reads
    // sessionStorage and activates/deactivates checking accordingly.
    this.storage.updateLanguageToolState = () => {
      const autoCorrectionEnabled = sessionStorage.getItem('autoCorrectionEnabled') !== 'false'
      this.storage.active = autoCorrectionEnabled && this.options.active
      if (this.storage.active && this.storage.editorView) {
        proofreadAndDecorateWholeDoc(this.storage, this.storage.editorView.state.doc)
      } else if (this.storage.editorView) {
        this.storage.match.value = null
        this.storage.matchRange = null
        this.storage.editorView.dispatch(
          this.storage.editorView.state.tr.setMeta(LanguageToolHelpingWords.LanguageToolTransactionName, true)
        )
      }
    }

    return [
      new Plugin({
        key: new PluginKey('languagetoolPlugin'),

        props: {
          decorations(state) {
            return this.getState(state)
          },

          attributes: {
            spellcheck: 'false',
          },

          handlePaste: () => {
            // Set flag to trigger full proofread after paste is applied
            this.storage.forceFullProofread = true
            return false
          },
        },

        state: {
          init: (_, state) => {
            this.storage.decorationSet = DecorationSet.create(state.doc, [])

            // Defer initial proofread until we have editorView
            return this.storage.decorationSet
          },

          apply: (tr, _oldPluginState) => {
            if (!this.storage.active) return DecorationSet.empty

            const loading = tr.getMeta(LanguageToolHelpingWords.LoadingTransactionName)
            if (loading !== undefined) this.storage.loading.value = !!loading

            const ltDecorations = tr.getMeta(LanguageToolHelpingWords.LanguageToolTransactionName)
            if (ltDecorations) return this.storage.decorationSet

            // Cursor movement or typing: dismiss popup unless this selection change
            // was caused by mousedown on an error span (_pendingClickActivation flag).
            if (!loading && (tr.selectionSet || tr.docChanged)) {
              if (this.storage._pendingClickActivation) {
                this.storage._pendingClickActivation = false
                this.storage.matchActivated = true
              } else {
                this.storage.matchActivated = false
              }
            }

            if (tr.docChanged && this.options.automaticMode) {
              // Full proofread if not done initially or if paste triggered it
              if (!this.storage.proofReadInitially || this.storage.forceFullProofread) {
                this.storage.forceFullProofread = false
                if (this.storage.debouncedProofreadAndDecorate) {
                  this.storage.debouncedProofreadAndDecorate(tr.doc)
                }
              } else {
                // Only check the currently selected block node for normal typing
                let selectedNode
                const { from, to } = tr.selection

                tr.doc.descendants((node, pos) => {
                  if (!node.isBlock) return false
                  if (node.type.name === 'codeBlock') return false

                  const nodeFrom = pos
                  const nodeTo = pos + node.nodeSize

                  if (nodeFrom <= from && to <= nodeTo)
                    selectedNode = { node, pos }
                })

                if (selectedNode && this.storage.editorView && this.storage.debouncedGetMatchAndSetDecorations) {
                  const originalFrom = selectedNode.pos + 1
                  this.storage.debouncedGetMatchAndSetDecorations(
                    selectedNode.node.textContent,
                    originalFrom
                  )
                }
              }
            }

            this.storage.decorationSet = this.storage.decorationSet.map(tr.mapping, tr.doc)
            if (this.storage.editorView) {
              setTimeout(() => addEventListenersToDecorations(this.storage), 100)
            }
            return this.storage.decorationSet
          },
        },

        view: (view) => {
          this.storage.editorView = view

          // Handler for when another editor adds a word to the shared dictionary
          const handleWordIgnored = (event) => {
            const ignoredWord = event.detail.word
            const allDecorations = this.storage.decorationSet.find()
            const decorationsToRemove = allDecorations.filter((deco) => {
              const decoText = view.state.doc.textBetween(deco.from, deco.to)
              return decoText.toLowerCase() === ignoredWord
            })

            if (decorationsToRemove.length > 0) {
              this.storage.decorationSet = this.storage.decorationSet.remove(decorationsToRemove)
              view.dispatch(view.state.tr.setMeta(LanguageToolHelpingWords.LanguageToolTransactionName, true))
            }
          }

          document.addEventListener(LanguageToolHelpingWords.WordIgnoredEventName, handleWordIgnored)

          // Initialize debounced functions now that we have editorView
          if (!this.storage.debouncedGetMatchAndSetDecorations) {
            this.storage.debouncedGetMatchAndSetDecorations = createDebouncedGetMatchAndSetDecorations(
              this.storage
            )
          }

          if (!this.storage.debouncedProofreadAndDecorate) {
            this.storage.debouncedProofreadAndDecorate = debounce((doc) => {
              proofreadAndDecorateWholeDoc(this.storage, doc)
            }, 1000)

            // Trigger initial proofread if active and automatic mode is enabled
            if (this.options.automaticMode && this.storage.active && !this.storage.proofReadInitially) {
              proofreadAndDecorateWholeDoc(this.storage, view.state.doc)
            }
          }

          setTimeout(() => addEventListenersToDecorations(this.storage), 100)

          return {
            update: (view) => {
              this.storage.editorView = view
            },
            destroy: () => {
              document.removeEventListener(LanguageToolHelpingWords.WordIgnoredEventName, handleWordIgnored)
              this.storage.editorView = null
            },
          }
        },
      }),
    ]
  },
})
