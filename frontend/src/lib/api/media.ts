// ============================================================
// Media API — presigned POST uploads, finalize, metadata
//
// Uploads go directly to MinIO via a presigned POST policy. The policy
// caps per-file size + content-type at the edge, so an oversize/wrong-type
// file is rejected by the object store even if the UI is bypassed.
// ============================================================

import { apiClient } from './client'
import type { MediaDto } from '@/types/api'

export type MediaType = 'image' | 'gif' | 'video'

export interface GetUploadUrlRequest {
  type: MediaType
  mime: string
  size: number
}

/** A presigned POST the browser submits as multipart/form-data (file last). */
export interface PresignedPost {
  /** Form action URL (public MinIO endpoint, path-style: <endpoint>/<bucket>). */
  url: string
  /** Required form fields (key, Content-Type, policy, signature, …). */
  fields: Record<string, string>
}

export interface GetUploadUrlResponse {
  mediaId: string
  upload: PresignedPost
}

export const mediaApi = {
  getUploadUrl: (body: GetUploadUrlRequest) =>
    apiClient.post<GetUploadUrlResponse>('/media/upload-url', body),

  finalize: (id: string) =>
    apiClient.post<{ media: MediaDto }>(`/media/${id}/finalize`),

  getById: (id: string) =>
    apiClient.get<{ media: MediaDto }>(`/media/${id}`),

  updateAltText: (id: string, altText: string) =>
    apiClient.patch<{ media: MediaDto }>(`/media/${id}`, { altText }),

  /**
   * Direct multipart POST to the presigned MinIO URL — bypasses apiClient (the
   * presigned policy is self-authenticating; no Bearer token). All policy fields
   * are appended first; the file MUST be the last form field (S3/MinIO rule).
   * Returns the raw Response so callers without progress needs can use it.
   */
  uploadToPresignedPost: (upload: PresignedPost, file: File): Promise<void> => {
    const form = buildUploadForm(upload, file)
    return fetch(upload.url, { method: 'POST', body: form }).then((res) => {
      if (!res.ok) throw new Error(`Upload failed: ${res.status}`)
    })
  },
}

/** Build the multipart form for a presigned POST: policy fields first, file last. */
export function buildUploadForm(upload: PresignedPost, file: File): FormData {
  const form = new FormData()
  for (const [key, value] of Object.entries(upload.fields)) {
    form.append(key, value)
  }
  form.append('file', file) // file last — MinIO ignores fields after the file
  return form
}
