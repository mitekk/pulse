import '@testing-library/jest-dom'
import { vi } from 'vitest'

// ── IntersectionObserver mock ─────────────────────────────
// jsdom does not implement IntersectionObserver; provide a proper
// constructor stub so hooks that use it don't throw.
class MockIntersectionObserver {
  observe = vi.fn()
  unobserve = vi.fn()
  disconnect = vi.fn()
  constructor(_callback: IntersectionObserverCallback, _options?: IntersectionObserverInit) {}
}

Object.defineProperty(window, 'IntersectionObserver', {
  writable: true,
  configurable: true,
  value: MockIntersectionObserver,
})

// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(globalThis as any).IntersectionObserver = MockIntersectionObserver
