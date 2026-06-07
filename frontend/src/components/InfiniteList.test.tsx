// ============================================================
// InfiniteList tests
// ============================================================

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { InfiniteList } from './InfiniteList'

const noop = () => {}

const baseProps = {
  sentinelRef: noop,
  status: 'success' as const,
  error: null,
  isFetchingNextPage: false,
  hasNextPage: false,
}

describe('InfiniteList', () => {
  it('renders items using renderItem', () => {
    render(
      <InfiniteList
        {...baseProps}
        items={['Alpha', 'Beta', 'Gamma']}
        renderItem={(item) => <div key={item}>{item}</div>}
      />,
    )
    expect(screen.getByText('Alpha')).toBeInTheDocument()
    expect(screen.getByText('Beta')).toBeInTheDocument()
    expect(screen.getByText('Gamma')).toBeInTheDocument()
  })

  it('renders loading skeletons when status is pending', () => {
    render(
      <InfiniteList
        {...baseProps}
        status="pending"
        items={[]}
        renderItem={() => null}
        loadingSkeletonCount={3}
      />,
    )
    const el = document.querySelector('[aria-busy="true"][aria-label="Loading"]')
    expect(el).toBeInTheDocument()
    // 3 skeletons rendered
    expect(document.querySelectorAll('[aria-label="Loading post"]').length).toBe(3)
  })

  it('renders error state when status is error', () => {
    render(
      <InfiniteList
        {...baseProps}
        status="error"
        error={new Error('Connection failed')}
        items={[]}
        renderItem={() => null}
      />,
    )
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByText('Connection failed')).toBeInTheDocument()
  })

  it('renders empty state when items array is empty', () => {
    render(
      <InfiniteList
        {...baseProps}
        items={[]}
        renderItem={() => null}
        emptyState={<p>Nothing here</p>}
      />,
    )
    expect(screen.getByText('Nothing here')).toBeInTheDocument()
  })

  it('renders sentinel div for intersection observer', () => {
    render(
      <InfiniteList
        {...baseProps}
        items={['A']}
        renderItem={(item) => <div key={item}>{item}</div>}
        testId="my-list"
      />,
    )
    expect(screen.getByTestId('my-list-sentinel')).toBeInTheDocument()
  })

  it('renders fetching-next-page skeleton when isFetchingNextPage is true', () => {
    render(
      <InfiniteList
        {...baseProps}
        items={['A']}
        renderItem={(item) => <div key={item}>{item}</div>}
        isFetchingNextPage={true}
        hasNextPage={true}
        testId="tl"
      />,
    )
    expect(screen.getByTestId('tl-fetching')).toBeInTheDocument()
  })

  it('renders end-of-list when hasNextPage is false and items exist', () => {
    render(
      <InfiniteList
        {...baseProps}
        items={['A', 'B']}
        renderItem={(item) => <div key={item}>{item}</div>}
        hasNextPage={false}
        testId="tl"
      />,
    )
    expect(screen.getByTestId('tl-end')).toBeInTheDocument()
  })
})
