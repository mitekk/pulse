// ============================================================
// useMediaUpload — manages the full per-file upload pipeline:
//   1. POST /media/upload-url  → { mediaId, upload: { url, fields } }
//   2. Direct multipart POST to MinIO (presigned policy) with progress
//   3. POST /media/:id/finalize
//   4. Poll GET /media/:id until status = 'ready' | 'failed'
//
// Returns a list of AttachedMedia items, each with status,
// progress 0–100, and the final MediaDto once ready.
//
// Limits enforced (mirror backend MEDIA_MAX_* defaults — the backend +
// presigned-POST policy are authoritative; this is fast UI feedback):
//   • up to 2 files per post
//   • ≤ 1 MB per file
//   • ≤ 2 MB total per post
//   • images + GIF only (video deferred); a GIF can't be mixed with images
// ============================================================

import { useState, useCallback, useRef } from 'react'
import { mediaApi, buildUploadForm } from '@/lib/api/media'
import type { MediaDto } from '@/types/api'
import type { MediaType } from '@/lib/api/media'

export type UploadStatus = 'idle' | 'uploading' | 'processing' | 'ready' | 'failed'

export interface AttachedMedia {
  /** Client-side ID (local, before server assigns mediaId) */
  localId: string
  /** Server-assigned media ID once upload-url is obtained */
  mediaId: string | null
  file: File
  previewUrl: string
  type: MediaType
  status: UploadStatus
  progress: number // 0-100
  altText: string
  /** Final MediaDto once ready */
  media: MediaDto | null
  error: string | null
}

const POLL_INTERVAL_MS = 1500
const POLL_MAX_ATTEMPTS = 20

// ── Limits (mirror backend MEDIA_MAX_* defaults) ───────────
export const MAX_FILES_PER_POST = 2
export const MAX_BYTES_PER_FILE = 1 * 1024 * 1024 // 1 MB
export const MAX_BYTES_PER_POST = 2 * 1024 * 1024 // 2 MB

/** Client allowlist — mirrors backend MediaLimits.allowedMimes. */
const ALLOWED_MIMES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']

// ── Mime type helpers ──────────────────────────────────────

function getMediaType(file: File): MediaType | null {
  const mime = file.type.toLowerCase()
  if (mime === 'image/gif') return 'gif'
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('video/')) return 'video'
  return null
}

function bytesToMb(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(bytes % (1024 * 1024) === 0 ? 0 : 1)
}

function validateFile(file: File, existingAttachments: AttachedMedia[]): string | null {
  const type = getMediaType(file)
  if (type === 'video') return 'Video uploads aren’t supported yet.'
  if (!type || !ALLOWED_MIMES.includes(file.type.toLowerCase())) {
    return 'Unsupported file type. Use JPEG, PNG, WebP, or GIF.'
  }

  // Count
  if (existingAttachments.length >= MAX_FILES_PER_POST) {
    return `Maximum ${MAX_FILES_PER_POST} media files per post.`
  }

  // Per-file size
  if (file.size > MAX_BYTES_PER_FILE) {
    return `Each file must be under ${bytesToMb(MAX_BYTES_PER_FILE)} MB.`
  }

  // Per-post total size
  const existingBytes = existingAttachments.reduce((sum, a) => sum + a.file.size, 0)
  if (existingBytes + file.size > MAX_BYTES_PER_POST) {
    return `Total media must be under ${bytesToMb(MAX_BYTES_PER_POST)} MB.`
  }

  // GIF cannot be mixed with images, and only one GIF
  const hasGif = existingAttachments.some((a) => a.type === 'gif')
  if (type === 'gif' && existingAttachments.length > 0) {
    return 'A GIF must be the only attachment.'
  }
  if (type === 'image' && hasGif) {
    return 'Cannot mix images with a GIF.'
  }

  return null
}

// ── Hook ──────────────────────────────────────────────────

export function useMediaUpload() {
  const [attachments, setAttachments] = useState<AttachedMedia[]>([])
  const pollTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const patchAttachment = useCallback((localId: string, patch: Partial<AttachedMedia>) => {
    setAttachments((prev) => prev.map((a) => (a.localId === localId ? { ...a, ...patch } : a)))
  }, [])

  // ── Poll for ready status ────────────────────────────────
  // Use a ref to hold the polling function to avoid circular dependency lint issues
  const patchAttachmentRef = useRef(patchAttachment)
  patchAttachmentRef.current = patchAttachment

  const pollReady = useCallback(function doPoll(localId: string, mediaId: string, attempt = 0) {
    const timer = setTimeout(async () => {
      try {
        const { media } = await mediaApi.getById(mediaId)
        if (media.status === 'ready') {
          patchAttachmentRef.current(localId, { status: 'ready', media, progress: 100 })
        } else if (media.status === 'failed') {
          patchAttachmentRef.current(localId, { status: 'failed', error: 'Processing failed' })
        } else if (attempt < POLL_MAX_ATTEMPTS) {
          doPoll(localId, mediaId, attempt + 1)
        } else {
          patchAttachmentRef.current(localId, {
            status: 'failed',
            error: 'Timed out waiting for media processing',
          })
        }
      } catch {
        patchAttachmentRef.current(localId, {
          status: 'failed',
          error: 'Failed to check media status',
        })
      }
    }, POLL_INTERVAL_MS)

    pollTimersRef.current.set(localId, timer)
  }, [])

  // ── Upload a single file ─────────────────────────────────
  const uploadFile = useCallback(
    async (file: File) => {
      // Validate before touching state
      const type = getMediaType(file)
      const validationError = validateFile(file, attachments)
      if (validationError) {
        // Return error string so caller can show it
        throw new Error(validationError)
      }
      if (!type) return // unreachable after validation, but narrows the type

      const localId = `local-${Date.now()}-${Math.random().toString(36).slice(2)}`
      const previewUrl = URL.createObjectURL(file)

      const newAttachment: AttachedMedia = {
        localId,
        mediaId: null,
        file,
        previewUrl,
        type,
        status: 'uploading',
        progress: 0,
        altText: '',
        media: null,
        error: null,
      }

      setAttachments((prev) => [...prev, newAttachment])

      try {
        // Step 1: Reserve quota + get the presigned POST
        const { mediaId, upload } = await mediaApi.getUploadUrl({
          type,
          mime: file.type,
          size: file.size,
        })

        patchAttachment(localId, { mediaId })

        // Step 2: Direct multipart POST with XHR for progress
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest()
          xhr.open('POST', upload.url)
          // No Content-Type header: the browser sets the multipart boundary.

          xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable) {
              const pct = Math.round((e.loaded / e.total) * 90)
              patchAttachment(localId, { progress: pct })
            }
          })

          xhr.addEventListener('load', () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve()
            } else {
              reject(new Error(`Upload failed: ${xhr.status}`))
            }
          })

          xhr.addEventListener('error', () => reject(new Error('Upload network error')))
          xhr.send(buildUploadForm(upload, file))
        })

        patchAttachment(localId, { progress: 90, status: 'processing' })

        // Step 3: Finalize (server HEAD-verifies + commits + enqueues processing)
        await mediaApi.finalize(mediaId)

        patchAttachment(localId, { progress: 95 })

        // Step 4: Poll until ready
        pollReady(localId, mediaId)
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Upload failed'
        patchAttachment(localId, { status: 'failed', error: msg })
      }
    },
    [attachments, patchAttachment, pollReady],
  )

  const removeAttachment = useCallback((localId: string) => {
    setAttachments((prev) => {
      const item = prev.find((a) => a.localId === localId)
      if (item) URL.revokeObjectURL(item.previewUrl)
      return prev.filter((a) => a.localId !== localId)
    })
    // Cancel any pending poll
    const timer = pollTimersRef.current.get(localId)
    if (timer) {
      clearTimeout(timer)
      pollTimersRef.current.delete(localId)
    }
  }, [])

  const reorderAttachments = useCallback((fromIdx: number, toIdx: number) => {
    setAttachments((prev) => {
      const next = [...prev]
      const [item] = next.splice(fromIdx, 1)
      next.splice(toIdx, 0, item)
      return next
    })
  }, [])

  const setAltText = useCallback(
    (localId: string, altText: string) => {
      patchAttachment(localId, { altText })
    },
    [patchAttachment],
  )

  const clearAll = useCallback(() => {
    setAttachments((prev) => {
      prev.forEach((a) => URL.revokeObjectURL(a.previewUrl))
      return []
    })
    pollTimersRef.current.forEach((t) => clearTimeout(t))
    pollTimersRef.current.clear()
  }, [])

  const isProcessing = attachments.some(
    (a) => a.status === 'uploading' || a.status === 'processing',
  )

  const readyMediaIds = attachments
    .filter((a) => a.status === 'ready' && a.mediaId)
    .map((a) => a.mediaId!)

  return {
    attachments,
    uploadFile,
    removeAttachment,
    reorderAttachments,
    setAltText,
    clearAll,
    isProcessing,
    readyMediaIds,
    validateFile: (file: File) => validateFile(file, attachments),
  }
}
