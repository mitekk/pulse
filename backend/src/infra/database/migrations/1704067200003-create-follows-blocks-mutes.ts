import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: follows, blocks, mutes tables
 *
 * follows:
 *   - Composite PK (follower_id, followee_id) prevents duplicate follow rows.
 *   - state enum stored as VARCHAR with CHECK for portability.
 *   - CHECK follower_id <> followee_id prevents self-follows at DB level.
 *   - Reverse index (followee_id, follower_id) for "who follows this user" queries.
 *   - Both FKs ON DELETE CASCADE so deleting a user removes all follow edges.
 *
 * blocks:
 *   - Composite PK (blocker_id, blocked_id).
 *   - Index (blocked_id) for "is this user blocked by anyone" lookups.
 *
 * mutes:
 *   - Composite PK (muter_id, muted_id).
 *   - Index (muted_id) for reverse lookup.
 */
export class CreateFollowsBlocksMutes1704067200003 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── follows ───────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE follows (
        follower_id   UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        followee_id   UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        state         VARCHAR(10) NOT NULL DEFAULT 'active'
                        CHECK (state IN ('active', 'pending')),
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (follower_id, followee_id),
        CHECK (follower_id <> followee_id)
      )
    `);

    // Reverse index: "who follows user X" — used for followers list + counter
    await queryRunner.query(`
      CREATE INDEX follows_followee_follower_idx ON follows (followee_id, follower_id);
    `);

    // Index for "who does user X follow" queries (follower_id side already in PK)
    await queryRunner.query(`
      CREATE INDEX follows_state_idx ON follows (state);
    `);

    // ── blocks ────────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE blocks (
        blocker_id  UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        blocked_id  UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (blocker_id, blocked_id),
        CHECK (blocker_id <> blocked_id)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX blocks_blocked_id_idx ON blocks (blocked_id);
    `);

    // ── mutes ─────────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE mutes (
        muter_id    UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        muted_id    UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (muter_id, muted_id),
        CHECK (muter_id <> muted_id)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX mutes_muted_id_idx ON mutes (muted_id);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS mutes`);
    await queryRunner.query(`DROP TABLE IF EXISTS blocks`);
    await queryRunner.query(`DROP TABLE IF EXISTS follows`);
  }
}
