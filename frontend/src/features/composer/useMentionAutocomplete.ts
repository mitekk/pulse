// ============================================================
// useMentionAutocomplete
//
// Detects @trigger in the textarea at the current cursor,
// debounces a call to /search/suggest, and returns suggestions.
// Also handles hashtag suggestions when # is at cursor.
// ============================================================

import { useState, useEffect, useCallback, useRef } from 'react'
import { searchApi } from '@/lib/api/search'
import type { UserCardDto, TagDto } from '@/types/api'

export interface MentionSuggestion {
  kind: 'user'
  user: UserCardDto
}
export interface HashtagSuggestion {
  kind: 'tag'
  tag: TagDto
}
export type AutocompleteSuggestion = MentionSuggestion | HashtagSuggestion

interface UseAutocompleteResult {
  suggestions: AutocompleteSuggestion[]
  isOpen: boolean
  activeIndex: number
  setActiveIndex: (i: number) => void
  selectSuggestion: (s: AutocompleteSuggestion) => void
  dismiss: () => void
  /** Call on every keystroke with (text, cursorPos) */
  onTextChange: (text: string, cursorPos: number) => void
}

const DEBOUNCE_MS = 200
const MIN_QUERY_LEN = 1

// Extract the @handle or #tag being typed at cursorPos
function extractTrigger(
  text: string,
  cursorPos: number,
): { kind: 'mention' | 'hashtag'; query: string; triggerStart: number } | null {
  // Walk backwards from cursor to find trigger char
  let i = cursorPos - 1
  while (i >= 0 && !/\s/.test(text[i])) {
    i--
  }
  const wordStart = i + 1
  const word = text.slice(wordStart, cursorPos)

  if (word.startsWith('@') && word.length > 1) {
    return {
      kind: 'mention',
      query: word.slice(1),
      triggerStart: wordStart,
    }
  }
  if (word.startsWith('#') && word.length > 1) {
    return {
      kind: 'hashtag',
      query: word.slice(1),
      triggerStart: wordStart,
    }
  }
  return null
}

export function useMentionAutocomplete(
  onInsert: (text: string, replaceFrom: number, replaceTo: number) => void,
): UseAutocompleteResult {
  const [suggestions, setSuggestions] = useState<AutocompleteSuggestion[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const triggerRef = useRef<{ kind: 'mention' | 'hashtag'; triggerStart: number; cursorPos: number } | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const dismiss = useCallback(() => {
    setIsOpen(false)
    setSuggestions([])
    triggerRef.current = null
  }, [])

  const onTextChange = useCallback(
    (text: string, cursorPos: number) => {
      const trigger = extractTrigger(text, cursorPos)

      if (!trigger || trigger.query.length < MIN_QUERY_LEN) {
        dismiss()
        return
      }

      triggerRef.current = {
        kind: trigger.kind,
        triggerStart: trigger.triggerStart,
        cursorPos,
      }

      // Debounce the API call
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(async () => {
        try {
          const { users, tags } = await searchApi.suggest(trigger.query)
          const results: AutocompleteSuggestion[] = []

          if (trigger.kind === 'mention') {
            users.slice(0, 5).forEach((u) => results.push({ kind: 'user', user: u }))
          } else {
            tags.slice(0, 5).forEach((t) => results.push({ kind: 'tag', tag: t }))
          }

          if (results.length > 0) {
            setSuggestions(results)
            setIsOpen(true)
            setActiveIndex(0)
          } else {
            dismiss()
          }
        } catch {
          dismiss()
        }
      }, DEBOUNCE_MS)
    },
    [dismiss],
  )

  const selectSuggestion = useCallback(
    (s: AutocompleteSuggestion) => {
      const ref = triggerRef.current
      if (!ref) return

      const insertion =
        s.kind === 'user' ? `@${s.user.handle} ` : `#${s.tag.tag} `

      onInsert(insertion, ref.triggerStart, ref.cursorPos)
      dismiss()
    },
    [onInsert, dismiss],
  )

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  return {
    suggestions,
    isOpen,
    activeIndex,
    setActiveIndex,
    selectSuggestion,
    dismiss,
    onTextChange,
  }
}
