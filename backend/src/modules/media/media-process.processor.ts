import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Job } from 'bullmq';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs/promises';
import sharp from 'sharp';
import ffmpeg from 'fluent-ffmpeg';
import { Media, MediaVariants } from './media.entity';
import { STORAGE_PORT, StoragePort } from '../../infra/storage/storage.port';

interface MediaProcessJobData {
  mediaId: string;
  ownerId: string;
}

/** Image variant sizes: [name, widthPx] */
const IMAGE_VARIANTS: Array<[keyof MediaVariants, number]> = [
  ['thumb', 150],
  ['small', 360],
  ['medium', 720],
  ['large', 1280],
];

@Processor('media')
export class MediaProcessProcessor extends WorkerHost {
  private readonly logger = new Logger(MediaProcessProcessor.name);

  constructor(
    @InjectRepository(Media)
    private readonly mediaRepo: Repository<Media>,
    @Inject(STORAGE_PORT)
    private readonly storage: StoragePort,
  ) {
    super();
  }

  async process(job: Job<MediaProcessJobData>): Promise<void> {
    const { mediaId } = job.data;
    this.logger.log(`Processing media ${mediaId} (attempt ${job.attemptsMade + 1})`);

    const media = await this.mediaRepo.findOne({ where: { id: mediaId } });
    if (!media) {
      this.logger.warn(`Media ${mediaId} not found — skipping`);
      return;
    }

    // Idempotent — already succeeded
    if (media.status === 'ready') {
      this.logger.debug(`Media ${mediaId} already ready — skipping`);
      return;
    }

    if (!media.storageKey) {
      await this.markFailed(mediaId, 'No storage key on media record');
      return;
    }

    try {
      await this.processMedia(media);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Media ${mediaId} processing failed: ${msg}`);
      await this.markFailed(mediaId, msg);
      throw err; // rethrow so BullMQ retries
    }
  }

  // ── Dispatch by type ──────────────────────────────────────────────────────

  private async processMedia(media: Media): Promise<void> {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), `media-${media.id}-`));

    try {
      // Download the uploaded file to a temp location
      // storageKey checked for null before reaching here (markFailed guard above)
      const inputKey = media.storageKey as string;
      const ext = media.mime.split('/')[1] ?? 'bin';
      const inputPath = path.join(tmpDir, `original.${ext}`);

      await this.downloadFromStorage(inputKey, inputPath);

      if (media.type === 'image') {
        await this.processImage(media, inputPath, tmpDir);
      } else if (media.type === 'gif') {
        await this.processGif(media, inputPath, tmpDir);
      } else if (media.type === 'video') {
        await this.processVideo(media, inputPath, tmpDir);
      }
    } finally {
      // Cleanup temp directory
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  // ── Image processing ──────────────────────────────────────────────────────

  private async processImage(media: Media, inputPath: string, tmpDir: string): Promise<void> {
    // Read metadata (width, height) and strip EXIF for privacy
    const meta = await sharp(inputPath).metadata();
    const width = meta.width ?? null;
    const height = meta.height ?? null;

    const variants: MediaVariants = {};

    for (const [name, targetWidth] of IMAGE_VARIANTS) {
      if (width && width <= targetWidth) {
        // Skip variants larger than the original — use the original instead for this size
        if (name === 'thumb' || !variants.small) {
          // Always produce at least thumb
        } else {
          continue;
        }
      }

      const variantPath = path.join(tmpDir, `${name}.jpg`);
      await sharp(inputPath)
        .autoOrient()
        .resize(targetWidth, undefined, { withoutEnlargement: true })
        .jpeg({ quality: 85, mozjpeg: true })
        .toFile(variantPath);

      const variantKey = this.variantKey(media, name);
      await this.uploadFile(variantPath, variantKey, 'image/jpeg');
      const { url } = await this.storage.getPresignedDownloadUrl(variantKey, 86400 * 365);
      variants[name] = url;
    }

    await this.mediaRepo.update(media.id, {
      status: 'ready',
      width,
      height,
      variants,
    });

    this.logger.log(`Image ${media.id} processed — ${Object.keys(variants).length} variants`);
  }

  // ── GIF processing ────────────────────────────────────────────────────────

  private async processGif(media: Media, inputPath: string, tmpDir: string): Promise<void> {
    const meta = await sharp(inputPath).metadata();
    const width = meta.width ?? null;
    const height = meta.height ?? null;

    // First-frame thumbnail as JPEG
    const thumbPath = path.join(tmpDir, 'thumb.jpg');
    await sharp(inputPath, { page: 0 })
      .resize(150, undefined, { withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toFile(thumbPath);

    const thumbKey = this.variantKey(media, 'thumb');
    await this.uploadFile(thumbPath, thumbKey, 'image/jpeg');
    const { url: thumbUrl } = await this.storage.getPresignedDownloadUrl(thumbKey, 86400 * 365);

    // Convert GIF → looping MP4 (web-friendly)
    const mp4Path = path.join(tmpDir, 'loop.mp4');
    await this.convertGifToMp4(inputPath, mp4Path);

    const mp4Key = this.variantKey(media, 'mp4');
    await this.uploadFile(mp4Path, mp4Key, 'video/mp4');
    const { url: mp4Url } = await this.storage.getPresignedDownloadUrl(mp4Key, 86400 * 365);

    await this.mediaRepo.update(media.id, {
      status: 'ready',
      width,
      height,
      variants: { thumb: thumbUrl, mp4: mp4Url },
    });

    this.logger.log(`GIF ${media.id} processed — thumb + mp4`);
  }

  // ── Video processing ──────────────────────────────────────────────────────

  private async processVideo(media: Media, inputPath: string, tmpDir: string): Promise<void> {
    // Probe for dimensions and duration
    const probe = await this.probeVideo(inputPath);
    const width = probe.width ?? null;
    const height = probe.height ?? null;
    const durationMs = probe.durationSec ? Math.round(probe.durationSec * 1000) : null;

    // Transcode to web-friendly H.264 MP4
    const mp4Path = path.join(tmpDir, 'output.mp4');
    await this.transcodeToMp4(inputPath, mp4Path);

    const mp4Key = this.variantKey(media, 'mp4');
    await this.uploadFile(mp4Path, mp4Key, 'video/mp4');
    const { url: mp4Url } = await this.storage.getPresignedDownloadUrl(mp4Key, 86400 * 365);

    // Extract poster frame (first frame as JPEG)
    const posterPath = path.join(tmpDir, 'poster.jpg');
    await this.extractPosterFrame(inputPath, posterPath);

    const posterKey = this.variantKey(media, 'poster');
    await this.uploadFile(posterPath, posterKey, 'image/jpeg');
    const { url: posterUrl } = await this.storage.getPresignedDownloadUrl(posterKey, 86400 * 365);

    // Thumbnail from poster
    const thumbPath = path.join(tmpDir, 'thumb.jpg');
    await sharp(posterPath)
      .resize(150, undefined, { withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toFile(thumbPath);

    const thumbKey = this.variantKey(media, 'thumb');
    await this.uploadFile(thumbPath, thumbKey, 'image/jpeg');
    const { url: thumbUrl } = await this.storage.getPresignedDownloadUrl(thumbKey, 86400 * 365);

    await this.mediaRepo.update(media.id, {
      status: 'ready',
      width,
      height,
      durationMs,
      variants: { thumb: thumbUrl, mp4: mp4Url, poster: posterUrl },
    });

    this.logger.log(`Video ${media.id} processed — mp4 + poster + thumb`);
  }

  // ── ffmpeg helpers ────────────────────────────────────────────────────────

  private convertGifToMp4(inputPath: string, outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .videoCodec('libx264')
        .outputOptions([
          '-movflags faststart',
          '-pix_fmt yuv420p',
          '-vf scale=trunc(iw/2)*2:trunc(ih/2)*2', // ensure even dimensions for H.264
          '-loop 0', // 0 = infinite loop (but MP4 itself is a finite file)
          '-an', // no audio track for GIF-derived video
        ])
        .on('error', (err) => reject(new Error(`GIF→MP4 failed: ${err.message}`)))
        .on('end', () => resolve())
        .save(outputPath);
    });
  }

  private transcodeToMp4(inputPath: string, outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .videoCodec('libx264')
        .audioCodec('aac')
        .outputOptions([
          '-movflags faststart',
          '-pix_fmt yuv420p',
          '-crf 23',
          '-preset fast',
          '-vf scale=trunc(iw/2)*2:trunc(ih/2)*2',
        ])
        .on('error', (err) => reject(new Error(`Video transcode failed: ${err.message}`)))
        .on('end', () => resolve())
        .save(outputPath);
    });
  }

  private extractPosterFrame(inputPath: string, outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .frames(1)
        .outputOptions(['-ss 0', '-vframes 1'])
        .on('error', (err) => reject(new Error(`Poster extract failed: ${err.message}`)))
        .on('end', () => resolve())
        .save(outputPath);
    });
  }

  private probeVideo(inputPath: string): Promise<{
    width?: number;
    height?: number;
    durationSec?: number;
  }> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(inputPath, (err, meta) => {
        if (err) {
          reject(new Error(`ffprobe failed: ${err.message}`));
          return;
        }
        const videoStream = meta.streams.find((s) => s.codec_type === 'video');
        resolve({
          width: videoStream?.width,
          height: videoStream?.height,
          durationSec: meta.format.duration,
        });
      });
    });
  }

  // ── Storage helpers ───────────────────────────────────────────────────────

  private async downloadFromStorage(key: string, destPath: string): Promise<void> {
    // Use StoragePort to get a presigned download URL, then fetch + stream to file
    const { url } = await this.storage.getPresignedDownloadUrl(key, 300);
    const response = await fetch(url);
    if (!response.ok || !response.body) {
      throw new Error(`Failed to download ${key}: HTTP ${response.status}`);
    }
    const buffer = await response.arrayBuffer();
    await fs.writeFile(destPath, Buffer.from(buffer));
  }

  private async uploadFile(filePath: string, key: string, mime: string): Promise<void> {
    const { uploadUrl } = await this.storage.getPresignedUploadUrl(key, mime, 600);
    const buffer = await fs.readFile(filePath);
    const res = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': mime, 'Content-Length': String(buffer.length) },
      body: buffer,
    });
    if (!res.ok) {
      throw new Error(`Upload of ${key} failed: HTTP ${res.status}`);
    }
  }

  private variantKey(media: Media, variant: string): string {
    return `processed/${media.ownerId}/${media.id}/${variant}`;
  }

  // ── Status helpers ────────────────────────────────────────────────────────

  private async markFailed(mediaId: string, reason: string): Promise<void> {
    this.logger.error(`Marking media ${mediaId} as failed: ${reason}`);
    await this.mediaRepo.update(mediaId, { status: 'failed' }).catch((err) => {
      this.logger.error(`Could not mark media ${mediaId} as failed: ${String(err)}`);
    });
  }
}
