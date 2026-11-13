// Boneco esquemático dos exercícios: um esqueleto 2D definido por ângulos, com duas posições (início e fim).
// Ângulos em graus: 0 aponta para baixo, 90 para a frente (direita), 180 para cima, -90 para trás.

export interface Pose {
  /** ponto fixo do corpo nesta posição */
  hip?: [number, number]
  foot?: [number, number]
  knee?: [number, number]
  torso: number
  head?: number
  armU: number
  armL: number
  arm2U?: number
  arm2L?: number
  legU: number
  legL: number
  leg2U?: number
  leg2L?: number
  /** direção do pé (90 = ponta para a frente) */
  toe?: number
}

export type Joint = 'hand' | 'hand2' | 'shoulder' | 'hip' | 'knee' | 'foot'

export type Prop =
  | { t: 'rect'; x: number; y: number; w: number; h: number }
  | { t: 'line'; x1: number; y1: number; x2: number; y2: number }
  | { t: 'load'; kind: 'bar' | 'db'; at: Joint; dx?: number; dy?: number }
  | { t: 'cable'; x: number; y: number; at: Joint }

export interface FigureDef {
  view?: 'side' | 'front'
  a: Pose
  /** sem `b` o exercício é isométrico (figura parada) */
  b?: Pose
  /** partes do corpo que mais trabalham, destacadas no desenho */
  hot?: ('torso' | 'armU' | 'armL' | 'legU' | 'legL')[]
  props?: Prop[]
}

export type Seg = 'torso' | 'armU' | 'armL' | 'legU' | 'legL' | 'foot'

export const VIEW = { w: 140, h: 120, floor: 110 }
const L = { torso: 30, neck: 3, head: 7, armU: 15, armL: 14, legU: 22, legL: 22, foot: 6 }
/** espessura de cada parte do corpo, nas unidades do desenho */
export const WIDTH: Record<Seg, number> = { torso: 12, legU: 9, legL: 7, foot: 4.5, armU: 6.5, armL: 5.5 }

type P = [number, number]
const vec = (deg: number, len: number): P => {
  const r = (deg * Math.PI) / 180
  return [Math.sin(r) * len, Math.cos(r) * len]
}
const add = (p: P, v: P): P => [p[0] + v[0], p[1] + v[1]]
const sub = (p: P, v: P): P => [p[0] - v[0], p[1] - v[1]]

export interface Bone {
  seg: Seg
  from: P
  to: P
  /** membro de trás (mais escuro) */
  back?: boolean
}
export interface Skeleton {
  /** partes do corpo em ordem de desenho, de trás para a frente */
  bones: Bone[]
  /** na vista de frente o tronco é um trapézio (ombros mais largos que o quadril) */
  torsoPoly?: P[]
  head: P
  joints: Record<Joint, P>
}

function side(p: Pose): Skeleton {
  let hip: P
  if (p.foot) hip = sub(sub(p.foot, vec(p.legL, L.legL)), vec(p.legU, L.legU))
  else if (p.knee) hip = sub(p.knee, vec(p.legU, L.legU))
  else hip = p.hip ?? [70, 64]
  const shoulder = add(hip, vec(p.torso, L.torso))
  const head = add(shoulder, vec(p.head ?? p.torso, L.neck + L.head))
  const elbow = add(shoulder, vec(p.armU, L.armU))
  const hand = add(elbow, vec(p.armL, L.armL))
  const knee = add(hip, vec(p.legU, L.legU))
  const foot = add(knee, vec(p.legL, L.legL))
  const toe = add(foot, vec(p.toe ?? 90, L.foot))
  const bones: Bone[] = []
  let hand2 = hand
  if (p.leg2U !== undefined) {
    const k2 = add(hip, vec(p.leg2U, L.legU))
    const f2 = add(k2, vec(p.leg2L ?? p.leg2U, L.legL))
    bones.push({ seg: 'legU', from: hip, to: k2, back: true }, { seg: 'legL', from: k2, to: f2, back: true })
  }
  if (p.arm2U !== undefined) {
    const e2 = add(shoulder, vec(p.arm2U, L.armU))
    hand2 = add(e2, vec(p.arm2L ?? p.arm2U, L.armL))
    bones.push({ seg: 'armU', from: shoulder, to: e2, back: true }, { seg: 'armL', from: e2, to: hand2, back: true })
  }
  bones.push(
    { seg: 'foot', from: foot, to: toe }, { seg: 'legL', from: knee, to: foot }, { seg: 'legU', from: hip, to: knee },
    { seg: 'torso', from: hip, to: shoulder },
    { seg: 'armU', from: shoulder, to: elbow }, { seg: 'armL', from: elbow, to: hand },
  )
  return { bones, head, joints: { hand, hand2, shoulder, hip, knee, foot } }
}

/** Vista de frente: corpo simétrico, os dois lados espelhados em torno do centro. */
function front(p: Pose): Skeleton {
  const cx = VIEW.w / 2
  const footY = p.foot?.[1] ?? VIEW.floor - 3
  const legDy = vec(p.legU, L.legU)[1] + vec(p.legL, L.legL)[1]
  const hipY = p.hip?.[1] ?? footY - legDy
  const shY = hipY - L.torso
  const bones: Bone[] = []
  const joints = {} as Record<Joint, P>
  for (const s of [1, -1]) {
    const m = (v: P): P => [v[0] * s, v[1]]
    const sh: P = [cx + 11 * s, shY + 2]
    const el = add(sh, m(vec(p.armU, L.armU)))
    const ha = add(el, m(vec(p.armL, L.armL)))
    const hp: P = [cx + 5 * s, hipY]
    const kn = add(hp, m(vec(p.legU, L.legU)))
    const ft = add(kn, m(vec(p.legL, L.legL)))
    bones.push(
      { seg: 'foot', from: ft, to: [ft[0] + 5 * s, ft[1]] }, { seg: 'legL', from: kn, to: ft }, { seg: 'legU', from: hp, to: kn },
      { seg: 'armU', from: sh, to: el }, { seg: 'armL', from: el, to: ha },
    )
    if (s === 1) Object.assign(joints, { hand: ha, shoulder: sh, hip: hp, knee: kn, foot: ft })
    else joints.hand2 = ha
  }
  return {
    bones,
    torsoPoly: [[cx - 10, shY + 1], [cx + 10, shY + 1], [cx + 6, hipY + 2], [cx - 6, hipY + 2]],
    head: [cx, shY - L.neck - L.head],
    joints,
  }
}

export function skeleton(def: FigureDef, pose: Pose): Skeleton {
  return def.view === 'front' ? front(pose) : side(pose)
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const lerpP = (a?: [number, number], b?: [number, number], t = 0): [number, number] | undefined =>
  a && b ? [lerp(a[0], b[0], t), lerp(a[1], b[1], t)] : a

/** Posição intermediária entre início (t=0) e fim (t=1). */
export function mix(a: Pose, b: Pose, t: number): Pose {
  const n = (k: keyof Pose) => (a[k] === undefined || b[k] === undefined ? (a[k] as number | undefined) : lerp(a[k] as number, b[k] as number, t))
  return {
    hip: lerpP(a.hip, b.hip, t), foot: lerpP(a.foot, b.foot, t), knee: lerpP(a.knee, b.knee, t),
    torso: lerp(a.torso, b.torso, t), head: n('head'),
    armU: lerp(a.armU, b.armU, t), armL: lerp(a.armL, b.armL, t), arm2U: n('arm2U'), arm2L: n('arm2L'),
    legU: lerp(a.legU, b.legU, t), legL: lerp(a.legL, b.legL, t), leg2U: n('leg2U'), leg2L: n('leg2L'),
    toe: n('toe'),
  }
}
