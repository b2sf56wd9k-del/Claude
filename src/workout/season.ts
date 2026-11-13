// Temporada: prova-alvo, fases da periodização, plano de corrida do treinador e o que cabe na musculação de cada dia.
import { addDays, weekStart } from '../game'

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
  /** tempo-alvo, em segundos */
  targetSec?: number
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
  id: 'livre' | 'base' | 'especifica' | 'polimento' | 'prova' | 'recuperacao' | 'deload' | 'retorno'
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
  polimento: { name: 'Polimento', desc: 'Reta final para a prova: mantenha as cargas e corte séries de pernas para chegar descansado.', legs: 0.6, upper: 1, hold: true },
  prova: { name: 'Semana da prova', desc: 'Um treino curto e leve no começo da semana, sem chegar perto da falha. Nada de pernas pesadas nos 3 dias antes.', legs: 0.5, upper: 0.6, hold: true },
  recuperacao: { name: 'Recuperação', desc: 'Semana depois da prova: treino leve, só para soltar. As cargas voltam na semana que vem.', legs: 0.5, upper: 0.75, hold: true },
  retorno: { name: 'Readaptação', desc: 'Pouco ou nenhum treino de força nas últimas três semanas: os dois primeiros treinos são mais curtos e com carga confortável, para não ficar dolorido e atrapalhar a corrida.', legs: 0.6, upper: 0.75, hold: true },
  deload: { name: 'Semana leve', desc: 'A cada quatro semanas o volume cai para o corpo assimilar o treino. Mesmas cargas, menos séries.', legs: 0.65, upper: 0.65, hold: true },
}

const phase = (id: Phase['id']): Phase => ({ id, ...PHASES[id] })

/** Até quantos dias antes da prova vai o polimento: provas curtas pedem redução curta. */
export const taperStart = (km: number) => (km <= 12 ? 10 : km <= 25 ? 20 : 27)

/**
 * `recentStrength` é o número de dias com treino de força nas últimas três semanas;
 * abaixo de 2, o treino entra em readaptação (quando informado).
 */
export function phaseFor(today: string, race: Race | null, startDate: string, recentStrength?: number): Phase {
  const to = race ? daysBetween(today, race.date) : null
  const taper = race ? taperStart(race.km) : 0
  if (to !== null) {
    if (to < 0 && to >= -7) return phase('recuperacao')
    if (to >= 0 && to <= 6) return phase('prova')
    if (to >= 7 && to <= taper) return phase('polimento')
  }
  if (recentStrength !== undefined && recentStrength < 2) return phase('retorno')
  const week = Math.floor(daysBetween(weekStart(startDate), weekStart(today)) / 7)
  if (week > 0 && week % 4 === 3) return phase('deload')
  if (to !== null && to > taper) return phase(to <= 62 ? 'especifica' : 'base')
  return phase('livre')
}

export function weeksTo(today: string, race: Race): number {
  return Math.ceil(daysBetween(today, race.date) / 7)
}

/** Trechos da preparação até a prova, para a linha do tempo. `share` soma 1. */
export function timeline(today: string, race: Race): { id: Phase['id']; name: string; share: number; current: boolean }[] {
  const total = daysBetween(today, race.date)
  if (total < 0) return []
  const taper = taperStart(race.km)
  const to = total
  const cur: Phase['id'] = to <= 6 ? 'prova' : to <= taper ? 'polimento' : to <= 62 ? 'especifica' : 'base'
  const parts: [Phase['id'], number][] = [
    ['base', Math.max(0, total - 62)],
    ['especifica', Math.max(0, Math.min(total, 62) - taper)],
    ['polimento', Math.max(0, Math.min(total, taper) - 6)],
    ['prova', Math.min(total, 6) + 1],
  ]
  const sum = parts.reduce((s, p) => s + p[1], 0)
  return parts.filter((p) => p[1] > 0).map(([id, d]) => ({ id, name: PHASES[id].name, share: d / sum, current: id === cur }))
}

// ---------- semana ----------

const hard = (r?: PlannedRun) => !!r && RUN_KINDS[r.kind].hard

export type LegLevel = 'pesado' | 'moderado' | 'leve'
/** fração das séries de pernas em cada nível */
export const LEG_FACTOR: Record<LegLevel, number> = { pesado: 1, moderado: 0.75, leve: 0.5 }

export interface DayFit {
  /** quanto as pernas aguentam hoje */
  level: LegLevel
  reason?: string
}

/**
 * O que cabe na musculação de um dia qualquer, para quem treina quando dá.
 * Em vez de proibir o treino, o dia "ruim" vira treino com pernas mais leves:
 * - leve: véspera de tiros, dia de longão ou prova, perto da prova, ou logo depois de pernas pesadas;
 * - moderado: véspera de longão ou de treino de ritmo, que toleram melhor pernas um pouco cansadas do que os tiros.
 */
export function dayFit(date: string, runs: PlannedRun[], race: Race | null, heavyLegDates: string[] = []): DayFit {
  const run = runs.find((r) => r.date === date)
  const next = runs.find((r) => r.date === addDays(date, 1))
  const to = race ? daysBetween(date, race.date) : null
  const fit = (level: LegLevel, reason: string): DayFit => ({ level, reason })
  if (to === 0) return fit('leve', 'hoje é dia de prova')
  if (to !== null && to > 0 && to <= 3) return fit('leve', `faltam ${to} dia${to === 1 ? '' : 's'} para a prova`)
  if (to !== null && to < 0 && to >= -2) return fit('leve', 'você acabou de correr a prova')
  if (run?.kind === 'longo' || run?.kind === 'prova') return fit('leve', `hoje tem ${RUN_KINDS[run.kind].name.toLowerCase()}`)
  if (next?.kind === 'tiro' || next?.kind === 'prova') return fit('leve', `amanhã tem ${RUN_KINDS[next.kind].name.toLowerCase()}`)
  if (heavyLegDates.includes(addDays(date, -1))) return fit('leve', 'ontem você já treinou pernas pesado')
  if (hard(next)) return fit('moderado', `amanhã tem ${RUN_KINDS[next!.kind].name.toLowerCase()}`)
  return { level: 'pesado' }
}

export interface DayPlan extends DayFit {
  date: string
  run?: PlannedRun
}

/** Os sete dias da semana com a corrida prevista e o que cabe na musculação. */
export function weekFit(monday: string, runs: PlannedRun[], race: Race | null, heavyLegDates: string[] = []): DayPlan[] {
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(monday, i)
    return { date, run: runs.find((r) => r.date === date), ...dayFit(date, runs, race, heavyLegDates) }
  })
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
