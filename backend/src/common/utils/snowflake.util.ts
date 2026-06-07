/**
 * SnowflakeUtil — 64-bit time-ordered ID generator.
 *
 * Layout (64 bits):
 *   [41 bits: ms since epoch] [10 bits: machineId] [12 bits: sequence]
 *
 * Epoch: 2024-01-01T00:00:00.000Z = 1704067200000
 * Max machineId: 1023 (10 bits)
 * Max sequence per ms: 4095 (12 bits)
 *
 * IDs are always returned as strings to avoid JavaScript's Number.MAX_SAFE_INTEGER limit.
 */
export class SnowflakeUtil {
  private static readonly EPOCH = 1704067200000n; // 2024-01-01T00:00:00.000Z
  private static readonly MACHINE_ID_BITS = 10n;
  private static readonly SEQUENCE_BITS = 12n;
  private static readonly MAX_SEQUENCE = (1n << SnowflakeUtil.SEQUENCE_BITS) - 1n; // 4095
  private static readonly MACHINE_ID_SHIFT = SnowflakeUtil.SEQUENCE_BITS;
  private static readonly TIMESTAMP_SHIFT =
    SnowflakeUtil.SEQUENCE_BITS + SnowflakeUtil.MACHINE_ID_BITS;

  private lastTimestamp = -1n;
  private sequence = 0n;
  private readonly machineId: bigint;

  constructor(machineId: number = 0) {
    const max = Number((1n << SnowflakeUtil.MACHINE_ID_BITS) - 1n);
    if (machineId < 0 || machineId > max) {
      throw new Error(`machineId must be between 0 and ${max}`);
    }
    this.machineId = BigInt(machineId);
  }

  generate(): string {
    let now = BigInt(Date.now());

    if (now === this.lastTimestamp) {
      this.sequence = (this.sequence + 1n) & SnowflakeUtil.MAX_SEQUENCE;
      if (this.sequence === 0n) {
        // Sequence exhausted — busy-wait until the next millisecond
        while (now <= this.lastTimestamp) {
          now = BigInt(Date.now());
        }
      }
    } else if (now > this.lastTimestamp) {
      this.sequence = 0n;
    } else {
      // Clock moved backward — use last known timestamp + advance sequence
      now = this.lastTimestamp;
      this.sequence = (this.sequence + 1n) & SnowflakeUtil.MAX_SEQUENCE;
      if (this.sequence === 0n) {
        now = this.lastTimestamp + 1n;
      }
    }

    this.lastTimestamp = now;

    const id =
      ((now - SnowflakeUtil.EPOCH) << SnowflakeUtil.TIMESTAMP_SHIFT) |
      (this.machineId << SnowflakeUtil.MACHINE_ID_SHIFT) |
      this.sequence;

    return id.toString();
  }

  /**
   * Extract the UTC timestamp embedded in a Snowflake ID string.
   */
  static timestampOf(id: string): Date {
    const bigId = BigInt(id);
    const ts = (bigId >> SnowflakeUtil.TIMESTAMP_SHIFT) + SnowflakeUtil.EPOCH;
    return new Date(Number(ts));
  }

  /**
   * Singleton instance for convenience. Machine ID is read from the env var
   * SNOWFLAKE_MACHINE_ID at first access; defaults to 0.
   */
  private static _instance: SnowflakeUtil | null = null;

  static get instance(): SnowflakeUtil {
    if (!SnowflakeUtil._instance) {
      const machineId = parseInt(process.env.SNOWFLAKE_MACHINE_ID ?? '0', 10);
      SnowflakeUtil._instance = new SnowflakeUtil(machineId);
    }
    return SnowflakeUtil._instance;
  }
}
