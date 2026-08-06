import { describe, it, expect } from 'vitest'
import { splitSnapshot, findOrphanedFiles } from '../src/endpoint/export'
import type { DirectusSnapshot, SchemaConfig } from '../src/endpoint/types'

const DEFAULT_CONFIG: SchemaConfig = {
  outputDir: './snapshots/split',
  ignoreCollections: [],
  ignoreSystemCollections: true,
  includeSystemCollections: [],
  prettyPrint: true,
}

const MOCK_SNAPSHOT: DirectusSnapshot = {
  version: 1,
  directus: '11.17.1',
  vendor: 'mysql',
  collections: [
    { collection: 'zbr_pages', meta: {} },
    { collection: 'zbr_content', meta: {} },
    { collection: 'directus_settings', meta: {} },
  ],
  fields: [
    { collection: 'zbr_pages', field: 'id' },
    { collection: 'zbr_pages', field: 'title' },
    { collection: 'zbr_content', field: 'id' },
    { collection: 'directus_settings', field: 'id' },
  ],
  relations: [
    { collection: 'zbr_pages', field: 'content_id', related_collection: 'zbr_content' },
    { collection: 'zbr_content', field: 'page_id', related_collection: 'zbr_pages' },
  ],
}

describe('splitSnapshot', () => {
  it('returns version, directus, and vendor in meta', () => {
    const { meta } = splitSnapshot(MOCK_SNAPSHOT, DEFAULT_CONFIG)
    expect(meta).toEqual({ version: 1, directus: '11.17.1', vendor: 'mysql' })
  })

  it('excludes system collections by default', () => {
    const { collections } = splitSnapshot(MOCK_SNAPSHOT, DEFAULT_CONFIG)
    expect(collections.has('directus_settings')).toBe(false)
  })

  it('includes user collections', () => {
    const { collections } = splitSnapshot(MOCK_SNAPSHOT, DEFAULT_CONFIG)
    expect(collections.has('zbr_pages')).toBe(true)
    expect(collections.has('zbr_content')).toBe(true)
  })

  it('groups fields by their collection', () => {
    const { collections } = splitSnapshot(MOCK_SNAPSHOT, DEFAULT_CONFIG)
    expect(collections.get('zbr_pages')?.fields).toHaveLength(2)
    expect(collections.get('zbr_content')?.fields).toHaveLength(1)
  })

  it('assigns relations to their collection (many-side)', () => {
    const { collections } = splitSnapshot(MOCK_SNAPSHOT, DEFAULT_CONFIG)
    const pagesRelations = collections.get('zbr_pages')?.relations ?? []
    expect(pagesRelations).toHaveLength(1)
    expect(pagesRelations[0]?.field).toBe('content_id')
  })

  it('stores the collection definition in the collection file', () => {
    const { collections } = splitSnapshot(MOCK_SNAPSHOT, DEFAULT_CONFIG)
    expect(collections.get('zbr_pages')?.collection).toEqual({ collection: 'zbr_pages', meta: {} })
  })

  it('excludes explicitly ignored collections', () => {
    const config = { ...DEFAULT_CONFIG, ignoreCollections: ['zbr_pages'] }
    const { collections } = splitSnapshot(MOCK_SNAPSHOT, config)
    expect(collections.has('zbr_pages')).toBe(false)
    expect(collections.has('zbr_content')).toBe(true)
  })

  it('includes system collections listed in includeSystemCollections', () => {
    const config = { ...DEFAULT_CONFIG, includeSystemCollections: ['directus_settings'] }
    const { collections } = splitSnapshot(MOCK_SNAPSHOT, config)
    expect(collections.has('directus_settings')).toBe(true)
  })

  it('returns empty collections map for empty snapshot', () => {
    const empty: DirectusSnapshot = {
      version: 1, directus: '11.17.1', vendor: 'mysql',
      collections: [], fields: [], relations: [],
    }
    const { collections } = splitSnapshot(empty, DEFAULT_CONFIG)
    expect(collections.size).toBe(0)
  })

  it('includes a field-only system collection when explicitly included', () => {
    const snapshot: DirectusSnapshot = {
      ...MOCK_SNAPSHOT,
      fields: [
        ...MOCK_SNAPSHOT.fields,
        { collection: 'directus_files', field: 'custom_alt_text' },
      ],
    }
    const config = { ...DEFAULT_CONFIG, includeSystemCollections: ['directus_files'] }
    const { collections } = splitSnapshot(snapshot, config)
    expect(collections.has('directus_files')).toBe(true)
    expect(collections.get('directus_files')?.collection).toBeUndefined()
    expect(collections.get('directus_files')?.fields).toEqual([
      { collection: 'directus_files', field: 'custom_alt_text' },
    ])
  })

  it('excludes a field-only system collection when not explicitly included', () => {
    const snapshot: DirectusSnapshot = {
      ...MOCK_SNAPSHOT,
      fields: [
        ...MOCK_SNAPSHOT.fields,
        { collection: 'directus_files', field: 'custom_alt_text' },
      ],
    }
    const { collections } = splitSnapshot(snapshot, DEFAULT_CONFIG)
    expect(collections.has('directus_files')).toBe(false)
  })

  it('includes a field-only system collection when ignoreSystemCollections is false', () => {
    const snapshot: DirectusSnapshot = {
      ...MOCK_SNAPSHOT,
      fields: [
        ...MOCK_SNAPSHOT.fields,
        { collection: 'directus_files', field: 'custom_alt_text' },
      ],
    }
    const config = { ...DEFAULT_CONFIG, ignoreSystemCollections: false }
    const { collections } = splitSnapshot(snapshot, config)
    expect(collections.has('directus_files')).toBe(true)
  })
})

describe('findOrphanedFiles', () => {
  it('returns json files whose collection no longer exists', () => {
    const existing = ['zbr_pages.json', 'generic_content.json', '_meta.json']
    const orphaned = findOrphanedFiles(existing, ['zbr_pages'])
    expect(orphaned).toEqual(['generic_content.json'])
  })

  it('never returns _meta.json', () => {
    const existing = ['_meta.json']
    const orphaned = findOrphanedFiles(existing, [])
    expect(orphaned).toEqual([])
  })

  it('ignores non-json files', () => {
    const existing = ['zbr_pages.json', 'README.md']
    const orphaned = findOrphanedFiles(existing, [])
    expect(orphaned).toEqual(['zbr_pages.json'])
  })

  it('returns an empty array when everything on disk still matches a current collection', () => {
    const existing = ['zbr_pages.json', 'zbr_content.json', '_meta.json']
    const orphaned = findOrphanedFiles(existing, ['zbr_pages', 'zbr_content'])
    expect(orphaned).toEqual([])
  })
})
