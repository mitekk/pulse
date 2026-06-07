// ============================================================
// Tests for useInfiniteList
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useInfiniteList } from './useInfiniteList'
import type { CursorPage } from '@/types/api'

// ── Mock data ─────────────────────────────────────────────

interface TestItem {
  id: string
  name: string
}

function makePage(items: TestItem[], cursor: string | null, hasMore: boolean): CursorPage<TestItem> {
  return { items, cursor, hasMore }
}

// ── Wrapper factory ────────────────────────────────────────

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  })
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children)
  return { wrapper, queryClient }
}

// ── IntersectionObserver mock ──────────────────────────────

class MockIntersectionObserver {
  observe = vi.fn()
  unobserve = vi.fn()
  disconnect = vi.fn()
  constructor(_cb: IntersectionObserverCallback, _opts?: IntersectionObserverInit) {}
}

beforeEach(() => {
  vi.stubGlobal('IntersectionObserver', MockIntersectionObserver)
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ── Tests ──────────────────────────────────────────────────

describe('useInfiniteList', () => {
  it('returns flattened items from a single page', async () => {
    const page1 = makePage([{ id: '1', name: 'Alpha' }, { id: '2', name: 'Beta' }], null, false)
    const queryFn = vi.fn().mockResolvedValue(page1)

    const { wrapper } = createWrapper()
    const { result } = renderHook(
      () =>
        useInfiniteList<TestItem>({
          queryKey: ['test-list'],
          queryFn,
          staleTime: 60_000,
        }),
      { wrapper },
    )

    await waitFor(() => expect(result.current.status).toBe('success'))

    expect(result.current.items).toHaveLength(2)
    expect(result.current.items[0].id).toBe('1')
    expect(result.current.items[1].id).toBe('2')
    expect(result.current.hasNextPage).toBe(false)
  })

  it('returns hasNextPage=true when cursor is non-null', async () => {
    const page1 = makePage([{ id: '1', name: 'Alpha' }], 'cursor-abc', true)
    const queryFn = vi.fn().mockResolvedValue(page1)

    const { wrapper } = createWrapper()
    const { result } = renderHook(
      () =>
        useInfiniteList<TestItem>({
          queryKey: ['test-list-cursor'],
          queryFn,
          staleTime: 30_000,
        }),
      { wrapper },
    )

    await waitFor(() => expect(result.current.status).toBe('success'))

    expect(result.current.hasNextPage).toBe(true)
  })

  it('flattens multiple pages into a single items array', async () => {
    const page1 = makePage([{ id: '1', name: 'Alpha' }], 'cursor-1', true)
    const page2 = makePage([{ id: '2', name: 'Beta' }], null, false)

    let callCount = 0
    const queryFn = vi.fn().mockImplementation(() => {
      callCount++
      return Promise.resolve(callCount === 1 ? page1 : page2)
    })

    const { wrapper } = createWrapper()
    const { result } = renderHook(
      () =>
        useInfiniteList<TestItem>({
          queryKey: ['test-multipage'],
          queryFn,
          staleTime: 60_000,
        }),
      { wrapper },
    )

    await waitFor(() => expect(result.current.status).toBe('success'))
    expect(result.current.items).toHaveLength(1)

    // Load next page
    await act(() => result.current.fetchNextPage())

    await waitFor(() => expect(result.current.items).toHaveLength(2))
    expect(result.current.items[0].id).toBe('1')
    expect(result.current.items[1].id).toBe('2')
    expect(result.current.hasNextPage).toBe(false)
  })

  it('passes null as initialPageParam (first fetch has no cursor)', async () => {
    const page = makePage([], null, false)
    const queryFn = vi.fn().mockResolvedValue(page)

    const { wrapper } = createWrapper()
    renderHook(
      () =>
        useInfiniteList<TestItem>({
          queryKey: ['test-initial-param'],
          queryFn,
          staleTime: 0,
        }),
      { wrapper },
    )

    await waitFor(() => expect(queryFn).toHaveBeenCalled())
    const ctx = queryFn.mock.calls[0][0] as { pageParam: unknown }
    expect(ctx.pageParam).toBeNull()
  })

  it('starts with pending status and transitions to success', async () => {
    const page = makePage([{ id: '1', name: 'Alpha' }], null, false)
    const queryFn = vi.fn().mockResolvedValue(page)

    const { wrapper } = createWrapper()
    const { result } = renderHook(
      () =>
        useInfiniteList<TestItem>({
          queryKey: ['test-pending'],
          queryFn,
          staleTime: 60_000,
        }),
      { wrapper },
    )

    // Initial state is pending
    expect(result.current.status).toBe('pending')

    await waitFor(() => expect(result.current.status).toBe('success'))
  })
})
