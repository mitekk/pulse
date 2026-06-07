import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: create conversations, conversation_participants, conversation_dyads, messages
 *
 * Tables:
 *   - conversations: bigint snowflake PK; is_group boolean (default false); created_at
 *   - conversation_participants: composite PK (conversation_id, user_id);
 *       last_read_message_id (nullable FK to messages); muted boolean; joined_at
 *   - conversation_dyads: canonical 1:1 lookup; UNIQUE(user_lo, user_hi);
 *       user_lo < user_hi by application convention
 *   - messages: bigint snowflake PK; conversation_id FK; sender_id FK;
 *       text nullable; media_id nullable FK; client_nonce UNIQUE; deleted_at; created_at
 *       index: (conversation_id, id DESC) for efficient message paging
 */
export class CreateMessaging1704067200007 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── conversations ───────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE conversations (
        id            BIGINT              NOT NULL,
        is_group      BOOLEAN             NOT NULL DEFAULT false,
        created_at    TIMESTAMPTZ         NOT NULL DEFAULT NOW(),
        CONSTRAINT pk_conversations PRIMARY KEY (id)
      )
    `);

    // ── conversation_participants ────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE conversation_participants (
        conversation_id     BIGINT      NOT NULL,
        user_id             UUID        NOT NULL,
        last_read_message_id BIGINT     NULL,
        muted               BOOLEAN     NOT NULL DEFAULT false,
        joined_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT pk_conv_participants PRIMARY KEY (conversation_id, user_id),
        CONSTRAINT fk_conv_part_conversation
          FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
        CONSTRAINT fk_conv_part_user
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // Index for "list conversations for a user"
    await queryRunner.query(`
      CREATE INDEX idx_conv_participants_user
        ON conversation_participants (user_id, conversation_id)
    `);

    // ── conversation_dyads ───────────────────────────────────────────────────
    // Canonical 1:1 pair; app enforces user_lo < user_hi (UUID lexicographic order)
    await queryRunner.query(`
      CREATE TABLE conversation_dyads (
        user_lo         UUID    NOT NULL,
        user_hi         UUID    NOT NULL,
        conversation_id BIGINT  NOT NULL,
        CONSTRAINT pk_conv_dyads PRIMARY KEY (user_lo, user_hi),
        CONSTRAINT uq_conv_dyads UNIQUE (user_lo, user_hi),
        CONSTRAINT fk_dyad_conv
          FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
        CONSTRAINT fk_dyad_user_lo
          FOREIGN KEY (user_lo) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT fk_dyad_user_hi
          FOREIGN KEY (user_hi) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT chk_dyad_order CHECK (user_lo < user_hi)
      )
    `);

    // ── messages ─────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE messages (
        id              BIGINT        NOT NULL,
        conversation_id BIGINT        NOT NULL,
        sender_id       UUID          NOT NULL,
        text            TEXT          NULL,
        media_id        BIGINT        NULL,
        client_nonce    VARCHAR(128)  NOT NULL,
        deleted_at      TIMESTAMPTZ   NULL,
        created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        CONSTRAINT pk_messages PRIMARY KEY (id),
        CONSTRAINT uq_messages_nonce UNIQUE (client_nonce),
        CONSTRAINT fk_msg_conversation
          FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
        CONSTRAINT fk_msg_sender
          FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT chk_msg_text_or_media CHECK (text IS NOT NULL OR media_id IS NOT NULL)
      )
    `);

    // Primary query pattern: paginate messages in a conversation by ID desc
    await queryRunner.query(`
      CREATE INDEX idx_messages_conv_id
        ON messages (conversation_id, id DESC)
    `);

    // FK index for sender lookups
    await queryRunner.query(`
      CREATE INDEX idx_messages_sender
        ON messages (sender_id)
    `);

    // Now that messages table exists, add the FK from conversation_participants
    await queryRunner.query(`
      ALTER TABLE conversation_participants
        ADD CONSTRAINT fk_conv_part_last_read
          FOREIGN KEY (last_read_message_id) REFERENCES messages(id) ON DELETE SET NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop FK first to avoid dependency errors
    await queryRunner.query(`
      ALTER TABLE conversation_participants
        DROP CONSTRAINT IF EXISTS fk_conv_part_last_read
    `);

    await queryRunner.query(`DROP TABLE IF EXISTS messages`);
    await queryRunner.query(`DROP TABLE IF EXISTS conversation_dyads`);
    await queryRunner.query(`DROP TABLE IF EXISTS conversation_participants`);
    await queryRunner.query(`DROP TABLE IF EXISTS conversations`);
  }
}
