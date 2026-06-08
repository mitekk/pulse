/**
 * Tour global setup — runs once before the UI walkthrough suite.
 *
 * Unlike the CI e2e global-setup (which seeds users for 4 narrow specs), this
 * builds a *complete* world so the walkthrough can verify every page against
 * real data:
 *   - tourUser  : the account the browser drives (logged in once here).
 *   - peerUser  : a second account that follows tourUser, likes & replies to
 *                 tourUser's post (→ notifications), authors a #hashtag post
 *                 (→ search / trends / tag timeline), and opens a DM thread.
 *
 * Login itself is handled per-worker by the `authedPage` fixture (fixtures.ts),
 * so this setup only builds data. It writes the seeded handles / post ids to
 * tour-state.json (git-ignored, under tests/e2e/tour/.auth/) for specs to read.
 */
import { request } from '@playwright/test'
import { execSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import {
  SEED_PASSWORD,
  registerUser,
  patchMe,
  createPost,
  followUser,
  likePost,
  createConversation,
  sendMessage,
} from '../helpers/seed'

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:18080'
const STATE_DIR = path.join(__dirname, '.auth')
const TOUR_STATE = path.join(STATE_DIR, 'tour-state.json')

export interface TourState {
  password: string
  tourUser: { email: string; handle: string; displayName: string }
  peerUser: { email: string; handle: string; displayName: string }
  seed: {
    hashtag: string
    tourPostId: string
    tourPostText: string
    peerPostId: string
    peerPostText: string
    peerHashtagPostId: string
    hashtagPostText: string
    peerReplyId: string
    conversationId: string
  }
}

async function tourSetup() {
  // 1. Reset Redis rate-limit counters from any previous run.
  try {
    execSync('docker exec tweeter-redis-1 redis-cli FLUSHALL', { stdio: 'pipe' })
    console.log('[tour-setup] Redis flushed — rate limit counters reset')
  } catch (err) {
    console.warn('[tour-setup] Redis flush skipped:', String(err))
  }

  if (!fs.existsSync(STATE_DIR)) fs.mkdirSync(STATE_DIR, { recursive: true })

  const api = await request.newContext({
    baseURL: BASE_URL,
    extraHTTPHeaders: { Origin: BASE_URL },
  })

  const suffix = (process.env.E2E_SUFFIX ?? Date.now().toString(36)).slice(0, 9)
  const hashtag = `pulse${suffix}` // alphanumeric, safe for #tag

  const tourUser = {
    email: `tour_${suffix}@e2e.test`,
    handle: `tour_${suffix}`.slice(0, 15),
    displayName: 'Tour User',
  }
  const peerUser = {
    email: `peer_${suffix}@e2e.test`,
    handle: `peer_${suffix}`.slice(0, 15),
    displayName: 'Peer User',
  }

  console.log('[tour-setup] Registering users...')
  const tour = await registerUser(api, tourUser)
  const peer = await registerUser(api, peerUser)

  // Open DMs both ways so the DM walkthrough works regardless of follow state.
  await patchMe(api, tour.accessToken, { dmPrivacy: 'everyone' })
  await patchMe(api, peer.accessToken, { dmPrivacy: 'everyone' })

  // tourUser authors a post (gives the profile/timeline content + a like target).
  const tourPostText = `Tour seed post ${suffix} — exploring PULSE`
  const tourPost = await createPost(api, tour.accessToken, { text: tourPostText })

  // peerUser authors a plain post and a #hashtag post (feeds search/trends/tag).
  const peerPostText = `Peer says hi ${suffix}`
  const peerPost = await createPost(api, peer.accessToken, { text: peerPostText })
  const hashtagPostText = `Loving the #${hashtag} vibes ${suffix}`
  const peerHashtagPost = await createPost(api, peer.accessToken, { text: hashtagPostText })

  // peerUser engages tourUser → generates follow / like / reply notifications.
  await followUser(api, peer.accessToken, tour.handle)
  await likePost(api, peer.accessToken, tourPost.id)
  const peerReply = await createPost(api, peer.accessToken, {
    replyToId: tourPost.id,
    text: `Nice one @${tour.handle}!`,
  })

  // tourUser follows peerUser back so peer's posts (incl. the #hashtag one) fan
  // into tourUser's home feed — gives the timeline walkthrough real content.
  await followUser(api, tour.accessToken, peer.handle)

  // A DM conversation peer → tour so the messages list + thread have data.
  const conversation = await createConversation(api, peer.accessToken, tour.handle)
  await sendMessage(api, peer.accessToken, conversation.id, 'Welcome to the tour!', `nonce-${suffix}-1`)

  await api.dispose()

  const state: TourState = {
    password: SEED_PASSWORD,
    tourUser,
    peerUser,
    seed: {
      hashtag,
      tourPostId: tourPost.id,
      tourPostText,
      peerPostId: peerPost.id,
      peerPostText,
      peerHashtagPostId: peerHashtagPost.id,
      hashtagPostText,
      peerReplyId: peerReply.id,
      conversationId: conversation.id,
    },
  }
  fs.writeFileSync(TOUR_STATE, JSON.stringify(state, null, 2))
  console.log('[tour-setup] Complete — world seeded, state saved to', TOUR_STATE)
}

export default tourSetup
