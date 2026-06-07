// ============================================================
// ConfirmDialog tests — renders, confirm/cancel actions, danger variant
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ConfirmDialog } from './ConfirmDialog'

function renderDialog(props: Partial<Parameters<typeof ConfirmDialog>[0]> = {}) {
  const onClose = props.onClose ?? vi.fn()
  const onConfirm = props.onConfirm ?? vi.fn()
  return {
    onClose,
    onConfirm,
    ...render(
      <ConfirmDialog
        isOpen={props.isOpen ?? true}
        onClose={onClose}
        onConfirm={onConfirm}
        title={props.title ?? 'Are you sure?'}
        description={props.description}
        confirmLabel={props.confirmLabel}
        cancelLabel={props.cancelLabel}
        danger={props.danger}
        isLoading={props.isLoading}
      />,
    ),
  }
}

describe('ConfirmDialog', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders when isOpen is true', () => {
    renderDialog({ isOpen: true })
    expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument()
  })

  it('does not render when isOpen is false', () => {
    renderDialog({ isOpen: false })
    expect(screen.queryByTestId('confirm-dialog')).not.toBeInTheDocument()
  })

  it('renders the title', () => {
    renderDialog({ title: 'Delete this item?' })
    expect(screen.getByText('Delete this item?')).toBeInTheDocument()
  })

  it('renders the description when provided', () => {
    renderDialog({ description: 'This action cannot be undone.' })
    expect(screen.getByText('This action cannot be undone.')).toBeInTheDocument()
  })

  it('calls onConfirm when confirm button clicked', () => {
    const { onConfirm } = renderDialog()
    fireEvent.click(screen.getByTestId('confirm-dialog-confirm'))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when cancel button clicked', () => {
    const { onClose } = renderDialog()
    fireEvent.click(screen.getByTestId('confirm-dialog-cancel'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('renders custom confirm label', () => {
    renderDialog({ confirmLabel: 'Delete forever' })
    expect(screen.getByTestId('confirm-dialog-confirm')).toHaveTextContent('Delete forever')
  })

  it('renders custom cancel label', () => {
    renderDialog({ cancelLabel: 'Never mind' })
    expect(screen.getByTestId('confirm-dialog-cancel')).toHaveTextContent('Never mind')
  })

  it('disables buttons when isLoading is true', () => {
    renderDialog({ isLoading: true })
    expect(screen.getByTestId('confirm-dialog-confirm')).toBeDisabled()
    expect(screen.getByTestId('confirm-dialog-cancel')).toBeDisabled()
  })

  it('shows loading ellipsis on confirm button when isLoading', () => {
    renderDialog({ isLoading: true })
    expect(screen.getByTestId('confirm-dialog-confirm')).toHaveTextContent('…')
  })

  it('default buttons are enabled when not loading', () => {
    renderDialog({ isLoading: false })
    expect(screen.getByTestId('confirm-dialog-confirm')).not.toBeDisabled()
    expect(screen.getByTestId('confirm-dialog-cancel')).not.toBeDisabled()
  })
})
