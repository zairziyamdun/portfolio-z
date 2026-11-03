import * as THREE from 'three'

// Scene progress → camera: a spiral climb up to 0.6, then a vertical rise that tilts toward the sky.

export const MOUNTAIN_END = 0.6
const RISE = 900
const ahead = new THREE.Vector3()
const sky = new THREE.Vector3()
const dir = new THREE.Vector3()
const side = new THREE.Vector3()
const UP = new THREE.Vector3(0, 1, 0)

export class CameraRig {
  private curve: THREE.CatmullRomCurve3
  private summitView: THREE.Vector3
  private base = new THREE.Vector3()
  private targetPos = new THREE.Vector3()
  private targetLook = new THREE.Vector3()
  private currentLook = new THREE.Vector3()
  private pointer = new THREE.Vector2()
  private pointerSmooth = new THREE.Vector2()
  private right = new THREE.Vector3()
  private placed = false

  constructor(private camera: THREE.PerspectiveCamera, path: Float32Array, summit: [number, number, number]) {
    const points: THREE.Vector3[] = []
    for (let i = 0; i < path.length; i += 12) points.push(new THREE.Vector3(path[i], path[i + 1], path[i + 2]))
    const last = path.length - 3
    points.push(new THREE.Vector3(path[last], path[last + 1], path[last + 2]))
    this.curve = new THREE.CatmullRomCurve3(points, false, 'centripetal')
    this.summitView = new THREE.Vector3(summit[0], summit[1] + 15, summit[2])

    if (matchMedia('(pointer: fine)').matches) addEventListener('pointermove', this.onPointer, { passive: true })
  }

  private onPointer = (e: PointerEvent) => {
    this.pointer.set((e.clientX / innerWidth) * 2 - 1, (e.clientY / innerHeight) * 2 - 1)
  }

  /** undamped camera pose for a scene progress; also used to place camps in view */
  poseAt(s: number, pos: THREE.Vector3, target: THREE.Vector3) {
    const t = THREE.MathUtils.clamp(s / MOUNTAIN_END, 0, 1)
    // getPoint, not getPointAt: same parameter as the worker's path samples
    this.curve.getPoint(t, pos)
    this.curve.getPoint(Math.min(1, t + 0.04), ahead)
    // look ahead along the trail, pulled toward the peak so the mountain stays in frame;
    // at the top the target is just above the summit, keeping it at eye level
    target.copy(ahead).lerp(this.summitView, THREE.MathUtils.lerp(0.45, 0.95, t))

    // near the top on landscape screens, aim left of the peak so it sits right of the text
    const shift = THREE.MathUtils.smoothstep(t, 0.75, 1) * (this.camera.aspect > 1 ? 1 : 0)
    if (shift > 0) {
      dir.subVectors(target, pos)
      const dist = dir.length()
      side.crossVectors(dir.normalize(), UP).normalize()
      target.addScaledVector(side, -dist * 0.32 * shift)
    }

    const rise = THREE.MathUtils.smoothstep(s, MOUNTAIN_END, 1)
    if (rise > 0) {
      pos.y += rise * RISE
      sky.copy(pos).add(ahead.set(0, 1000, -300))
      target.lerp(sky, Math.pow(rise, 1.4))
    }
  }

  update(s: number) {
    this.poseAt(s, this.targetPos, this.targetLook)

    // Big jumps (veil travel) snap; scroll-sized moves glide.
    const far = !this.placed || this.base.distanceTo(this.targetPos) > 300
    const k = far ? 1 : 0.12
    this.base.lerp(this.targetPos, k)
    this.currentLook.lerp(this.targetLook, k)
    this.placed = true

    // subtle pointer parallax, applied on top of the damped base so it never accumulates
    this.pointerSmooth.lerp(this.pointer, 0.05)
    this.right.set(1, 0, 0).applyQuaternion(this.camera.quaternion)
    this.camera.position.copy(this.base).addScaledVector(this.right, this.pointerSmooth.x * 6)
    this.camera.position.y -= this.pointerSmooth.y * 4
    this.camera.lookAt(this.currentLook)
  }

  dispose() {
    removeEventListener('pointermove', this.onPointer)
  }
}
