export interface SchemaConfig {
  outputDir: string
  ignoreCollections: string[]
  ignoreSystemCollections: boolean
  includeSystemCollections: string[]
  prettyPrint: boolean
}

export interface CollectionSnapshot {
  collection?: Record<string, unknown>
  fields: Record<string, unknown>[]
  relations: Record<string, unknown>[]
}

export interface SnapshotMeta {
  version: number
  directus: string
  vendor: string
  systemFields?: Record<string, unknown>[]
}

export interface DirectusSnapshot {
  version: number
  directus: string
  vendor: string
  collections: Record<string, unknown>[]
  fields: Record<string, unknown>[]
  systemFields?: Record<string, unknown>[]
  relations: Record<string, unknown>[]
}
