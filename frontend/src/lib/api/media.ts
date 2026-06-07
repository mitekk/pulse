// ============================================================
// Media API — presigned uploads, finalize, metadata
// ============================================================

import { apiClient } from './client'
import type { MediaDto } from '@/types/api'

export type MediaType = 'image' | 'gif' | 'video'

export interface GetUploadUrlRequest {
  type: MediaType
  mime: string
  size: number
}

export interface GetUploadUrlResponse {
  mediaId: string
  uploadUrl: string
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
   * Direct PUT to presigned URL — bypasses the apiClient (no Bearer token;
   * the presigned URL is self-authenticating). Returns the raw Response so
   * the caller can observe progress via XHR or the status code.
   */
  uploadDirect: (uploadUrl: string, file: File): Promise<void> =>
    fetch(uploadUrl, {
      method: 'PUT',
      body: file,
      headers: { 'Content-Type': file.type },
    }).then((res) => {
      if (!res.ok) throw new Error(`Upload failed: ${res.status}`)
    }),
}
