import { describe, it, expect } from 'vitest'
import { buildUploadForm } from './media'
import type { PresignedPost } from './media'

describe('buildUploadForm', () => {
  const upload: PresignedPost = {
    url: 'http://localhost:9000/tweeter-media',
    fields: {
      key: 'media/u1/abc/original.jpeg',
      'Content-Type': 'image/jpeg',
      Policy: 'eyJ...',
      'X-Amz-Signature': 'sig',
    },
  }
  const file = new File([new Uint8Array([1, 2, 3])], 'photo.jpeg', { type: 'image/jpeg' })

  it('appends every policy field', () => {
    const form = buildUploadForm(upload, file)
    expect(form.get('key')).toBe('media/u1/abc/original.jpeg')
    expect(form.get('Content-Type')).toBe('image/jpeg')
    expect(form.get('Policy')).toBe('eyJ...')
    expect(form.get('X-Amz-Signature')).toBe('sig')
  })

  it('appends the file last under the "file" field (S3/MinIO requirement)', () => {
    const form = buildUploadForm(upload, file)
    const keys = [...form.keys()]
    expect(keys[keys.length - 1]).toBe('file')
    expect(form.get('file')).toBeInstanceOf(File)
  })
})
