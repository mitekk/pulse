/**
 * Reads the seeded world written by tour-setup.ts. Specs call readTourState()
 * in beforeAll to get the tour/peer handles and seeded post ids.
 */
import * as fs from 'fs'
import * as path from 'path'
import type { TourState } from './tour-setup'

const TOUR_STATE = path.join(__dirname, '.auth', 'tour-state.json')

export function readTourState(): TourState {
  if (!fs.existsSync(TOUR_STATE)) {
    throw new Error(
      `Tour state not found at ${TOUR_STATE}. Did tour-setup run? Use the tour config: ` +
        `npx playwright test --config=playwright.tour.config.ts`,
    )
  }
  return JSON.parse(fs.readFileSync(TOUR_STATE, 'utf-8')) as TourState
}

export type { TourState }
