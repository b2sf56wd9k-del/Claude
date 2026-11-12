// Categorias, regras de classificação automática e agregações mês a mês.
import type { Source } from './parse'

export interface Category {
  id: string
  name: string
  /** expense entra no total de gastos; income é receita; ignore não conta (transferências, pagamento de fatura) */
  kind: 'expense' | 'income' | 'ignore'
  /** orçamento mensal (apenas para gastos) */
  budget?: number
}

export interface Rule {
  /** trecho procurado na descrição normalizada */
  pattern: string
  categoryId: string
}

export interface Tx {
  id: string
  date: string
  description: string
  amount: number
  source: Source
  /** índice da pessoa (0 ou 1) */
  owner: number
  categoryId: string
}

export const DEFAULT_CATEGORIES: Category[] = [
  { id: 'moradia', name: 'Moradia', kind: 'expense' },
  { id: 'mercado', name: 'Mercado', kind: 'expense' },
  { id: 'restaurantes', name: 'Restaurantes e delivery', kind: 'expense' },
  { id: 'transporte', name: 'Transporte', kind: 'expense' },
  { id: 'saude', name: 'Saúde', kind: 'expense' },
  { id: 'esporte', name: 'Esporte', kind: 'expense' },
  { id: 'assinaturas', name: 'Assinaturas', kind: 'expense' },
  { id: 'compras', name: 'Compras', kind: 'expense' },
  { id: 'lazer', name: 'Lazer e viagens', kind: 'expense' },
  { id: 'educacao', name: 'Educação', kind: 'expense' },
  { id: 'outros', name: 'Outros', kind: 'expense' },
  { id: 'receita', name: 'Receitas', kind: 'income' },
  { id: 'investimentos', name: 'Investimentos', kind: 'ignore' },
  { id: 'transferencias', name: 'Transferências e fatura', kind: 'ignore' },
]

const R = (categoryId: string, ...patterns: string[]): Rule[] => patterns.map((pattern) => ({ pattern, categoryId }))

export const DEFAULT_RULES: Rule[] = [
  ...R('transferencias', 'pagamento de fatura', 'pagamento fatura', 'pagamento recebido', 'pgto fatura', 'fatura cartao'),
  ...R('investimentos', 'aplicacao', 'resgate', 'tesouro direto', 'corretora', 'cdb', 'rdb'),
  ...R('restaurantes', 'ifood', 'rappi', 'restaurante', 'lanchonete', 'pizzaria', 'burger', 'padaria', 'cafeteria', 'bar '),
  ...R('mercado', 'supermercado', 'mercado', 'atacadao', 'assai', 'carrefour', 'pao de acucar', 'hortifruti', 'sacolao'),
  ...R('transporte', 'uber', '99app', '99 pop', 'posto', 'combustivel', 'estacionamento', 'sem parar', 'pedagio', 'metro'),
  ...R('saude', 'farmacia', 'drogaria', 'droga', 'hospital', 'clinica', 'laboratorio', 'unimed', 'dentista'),
  ...R('esporte', 'academia', 'smart fit', 'crossfit', 'assessoria', 'strava', 'treinus', 'decathlon', 'centauro'),
  ...R('assinaturas', 'netflix', 'spotify', 'amazon prime', 'disney', 'youtube', 'apple.com', 'icloud', 'hbo', 'globoplay'),
  ...R('moradia', 'aluguel', 'condominio', 'energia', 'enel', 'cpfl', 'sabesp', 'internet', 'vivo', 'claro', 'tim ', 'iptu'),
  ...R('compras', 'amazon', 'mercado livre', 'mercadolivre', 'magazine', 'shopee', 'renner', 'zara'),
  ...R('lazer', 'cinema', 'ingresso', 'airbnb', 'booking', 'hotel', 'latam', 'gol linhas', 'azul linhas'),
  ...R('educacao', 'curso', 'udemy', 'livraria', 'escola', 'faculdade'),
]

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Chave do estabelecimento: descrição sem parcelas, números e pontuação. */
export function merchantKey(description: string): string {
  return normalize(description)
    .replace(/parc(ela)?\.?\s*\d+\s*(\/|de)\s*\d+/g, ' ')
    .replace(/\d+\s*\/\s*\d+/g, ' ')
    .replace(/[\d*#]+/g, ' ')
    .replace(/[^a-z ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Vence o padrão mais longo (mais específico); em empate, a regra que vem antes na lista. */
export function categorize(description: string, amount: number, source: Source, rules: Rule[]): string {
  const d = `${normalize(description)} | ${merchantKey(description)} `
  let best: Rule | null = null
  for (const r of rules) {
    if (d.includes(r.pattern) && (!best || r.pattern.length > best.pattern.length)) best = r
  }
  if (best) return best.categoryId
  if (amount > 0) return source === 'cartao' ? 'transferencias' : 'receita'
  return 'outros'
}

export const monthOf = (date: string) => date.slice(0, 7)

export interface MonthSummary {
  spent: number
  income: number
  byCategory: Record<string, number>
}

/** Totais do mês. Gastos são positivos; estornos abatem a categoria. */
export function summarize(txs: Tx[], categories: Category[], month: string, owner: number | null): MonthSummary {
  const kind = new Map(categories.map((c) => [c.id, c.kind]))
  const out: MonthSummary = { spent: 0, income: 0, byCategory: {} }
  for (const t of txs) {
    if (monthOf(t.date) !== month) continue
    if (owner !== null && t.owner !== owner) continue
    const k = kind.get(t.categoryId) ?? 'expense'
    if (k === 'ignore') continue
    if (k === 'income') out.income += t.amount
    else {
      out.spent -= t.amount
      out.byCategory[t.categoryId] = (out.byCategory[t.categoryId] ?? 0) - t.amount
    }
  }
  return out
}

export function shiftMonth(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m - 1 + n, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
export function monthLabel(month: string, long = false): string {
  const [y, m] = month.split('-').map(Number)
  return long ? `${MONTHS[m - 1]} ${y}` : `${MONTHS[m - 1]}/${String(y).slice(2)}`
}

export const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
