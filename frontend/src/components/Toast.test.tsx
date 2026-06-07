import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ToastProvider, useToast } from './Toast'

// Helper component to call the toast hook
function ToastTrigger({
  variant = 'success',
  title = 'Test title',
  description,
  duration,
}: {
  variant?: 'success' | 'error' | 'info' | 'warning'
  title?: string
  description?: string
  duration?: number
}) {
  const { toast } = useToast()
  return (
    <button
      data-testid="trigger"
      onClick={() => toast({ variant, title, description, duration })}
    >
      Fire toast
    </button>
  )
}

function Wrapper({ children }: { children: React.ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>
}

describe('Toast', () => {
  it('shows a toast when triggered', async () => {
    render(
      <Wrapper>
        <ToastTrigger title="Hello" />
      </Wrapper>,
    )

    await userEvent.click(screen.getByTestId('trigger'))

    expect(screen.getByText('Hello')).toBeInTheDocument()
  })

  it('shows success variant', async () => {
    render(
      <Wrapper>
        <ToastTrigger variant="success" title="Success!" />
      </Wrapper>,
    )
    await userEvent.click(screen.getByTestId('trigger'))
    expect(screen.getByText('Success!')).toBeInTheDocument()
  })

  it('shows error variant', async () => {
    render(
      <Wrapper>
        <ToastTrigger variant="error" title="Failed!" />
      </Wrapper>,
    )
    await userEvent.click(screen.getByTestId('trigger'))
    expect(screen.getByText('Failed!')).toBeInTheDocument()
  })

  it('shows optional description', async () => {
    render(
      <Wrapper>
        <ToastTrigger title="Saved" description="Changes saved successfully" />
      </Wrapper>,
    )
    await userEvent.click(screen.getByTestId('trigger'))
    expect(screen.getByText('Changes saved successfully')).toBeInTheDocument()
  })

  it('dismisses when X button clicked', async () => {
    render(
      <Wrapper>
        <ToastTrigger title="Dismiss me" duration={0} />
      </Wrapper>,
    )
    await userEvent.click(screen.getByTestId('trigger'))
    expect(screen.getByText('Dismiss me')).toBeInTheDocument()

    // Find the dismiss button and click it
    const dismissBtn = screen.getByLabelText('Dismiss notification')
    await userEvent.click(dismissBtn)

    await waitFor(() => {
      expect(screen.queryByText('Dismiss me')).not.toBeInTheDocument()
    }, { timeout: 1000 })
  })

  it('renders aria-live region', () => {
    render(
      <Wrapper>
        <ToastTrigger />
      </Wrapper>,
    )
    expect(screen.getByTestId('toast-region')).toHaveAttribute('aria-live', 'polite')
  })

  it('renders multiple toasts', async () => {
    function MultiTrigger() {
      const { toast } = useToast()
      return (
        <>
          <button data-testid="t1" onClick={() => toast({ variant: 'success', title: 'Alpha toast', duration: 0 })}>
            Trigger 1
          </button>
          <button data-testid="t2" onClick={() => toast({ variant: 'error', title: 'Beta toast', duration: 0 })}>
            Trigger 2
          </button>
        </>
      )
    }

    render(
      <ToastProvider>
        <MultiTrigger />
      </ToastProvider>,
    )

    await userEvent.click(screen.getByTestId('t1'))
    await userEvent.click(screen.getByTestId('t2'))

    expect(screen.getAllByText('Alpha toast').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Beta toast').length).toBeGreaterThan(0)
  })

  it('throws when used outside provider', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    function Naked() {
      useToast()
      return null
    }
    expect(() => render(<Naked />)).toThrow('useToast must be used inside <ToastProvider>')
    consoleError.mockRestore()
  })
})
