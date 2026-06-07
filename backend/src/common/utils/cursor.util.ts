/**
 * CursorUtil — opaque base64 encode/decode for cursor-based pagination.
 *
 * Supports two cursor shapes:
 *   - ID cursor:          { id: string }
 *   - Score+ID cursor:    { score: string; id: string }
 *
 * The payload is JSON-encoded and base64url-encoded. A HMAC-style version
 * prefix ("v1:") is prepended so we can detect/reject tampered or stale
 * cursor formats in future versions.
 */

const VERSION_PREFIX = 'v1:';

export interface IdCursor {
  type: 'id';
  id: string;
}

export interface ScoreIdCursor {
  type: 'score_id';
  score: string;
  id: string;
}

export type CursorPayload = IdCursor | ScoreIdCursor;

export class CursorUtil {
  /**
   * Encode a cursor payload to an opaque base64url string.
   */
  static encode(payload: CursorPayload): string {
    const json = JSON.stringify(payload);
    const base64 = Buffer.from(json, 'utf8').toString('base64url');
    return VERSION_PREFIX + base64;
  }

  /**
   * Decode an opaque cursor string back to a typed payload.
   * Throws if the cursor is malformed, tampered, or uses an unknown version.
   */
  static decode(cursor: string): CursorPayload {
    if (!cursor.startsWith(VERSION_PREFIX)) {
      throw new Error('Invalid cursor: unknown version');
    }

    const base64 = cursor.slice(VERSION_PREFIX.length);

    let json: string;
    try {
      json = Buffer.from(base64, 'base64url').toString('utf8');
    } catch {
      throw new Error('Invalid cursor: base64 decode failed');
    }

    let payload: unknown;
    try {
      payload = JSON.parse(json);
    } catch {
      throw new Error('Invalid cursor: JSON parse failed');
    }

    if (!CursorUtil.isValidPayload(payload)) {
      throw new Error('Invalid cursor: unexpected payload shape');
    }

    return payload;
  }

  /**
   * Convenience: encode an ID-only cursor.
   */
  static encodeId(id: string): string {
    return CursorUtil.encode({ type: 'id', id });
  }

  /**
   * Convenience: encode a score+id cursor (used for Redis zset pagination).
   */
  static encodeScoreId(score: string, id: string): string {
    return CursorUtil.encode({ type: 'score_id', score, id });
  }

  /**
   * Type guard — validates payload shape after JSON parse.
   */
  private static isValidPayload(value: unknown): value is CursorPayload {
    if (typeof value !== 'object' || value === null) return false;
    const obj = value as Record<string, unknown>;

    if (obj['type'] === 'id') {
      return typeof obj['id'] === 'string' && obj['id'].length > 0;
    }

    if (obj['type'] === 'score_id') {
      return (
        typeof obj['score'] === 'string' &&
        obj['score'].length > 0 &&
        typeof obj['id'] === 'string' &&
        obj['id'].length > 0
      );
    }

    return false;
  }
}
