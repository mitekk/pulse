// ============================================================
// Timeline New-Posts Buffer Store
// Accumulates "N new posts available" signals from WS
// timeline.newPosts events without auto-injecting them.
// The home page renders a "N new posts" pill that calls flush()
// when tapped, triggering a full timeline refetch.
// ============================================================

import { create } from 'zustand'

interface TimelineBufferState {
  /** Accumulated new-post count since last flush */
  newCount: number
  /** Preview IDs received (last batch wins for display) */
  previewIds: string[]

  add: (count: number, previewIds: string[]) => void
  flush: () => void
}

export const useTimelineBufferStore = create<TimelineBufferState>((set) => ({
  newCount: 0,
  previewIds: [],

  add: (count, previewIds) =>
    set((s) => ({
      newCount: s.newCount + count,
      previewIds,
    })),

  flush: () => set({ newCount: 0, previewIds: [] }),
}))
