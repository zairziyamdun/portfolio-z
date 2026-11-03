// Raw Meshy/Blender exports in assets-src/models → optimized GLB in public/models.
// Usage: npm run models
import { execFileSync } from 'node:child_process'
import { mkdirSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const SRC = 'assets-src/models'
const OUT = 'public/models'
mkdirSync(OUT, { recursive: true })

for (const file of readdirSync(SRC).filter((f) => f.endsWith('.glb'))) {
  const input = join(SRC, file)
  const output = join(OUT, file)
  // simplify + weld + meshopt compression + webp textures capped at 1K
  execFileSync(
    'npx',
    ['gltf-transform', 'optimize', input, output, '--compress', 'meshopt', '--texture-compress', 'webp', '--texture-size', '1024', '--simplify-ratio', '0.5'],
    { stdio: 'inherit', shell: true },
  )
}
