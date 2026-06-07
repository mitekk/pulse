// ============================================================
// Composer draft store
//
// Persists draft text per "mode key" in localStorage so
// closing the modal doesn't discard work. Keys:
//   'new'          — top-level post
//   'reply:{id}'   — reply to a specific post
//   'quote:{id}'   — quote of a specific post
// ============================================================

import { create } from 'zustand'

const LS_PREFIX = 'pulse:draft:'

function lsGet(key: string): string {
  try {
    return localStorage.getItem(LS_PREFIX + key) ?? ''
  } catch {
    return ''
  }
}

function lsSet(key: string, value: string) {
  try {
    if (value) {
      localStorage.setItem(LS_PREFIX + key, value)
    } else {
      localStorage.removeItem(LS_PREFIX + key)
    }
  } catch {
    // Ignore storage quota errors
  }
}

interface ComposerState {
  /** The current draft text (for the active mode) */
  drafts: Record<string, string>

  /** Get draft for a given mode key */
  getDraft: (key: string) => string
  /** Update draft */
  setDraft: (key: string, text: string) => void
  /** Clear draft after successful submit */
  clearDraft: (key: string) => void
}

export const useComposerStore = create<ComposerState>()((set, get) => ({
  drafts: {},

  getDraft: (key) => {
    const mem = get().drafts[key]
    if (mem !== undefined) return mem
    // Fall back to localStorage on first access
    const ls = lsGet(key)
    if (ls) {
      set((s) => ({ drafts: { ...s.drafts, [key]: ls } }))
    }
    return ls
  },

  setDraft: (key, text) => {
    lsSet(key, text)
    set((s) => ({ drafts: { ...s.drafts, [key]: text } }))
  },

  clearDraft: (key) => {
    lsSet(key, '')
    set((s) => {
      const next = { ...s.drafts }
      delete next[key]
      return { drafts: next }
    })
  },
}))
