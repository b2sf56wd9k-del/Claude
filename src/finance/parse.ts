// Leitura de extratos: OFX (conta e cartão) e CSV (formatos brasileiros comuns).

export type Source = 'conta' | 'cartao'

export interface ParsedTx {
  /** identificador estável dentro da origem, usado para não duplicar reimportações */
  ref: string
  date: string // YYYY-MM-DD
  description: string
  /** negativo = gasto, positivo = entrada */
  amount: number
}

/** Decodifica o arquivo: UTF-8 quando válido, senão Windows-1252 (comum em OFX de bancos). */
export function decodeBytes(buf: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf)
  } catch {
    return new TextDecoder('windows-1252').decode(buf)
  }
}

/** "1.234,56" | "1234.56" | "-R$ 12,30" | "(12,30)" -> número */
export function parseAmount(raw: string): number {
  let s = raw.replace(/[R$\s"]/g, '')
  let neg = false
  if (/^\(.*\)$/.test(s)) {
    neg = true
    s = s.slice(1, -1)
  }
  if (s.startsWith('-') || s.endsWith('-')) {
    neg = true
    s = s.replace(/-/g, '')
  }
  s = s.replace(/^\+/, '')
  const comma = s.lastIndexOf(',')
  const dot = s.lastIndexOf('.')
  if (comma > dot) s = s.replace(/\./g, '').replace(',', '.')
  else s = s.replace(/,/g, '')
  const n = Number(s)
  if (!isFinite(n) || s === '') return NaN
  return neg ? -n : n
}

/** dd/mm/aaaa, dd/mm/aa, dd-mm-aaaa, aaaa-mm-dd -> YYYY-MM-DD */
export function parseDate(raw: string): string | null {
  const s = raw.trim().replace(/"/g, '')
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/)
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3]
    return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  }
  return null
}

// ---------- OFX ----------

function ofxTag(block: string, tag: string): string {
  const m = block.match(new RegExp(`<${tag}>([^<\\r\\n]*)`, 'i'))
  return m ? m[1].trim() : ''
}

export function parseOFX(text: string): ParsedTx[] {
  const out: ParsedTx[] = []
  const seen = new Map<string, number>()
  const blocks = text.split(/<STMTTRN>/i).slice(1)
  for (const b of blocks) {
    const block = b.split(/<\/STMTTRN>/i)[0]
    const dt = ofxTag(block, 'DTPOSTED')
    const amount = parseAmount(ofxTag(block, 'TRNAMT'))
    if (dt.length < 8 || isNaN(amount)) continue
    const date = `${dt.slice(0, 4)}-${dt.slice(4, 6)}-${dt.slice(6, 8)}`
    const description = [ofxTag(block, 'NAME'), ofxTag(block, 'MEMO')].filter(Boolean).join(' - ') || '(sem descrição)'
    // Alguns bancos repetem ou omitem o FITID; o contador garante unicidade dentro do arquivo.
    const base = ofxTag(block, 'FITID') || `${date}|${amount}|${description}`
    const n = (seen.get(base) ?? 0) + 1
    seen.set(base, n)
    out.push({ ref: n === 1 ? base : `${base}#${n}`, date, description, amount })
  }
  return out
}

// ---------- CSV ----------

function splitLine(line: string, sep: string): string[] {
  const out: string[] = []
  let cur = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') {
      if (quoted && line[i + 1] === '"') {
        cur += '"'
        i++
      } else quoted = !quoted
    } else if (c === sep && !quoted) {
      out.push(cur)
      cur = ''
    } else cur += c
  }
  out.push(cur)
  return out.map((s) => s.trim())
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')

const DATE_COLS = ['data', 'date', 'dt']
const DESC_COLS = ['descricao', 'description', 'title', 'titulo', 'historico', 'lancamento', 'estabelecimento', 'memo', 'detalhes']
const AMOUNT_COLS = ['valor', 'amount', 'montante', 'quantia']

function findCol(header: string[], names: string[]): number {
  let i = header.findIndex((h) => names.includes(h))
  if (i < 0) i = header.findIndex((h) => names.some((n) => h.startsWith(n)))
  return i
}

/**
 * CSV com cabeçalho. Detecta separador e colunas de data/descrição/valor.
 * Em faturas de cartão o gasto costuma vir positivo: nesse caso o sinal é invertido.
 */
export function parseCSV(text: string, source: Source): ParsedTx[] {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim() !== '')
  // O cabeçalho é a primeira linha que tem coluna de data e de valor (alguns bancos põem texto antes).
  let start = -1
  let sep = ','
  let header: string[] = []
  for (let i = 0; i < Math.min(lines.length, 15) && start < 0; i++) {
    for (const s of [';', ',', '\t']) {
      const h = splitLine(lines[i], s).map(norm)
      if (findCol(h, DATE_COLS) >= 0 && findCol(h, AMOUNT_COLS) >= 0) {
        start = i
        sep = s
        header = h
        break
      }
    }
  }
  if (start < 0) throw new Error('Não encontrei as colunas de data e valor no CSV.')
  const iDate = findCol(header, DATE_COLS)
  const iAmount = findCol(header, AMOUNT_COLS)
  const iDesc = findCol(header, DESC_COLS)

  const rows: Omit<ParsedTx, 'ref'>[] = []
  for (const line of lines.slice(start + 1)) {
    const cols = splitLine(line, sep)
    const date = parseDate(cols[iDate] ?? '')
    const amount = parseAmount(cols[iAmount] ?? '')
    if (!date || isNaN(amount)) continue
    rows.push({ date, amount, description: (iDesc >= 0 ? cols[iDesc] : '') || '(sem descrição)' })
  }

  if (source === 'cartao') {
    const positives = rows.filter((r) => r.amount > 0).length
    if (positives > rows.length / 2) for (const r of rows) r.amount = -r.amount
  }

  const seen = new Map<string, number>()
  return rows.map((r) => {
    const base = `${r.date}|${r.amount.toFixed(2)}|${r.description}`
    const n = (seen.get(base) ?? 0) + 1
    seen.set(base, n)
    return { ...r, ref: n === 1 ? base : `${base}#${n}` }
  })
}

export function parseStatement(fileName: string, text: string, source: Source): ParsedTx[] {
  const isOfx = /\.(ofx|qfx)$/i.test(fileName) || /<OFX>/i.test(text)
  return isOfx ? parseOFX(text) : parseCSV(text, source)
}
