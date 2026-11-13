// Temporada: prova-alvo, fases da periodização, plano de corrida do treinador e encaixe da musculação na semana.
import { addDays, weekStart } from '../game'
import type { WorkoutId } from './plan'

export type RunKind = 'leve' | 'tiro' | 'ritmo' | 'longo' | 'prova' | 'descanso'

export const RUN_KINDS: Record<RunKind, { name: string; hard: boolean }> = {
  leve: { name: 'Rodagem leve', hard: false },
  tiro: { name: 'Tiros / intervalado', hard: true },
  ritmo: { name: 'Ritmo / tempo run', hard: true },
  longo: { name: 'Longão', hard: true },
  prova: { name: 'Prova', hard: true },
  descanso: { name: 'Descanso', hard: false },
}

export interface PlannedRun {
  date: string
  kind: RunKind
  title: string
  km?: number
}

export interface Race {
  name: string
  date: string
  km: number
}

const daysBetween = (a: string, b: string) => Math.round((Date.parse(b + 'T12:00:00') - Date.parse(a + 'T12:00:00')) / 86400000)

/** Limpa o que veio de fora (leitura dos prints) antes de virar plano. */
export function sanitizeRuns(raw: unknown): PlannedRun[] {
  if (!Array.isArray(raw)) return []
  const out = new Map<string, PlannedRun>()
  for (const r of raw as Record<string, unknown>[]) {
    if (!r || typeof r !== 'object') continue
    const date = String(r.date ?? '')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(Date.parse(date))) continue
    const kind = (Object.keys(RUN_KINDS) as RunKind[]).includes(r.kind as RunKind) ? (r.kind as RunKind) : 'leve'
    if (kind === 'descanso') continue
    const km = Number(r.km)
    out.set(date, { date, kind, title: String(r.title ?? '').replace(/\s+/g, ' ').trim().slice(0, 90), ...(km > 0 && km < 200 ? { km: Math.round(km * 10) / 10 } : {}) })
  }
  return [...out.values()].sort((a, b) => (a.date < b.date ? -1 : 1))
}

// ---------- fases ----------

export interface Phase {
  id: 'livre' | 'base' | 'especifica' | 'polimento' | 'prova' | 'recuperacao' | 'deload'
  name: string
  desc: string
  /** fração das séries de pernas e de superior em relação ao plano cheio */
  legs: number
  upper: number
  /** nesta fase a carga não sobe */
  hold: boolean
}

const PHASES: Record<Phase['id'], Omit<Phase, 'id'>> = {
  livre: { name: 'Construção', desc: 'Sem prova marcada: volume completo, subindo carga sempre que fechar as séries.', legs: 1, upper: 1, hold: false },
  base: { name: 'Construção de força', desc: 'Longe da prova: é a hora de ganhar força. Volume completo e progressão de carga.', legs: 1, upper: 1, hold: false },
  especifica: { name: 'Específica', desc: 'A corrida está no pico de volume. Pernas com menos séries e as mesmas cargas; superior normal.', legs: 0.75, upper: 1, hold: false },
  polimento: { name: 'Polimento', desc: 'Duas a três semanas para a prova: mantenha as cargas e corte séries de pernas para chegar descansado.', legs: 0.6, upper: 1, hold: true },
  prova: { name: 'Semana da prova', desc: 'Um treino curto e leve no começo da semana, sem chegar perto da falha. Nada de pernas pesadas nos 3 dias antes.', legs: 0.5, upper: 0.6, hold: true },
  recuperacao: { name: 'Recuperação', desc: 'Semana depois da prova: treino leve, só para soltar. As cargas voltam na semana que vem.', legs: 0.5, upper: 0.75, hold: true },
  deload: { name: 'Semana leve', desc: 'A cada quatro semanas o volume cai para o corpo assimilar o treino. Mesmas cargas, menos séries.', legs: 0.65, upper: 0.65, hold: true },
}

const phase = (id: Phase['id']): Phase => ({ id, ...PHASES[id] })

export function phaseFor(today: string, race: Race | null, startDate: string): Phase {
  const to = race ? daysBetween(today, race.date) : null
  if (to !== null) {
    if (to < 0 && to >= -7) return phase('recuperacao')
    if (to >= 0 && to <= 6) return phase('prova')
    if (to >= 7 && to <= 20) return phase('polimento')
  }
  const week = Math.floor(daysBetween(weekStart(startDate), weekStart(today)) / 7)
  if (week > 0 && week % 4 === 3) return phase('deload')
  if (to !== null && to > 20) return phase(to <= 62 ? 'especifica' : 'base')
  return phase('livre')
}

export function weeksTo(today: string, race: Race): number {
  return Math.ceil(daysBetween(today, race.date) / 7)
}

/** Trechos da preparação até a prova, para a linha do tempo. `share` soma 1. */
export function timeline(today: string, race: Race): { id: Phase['id']; name: string; share: number; current: boolean }[] {
  const total = daysBetween(today, race.date)
  if (total < 0) return []
  const cur = phaseFor(today, race, today).id
  const parts: [Phase['id'], number][] = [
    ['base', Math.max(0, total - 62)],
    ['especifica', Math.max(0, Math.min(total, 62) - 20)],
    ['polimento', Math.max(0, Math.min(total, 20) - 6)],
    ['prova', Math.min(total, 6) + 1],
  ]
  const sum = parts.reduce((s, p) => s + p[1], 0)
  return parts.filter((p) => p[1] > 0).map(([id, d]) => ({ id, name: PHASES[id].name, share: d / sum, current: id === cur }))
}

// ---------- semana ----------

export interface DayPlan {
  date: string
  run?: PlannedRun
  strength?: WorkoutId
  /** orientação para o dia de musculação */
  note?: string
}

const hard = (r?: PlannedRun) => !!r && RUN_KINDS[r.kind].hard

/**
 * Encaixa a musculação na semana de corrida.
 * Pernas pesadas (A e B): nunca na véspera de treino forte, nem no dia do longão, nem nos 3 dias antes da prova;
 * de preferência no mesmo dia do treino de qualidade (dias fortes juntos, dias leves de verdade) ou em dia leve.
 * O treino C (pernas leve) só evita o dia do longão e a véspera da prova.
 */
export function weekSchedule(monday: string, runs: PlannedRun[], days: 0 | 2 | 3, race: Race | null): DayPlan[] {
  const byDate = new Map(runs.map((r) => [r.date, r]))
  const dates = Array.from({ length: 7 }, (_, i) => addDays(monday, i))
  const out: DayPlan[] = dates.map((date) => ({ date, run: byDate.get(date) }))
  if (days === 0) return out

  const toRace = (i: number) => (race ? daysBetween(dates[i], race.date) : null)
  const raceWeek = dates.some((_, i) => toRace(i) === 0)
  const afterRace = (i: number) => {
    const t = toRace(i)
    return t !== null && t < 0 && t >= -2
  }
  // aceita dias fora da semana (domingo anterior, segunda seguinte)
  const kind = (i: number) => byDate.get(addDays(monday, i))?.kind
  const longDay = (i: number) => kind(i) === 'longo' || kind(i) === 'prova'
  const nearRace = (i: number, n: number) => {
    const t = toRace(i)
    return t !== null && t >= 0 && t <= n
  }
  const heavyOk = (i: number) => !hard(byDate.get(addDays(monday, i + 1))) && !longDay(i) && !nearRace(i, 3) && !afterRace(i)
  const lightOk = (i: number) => !longDay(i) && !nearRace(i, 1) && !afterRace(i)
  const hasPlan = out.some((d) => d.run)
  const defaults: Record<string, number> = days === 3 ? { A: 0, B: 2, C: 5 } : { A: 0, B: 4 }
  const score = (w: WorkoutId, i: number) => {
    if (!hasPlan) return i === defaults[w] ? 5 : 0
    const k = kind(i)
    const base = w === 'C' ? (k === 'tiro' || k === 'ritmo' ? 1 : 2) : k === 'tiro' || k === 'ritmo' ? 3 : 2
    return base - (kind(i - 1) === 'longo' && w !== 'C' ? 1 : 0)
  }

  let want: WorkoutId[] = raceWeek ? ['A'] : days === 3 ? ['A', 'B', 'C'] : ['A', 'B']
  let best: number[] | null = null
  while (want.length > 0 && !best) {
    let bestScore = -Infinity
    const pick = (chosen: number[]) => {
      if (chosen.length === want.length) {
        const heavy = chosen.filter((_, n) => want[n] !== 'C')
        const gap = heavy.length === 2 ? Math.min(heavy[1] - heavy[0], 3) * 0.1 : 0
        const s = chosen.reduce((t, i, n) => t + score(want[n], i), 0) + gap - chosen.reduce((t, i) => t + i * 0.001, 0)
        if (s > bestScore) {
          bestScore = s
          best = [...chosen]
        }
        return
      }
      const w = want[chosen.length]
      for (let i = 0; i < 7; i++) {
        if (chosen.includes(i)) continue
        if (w === 'C' ? !lightOk(i) : !heavyOk(i)) continue
        // A antes de B, com pelo menos um dia entre os dois treinos pesados de pernas
        if (w === 'B' && i - chosen[0] < 2) continue
        pick([...chosen, i])
      }
    }
    pick([])
    if (!best) want = want.slice(0, -1)
  }
  ;(best ?? []).forEach((i: number, n: number) => {
    out[i].strength = want[n]
    const k = out[i].run?.kind
    out[i].note = k === 'tiro' || k === 'ritmo' ? 'Corra primeiro; musculação pelo menos 3 horas depois.' : k === 'leve' ? 'Dia de rodagem leve: a musculação pode vir antes ou depois.' : undefined
  })
  return out
}

/** Por que hoje não é dia de musculação (quando não há treino encaixado). */
export function restReason(week: DayPlan[], runs: PlannedRun[], today: string, race: Race | null): string {
  const tomorrow = runs.find((r) => r.date === addDays(today, 1))
  const run = week.find((d) => d.date === today)?.run
  const to = race ? daysBetween(today, race.date) : null
  if (to === 0) return 'hoje é dia de prova.'
  if (to !== null && to > 0 && to <= 3) return `faltam ${to} dia(s) para a prova: pernas descansadas.`
  if (to !== null && to < 0 && to >= -2) return 'você acabou de correr a prova: recupere.'
  if (run?.kind === 'longo') return 'hoje é dia de longão.'
  if (tomorrow && hard(tomorrow)) return `amanhã tem ${RUN_KINDS[tomorrow.kind].name.toLowerCase()}: chegue com as pernas descansadas.`
  return 'os treinos da semana ficaram melhor encaixados em outros dias.'
}

/** Semana com volume de corrida bem acima do normal do plano pede menos séries de pernas. */
export function peakWeek(monday: string, runs: PlannedRun[]): boolean {
  const weeks = new Map<string, number>()
  for (const r of runs) if (r.km) weeks.set(weekStart(r.date), (weeks.get(weekStart(r.date)) ?? 0) + r.km)
  const mine = weeks.get(monday)
  if (!mine || weeks.size < 3) return false
  const sorted = [...weeks.values()].sort((a, b) => a - b)
  const median = sorted[Math.floor(sorted.length / 2)]
  return mine >= median * 1.2
}
