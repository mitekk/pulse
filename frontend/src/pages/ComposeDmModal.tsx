import { useNavigate } from 'react-router-dom'
import { EmptyState } from '@/components/EmptyState'

export default function ComposeDmModal() {
  const navigate = useNavigate()
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'var(--color-overlay)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 'var(--z-modal)',
      }}
      onClick={() => navigate(-1)}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-xl)',
          minWidth: '400px',
          maxWidth: '520px',
          width: '100%',
          padding: '1.5rem',
        }}
      >
        <EmptyState title="New Message" description="DM composer — coming in Phase 6." />
      </div>
    </div>
  )
}
