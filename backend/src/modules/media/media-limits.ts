import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Media limits, env-driven (only config differs dev↔prod). Confirmed defaults:
 * 2 files/post · 1 MB/file · 2 MB/post · 500 MB global cap · soft-warn at 80%.
 * Images + GIF only this iteration (video deferred; processing seam preserved).
 */
@Injectable()
export class MediaLimits {
  readonly maxFilesPerPost: number;
  readonly maxBytesPerFile: number;
  readonly maxBytesPerPost: number;
  readonly globalCapBytes: number;
  readonly softThresholdPct: number;
  /** Server-side allowlist (allowlist, not denylist). */
  readonly allowedMimes: readonly string[] = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/gif',
  ];

  constructor(config: ConfigService) {
    const num = (key: string, def: number): number => {
      const raw = config.get<string>(key);
      const parsed = raw === undefined ? def : Number(raw);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : def;
    };
    this.maxFilesPerPost = num('MEDIA_MAX_FILES_PER_POST', 2);
    this.maxBytesPerFile = num('MEDIA_MAX_BYTES_PER_FILE', 1 * 1024 * 1024);
    this.maxBytesPerPost = num('MEDIA_MAX_BYTES_PER_POST', 2 * 1024 * 1024);
    this.globalCapBytes = num('MEDIA_GLOBAL_CAP_BYTES', 500 * 1024 * 1024);
    this.softThresholdPct = num('MEDIA_SOFT_THRESHOLD_PCT', 80);
  }

  get softThresholdBytes(): number {
    return Math.floor((this.globalCapBytes * this.softThresholdPct) / 100);
  }

  isMimeAllowed(mime: string): boolean {
    return this.allowedMimes.includes(mime.toLowerCase());
  }
}
