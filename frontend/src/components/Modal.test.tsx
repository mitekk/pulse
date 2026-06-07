// ============================================================
// Modal tests — focus trap, Escape, overlay close
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Modal } from './Modal'

function renderModal(props: Partial<Parameters<typeof Modal>[0]> = {}) {
  const onClose = props.onClose ?? vi.fn()
  return {
    onClose,
    ...render(
      <Modal
        isOpen={props.isOpen ?? true}
        onClose={onClose}
        ariaLabel="Test modal"
        testId="test-modal"
        {...props}
      >
        <button data-testid="first-btn">First</button>
        <button data-testid="second-btn">Second</button>
      </Modal>,
    ),
  }
}

describe('Modal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders nothing when isOpen is false', () => {
    renderModal({ isOpen: false })
    expect(screen.queryByTestId('test-modal')).not.toBeInTheDocument()
  })

  it('renders content when isOpen is true', () => {
    renderModal()
    expect(screen.getByTestId('test-modal')).toBeInTheDocument()
    expect(screen.getByTestId('first-btn')).toBeInTheDocument()
  })

  it('calls onClose when Escape is pressed', () => {
    const { onClose } = renderModal()
    fireEvent.keyDown(screen.getByTestId('test-modal'), { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when overlay is clicked', () => {
    const { onClose } = renderModal()
    fireEvent.click(screen.getByTestId('test-modal-overlay'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does NOT call onClose when modal panel is clicked', () => {
    const { onClose } = renderModal()
    fireEvent.click(screen.getByTestId('test-modal'))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('has role="dialog"', () => {
    renderModal()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('has aria-modal="true"', () => {
    renderModal()
    expect(screen.getByTestId('test-modal')).toHaveAttribute('aria-modal', 'true')
  })

  it('has aria-label when provided', () => {
    renderModal({ ariaLabel: 'Custom label' })
    expect(screen.getByLabelText('Custom label')).toBeInTheDocument()
  })

  it('renders children', () => {
    renderModal()
    expect(screen.getByTestId('first-btn')).toBeInTheDocument()
    expect(screen.getByTestId('second-btn')).toBeInTheDocument()
  })
})
