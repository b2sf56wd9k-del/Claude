import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  DEFAULT_QUESTS,
  advanceQuest,
  awardOnce,
  completePenalty,
  toISO,
  undoQuest,
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
import { parseStatement, type Source } from './finance/parse'

export const IMPORT_XP = 40
export const BUDGET_XP = 25

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
}

interface Actions {
  advance: (questId: string) => void
  undo: (questId: string) => void
  payPenalty: () => void
  saveQuest: (q: Quest) => void
  removeQuest: (id: string) => void
  importStatement: (fileName: string, text: string, source: Source, owner: number) => { added: number; skipped: number }
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
})

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

      importStatement: (fileName, text, source, owner) => {
        const s = get()
        const parsed = parseStatement(fileName, text, source)
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

      setProfile: (p) => set(p),
      replaceAll: (d) => set(d),
      reset: () => set(initial()),
    }),
    { name: 'ascensao-v1' },
  ),
)

export function snapshot(): Data {
  const { name, startDate, people, quests, events, txs, categories, rules } = useStore.getState()
  return { name, startDate, people, quests, events, txs, categories, rules }
}
