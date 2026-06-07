// ============================================================
// Tests: SearchTypeahead — debounce, short-circuit routing
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { SearchTypeahead } from './SearchTypeahead'
import { searchApi } from '@/lib/api/search'

vi.mock('@/lib/api/search', () => ({
  searchApi: {
    suggest: vi.fn(),
    search: vi.fn(),
    getTrends: vi.fn(),
  },
}))

// Mock useNavigate
const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

function renderTypeahead(props: { onSearch?: (q: string) => void; defaultValue?: string } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <SearchTypeahead {...props} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('SearchTypeahead', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(searchApi.suggest).mockResolvedValue({ users: [], tags: [] })
  })

  it('renders the search input', () => {
    renderTypeahead()
    expect(screen.getByTestId('search-input')).toBeInTheDocument()
  })

  it('shows clear button when input has value', () => {
    renderTypeahead({ defaultValue: 'hello' })
    expect(screen.getByTestId('search-clear')).toBeInTheDocument()
  })

  it('hides clear button when input is empty', () => {
    renderTypeahead()
    expect(screen.queryByTestId('search-clear')).toBeNull()
  })

  it('clears input when clear button clicked', () => {
    renderTypeahead({ defaultValue: 'hello' })
    fireEvent.click(screen.getByTestId('search-clear'))
    expect(screen.getByTestId('search-input')).toHaveValue('')
  })

  it('navigates to #tag route on Enter with #tag input', () => {
    renderTypeahead()
    const input = screen.getByTestId('search-input')
    fireEvent.change(input, { target: { value: '#typescript' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(mockNavigate).toHaveBeenCalledWith('/tag/typescript')
  })

  it('navigates to @handle route on Enter with @handle input', () => {
    renderTypeahead()
    const input = screen.getByTestId('search-input')
    fireEvent.change(input, { target: { value: '@alice' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(mockNavigate).toHaveBeenCalledWith('/@alice')
  })

  it('navigates to /search on Enter with plain query', () => {
    renderTypeahead()
    const input = screen.getByTestId('search-input')
    fireEvent.change(input, { target: { value: 'react hooks' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(mockNavigate).toHaveBeenCalledWith('/search?q=react%20hooks&type=top')
  })

  it('calls onSearch callback on Enter with plain query', () => {
    const onSearch = vi.fn()
    renderTypeahead({ onSearch })
    const input = screen.getByTestId('search-input')
    fireEvent.change(input, { target: { value: 'react' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onSearch).toHaveBeenCalledWith('react')
  })

  it('does not navigate on Enter when input is empty', () => {
    renderTypeahead()
    const input = screen.getByTestId('search-input')
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('closes dropdown on Escape', async () => {
    vi.mocked(searchApi.suggest).mockResolvedValue({
      users: [{ id: 'u1', handle: 'alice', displayName: 'Alice', avatarUrl: null, isVerified: false, isPrivate: false }],
      tags: [],
    })
    renderTypeahead()
    const input = screen.getByTestId('search-input')

    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'ali' } })

    // Advance debounce
    await act(async () => {
      await new Promise((r) => setTimeout(r, 300))
    })

    await waitFor(() => {
      // dropdown should appear
      expect(screen.queryByTestId('search-typeahead-dropdown')).toBeInTheDocument()
    })

    fireEvent.keyDown(input, { key: 'Escape' })
    expect(screen.queryByTestId('search-typeahead-dropdown')).toBeNull()
  })

  it('debounces suggest calls (only fires after 250ms)', async () => {
    renderTypeahead()
    const input = screen.getByTestId('search-input')

    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'a' } })
    fireEvent.change(input, { target: { value: 'al' } })
    fireEvent.change(input, { target: { value: 'ali' } })

    // Before debounce fires
    expect(searchApi.suggest).not.toHaveBeenCalled()

    await act(async () => {
      await new Promise((r) => setTimeout(r, 300))
    })

    // After debounce: only called once with latest value
    expect(searchApi.suggest).toHaveBeenCalledTimes(1)
    expect(searchApi.suggest).toHaveBeenCalledWith('ali')
  })

  it('shows user suggestions in dropdown', async () => {
    vi.mocked(searchApi.suggest).mockResolvedValue({
      users: [
        { id: 'u1', handle: 'alice', displayName: 'Alice', avatarUrl: null, isVerified: false, isPrivate: false },
      ],
      tags: [],
    })
    renderTypeahead()
    const input = screen.getByTestId('search-input')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'ali' } })

    await act(async () => {
      await new Promise((r) => setTimeout(r, 300))
    })

    await waitFor(() => {
      expect(screen.getByTestId('suggest-user-alice')).toBeInTheDocument()
    })
  })

  it('shows tag suggestions in dropdown', async () => {
    vi.mocked(searchApi.suggest).mockResolvedValue({
      users: [],
      tags: [{ tag: 'typescript', postCount: 1200 }],
    })
    renderTypeahead()
    const input = screen.getByTestId('search-input')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'type' } })

    await act(async () => {
      await new Promise((r) => setTimeout(r, 300))
    })

    await waitFor(() => {
      expect(screen.getByTestId('suggest-tag-typescript')).toBeInTheDocument()
    })
  })

  it('navigates to /@handle when user suggestion clicked', async () => {
    vi.mocked(searchApi.suggest).mockResolvedValue({
      users: [
        { id: 'u1', handle: 'alice', displayName: 'Alice', avatarUrl: null, isVerified: false, isPrivate: false },
      ],
      tags: [],
    })
    renderTypeahead()
    const input = screen.getByTestId('search-input')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'ali' } })

    await act(async () => {
      await new Promise((r) => setTimeout(r, 300))
    })

    await waitFor(() => screen.getByTestId('suggest-user-alice'))
    fireEvent.click(screen.getByTestId('suggest-user-alice'))
    expect(mockNavigate).toHaveBeenCalledWith('/@alice')
  })

  it('navigates to /tag/:tag when tag suggestion clicked', async () => {
    vi.mocked(searchApi.suggest).mockResolvedValue({
      users: [],
      tags: [{ tag: 'typescript', postCount: 500 }],
    })
    renderTypeahead()
    const input = screen.getByTestId('search-input')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'type' } })

    await act(async () => {
      await new Promise((r) => setTimeout(r, 300))
    })

    await waitFor(() => screen.getByTestId('suggest-tag-typescript'))
    fireEvent.click(screen.getByTestId('suggest-tag-typescript'))
    expect(mockNavigate).toHaveBeenCalledWith('/tag/typescript')
  })
})
