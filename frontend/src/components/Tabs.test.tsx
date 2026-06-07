import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Tabs, TabPanel } from './Tabs'

const TABS = [
  { key: 'posts', label: 'Posts' },
  { key: 'replies', label: 'Replies' },
  { key: 'media', label: 'Media', disabled: true },
]

describe('Tabs', () => {
  it('renders tab list', () => {
    render(<Tabs tabs={TABS} activeKey="posts" onChange={() => undefined} />)
    expect(screen.getByRole('tablist')).toBeInTheDocument()
  })

  it('renders all tabs', () => {
    render(<Tabs tabs={TABS} activeKey="posts" onChange={() => undefined} />)
    expect(screen.getByRole('tab', { name: 'Posts' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Replies' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Media' })).toBeInTheDocument()
  })

  it('marks active tab with aria-selected=true', () => {
    render(<Tabs tabs={TABS} activeKey="replies" onChange={() => undefined} />)
    expect(screen.getByRole('tab', { name: 'Replies' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Posts' })).toHaveAttribute('aria-selected', 'false')
  })

  it('disables disabled tab', () => {
    render(<Tabs tabs={TABS} activeKey="posts" onChange={() => undefined} />)
    expect(screen.getByRole('tab', { name: 'Media' })).toBeDisabled()
  })

  it('calls onChange when tab clicked', async () => {
    const onChange = vi.fn()
    render(<Tabs tabs={TABS} activeKey="posts" onChange={onChange} />)
    await userEvent.click(screen.getByRole('tab', { name: 'Replies' }))
    expect(onChange).toHaveBeenCalledWith('replies')
  })

  it('does not call onChange when disabled tab clicked', async () => {
    const onChange = vi.fn()
    render(<Tabs tabs={TABS} activeKey="posts" onChange={onChange} />)
    await userEvent.click(screen.getByRole('tab', { name: 'Media' }))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('navigates right with ArrowRight key', async () => {
    const onChange = vi.fn()
    render(<Tabs tabs={TABS} activeKey="posts" onChange={onChange} />)
    const postsTab = screen.getByRole('tab', { name: 'Posts' })
    postsTab.focus()
    await userEvent.keyboard('{ArrowRight}')
    // Should skip to 'replies' (next enabled tab)
    expect(onChange).toHaveBeenCalledWith('replies')
  })

  it('navigates left with ArrowLeft key', async () => {
    const onChange = vi.fn()
    render(<Tabs tabs={TABS} activeKey="replies" onChange={onChange} />)
    const repliesTab = screen.getByRole('tab', { name: 'Replies' })
    repliesTab.focus()
    await userEvent.keyboard('{ArrowLeft}')
    expect(onChange).toHaveBeenCalledWith('posts')
  })

  it('navigates to first with Home key', async () => {
    const onChange = vi.fn()
    render(<Tabs tabs={TABS} activeKey="replies" onChange={onChange} />)
    const repliesTab = screen.getByRole('tab', { name: 'Replies' })
    repliesTab.focus()
    await userEvent.keyboard('{Home}')
    expect(onChange).toHaveBeenCalledWith('posts')
  })

  it('navigates to last enabled with End key', async () => {
    const onChange = vi.fn()
    render(<Tabs tabs={TABS} activeKey="posts" onChange={onChange} />)
    const postsTab = screen.getByRole('tab', { name: 'Posts' })
    postsTab.focus()
    await userEvent.keyboard('{End}')
    // Last enabled tab is 'replies' (media is disabled)
    expect(onChange).toHaveBeenCalledWith('replies')
  })

  it('shows count badge when tab.count provided', () => {
    const tabsWithCount = [
      { key: 'posts', label: 'Posts', count: 5 },
      { key: 'replies', label: 'Replies', count: 0 },
    ]
    render(<Tabs tabs={tabsWithCount} activeKey="posts" onChange={() => undefined} />)
    expect(screen.getByText('5')).toBeInTheDocument()
    // count=0 should not render
    expect(screen.queryByText('0')).not.toBeInTheDocument()
  })
})

describe('TabPanel', () => {
  it('renders when active', () => {
    render(
      <TabPanel tabKey="posts" activeKey="posts">
        <div data-testid="content">Posts content</div>
      </TabPanel>,
    )
    expect(screen.getByTestId('content')).toBeInTheDocument()
  })

  it('does not render when inactive (lazy=true)', () => {
    render(
      <TabPanel tabKey="replies" activeKey="posts">
        <div data-testid="content">Replies content</div>
      </TabPanel>,
    )
    expect(screen.queryByTestId('content')).not.toBeInTheDocument()
  })

  it('has correct role and aria attributes', () => {
    render(
      <TabPanel tabKey="posts" activeKey="posts">
        Content
      </TabPanel>,
    )
    const panel = screen.getByRole('tabpanel', { hidden: true })
    expect(panel).toHaveAttribute('id', 'tabpanel-posts')
    expect(panel).toHaveAttribute('aria-labelledby', 'tab-posts')
  })
})
