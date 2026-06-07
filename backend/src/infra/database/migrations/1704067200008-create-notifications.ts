import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: create notifications table
 *
 * Table:
 *   - notifications: bigint snowflake PK; recipient_id FK→users; type enum;
 *       actor_id FK→users; post_id bigint nullable; read_at timestamptz nullable;
 *       created_at timestamptz
 *
 * Indexes:
 *   - (recipient_id, id DESC) — primary query pattern for listing notifications
 *   - partial (recipient_id) WHERE read_at IS NULL — unread count queries
 *
 * Constraints:
 *   - recipient_id FK→users ON DELETE CASCADE
 *   - actor_id FK→users ON DELETE CASCADE
 *   - CHECK (recipient_id <> actor_id) — prevent self-notifications at DB level
 */
export class CreateNotifications1704067200008 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── notifications type enum ─────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TYPE notification_type AS ENUM (
        'like',
        'reply',
        'repost',
        'quote',
        'follow',
        'mention',
        'follow_request',
        'dm'
      )
    `);

    // ── notifications table ─────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE notifications (
        id             BIGINT                    NOT NULL,
        recipient_id   UUID                      NOT NULL,
        type           notification_type         NOT NULL,
        actor_id       UUID                      NOT NULL,
        post_id        BIGINT,
        read_at        TIMESTAMPTZ,
        created_at     TIMESTAMPTZ               NOT NULL DEFAULT NOW(),
        CONSTRAINT pk_notifications PRIMARY KEY (id),
        CONSTRAINT fk_notifications_recipient FOREIGN KEY (recipient_id)
          REFERENCES users (id) ON DELETE CASCADE,
        CONSTRAINT fk_notifications_actor FOREIGN KEY (actor_id)
          REFERENCES users (id) ON DELETE CASCADE,
        CONSTRAINT chk_notifications_no_self_notify
          CHECK (recipient_id <> actor_id)
      )
    `);

    // ── index: list by recipient newest-first ───────────────────────────────
    await queryRunner.query(`
      CREATE INDEX idx_notifications_recipient_id
        ON notifications (recipient_id, id DESC)
    `);

    // ── partial index: unread-count queries ────────────────────────────────
    await queryRunner.query(`
      CREATE INDEX idx_notifications_unread
        ON notifications (recipient_id)
        WHERE read_at IS NULL
    `);

    // ── index: deduplicate check (type, post_id, actor_id, recipient_id) ──
    await queryRunner.query(`
      CREATE INDEX idx_notifications_dedup
        ON notifications (recipient_id, type, actor_id, post_id)
        WHERE post_id IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS notifications`);
    await queryRunner.query(`DROP TYPE IF EXISTS notification_type`);
  }
}
