// Lists the static assets the hosted preview must publish next to the page, as { path } entries relative to `public/`
// (published path = `assets/...`, which is exactly what the registry resolves under the preview's relative base).
import { readdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../public')
export function previewFiles() {
  const out = []
  const walk = (dir, rel) => { for (const n of readdirSync(dir)) { const p = join(dir, n), r = `${rel}/${n}`; if (statSync(p).isDirectory()) walk(p, r); else if (n !== '.gitkeep') out.push({ path: r.slice(1) }) } }
  walk(join(ROOT, 'assets'), '/assets')
  return out.sort((a, b) => a.path.localeCompare(b.path))
}
if (process.argv[1] && process.argv[1].endsWith('files.mjs')) console.log(JSON.stringify(previewFiles()))
