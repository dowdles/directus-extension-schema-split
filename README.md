# directus-extension-schema-split

Export and import Directus schema snapshots split by collection — one JSON file per collection instead of a single monolithic snapshot. Makes schema changes reviewable in version control.

Requires Directus `>=11.0.0`.

## Why

Directus schema snapshots are a single JSON blob covering all collections, fields, and relations. A single field change touches hundreds of lines. This extension splits that blob into one file per collection so each diff is scoped to the changed collection.

## Installation

```sh
pnpm add directus-extension-schema-split
```

Restart Directus after installation.

## File format

After export, `SCHEMA_SYNC_OUTPUT_DIR` contains:

```
snapshots/split/
  _meta.json        # { version, directus, vendor }
  zbr_pages.json    # { collection, fields[], relations[] }
  zbr_products.json
  ...
```

Each collection file holds the collection definition, all its fields, and all relations where that collection is on the many-side.

## Endpoints

Both endpoints run inside Directus and require an admin token.

### Export

```
GET /schema-sync/export
Authorization: Bearer <token>
```

Reads the current schema, splits it by collection, and writes JSON files to the configured output directory. Orphaned `.json` files (corresponding to collections no longer in the schema) are automatically deleted; `_meta.json` and non-JSON files are never removed.

**Response:**
```json
{ "exported": 12, "outputDir": "/directus/snapshots/split", "removed": 0 }
```

### Import

```
POST /schema-sync/import
Authorization: Bearer <token>
```

Reads the JSON files from the configured output directory, merges them into a snapshot, and applies it to Directus.

**Response:**
```json
{ "applied": true, "collections": 12 }
// or
{ "applied": false, "message": "No changes detected" }
```

## Configuration

Configure via environment variables in your Directus container:

| Variable | Default | Description |
|---|---|---|
| `SCHEMA_SYNC_OUTPUT_DIR` | `./snapshots/split` | Output directory for split snapshot files |
| `SCHEMA_SYNC_IGNORE_SYSTEM` | `true` | Ignore system collections (`directus_*`) |
| `SCHEMA_SYNC_INCLUDE_SYSTEM` | `""` | Comma-separated system collections to include despite `IGNORE_SYSTEM` |
| `SCHEMA_SYNC_IGNORE_COLLECTIONS` | `""` | Comma-separated collection names to exclude |
| `SCHEMA_SYNC_PRETTY_PRINT` | `true` | Pretty-print JSON output |

## CLI

The package ships a `schema-sync` CLI with two modes:

**Direct mode** — runs on the same server as Directus, no token required. Uses `npx directus schema snapshot` / `npx directus schema apply` under the hood.

**HTTP mode** — calls the extension endpoints over HTTP, requires an admin token. Use this from CI/CD or any machine with network access to Directus.

The mode is selected automatically: if no token is provided, direct mode is used.

```
schema-sync export|import [options]

Options:
  --url <url>              Directus URL (HTTP mode only)
                           Env: DIRECTUS_URL (default: http://localhost:8055)
  --token <token>          Admin access token (required for HTTP mode)
                           Env: DIRECTUS_ACCESS_TOKEN
  --output <dir>           Output directory
                           Env: SCHEMA_SYNC_OUTPUT_DIR
  --no-ignore-system       Include system collections
  --include-system <list>  Comma-separated system collections to include
  --ignore <list>          Comma-separated collections to ignore
  --no-pretty              Compact JSON output
  --env-file <path>        Load environment variables from file
```

**Direct mode** (on the Directus server, no token needed):

```sh
schema-sync export
schema-sync import
```

**HTTP mode** (from CI/CD or remote machine):

```sh
schema-sync export --url https://directus.example.com --token <admin-token>
schema-sync import --url https://directus.example.com --token <admin-token>
```

With a `.env` file:

```sh
schema-sync export --env-file .env
schema-sync import --env-file .env
```

## Contributing

### Setup

```sh
pnpm install
pnpm test    # run all tests
pnpm build   # build both targets (extension + CLI)
```

Run a single test file:

```sh
pnpm vitest run tests/export.test.ts
```

### Pull requests

External contributors: fork the repo and open a PR against `main`.  
Both `pnpm test` and `pnpm build` must pass.

### Release process

1. Bump the version in `package.json` and commit: `chore: bump version to x.y.z`
2. Tag and push: `git tag vx.y.z && git push origin vx.y.z`

The publish workflow triggers on the tag, syncs `package.json` to the tag version, and publishes to npm automatically.

## License

MIT
