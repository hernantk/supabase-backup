import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { contentTypeFor, readStorageArchive } from './storageArchive'

let dir: string

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'archive-test-'))
})
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

function write(rel: string, content: string) {
  const file = path.join(dir, rel)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, content)
}

describe('readStorageArchive', () => {
  it('reads buckets, their metadata and nested files with forward-slash paths', () => {
    write('avatars/_bucket_meta.json', JSON.stringify({ name: 'avatars', public: true, file_size_limit: 1000, allowed_mime_types: ['image/png'] }))
    write('avatars/logo.png', 'x')
    write('avatars/users/1/photo.jpg', 'yy')
    write('docs/readme.txt', 'z')

    const buckets = readStorageArchive(dir)

    expect(buckets.map((b) => b.name)).toEqual(['avatars', 'docs'])
    const avatars = buckets[0]
    expect(avatars).toMatchObject({ public: true, fileSizeLimit: 1000, allowedMimeTypes: ['image/png'] })
    expect(avatars.files.map((f) => f.relPath).sort()).toEqual(['logo.png', 'users/1/photo.jpg'])
    expect(avatars.files.find((f) => f.relPath === 'users/1/photo.jpg')?.size).toBe(2)
  })

  it('never lists the metadata file as an object, and defaults to a private bucket without it', () => {
    write('docs/_bucket_meta.json', '{not json')
    write('docs/a.txt', 'a')
    const [docs] = readStorageArchive(dir)
    expect(docs.public).toBe(false)
    expect(docs.files.map((f) => f.relPath)).toEqual(['a.txt'])
  })

  it('returns nothing when the folder does not exist or holds only loose files', () => {
    expect(readStorageArchive(path.join(dir, 'missing'))).toEqual([])
    write('loose.txt', 'x')
    expect(readStorageArchive(dir)).toEqual([])
  })
})

describe('contentTypeFor', () => {
  it('maps known extensions and falls back to octet-stream', () => {
    expect(contentTypeFor('a.PNG')).toBe('image/png')
    expect(contentTypeFor('x.unknown')).toBe('application/octet-stream')
  })
})
