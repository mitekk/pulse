// ============================================================
// Theme management — light/dark toggle
// Persists to localStorage; respects prefers-color-scheme by default
// ============================================================

import { create } from 'zustand'

type Theme = 'dark' | 'light' | 'system'

const STORAGE_KEY = 'pulse-theme'

function getSystemTheme(): 'dark' | 'light' {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function applyTheme(theme: Theme): void {
  const resolved = theme === 'system' ? getSystemTheme() : theme
  if (resolved === 'light') {
    document.documentElement.setAttribute('data-theme', 'light')
  } else {
    document.documentElement.removeAttribute('data-theme')
  }
}

function loadInitialTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'dark' || stored === 'light' || stored === 'system') {
      return stored
    }
  } catch {
    // localStorage not available
  }
  return 'system'
}

interface ThemeState {
  theme: Theme
  resolvedTheme: 'dark' | 'light'
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
}

const initialTheme = loadInitialTheme()
const initialResolved = initialTheme === 'system' ? getSystemTheme() : initialTheme

// Apply immediately to avoid flash
applyTheme(initialTheme)

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: initialTheme,
  resolvedTheme: initialResolved,

  setTheme: (theme) => {
    try {
      localStorage.setItem(STORAGE_KEY, theme)
    } catch {
      // Ignore
    }
    applyTheme(theme)
    const resolvedTheme = theme === 'system' ? getSystemTheme() : theme
    set({ theme, resolvedTheme })
  },

  toggleTheme: () => {
    const current = get().resolvedTheme
    get().setTheme(current === 'dark' ? 'light' : 'dark')
  },
}))

// Listen for system theme changes
if (typeof window !== 'undefined') {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    const state = useThemeStore.getState()
    if (state.theme === 'system') {
      const newResolved = getSystemTheme()
      applyTheme('system')
      useThemeStore.setState({ resolvedTheme: newResolved })
    }
  })
}
