// ============================================================
// EmptyState — placeholder for pages not yet built
// ============================================================

interface EmptyStateProps {
  title?: string
  description?: string
  icon?: React.ReactNode
}

export function EmptyState({
  title = 'Coming soon',
  description = 'This section is under construction.',
  icon,
}: EmptyStateProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '60vh',
        padding: '3rem 1.5rem',
        textAlign: 'center',
        gap: '1rem',
        color: 'var(--color-text-muted)',
      }}
    >
      {icon && (
        <div style={{ fontSize: '3rem', marginBottom: '0.5rem', opacity: 0.4 }}>{icon}</div>
      )}
      <h2
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'var(--text-xl)',
          color: 'var(--color-text)',
          fontWeight: 400,
        }}
      >
        {title}
      </h2>
      <p style={{ fontSize: 'var(--text-sm)', maxWidth: '32ch', lineHeight: 'var(--leading-relaxed)' }}>
        {description}
      </p>
    </div>
  )
}
