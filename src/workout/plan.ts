// Treinos A/B/C, montagem da sessão pelo tempo disponível, progressão de carga e histórico.
import { EXERCISES } from './exercises'

export type WorkoutId = 'A' | 'B' | 'C'

export interface PlanItem {
  ex: string
  sets: number
  /** faixa de repetições (ou segundos) por série */
  reps: [number, number]
  /** descanso entre séries, em segundos */
  rest: number
  /**
   * Ordem de corte quando falta tempo, seguindo a prioridade do plano:
   * 1 = desempenho na corrida (nunca sai), 2 = base de estética e composição corporal,
   * 3 = reforço que protege o corredor, 4 = isolados de estética (os primeiros a sair).
   */
  prio: 1 | 2 | 3 | 4
  /** séries de aquecimento antes das séries válidas */
  warmup?: number
}

export interface Workout {
  id: WorkoutId
  focus: string
  items: PlanItem[]
}

const I = (ex: string, sets: number, lo: number, hi: number, rest: number, prio: PlanItem['prio'], warmup?: number): PlanItem => ({ ex, sets, reps: [lo, hi], rest, prio, warmup })

export const WORKOUTS: Record<WorkoutId, Workout> = {
  A: {
    id: 'A',
    focus: 'Pernas pesado + peito e costas',
    items: [
      I('pogo', 3, 10, 10, 60, 1),
      I('agachamento', 4, 4, 5, 150, 1, 2),
      I('bulgaro', 3, 6, 8, 90, 1),
      I('supino', 4, 8, 10, 90, 2, 1),
      I('remada-curvada', 4, 8, 10, 90, 2),
      I('panturrilha-pe', 3, 6, 8, 60, 3),
      I('copenhagen', 2, 20, 30, 45, 3),
      I('elevacao-lateral', 3, 12, 15, 60, 4),
    ],
  },
  B: {
    id: 'B',
    focus: 'Posterior pesado + ombros e dorsais',
    items: [
      I('salto-caixa', 3, 5, 5, 75, 1),
      I('terra-romeno', 4, 5, 6, 150, 1, 2),
      I('elevacao-pelvica', 3, 6, 8, 120, 1, 1),
      I('desenvolvimento', 4, 8, 10, 90, 2, 1),
      I('puxada', 4, 8, 10, 90, 2),
      I('panturrilha-sentado', 3, 8, 10, 60, 3),
      I('pallof', 3, 10, 10, 45, 3),
      I('rosca-direta', 3, 10, 12, 60, 4),
      I('triceps-polia', 3, 10, 12, 60, 4),
    ],
  },
  C: {
    id: 'C',
    focus: 'Superior com volume + pernas leve',
    items: [
      I('step-up', 3, 8, 8, 75, 1),
      I('supino-inclinado', 4, 8, 10, 90, 2, 1),
      I('puxada-neutra', 4, 8, 10, 90, 2),
      I('remada-unilateral', 3, 10, 10, 60, 2),
      I('nordica', 2, 5, 5, 90, 3),
      I('prancha', 3, 40, 40, 45, 3),
      I('elevacao-lateral', 4, 12, 15, 60, 4),
      I('rosca-martelo', 3, 10, 12, 60, 4),
      I('triceps-testa', 3, 10, 12, 60, 4),
    ],
  },
}

/** exercícios de pernas: são os que a periodização e a semana de corrida reduzem */
export const LEGS = new Set(['pogo', 'agachamento', 'leg-press', 'bulgaro', 'panturrilha-pe', 'salto-caixa', 'terra-romeno', 'elevacao-pelvica', 'panturrilha-sentado', 'step-up', 'nordica', 'copenhagen'])

export const workoutIds = (days: 0 | 2 | 3): WorkoutId[] => (days === 3 ? ['A', 'B', 'C'] : days === 2 ? ['A', 'B'] : [])

// ---------- registro ----------

export interface SetLog {
  kg: number
  reps: number
}
export interface SessionEntry {
  ex: string
  /** séries planejadas para hoje */
  target: number
  reps: [number, number]
  rest: number
  sets: SetLog[]
}
export interface Session {
  id: string
  date: string
  workout: WorkoutId
  minutes: number
  startedAt: number
  finishedAt?: number
  /** quanto as pernas trabalharam neste treino (sem valor = pesado) */
  legs?: 'pesado' | 'moderado' | 'leve'
  entries: SessionEntry[]
}

/**
 * Qual treino fazer hoje, para quem treina quando dá.
 * Dia de pernas leves: o treino C (leve de pernas, pesado no superior), quando faz parte da rotina.
 * Nos outros dias alterna A e B; em dia de pernas pesadas a vez é de quem está há mais tempo
 * sem ser feito com as pernas inteiras, para nenhum dos dois ficar sempre com a versão reduzida.
 */
export function nextWorkout(sessions: Session[], days: 0 | 2 | 3, level: 'pesado' | 'moderado' | 'leve' = 'pesado'): WorkoutId {
  const ids = workoutIds(days || 2)
  if (level === 'leve' && ids.includes('C')) return 'C'
  const done = [...sessions].filter((s) => s.finishedAt).sort((a, b) => a.startedAt - b.startedAt)
  const last = (w: WorkoutId, full: boolean) => {
    const hit = done.filter((s) => s.workout === w && (!full || (s.legs ?? 'pesado') === 'pesado')).pop()
    return hit ? hit.startedAt : -1
  }
  const key = (w: WorkoutId): [number, number] => (level === 'pesado' ? [last(w, true), last(w, false)] : [last(w, false), 0])
  const [a, b] = [key('A'), key('B')]
  return b[0] < a[0] || (b[0] === a[0] && b[1] < a[1]) ? 'B' : 'A'
}

// ---------- tempo ----------

const WARMUP_GENERAL = 5 * 60
const TRANSITION = 45

/** Tempo estimado de um exercício, em segundos. */
export function itemSeconds(it: PlanItem, sets = it.sets): number {
  if (sets <= 0) return 0
  const def = EXERCISES[it.ex]
  const work = (def.unit === 's' ? it.reps[1] : 35) * (def.perSide ? 2 : 1)
  return TRANSITION + (it.warmup ?? 0) * 60 + sets * work + (sets - 1) * it.rest
}

export const planMinutes = (items: { item: PlanItem; sets: number }[]) =>
  Math.round((WARMUP_GENERAL + items.reduce((s, x) => s + itemSeconds(x.item, x.sets), 0)) / 60)

export interface Built {
  items: { item: PlanItem; sets: number }[]
  minutes: number
  /** exercícios do plano que ficaram de fora hoje */
  dropped: string[]
  /** séries cortadas dos que ficaram */
  trimmed: boolean
}

/**
 * Ajusta o treino ao tempo disponível. Corta de trás para a frente na prioridade:
 * primeiro tira séries e depois exercícios de estética isolados, depois os de reforço,
 * depois reduz a base de estética. O bloco de corrida só perde uma série em último caso.
 */
export function buildSession(workout: Workout, minutes: number, scale: { legs: number; upper: number } = { legs: 1, upper: 1 }): Built {
  // a fase da periodização reduz as séries antes de o tempo entrar na conta
  const rows = workout.items.map((item) => {
    const f = LEGS.has(item.ex) ? scale.legs : scale.upper
    return { item, sets: f >= 1 ? item.sets : Math.max(item.prio === 1 ? 2 : 1, Math.round(item.sets * f)) }
  })
  const reduced = scale.legs < 1 || scale.upper < 1
  const total = () => planMinutes(rows.filter((r) => r.sets > 0))
  const byPrio = (p: number) => rows.filter((r) => r.item.prio === p && r.sets > 0).reverse()
  let trimmed = false

  const trim = (p: number, floor: number) => {
    let changed = true
    while (total() > minutes && changed) {
      changed = false
      for (const r of byPrio(p)) {
        if (total() <= minutes) break
        if (r.sets > floor) {
          r.sets--
          trimmed = true
          changed = true
        }
      }
    }
  }
  const drop = (p: number) => {
    for (const r of byPrio(p)) {
      if (total() <= minutes) break
      r.sets = 0
    }
  }

  trim(4, 2)
  drop(4)
  trim(3, 2)
  trim(2, 3)
  drop(3)
  trim(2, 2)
  trim(1, 3)
  // último recurso: fica a base de estética mais curta, nunca o bloco de corrida
  const p2 = byPrio(2)
  for (const r of p2.slice(0, Math.max(0, p2.length - 1))) {
    if (total() <= minutes) break
    r.sets = 0
  }
  trim(1, 2)

  // sobrou tempo: uma série a mais na base de estética, até 5 (não em fase de volume reduzido)
  for (const r of reduced ? [] : rows.filter((x) => x.item.prio === 2 && x.sets > 0)) {
    if (r.sets >= 5) continue
    r.sets++
    if (total() > minutes) r.sets--
  }

  const kept = rows.filter((r) => r.sets > 0)
  return { items: kept, minutes: planMinutes(kept), dropped: rows.filter((r) => r.sets === 0).map((r) => r.item.ex), trimmed }
}

// ---------- progressão ----------

export const fmtKg = (kg: number) => `${String(Math.round(kg * 10) / 10).replace('.', ',')} kg`

export function repsLabel(ex: string, sets: number, reps: [number, number]): string {
  const def = EXERCISES[ex]
  const range = reps[0] === reps[1] ? `${reps[0]}` : `${reps[0]}–${reps[1]}`
  return `${sets} × ${range}${def.unit === 's' ? ' s' : ''}${def.perSide ? ' cada lado' : ''}`
}

/** Última vez que o exercício foi feito em uma sessão concluída. */
export function lastEntry(sessions: Session[], ex: string): { date: string; entry: SessionEntry } | null {
  const done = [...sessions].filter((s) => s.finishedAt).sort((a, b) => b.startedAt - a.startedAt)
  for (const s of done) {
    const entry = s.entries.find((e) => e.ex === ex && e.sets.length > 0)
    if (entry) return { date: s.date, entry }
  }
  return null
}

export interface Suggestion {
  kg: number | null
  reps: number
  text: string
}

/**
 * Progressão dupla: quando todas as séries chegam ao topo da faixa, sobe a carga;
 * senão, mantém a carga e busca uma repetição a mais.
 */
export function suggest(sessions: Session[], ex: string, reps: [number, number], target: number, hold = false): Suggestion {
  const def = EXERCISES[ex]
  const last = lastEntry(sessions, ex)
  if (!last) {
    return {
      kg: null,
      reps: reps[1],
      text: def.load === 'kg' ? 'Primeira vez: escolha uma carga que deixe 1 a 2 repetições sobrando na última série.' : 'Primeira vez: foque na execução.',
    }
  }
  const sets = last.entry.sets
  const top = Math.max(...sets.map((s) => s.kg))
  const allTop = sets.length >= Math.min(target, last.entry.target) && sets.every((s) => s.reps >= reps[1])
  const worst = Math.min(...sets.map((s) => s.reps))
  const unit = def.unit === 's' ? 's' : 'reps'
  if (def.load === 'corpo') {
    return allTop
      ? { kg: 0, reps: reps[1], text: `Bateu o topo da faixa da última vez. Deixe mais difícil: mais lento ou com uma pausa.` }
      : { kg: 0, reps: Math.min(reps[1], worst + (def.unit === 's' ? 5 : 1)), text: `Última vez: mínimo de ${worst} ${unit}. Tente um pouco mais.` }
  }
  if (hold) return { kg: top, reps: reps[0], text: `Fase de volume reduzido: mantenha ${fmtKg(top)}, sem chegar perto da falha.` }
  if (allTop) return { kg: top + def.step, reps: reps[0], text: `Subiu de carga: todas as séries no topo com ${fmtKg(top)}.` }
  return { kg: top, reps: Math.min(reps[1], worst + 1), text: `Mesma carga da última vez (${fmtKg(top)}); busque 1 repetição a mais.` }
}

/** 1RM estimado (Epley), só para comparar a evolução entre sessões. */
export const est1RM = (s: SetLog) => (s.reps <= 1 ? s.kg : s.kg * (1 + s.reps / 30))

export interface HistoryPoint {
  date: string
  topKg: number
  bestReps: number
  est: number
  sets: SetLog[]
}

export function history(sessions: Session[], ex: string): HistoryPoint[] {
  return [...sessions]
    .filter((s) => s.finishedAt)
    .sort((a, b) => a.startedAt - b.startedAt)
    .flatMap((s) => {
      const e = s.entries.find((x) => x.ex === ex && x.sets.length > 0)
      if (!e) return []
      const topKg = Math.max(...e.sets.map((x) => x.kg))
      return [{ date: s.date, topKg, bestReps: Math.max(...e.sets.filter((x) => x.kg === topKg).map((x) => x.reps)), est: Math.max(...e.sets.map(est1RM)), sets: e.sets }]
    })
}

/** Recordes batidos nesta sessão (maior 1RM estimado, ou mais repetições no peso do corpo). */
export function records(previous: Session[], session: Session): string[] {
  const out: string[] = []
  for (const e of session.entries) {
    if (e.sets.length === 0) continue
    const before = history(previous, e.ex)
    if (before.length === 0) continue
    const def = EXERCISES[e.ex]
    const now = def.load === 'kg' ? Math.max(...e.sets.map(est1RM)) : Math.max(...e.sets.map((s) => s.reps))
    const best = def.load === 'kg' ? Math.max(...before.map((h) => h.est)) : Math.max(...before.flatMap((h) => h.sets.map((s) => s.reps)))
    if (now > best + 0.01) out.push(e.ex)
  }
  return out
}

export const sessionVolume = (s: Session) => s.entries.reduce((t, e) => t + e.sets.reduce((x, y) => x + y.kg * y.reps, 0), 0)
