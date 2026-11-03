import { generateTerrain, type TerrainOptions } from './generate'

// Heavy heightfield maths off the main thread; buffers are transferred, not copied.
self.onmessage = (e: MessageEvent<TerrainOptions>) => {
  const data = generateTerrain(e.data)
  const transfer = [data.positions, data.normals, data.colors, data.index, data.trees, data.rocks, data.path].map((a) => a.buffer)
  ;(self as unknown as Worker).postMessage(data, transfer)
}
