import { describe, it, expect } from 'vitest'
import { splitSnapshot } from '../src/endpoint/export'
import { mergeSnapshots } from '../src/endpoint/import'
import type { DirectusSnapshot, SchemaConfig } from '../src/endpoint/types'

const CONFIG: SchemaConfig = {
  outputDir: './snapshots/split',
  ignoreCollections: [],
  ignoreSystemCollections: false,
  includeSystemCollections: [],
  prettyPrint: false,
}

function baseSnapshot(): DirectusSnapshot {
  return {
    version: 1,
    directus: '11.17.1',
    vendor: 'mysql',
    collections: [{ collection: 'articles', meta: {} }],
    fields: [
      { collection: 'articles', field: 'title' },
      { collection: 'directus_files', field: 'custom_alt_text' },
    ],
    relations: [
      { collection: 'directus_files', field: 'custom_related_article', related_collection: 'articles' },
    ],
  }
}

describe('field-only system collection round trip', () => {
  it("carries a field-only collection's fields through split -> disk -> merge", () => {
    const { meta, collections } = splitSnapshot(baseSnapshot(), CONFIG)

    const onDisk = [...collections.values()].map((c) => JSON.parse(JSON.stringify(c)))

    const merged = mergeSnapshots(meta, onDisk)

    expect(merged.collections.map((c) => c['collection'])).toEqual(['articles'])
    expect(merged.fields).toEqual(
      expect.arrayContaining([{ collection: 'directus_files', field: 'custom_alt_text' }]),
    )
  })

  it('captures relations for a field-only collection in the split output', () => {
    const { collections } = splitSnapshot(baseSnapshot(), CONFIG)
    expect(collections.get('directus_files')?.relations).toEqual([
      { collection: 'directus_files', field: 'custom_related_article', related_collection: 'articles' },
    ])
  })

  it("carries a field-only collection's relations through split -> disk -> merge", () => {
    const { meta, collections } = splitSnapshot(baseSnapshot(), CONFIG)
    const onDisk = [...collections.values()].map((c) => JSON.parse(JSON.stringify(c)))
    const merged = mergeSnapshots(meta, onDisk)
    expect(merged.relations).toEqual(
      expect.arrayContaining([
        { collection: 'directus_files', field: 'custom_related_article', related_collection: 'articles' },
      ]),
    )
  })

  it('ignores a field entry with no collection key instead of throwing', () => {
    const snapshot: DirectusSnapshot = {
      ...baseSnapshot(),
      fields: [...baseSnapshot().fields, { field: 'orphaned_field' }],
    }
    expect(() => splitSnapshot(snapshot, CONFIG)).not.toThrow()
  })
})
