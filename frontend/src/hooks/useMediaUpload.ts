// ============================================================
// useMediaUpload — manages the full per-file upload pipeline:
//   1. POST /media/upload-url  → { mediaId, uploadUrl }
//   2. Direct PUT to uploadUrl with progress tracking
//   3. POST /media/:id/finalize
//   4. Poll GET /media/:id until status = 'ready' | 'failed'
//
// Returns a list of AttachedMedia items, each with status,
// progress 0–100, and the final MediaDto once ready.
//
// Limits enforced:
//   Images: up to 4
//   Video/GIF: up to 1 (mutually exclusive with images)
// ============================================================

import { useState, useCallback, useRef } from 'react'
import { mediaApi } from '@/lib/api/media'
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
  progress: number  // 0-100
  altText: string
  /** Final MediaDto once ready */
  media: MediaDto | null
  error: string | null
}

const POLL_INTERVAL_MS = 1500
const POLL_MAX_ATTEMPTS = 20

// ── Mime type helpers ──────────────────────────────────────

function getMediaType(file: File): MediaType | null {
  if (file.type.startsWith('image/gif')) return 'gif'
  if (file.type.startsWith('image/')) return 'image'
  if (file.type.startsWith('video/')) return 'video'
  return null
}

// Client-side size limits (mirrors backend): 10MB images, 100MB video
const MAX_IMAGE_SIZE = 10 * 1024 * 1024
const MAX_VIDEO_SIZE = 100 * 1024 * 1024

function validateFile(
  file: File,
  existingAttachments: AttachedMedia[],
): string | null {
  const type = getMediaType(file)
  if (!type) return 'Unsupported file type. Use JPEG, PNG, GIF, MP4, or WebM.'

  const existingImages = existingAttachments.filter((a) => a.type === 'image')
  const existingVideo = existingAttachments.filter(
    (a) => a.type === 'video' || a.type === 'gif',
  )

  if (type === 'image') {
    if (existingVideo.length > 0) return 'Cannot mix images with video or GIF.'
    if (existingImages.length >= 4) return 'Maximum 4 images per post.'
    if (file.size > MAX_IMAGE_SIZE) return 'Image must be under 10 MB.'
  }

  if (type === 'video' || type === 'gif') {
    if (existingAttachments.length > 0) return 'Video or GIF must be the only attachment.'
    if (file.size > MAX_VIDEO_SIZE) return `${type === 'gif' ? 'GIF' : 'Video'} must be under 100 MB.`
  }

  return null
}

// ── Hook ──────────────────────────────────────────────────

export function useMediaUpload() {
  const [attachments, setAttachments] = useState<AttachedMedia[]>([])
  const pollTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const patchAttachment = useCallback(
    (localId: string, patch: Partial<AttachedMedia>) => {
      setAttachments((prev) =>
        prev.map((a) => (a.localId === localId ? { ...a, ...patch } : a)),
      )
    },
    [],
  )

  // ── Poll for ready status ────────────────────────────────
  // Use a ref to hold the polling function to avoid circular dependency lint issues
  const patchAttachmentRef = useRef(patchAttachment)
  patchAttachmentRef.current = patchAttachment

  const pollReady = useCallback(
    function doPoll(localId: string, mediaId: string, attempt = 0) {
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
          patchAttachmentRef.current(localId, { status: 'failed', error: 'Failed to check media status' })
        }
      }, POLL_INTERVAL_MS)

      pollTimersRef.current.set(localId, timer)
    },
    [],
  )

  // ── Upload a single file ─────────────────────────────────
  const uploadFile = useCallback(
    async (file: File) => {
      // Validate before touching state
      const type = getMediaType(file)
      if (!type) return

      const validationError = validateFile(file, attachments)
      if (validationError) {
        // Return error string so caller can show it
        throw new Error(validationError)
      }

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
        // Step 1: Get presigned upload URL
        const { mediaId, uploadUrl } = await mediaApi.getUploadUrl({
          type,
          mime: file.type,
          size: file.size,
        })

        patchAttachment(localId, { mediaId })

        // Step 2: Direct PUT with XHR for progress
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest()
          xhr.open('PUT', uploadUrl)
          xhr.setRequestHeader('Content-Type', file.type)

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
          xhr.send(file)
        })

        patchAttachment(localId, { progress: 90, status: 'processing' })

        // Step 3: Finalize
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

  const setAltText = useCallback((localId: string, altText: string) => {
    patchAttachment(localId, { altText })
  }, [patchAttachment])

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
