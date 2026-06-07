// ============================================================
// ScrollSentinel — lightweight sentinel div for infinite scroll
// Attaches the sentinelRef from useInfiniteList for auto load-more
// ============================================================

interface ScrollSentinelProps {
  sentinelRef: (node: HTMLElement | null) => void
  isFetchingNextPage: boolean
}

export function ScrollSentinel({ sentinelRef, isFetchingNextPage }: ScrollSentinelProps) {
  return (
    <>
      <div
        ref={sentinelRef as (node: HTMLDivElement | null) => void}
        data-testid="scroll-sentinel"
        aria-hidden="true"
        style={{ height: '1px' }}
      />
      {isFetchingNextPage && (
        <div
          data-testid="scroll-sentinel-loading"
          aria-label="Loading more"
          style={{
            display: 'flex',
            justifyContent: 'center',
            padding: '1rem',
            color: 'var(--color-text-muted)',
          }}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            style={{ animation: 'spin 1s linear infinite' }}
          >
            <style>{'@keyframes spin { to { transform: rotate(360deg); } }'}</style>
            <circle
              cx="12"
              cy="12"
              r="9"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeDasharray="28 56"
            />
          </svg>
        </div>
      )}
    </>
  )
}
