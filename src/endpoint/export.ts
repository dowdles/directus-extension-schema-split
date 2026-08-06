import { shouldInclude } from './config.js'
import type { SchemaConfig, CollectionSnapshot, SnapshotMeta, DirectusSnapshot } from './types.js'

export function splitSnapshot(
  snapshot: DirectusSnapshot,
  config: SchemaConfig,
): { meta: SnapshotMeta; collections: Map<string, CollectionSnapshot> } {
  const { version, directus, vendor, collections, fields, systemFields, relations } = snapshot

  const collectionsByName = new Map(collections.map((c) => [c['collection'] as string, c]))
  const names = new Set(collectionsByName.keys())
  for (const field of fields) {
    const name = field['collection'] as string | undefined
    if (name) names.add(name)
  }

  const result = new Map<string, CollectionSnapshot>()

  for (const name of names) {
    if (!shouldInclude(name, config)) continue
    const collection = collectionsByName.get(name)
    const entry: CollectionSnapshot = {
      fields: fields.filter((f) => f['collection'] === name),
      relations: relations.filter((r) => r['collection'] === name),
    }
    if (collection) entry.collection = collection
    result.set(name, entry)
  }

  const meta: SnapshotMeta = { version, directus, vendor }
  if (systemFields !== undefined) meta.systemFields = systemFields

  return { meta, collections: result }
}
