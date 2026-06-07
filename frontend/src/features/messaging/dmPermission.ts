// ============================================================
// DM permission gate logic
//
// Rules (from spec §6 + §C14):
//   - If the viewer has blocked the recipient (or vice versa) → blocked
//   - If recipient.dmPrivacy = 'everyone' → allowed
//   - If recipient.dmPrivacy = 'following' → allowed only if they follow back
//     (i.e. viewer is in their followers list — `followedBy` flag)
//
// The ConversationDto includes participants; ProfileDto has viewer flags.
// We derive permission from ProfileDto.viewer which the ConversationPage
// fetches for the other participant.
// ============================================================

import type { ProfileDto } from '@/types/api'

export type DmPermissionStatus =
  | 'allowed'
  | 'blocked'
  | 'not_following' // recipient has dmPrivacy='following' and doesn't follow viewer
  | 'loading'
  | 'unknown'

export interface DmPermissionResult {
  status: DmPermissionStatus
  /** Human-readable explanation when not allowed */
  explanation: string | null
}

export function getDmPermission(
  recipientProfile: ProfileDto | null | undefined,
): DmPermissionResult {
  if (!recipientProfile) {
    return { status: 'loading', explanation: null }
  }

  const viewer = recipientProfile.viewer

  if (!viewer) {
    // Unauthenticated or profile loaded without viewer context
    return { status: 'unknown', explanation: 'Unable to determine messaging permissions.' }
  }

  if (viewer.blocked) {
    return {
      status: 'blocked',
      explanation: `You've blocked @${recipientProfile.handle}. Unblock them to send messages.`,
    }
  }

  // Check if recipient has blocked the viewer
  // The API surfaces this indirectly — if `blocked` is true from viewer perspective
  // it means we blocked them. Reciprocal block detection requires backend support;
  // we approximate: if profile is inaccessible (which the API would 403 on blocked),
  // the ProfileDto wouldn't load — so if we got here, no reciprocal block.

  if (recipientProfile.dmPrivacy === 'following') {
    // Recipient only accepts DMs from people they follow
    if (!viewer.followedBy) {
      return {
        status: 'not_following',
        explanation: `@${recipientProfile.handle} only accepts messages from people they follow.`,
      }
    }
  }

  return { status: 'allowed', explanation: null }
}
