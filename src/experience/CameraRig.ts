import * as THREE from 'three'
import { EARTH_CENTER, EARTH_RADIUS, SPACE_START, spaceAltitude } from './Space'

// Scene progress → camera: a spiral climb up to 0.6, a rise into the cloud deck, then (past the
// veil at SPACE_START) a climb above the planet from the stratosphere to the orbit.

export const MOUNTAIN_END = 0.6
const CLOUD_RISE = 380
// on landscape screens the orbit view rolls, so the planet's limb sweeps up the free right side
const ORBIT_ROLL = 0.32
const ahead = new THREE.Vector3()
const sky = new THREE.Vector3()
const dir = new THREE.Vector3()
const side = new THREE.Vector3()
const UP = new THREE.Vector3(0, 1, 0)
const KARMAN_ROLL_FROM = 0.78

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
  private wasInSpace = false

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
    if (s >= SPACE_START) return this.spacePoseAt(s, pos, target)
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

    // straight up into the clouds, half tilting toward the deck overhead
    const rise = THREE.MathUtils.smoothstep(s, MOUNTAIN_END, SPACE_START)
    if (rise > 0) {
      pos.y += rise * CLOUD_RISE
      sky.copy(pos).add(ahead.set(0, 1000, -300))
      target.lerp(sky, rise * 0.55)
    }
  }

  // Above the planet's top point looking along -z: the horizon sits just above the frame centre,
  // so the planet fills the lower part and dips further as the camera climbs.
  private spacePoseAt(s: number, pos: THREE.Vector3, target: THREE.Vector3) {
    const t = THREE.MathUtils.clamp((s - SPACE_START) / (1 - SPACE_START), 0, 1)
    const h = spaceAltitude(s)
    pos.set(EARTH_CENTER.x, EARTH_CENTER.y + EARTH_RADIUS + h, EARTH_CENTER.z)
    const dip = Math.acos(EARTH_RADIUS / (EARTH_RADIUS + h))
    const pitch = -dip + THREE.MathUtils.lerp(0.05, 0.12, t)
    target.set(pos.x, pos.y + Math.sin(pitch) * 100, pos.z - Math.cos(pitch) * 100)
  }

  /** camera up vector for a scene progress: level on the mountain, rolled in orbit */
  upAt(s: number, out: THREE.Vector3) {
    const roll = s >= SPACE_START && this.camera.aspect > 1 ? ORBIT_ROLL * THREE.MathUtils.smoothstep(s, KARMAN_ROLL_FROM, 1) : 0
    return out.set(Math.sin(roll), Math.cos(roll), 0)
  }

  update(s: number) {
    this.poseAt(s, this.targetPos, this.targetLook)

    // Big jumps (veil travel) and the swap behind the clouds snap; scroll-sized moves glide.
    // In space the limit is higher: the meter leaps from 100 to 400 km, and that climb should glide.
    const inSpace = s >= SPACE_START
    const swapped = inSpace !== this.wasInSpace
    const far = !this.placed || swapped || this.base.distanceTo(this.targetPos) > (inSpace ? 800 : 300)
    const k = far ? 1 : 0.12
    this.base.lerp(this.targetPos, k)
    this.currentLook.lerp(this.targetLook, k)
    this.placed = true
    this.wasInSpace = inSpace

    // subtle pointer parallax, applied on top of the damped base so it never accumulates
    this.pointerSmooth.lerp(this.pointer, 0.05)
    this.right.set(1, 0, 0).applyQuaternion(this.camera.quaternion)
    this.camera.position.copy(this.base).addScaledVector(this.right, this.pointerSmooth.x * 6)
    this.camera.position.y -= this.pointerSmooth.y * 4
    this.upAt(s, this.camera.up)
    this.camera.lookAt(this.currentLook)
  }

  dispose() {
    removeEventListener('pointermove', this.onPointer)
  }
}
