import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  DEFAULT_QUESTS,
  advanceQuest,
  awardOnce,
  completePenalty,
  toISO,
  undoQuest,
  weekStart,
  type Quest,
  type XpEvent,
} from './game'
import {
  DEFAULT_CATEGORIES,
  DEFAULT_RULES,
  categorize,
  merchantKey,
  monthLabel,
  monthOf,
  summarize,
  type Category,
  type Rule,
  type Tx,
} from './finance/categorize'
import type { ParsedTx, Source } from './finance/parse'
import { applyActivities, ensureFresh, exchangeCode, fetchActivities, type StravaState } from './strava'
import { DEFAULT_PROFILE, targets, type HealthProfile, type Measurement } from './health'

export const IMPORT_XP = 40
export const BUDGET_XP = 25
export const MEASURE_XP = 30

export interface Data {
  name: string
  startDate: string
  people: [string, string]
  quests: Quest[]
  events: XpEvent[]
  txs: Tx[]
  categories: Category[]
  /** regras aprendidas com as correções do usuário */
  rules: Rule[]
  health: HealthProfile
  /** false até o usuário salvar o perfil de saúde pela primeira vez */
  healthReady: boolean
  measurements: Measurement[]
  strava: StravaState | null
}

interface Actions {
  advance: (questId: string) => void
  undo: (questId: string) => void
  payPenalty: () => void
  saveQuest: (q: Quest) => void
  removeQuest: (id: string) => void
  importParsed: (parsed: ParsedTx[], source: Source, owner: number) => { added: number; skipped: number }
  saveHealth: (p: HealthProfile) => void
  addMeasurement: (m: Measurement) => void
  removeMeasurement: (date: string) => void
  setStrava: (st: StravaState | null) => void
  setTxCategory: (txId: string, categoryId: string) => void
  removeMonth: (month: string, source: Source, owner: number) => void
  setBudget: (categoryId: string, budget: number) => void
  addCategory: (name: string) => void
  closeMonth: (month: string) => number
  setProfile: (p: Partial<Pick<Data, 'name' | 'people'>>) => void
  replaceAll: (d: Data) => void
  reset: () => void
}

const today = () => toISO(new Date())

const initial = (): Data => ({
  name: 'Jogador',
  startDate: today(),
  people: ['Eu', 'Esposa'],
  quests: DEFAULT_QUESTS,
  events: [],
  txs: [],
  categories: DEFAULT_CATEGORIES,
  rules: [],
  health: DEFAULT_PROFILE,
  healthReady: false,
  measurements: [],
  strava: null,
})

export const latestMeasurement = (list: Measurement[]) =>
  list.length ? list.reduce((a, b) => (b.date > a.date ? b : a)) : null

/** Mantém as missões de corrida, força e proteína alinhadas ao perfil de saúde. */
function syncHealthQuests(quests: Quest[], health: HealthProfile, measurements: Measurement[]): Quest[] {
  const upsert = (list: Quest[], q: Quest) => (list.some((x) => x.id === q.id) ? list.map((x) => (x.id === q.id ? { ...x, ...q } : x)) : [...list, q])
  let out = quests
  if (health.runDays > 0) {
    out = upsert(out, { id: 'corrida', title: 'Treino de corrida da assessoria', attr: 'resistencia', xp: 60 * health.runDays, freq: 'weekly', target: health.runDays, active: true })
  }
  out =
    health.strengthDays > 0
      ? upsert(out, { id: 'forca', title: 'Treino de força', attr: 'forca', xp: 70 * health.strengthDays, freq: 'weekly', target: health.strengthDays, active: true })
      : out.map((q) => (q.id === 'forca' ? { ...q, active: false } : q))
  const m = latestMeasurement(measurements)
  if (m) {
    const t = targets(health, m, new Date().getFullYear())
    out = upsert(out, { id: 'proteina', title: `Bater a meta de proteína (${t.proteinG} g)`, attr: 'forca', xp: 20, freq: 'daily', target: 1, active: true })
  }
  return out
}

export const allRules = (d: Pick<Data, 'rules'>) => [...d.rules, ...DEFAULT_RULES]

export const useStore = create<Data & Actions>()(
  persist(
    (set, get) => ({
      ...initial(),

      advance: (id) =>
        set((s) => {
          const q = s.quests.find((x) => x.id === id)
          return q ? { events: advanceQuest(s.events, s.quests, q, today()) } : s
        }),

      undo: (id) =>
        set((s) => {
          const q = s.quests.find((x) => x.id === id)
          return q ? { events: undoQuest(s.events, s.quests, q, today()) } : s
        }),

      payPenalty: () => set((s) => ({ events: completePenalty(s.events, today()) })),

      saveQuest: (q) =>
        set((s) => ({
          quests: s.quests.some((x) => x.id === q.id) ? s.quests.map((x) => (x.id === q.id ? q : x)) : [...s.quests, q],
        })),

      removeQuest: (id) => set((s) => ({ quests: s.quests.filter((q) => q.id !== id) })),

      importParsed: (parsed, source, owner) => {
        const s = get()
        const have = new Set(s.txs.map((t) => t.id))
        const rules = allRules(s)
        const fresh: Tx[] = []
        for (const p of parsed) {
          const id = `${source}:${owner}:${p.ref}`
          if (have.has(id)) continue
          have.add(id)
          fresh.push({
            id,
            date: p.date,
            description: p.description,
            amount: p.amount,
            source,
            owner,
            categoryId: categorize(p.description, p.amount, source, rules),
          })
        }
        let events = s.events
        for (const month of new Set(fresh.map((t) => monthOf(t.date)))) {
          events = awardOnce(events, {
            key: `import:${month}:${source}:${owner}`,
            date: today(),
            attr: 'financas',
            xp: IMPORT_XP,
            label: `Extrato importado (${source === 'conta' ? 'conta' : 'cartão'}, ${monthLabel(month)})`,
          })
        }
        set({ txs: [...s.txs, ...fresh], events })
        return { added: fresh.length, skipped: parsed.length - fresh.length }
      },

      setTxCategory: (txId, categoryId) =>
        set((s) => {
          const tx = s.txs.find((t) => t.id === txId)
          if (!tx) return s
          const key = merchantKey(tx.description)
          // Descrição sem texto útil: corrige só este lançamento, sem criar regra.
          if (key.length < 3) return { txs: s.txs.map((t) => (t.id === txId ? { ...t, categoryId } : t)) }
          return {
            rules: [{ pattern: key, categoryId }, ...s.rules.filter((r) => r.pattern !== key)],
            txs: s.txs.map((t) => (merchantKey(t.description) === key ? { ...t, categoryId } : t)),
          }
        }),

      removeMonth: (month, source, owner) =>
        set((s) => ({
          txs: s.txs.filter((t) => !(monthOf(t.date) === month && t.source === source && t.owner === owner)),
        })),

      setBudget: (categoryId, budget) =>
        set((s) => ({
          categories: s.categories.map((c) => (c.id === categoryId ? { ...c, budget: budget > 0 ? budget : undefined } : c)),
        })),

      addCategory: (name) =>
        set((s) => {
          const clean = name.trim()
          if (!clean) return s
          return { categories: [...s.categories, { id: `c${Date.now()}`, name: clean, kind: 'expense' }] }
        }),

      closeMonth: (month) => {
        const s = get()
        const sum = summarize(s.txs, s.categories, month, null)
        let events = awardOnce(s.events, { key: `closed:${month}`, date: today(), attr: 'financas', xp: 0, label: `Mês fechado (${monthLabel(month)})` })
        let won = 0
        for (const c of s.categories) {
          if (c.kind !== 'expense' || !c.budget) continue
          if ((sum.byCategory[c.id] ?? 0) <= c.budget) {
            won++
            events = awardOnce(events, {
              key: `budget:${month}:${c.id}`,
              date: today(),
              attr: 'financas',
              xp: BUDGET_XP,
              label: `Orçamento cumprido: ${c.name} (${monthLabel(month)})`,
            })
          }
        }
        set({ events })
        return won
      },

      saveHealth: (health) =>
        set((s) => ({ health, healthReady: true, quests: syncHealthQuests(s.quests, health, s.measurements) })),

      addMeasurement: (m) =>
        set((s) => {
          const measurements = [...s.measurements.filter((x) => x.date !== m.date), m].sort((a, b) => (a.date < b.date ? -1 : 1))
          return {
            measurements,
            quests: s.healthReady ? syncHealthQuests(s.quests, s.health, measurements) : s.quests,
            events: awardOnce(s.events, {
              key: `measure:${weekStart(m.date)}`,
              date: today(),
              attr: 'disciplina',
              xp: MEASURE_XP,
              label: 'Avaliação corporal da semana',
            }),
          }
        }),

      removeMeasurement: (date) => set((s) => ({ measurements: s.measurements.filter((m) => m.date !== date) })),

      setStrava: (strava) => set({ strava }),

      setProfile: (p) => set(p),
      replaceAll: (d) => set(d),
      reset: () => set(initial()),
    }),
    { name: 'ascensao-v1' },
  ),
)

export function snapshot(): Data {
  const { name, startDate, people, quests, events, txs, categories, rules, health, healthReady, measurements, strava } = useStore.getState()
  return { name, startDate, people, quests, events, txs, categories, rules, health, healthReady, measurements, strava }
}

// ---------- Strava ----------

/** Conclui o login depois que o Strava devolve o código de autorização. */
export async function finishStravaLogin(code: string) {
  const st = useStore.getState().strava
  if (!st) throw new Error('Informe o Client ID e o Client Secret antes de conectar.')
  useStore.getState().setStrava(await exchangeCode(st, code))
}

/** Busca atividades novas e conclui as missões de corrida e força. Devolve quantas contaram. */
export async function syncStrava(): Promise<number> {
  const s = useStore.getState()
  if (!s.strava?.refreshToken) return 0
  const st = await ensureFresh(s.strava, Math.floor(Date.now() / 1000))
  // desde o início da semana em que o jogo começou, no máximo 30 dias atrás
  const floor = Math.max(Date.parse(weekStart(s.startDate) + 'T00:00:00'), Date.now() - 30 * 86400000)
  const acts = await fetchActivities(st.accessToken!, Math.floor(floor / 1000))
  const cur = useStore.getState()
  const r = applyActivities(cur.events, cur.quests, st.seen, acts)
  useStore.setState({ events: r.events, strava: { ...st, seen: r.seen, lastSync: new Date().toISOString() } })
  return r.added
}
