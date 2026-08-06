import { describe, it, expect } from 'vitest'
import { mergeSnapshots } from '../src/endpoint/import'
import type { CollectionSnapshot, SnapshotMeta } from '../src/endpoint/types'

const META: SnapshotMeta = { version: 1, directus: '11.17.1', vendor: 'mysql' }

const COLLECTIONS: CollectionSnapshot[] = [
  {
    collection: { collection: 'zbr_pages', meta: {} },
    fields: [
      { collection: 'zbr_pages', field: 'id' },
      { collection: 'zbr_pages', field: 'title' },
    ],
    relations: [
      { collection: 'zbr_pages', field: 'content_id', related_collection: 'zbr_content' },
    ],
  },
  {
    collection: { collection: 'zbr_content', meta: {} },
    fields: [{ collection: 'zbr_content', field: 'id' }],
    relations: [],
  },
]

describe('mergeSnapshots', () => {
  it('sets version, directus, and vendor from meta', () => {
    const snapshot = mergeSnapshots(META, COLLECTIONS)
    expect(snapshot.version).toBe(1)
    expect(snapshot.directus).toBe('11.17.1')
    expect(snapshot.vendor).toBe('mysql')
  })

  it('flattens all collection definitions', () => {
    const snapshot = mergeSnapshots(META, COLLECTIONS)
    expect(snapshot.collections).toHaveLength(2)
    expect(snapshot.collections.map((c) => c['collection'])).toEqual(['zbr_pages', 'zbr_content'])
  })

  it('flattens all fields from all collections', () => {
    const snapshot = mergeSnapshots(META, COLLECTIONS)
    expect(snapshot.fields).toHaveLength(3)
  })

  it('flattens all relations from all collections', () => {
    const snapshot = mergeSnapshots(META, COLLECTIONS)
    expect(snapshot.relations).toHaveLength(1)
    expect(snapshot.relations[0]?.['field']).toBe('content_id')
  })

  it('returns empty arrays when given no collections', () => {
    const snapshot = mergeSnapshots(META, [])
    expect(snapshot.collections).toEqual([])
    expect(snapshot.fields).toEqual([])
    expect(snapshot.relations).toEqual([])
  })

  it('preserves field order across collections', () => {
    const snapshot = mergeSnapshots(META, COLLECTIONS)
    expect(snapshot.fields[0]?.['field']).toBe('id')
    expect(snapshot.fields[1]?.['field']).toBe('title')
    expect(snapshot.fields[2]?.['field']).toBe('id')
  })

  it('omits collection-less entries from snapshot.collections but keeps their fields', () => {
    const withFieldOnly: CollectionSnapshot[] = [
      ...COLLECTIONS,
      {
        fields: [{ collection: 'directus_files', field: 'custom_alt_text' }],
        relations: [],
      },
    ]
    const snapshot = mergeSnapshots(META, withFieldOnly)
    expect(snapshot.collections).toHaveLength(2)
    expect(snapshot.collections.map((c) => c['collection'])).toEqual(['zbr_pages', 'zbr_content'])
    expect(snapshot.fields).toHaveLength(4)
    expect(
      snapshot.fields.some((f) => f['collection'] === 'directus_files' && f['field'] === 'custom_alt_text'),
    ).toBe(true)
  })
})
