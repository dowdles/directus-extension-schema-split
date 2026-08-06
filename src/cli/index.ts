import { spawn } from 'child_process'
import { existsSync, readFileSync } from 'fs'
import { mkdir, readdir, readFile, unlink, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { splitSnapshot, findOrphanedFiles } from '../endpoint/export.js'
import { mergeSnapshots } from '../endpoint/import.js'
import type { CollectionSnapshot, DirectusSnapshot, SchemaConfig, SnapshotMeta } from '../endpoint/types.js'
import { getFlag, parseCliConfig } from './args.js'
import type { CliConfig } from './args.js'

function loadEnvFile(path: string): void {
  if (!existsSync(path)) return
  const content = readFileSync(path, 'utf-8')
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '')
    if (!process.env[key]) process.env[key] = value
  }
}

function spawnCommand(cmd: string, cmdArgs: string[]): Promise<void> {
  return new Promise((res, rej) => {
    const child = spawn(cmd, cmdArgs, { stdio: 'inherit' })
    child.on('close', (code) => {
      if (code === 0) res()
      else rej(new Error(`"${cmd} ${cmdArgs.join(' ')}" exited with code ${code}`))
    })
    child.on('error', rej)
  })
}

function toSchemaConfig(config: CliConfig): SchemaConfig {
  return {
    outputDir: config.outputDir,
    ignoreCollections: config.ignoreCollections,
    ignoreSystemCollections: config.ignoreSystemCollections,
    includeSystemCollections: config.includeSystemCollections,
    prettyPrint: config.prettyPrint,
  }
}

async function directExport(config: CliConfig): Promise<void> {
  const tmpFile = join(tmpdir(), `schema-sync-${process.pid}.json`)
  try {
    await spawnCommand('npx', ['directus', 'schema', 'snapshot', '--format', 'json', tmpFile])
    const raw = await readFile(tmpFile, 'utf-8')
    const snapshot: DirectusSnapshot = JSON.parse(raw)
    const { meta, collections } = splitSnapshot(snapshot, toSchemaConfig(config))
    const outputDir = resolve(process.cwd(), config.outputDir)
    await mkdir(outputDir, { recursive: true })
    const indent = config.prettyPrint ? 2 : undefined
    await writeFile(join(outputDir, '_meta.json'), JSON.stringify(meta, null, indent))
    for (const [name, data] of collections) {
      await writeFile(join(outputDir, `${name}.json`), JSON.stringify(data, null, indent))
    }
    const existing = await readdir(outputDir).catch(() => [])
    const orphaned = findOrphanedFiles(existing, collections.keys())
    for (const file of orphaned) {
      await unlink(join(outputDir, file))
    }
    console.log(`Exported ${collections.size} collections to ${outputDir}`)
    if (orphaned.length > 0) {
      console.log(`Removed ${orphaned.length} orphaned file(s): ${orphaned.join(', ')}`)
    }
  } finally {
    await unlink(tmpFile).catch(() => {})
  }
}

async function directImport(config: CliConfig): Promise<void> {
  const outputDir = resolve(process.cwd(), config.outputDir)
  const files = await readdir(outputDir).catch(() => {
    throw new Error(`Output directory not found or empty: ${outputDir}`)
  })
  const jsonFiles = files.filter((f) => f.endsWith('.json'))
  if (!jsonFiles.includes('_meta.json')) {
    throw new Error(`_meta.json not found in ${outputDir}`)
  }
  const metaRaw = await readFile(join(outputDir, '_meta.json'), 'utf-8')
  const meta: SnapshotMeta = JSON.parse(metaRaw)
  const collectionFiles = jsonFiles.filter((f) => f !== '_meta.json')
  const collections: CollectionSnapshot[] = await Promise.all(
    collectionFiles.map(async (f) => {
      const raw = await readFile(join(outputDir, f), 'utf-8')
      return JSON.parse(raw)
    }),
  )
  const snapshot = mergeSnapshots(meta, collections)
  const tmpFile = join(tmpdir(), `schema-sync-${process.pid}.json`)
  try {
    await writeFile(tmpFile, JSON.stringify(snapshot, null, 2))
    await spawnCommand('npx', ['directus', 'schema', 'apply', tmpFile, '--yes'])
    console.log(`Schema applied: ${collectionFiles.length} collections`)
  } finally {
    await unlink(tmpFile).catch(() => {})
  }
}

const argv = process.argv.slice(2)
const command = argv[0]
const args = argv.slice(1)

const envFile = getFlag(args, '--env-file')
if (envFile) loadEnvFile(envFile)

const config = parseCliConfig(args)

if (command === 'export') {
  if (!config.token) {
    try {
      await directExport(config)
    } catch (error) {
      console.error('Export failed:', String(error))
      process.exit(1)
    }
  } else {
    const res = await fetch(`${config.url}/schema-sync/export`, {
      headers: { Authorization: `Bearer ${config.token}` },
    })
    const data = await res.json() as { exported?: number; outputDir?: string; removed?: number; error?: string }
    if (!res.ok) {
      console.error('Export failed:', data.error ?? res.statusText)
      process.exit(1)
    }
    console.log(`Exported ${data.exported} collections to ${data.outputDir}`)
    if (data.removed) {
      console.log(`Removed ${data.removed} orphaned file(s)`)
    }
  }
} else if (command === 'import') {
  if (!config.token) {
    try {
      await directImport(config)
    } catch (error) {
      console.error('Import failed:', String(error))
      process.exit(1)
    }
  } else {
    const res = await fetch(`${config.url}/schema-sync/import`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.token}` },
    })
    const data = await res.json() as {
      applied?: boolean
      collections?: number
      message?: string
      error?: string
    }
    if (!res.ok) {
      console.error('Import failed:', data.error ?? res.statusText)
      process.exit(1)
    }
    if (data.applied) {
      console.log(`Schema imported: ${data.collections} collections applied`)
    } else {
      console.log('No changes detected, schema is up to date')
    }
  }
} else {
  console.error(`Unknown command: ${command ?? '(none)'}`)
  console.error('Usage: schema-sync export|import [options]')
  process.exit(1)
}
