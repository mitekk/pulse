import { EmptyState } from '@/components/EmptyState'

export default function HomePage() {
  return (
    <div>
      <header
        style={{
          position: 'sticky',
          top: 0,
          height: 'var(--shell-header-height)',
          background: 'rgba(14,14,15,0.85)',
          backdropFilter: 'blur(12px)',
          borderBottom: '1px solid var(--color-border)',
          display: 'flex',
          alignItems: 'center',
          padding: '0 1rem',
          zIndex: 'var(--z-sticky)',
        }}
      >
        <h1
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 'var(--text-md)',
            fontWeight: 'var(--font-weight-semibold)',
            color: 'var(--color-text)',
          }}
        >
          Home
        </h1>
      </header>
      <EmptyState
        title="Timeline coming soon"
        description="Phase 3 will bring your home timeline with posts, reposts, and quotes."
      />
    </div>
  )
}
