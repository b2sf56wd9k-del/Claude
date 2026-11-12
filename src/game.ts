// Regras do jogo — funções puras, sem estado. Tudo é derivado do livro de XP (ledger).

export type Attr = 'forca' | 'resistencia' | 'disciplina' | 'financas' | 'mente'

export const ATTRS: { id: Attr; name: string; short: string }[] = [
  { id: 'forca', name: 'Força', short: 'FOR' },
  { id: 'resistencia', name: 'Resistência', short: 'RES' },
  { id: 'disciplina', name: 'Disciplina', short: 'DIS' },
  { id: 'financas', name: 'Finanças', short: 'FIN' },
  { id: 'mente', name: 'Mente', short: 'MEN' },
]

export interface Quest {
  id: string
  title: string
  attr: Attr
  /** XP total ao completar a meta do período */
  xp: number
  freq: 'daily' | 'weekly'
  /** quantas vezes no período (diária = 1) */
  target: number
  active: boolean
}

export interface XpEvent {
  /** chave única: permite desfazer e evita prêmio duplicado */
  key: string
  date: string // YYYY-MM-DD
  attr: Attr
  xp: number
  label: string
}

export const DAILY_BONUS_XP = 30

// ---------- datas ----------

export function toISO(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  return toISO(new Date(y, m - 1, d + n))
}

/** Segunda-feira da semana da data */
export function weekStart(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dow = (new Date(y, m - 1, d).getDay() + 6) % 7
  return addDays(iso, -dow)
}

export function periodKey(q: Pick<Quest, 'freq'>, date: string): string {
  return q.freq === 'daily' ? date : weekStart(date)
}

// ---------- níveis ----------

/** XP necessário para sair do nível n e chegar ao n+1 */
export function xpToNext(level: number, base = 100): number {
  return Math.round(base * Math.pow(level, 1.4))
}

export function levelInfo(totalXp: number, base = 100) {
  let level = 1
  let rest = Math.max(0, totalXp)
  while (rest >= xpToNext(level, base)) {
    rest -= xpToNext(level, base)
    level++
  }
  return { level, into: rest, need: xpToNext(level, base) }
}

export const RANKS = [
  { rank: 'E', min: 1 },
  { rank: 'D', min: 10 },
  { rank: 'C', min: 20 },
  { rank: 'B', min: 35 },
  { rank: 'A', min: 50 },
  { rank: 'S', min: 70 },
]

export function rankFor(level: number): string {
  let r = 'E'
  for (const x of RANKS) if (level >= x.min) r = x.rank
  return r
}

export function nextRank(level: number) {
  return RANKS.find((x) => x.min > level) ?? null
}

export function totalXp(events: XpEvent[]): number {
  return events.reduce((s, e) => s + e.xp, 0)
}

export function xpByAttr(events: XpEvent[]): Record<Attr, number> {
  const out: Record<Attr, number> = { forca: 0, resistencia: 0, disciplina: 0, financas: 0, mente: 0 }
  for (const e of events) out[e.attr] += e.xp
  return out
}

// ---------- missões ----------

const stepPrefix = (q: Quest, date: string) => `quest:${q.id}:${periodKey(q, date)}:`

export function questCount(events: XpEvent[], q: Quest, date: string): number {
  const p = stepPrefix(q, date)
  return events.filter((e) => e.key.startsWith(p)).length
}

/** XP de cada passo: divide o total pela meta; o último passo leva o resto */
function stepXp(q: Quest, step: number): number {
  const share = Math.floor(q.xp / q.target)
  return step === q.target ? q.xp - share * (q.target - 1) : share
}

const bonusKey = (date: string) => `bonus:${date}`
const penaltyKey = (date: string) => `penalty:${date}`

function allDailiesDone(events: XpEvent[], quests: Quest[], date: string): boolean {
  const dailies = quests.filter((q) => q.active && q.freq === 'daily')
  return dailies.length > 0 && dailies.every((q) => questCount(events, q, date) >= q.target)
}

/** Mantém o bônus diário coerente com o estado das missões do dia */
function syncBonus(events: XpEvent[], quests: Quest[], date: string): XpEvent[] {
  const has = events.some((e) => e.key === bonusKey(date))
  const done = allDailiesDone(events, quests, date)
  if (done && !has) {
    return [
      ...events,
      { key: bonusKey(date), date, attr: 'disciplina', xp: DAILY_BONUS_XP, label: 'Bônus: todas as diárias concluídas' },
    ]
  }
  if (!done && has) return events.filter((e) => e.key !== bonusKey(date))
  return events
}

/** Avança um passo da missão (até a meta). */
export function advanceQuest(events: XpEvent[], quests: Quest[], q: Quest, date: string): XpEvent[] {
  const count = questCount(events, q, date)
  if (count >= q.target) return events
  const step = count + 1
  const next = [
    ...events,
    { key: stepPrefix(q, date) + step, date, attr: q.attr, xp: stepXp(q, step), label: q.title },
  ]
  return syncBonus(next, quests, date)
}

/** Desfaz o último passo da missão no período. */
export function undoQuest(events: XpEvent[], quests: Quest[], q: Quest, date: string): XpEvent[] {
  const count = questCount(events, q, date)
  if (count === 0) return events
  const key = stepPrefix(q, date) + count
  return syncBonus(
    events.filter((e) => e.key !== key),
    quests,
    date,
  )
}

// ---------- sequência e penalidade ----------

/** Um dia "vale" se as diárias foram concluídas ou se a penalidade foi cumprida no dia seguinte. */
function dayOk(keys: Set<string>, date: string): boolean {
  return keys.has(bonusKey(date)) || keys.has(penaltyKey(addDays(date, 1)))
}

export function streak(events: XpEvent[], today: string): number {
  const keys = new Set(events.map((e) => e.key))
  let d = dayOk(keys, today) ? today : addDays(today, -1)
  let n = 0
  while (dayOk(keys, d)) {
    n++
    d = addDays(d, -1)
  }
  return n
}

export type PenaltyState = 'none' | 'pending' | 'done'

/** Falhou as diárias ontem? Hoje aparece uma missão de penalidade que salva a sequência. */
export function penaltyState(events: XpEvent[], quests: Quest[], startDate: string, today: string): PenaltyState {
  const yesterday = addDays(today, -1)
  if (startDate > yesterday) return 'none'
  if (!quests.some((q) => q.active && q.freq === 'daily')) return 'none'
  const keys = new Set(events.map((e) => e.key))
  if (keys.has(penaltyKey(today))) return 'done'
  return keys.has(bonusKey(yesterday)) ? 'none' : 'pending'
}

export function completePenalty(events: XpEvent[], today: string): XpEvent[] {
  if (events.some((e) => e.key === penaltyKey(today))) return events
  return [...events, { key: penaltyKey(today), date: today, attr: 'disciplina', xp: 0, label: 'Penalidade cumprida' }]
}

/** Adiciona um prêmio único (ignora se a chave já existe). */
export function awardOnce(events: XpEvent[], ev: XpEvent): XpEvent[] {
  return events.some((e) => e.key === ev.key) ? events : [...events, ev]
}

export const DEFAULT_QUESTS: Quest[] = [
  { id: 'corrida', title: 'Treino de corrida da assessoria', attr: 'resistencia', xp: 180, freq: 'weekly', target: 3, active: true },
  { id: 'forca', title: 'Treino de força', attr: 'forca', xp: 140, freq: 'weekly', target: 2, active: true },
  { id: 'financas', title: 'Revisar gastos da semana', attr: 'financas', xp: 60, freq: 'weekly', target: 1, active: true },
  { id: 'sono', title: 'Dormir 7h ou mais', attr: 'disciplina', xp: 20, freq: 'daily', target: 1, active: true },
  { id: 'agua', title: 'Beber 2 L de água', attr: 'disciplina', xp: 10, freq: 'daily', target: 1, active: true },
  { id: 'leitura', title: 'Ler por 20 minutos', attr: 'mente', xp: 20, freq: 'daily', target: 1, active: true },
]
