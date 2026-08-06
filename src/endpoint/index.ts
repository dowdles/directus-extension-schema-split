import { defineEndpoint } from '@directus/extensions-sdk'
import { mkdir, readdir, readFile, unlink, writeFile } from 'fs/promises'
import { join, resolve } from 'path'
import { loadConfig } from './config.js'
import { splitSnapshot, findOrphanedFiles } from './export.js'
import { mergeSnapshots } from './import.js'
import type { CollectionSnapshot, SnapshotMeta } from './types.js'

export default defineEndpoint({
  id: 'schema-sync',
  handler: (router, { services, database, getSchema, logger }) => {
    const { SchemaService } = services

    router.get('/export', async (req: any, res: any) => {
      if (!req.accountability?.admin) {
        return res.status(403).json({ error: 'Admin access required' })
      }
      try {
        const schema = await getSchema()
        const service = new SchemaService({ knex: database, schema, accountability: req.accountability })
        const snapshot = await service.snapshot()

        const config = loadConfig()
        const { meta, collections } = splitSnapshot(snapshot, config)

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
        if (orphaned.length > 0) {
          logger.info(`Removed ${orphaned.length} orphaned file(s): ${orphaned.join(', ')}`)
        }

        res.json({ exported: collections.size, outputDir, removed: orphaned.length })
      } catch (error) {
        logger.error(error)
        res.status(500).json({ error: String(error) })
      }
    })

    router.post('/import', async (req: any, res: any) => {
      if (!req.accountability?.admin) {
        return res.status(403).json({ error: 'Admin access required' })
      }
      try {
        const config = loadConfig()
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

        const schema = await getSchema()
        const service = new SchemaService({ knex: database, schema, accountability: req.accountability })
        const currentSnapshot = await service.snapshot()
        const snapshotDiff = await service.diff(snapshot, { currentSnapshot })

        if (snapshotDiff) {
          const { hash } = service.getHashedSnapshot(currentSnapshot)
          await service.apply({ hash, diff: snapshotDiff })
          res.json({ applied: true, collections: collections.length })
        } else {
          res.json({ applied: false, message: 'No changes detected' })
        }
      } catch (error) {
        logger.error(error)
        res.status(500).json({ error: String(error) })
      }
    })
  },
})
