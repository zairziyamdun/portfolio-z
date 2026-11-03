import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { TerrainData } from './terrain/generate'

// Terrain + instanced trees and rocks: three draw calls for the whole mountain.

const tint = (geometry: THREE.BufferGeometry, hex: number) => {
  const c = new THREE.Color(hex)
  const count = geometry.getAttribute('position').count
  const colors = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) colors.set([c.r, c.g, c.b], i * 3)
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  return geometry
}

function treeGeometry() {
  const trunk = tint(new THREE.CylinderGeometry(0.12, 0.18, 1, 5).translate(0, 0.5, 0), 0x2b2420)
  const low = tint(new THREE.ConeGeometry(0.85, 1.7, 6).translate(0, 1.6, 0), 0x16261f)
  const high = tint(new THREE.ConeGeometry(0.6, 1.3, 6).translate(0, 2.4, 0), 0x1b2d24)
  const merged = mergeGeometries([trunk, low, high])!
  for (const g of [trunk, low, high]) g.dispose()
  return merged
}

function rockGeometry() {
  return tint(new THREE.IcosahedronGeometry(1, 0).scale(1, 0.6, 1.2), 0x4a4752)
}

function instanced(geometry: THREE.BufferGeometry, material: THREE.Material, data: Float32Array, sink: number, seedShift: number) {
  const count = data.length / 5
  const mesh = new THREE.InstancedMesh(geometry, material, count)
  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const s = new THREE.Vector3()
  const p = new THREE.Vector3()
  const up = new THREE.Vector3(0, 1, 0)
  const color = new THREE.Color()
  for (let i = 0; i < count; i++) {
    const [x, y, z, scale, rot] = data.subarray(i * 5, i * 5 + 5)
    q.setFromAxisAngle(up, rot)
    s.setScalar(scale)
    p.set(x, y - sink * scale, z)
    mesh.setMatrixAt(i, m.compose(p, q, s))
    // slight per-instance shade so the forest doesn't look stamped
    const v = 0.85 + (((i * 2654435761 + seedShift) >>> 0) % 1000) / 1000 * 0.3
    mesh.setColorAt(i, color.setScalar(v))
  }
  mesh.instanceMatrix.needsUpdate = true
  mesh.computeBoundingSphere()
  return mesh
}

export class Mountain {
  readonly group = new THREE.Group()
  private disposables: Array<{ dispose(): void }> = []

  constructor(data: TerrainData) {
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(data.positions, 3))
    geometry.setAttribute('normal', new THREE.BufferAttribute(data.normals, 3))
    geometry.setAttribute('color', new THREE.BufferAttribute(data.colors, 3))
    geometry.setIndex(new THREE.BufferAttribute(data.index, 1))
    geometry.computeBoundingSphere()
    const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })
    this.group.add(new THREE.Mesh(geometry, material))

    const propMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })
    const trees = treeGeometry()
    const rocks = rockGeometry()
    if (data.trees.length) this.group.add(instanced(trees, propMaterial, data.trees, 0.15, 7))
    if (data.rocks.length) this.group.add(instanced(rocks, propMaterial, data.rocks, 0.3, 13))

    this.disposables.push(geometry, material, propMaterial, trees, rocks)
  }

  dispose() {
    for (const d of this.disposables) d.dispose()
  }
}
