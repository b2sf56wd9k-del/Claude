// Leitura de extratos em PDF (extrato de conta e fatura de cartão).
// A extração do texto usa pdf.js; a interpretação das linhas é uma função pura, testável.
import { parseAmount, type ParsedTx, type Source } from './parse'

export interface PdfItem {
  str: string
  x: number
  w: number
}
export interface PdfLine {
  text: string
  items: PdfItem[]
}

/** Extrai as linhas de texto do PDF, de cima para baixo, com a posição horizontal de cada trecho. */
export async function extractPdfLines(buf: ArrayBuffer, askPassword: () => Promise<string | null>): Promise<PdfLine[]> {
  const pdfjs = await import('pdfjs-dist')
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default

  const task = pdfjs.getDocument({ data: new Uint8Array(buf) })
  // Faturas enviadas por e-mail costumam vir protegidas por senha.
  task.onPassword = (update: (pw: string) => void) => {
    void askPassword().then((pw) => (pw === null ? void task.destroy() : update(pw)))
  }
  const doc = await task.promise
  const lines: PdfLine[] = []
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n)
    const content = await page.getTextContent()
    const items = content.items
      .filter((i): i is typeof i & { str: string; transform: number[]; width: number } => 'str' in i && i.str.trim() !== '')
      .map((i) => ({ str: i.str, x: i.transform[4], y: i.transform[5], w: i.width }))
      .sort((a, b) => b.y - a.y || a.x - b.x)
    let row: typeof items = []
    const flush = () => {
      if (!row.length) return
      row.sort((a, b) => a.x - b.x)
      let text = ''
      let end = -Infinity
      for (const it of row) {
        text += (text && it.x - end > 1 ? ' ' : '') + it.str
        end = it.x + it.w
      }
      lines.push({ text: text.replace(/\s+/g, ' ').trim(), items: row.map(({ str, x, w }) => ({ str, x, w })) })
      row = []
    }
    for (const it of items) {
      if (row.length && Math.abs(row[0].y - it.y) > 2.5) flush()
      row.push(it)
    }
    flush()
  }
  return lines
}

const AMOUNT = /(?<![\d.,])-?\s?\d{1,3}(?:\.\d{3})*,\d{2}(?![\d,])\s?-?/g
const SKIP = /^(saldo|total|subtotal|limite|pagamento m[ií]nimo|encargos|juros)/i

interface Num {
  raw: string
  value: number
  /** borda direita do número na página (valores ficam alinhados à direita nas colunas) */
  right: number
}

function numbersOf(line: PdfLine): Num[] {
  const out: Num[] = []
  for (const it of line.items) {
    for (const m of it.str.matchAll(AMOUNT)) {
      const raw = m[0].trim()
      out.push({ raw, value: parseAmount(raw), right: it.x + it.w })
    }
  }
  // PDFs que quebram o número em vários trechos: recorre ao texto da linha inteira.
  if (out.length === 0) {
    for (const m of line.text.matchAll(AMOUNT)) out.push({ raw: m[0].trim(), value: parseAmount(m[0]), right: NaN })
  }
  return out.filter((n) => !isNaN(n.value))
}

const clean = (s: string) => s.replace(AMOUNT, ' ').replace(/\s+/g, ' ').trim()

function withRefs(rows: Omit<ParsedTx, 'ref'>[]): ParsedTx[] {
  const seen = new Map<string, number>()
  return rows.map((r) => {
    const base = `${r.date}|${r.amount.toFixed(2)}|${r.description}`
    const n = (seen.get(base) ?? 0) + 1
    seen.set(base, n)
    return { ...r, ref: n === 1 ? base : `${base}#${n}` }
  })
}

/**
 * Extrato de conta: colunas Data | Histórico | Docto. | Crédito | Débito | Saldo.
 * A data só aparece no primeiro lançamento do dia e o histórico pode continuar na linha de baixo.
 * O sinal vem, nesta ordem: da coluna em que o valor está, do sinal impresso, ou da variação do saldo.
 */
export function parseAccountPdf(lines: PdfLine[]): ParsedTx[] {
  const rows: Omit<ParsedTx, 'ref'>[] = []
  let cols: { credit: number; debit: number; saldo: number | null } | null = null
  let date: string | null = null
  let prevSaldo: number | null = null
  let last: Omit<ParsedTx, 'ref'> | null = null
  let extra = 0

  for (const line of lines) {
    const credit = line.items.find((i) => /cr[eé]dito/i.test(i.str))
    const debit = line.items.find((i) => /d[eé]bito/i.test(i.str))
    if (credit && debit && credit !== debit) {
      const saldo = line.items.find((i) => /saldo/i.test(i.str) && i !== credit && i !== debit)
      cols = { credit: credit.x + credit.w, debit: debit.x + debit.w, saldo: saldo ? saldo.x + saldo.w : null }
      last = null
      continue
    }

    const dm = line.text.match(/^(\d{2})\/(\d{2})\/(\d{2,4})\b/)
    if (dm) date = `${dm[3].length === 2 ? '20' + dm[3] : dm[3]}-${dm[2]}-${dm[1]}`
    const body = dm ? line.text.slice(dm[0].length) : line.text
    const nums = numbersOf(line)

    if (nums.length === 0) {
      // linha só de texto logo após um lançamento: complemento do histórico (ex.: "DES: Fulano")
      if (last && extra < 2 && !dm && !SKIP.test(body.trim()) && !/p[aá]gina|folha|extrato|ag[eê]ncia/i.test(body)) {
        last.description += ' ' + body.trim()
        extra++
      }
      continue
    }
    if (!date) continue

    // tira o número do documento (coluna Docto.), que vem depois do histórico
    const description = clean(body).replace(/\b\d{5,}\b/g, ' ').replace(/\s+/g, ' ').trim().replace(/\s\d+$/, '') || '(sem descrição)'
    if (SKIP.test(description)) {
      prevSaldo = nums[nums.length - 1].value
      last = null
      continue
    }

    let amount: number
    let saldo: number | null = null
    const positioned = cols && nums.every((n) => !isNaN(n.right))
    if (cols && positioned) {
      const targets: [string, number][] = [['credit', cols.credit], ['debit', cols.debit]]
      if (cols.saldo !== null) targets.push(['saldo', cols.saldo])
      const col = (n: Num) => targets.reduce((b, t) => (Math.abs(t[1] - n.right) < Math.abs(b[1] - n.right) ? t : b))[0]
      const mov = nums.find((n) => col(n) !== 'saldo')
      if (!mov) continue
      amount = col(mov) === 'credit' ? Math.abs(mov.value) : -Math.abs(mov.value)
      saldo = nums.find((n) => col(n) === 'saldo')?.value ?? null
    } else {
      const mov = nums[0]
      amount = mov.value
      if (nums.length > 1) saldo = nums[nums.length - 1].value
      if (!mov.raw.includes('-') && saldo !== null && prevSaldo !== null) {
        const diff = saldo - prevSaldo
        if (Math.abs(Math.abs(diff) - Math.abs(amount)) < 0.01) amount = Math.sign(diff) * Math.abs(amount)
      }
    }
    prevSaldo = saldo ?? (prevSaldo !== null ? prevSaldo + amount : null)

    last = { date, description, amount }
    extra = 0
    rows.push(last)
  }
  return withRefs(rows)
}

/**
 * Fatura de cartão: linhas "dd/mm DESCRIÇÃO [CIDADE] valor". O ano vem da data de vencimento.
 * Valor sem sinal é gasto; com "-" é pagamento ou estorno.
 * Parcelas antigas trazem a data da compra original: são trazidas para o mês da fatura,
 * que é quando o gasto pesa no orçamento.
 */
export function parseCardPdf(lines: PdfLine[], today: string): ParsedTx[] {
  const venc = lines.find((l) => /vencimento/i.test(l.text) && /\d{2}\/\d{2}\/\d{4}/.test(l.text)) ?? lines.find((l) => /\d{2}\/\d{2}\/\d{4}/.test(l.text))
  const vm = venc?.text.match(/(\d{2})\/(\d{2})\/(\d{4})/)
  const refYear = vm ? +vm[3] : +today.slice(0, 4)
  const refMonth = vm ? +vm[2] : +today.slice(5, 7)
  // mês de referência dos gastos: o anterior ao vencimento
  const cycle = new Date(refYear, refMonth - 2, 1)
  const cycleISO = `${cycle.getFullYear()}-${String(cycle.getMonth() + 1).padStart(2, '0')}-01`

  const rows: Omit<ParsedTx, 'ref'>[] = []
  for (const line of lines) {
    const m = line.text.match(/^(\d{2})\/(\d{2})(?!\/?\d)\s*(.*)$/)
    if (!m) continue
    const nums = numbersOf(line)
    if (nums.length === 0) continue
    const [, dd, mm, rest] = m
    if (+mm < 1 || +mm > 12 || +dd < 1 || +dd > 31) continue
    const mov = nums[nums.length - 1]
    const description = clean(rest) || '(sem descrição)'
    if (SKIP.test(description)) continue
    const year = +mm > refMonth ? refYear - 1 : refYear
    let date = `${year}-${mm}-${dd}`
    const parcel = description.match(/\b(\d{1,2})\/(\d{1,2})\b/)
    if (parcel && +parcel[1] > 1 && date < cycleISO) date = cycleISO
    rows.push({ date, description, amount: mov.raw.includes('-') ? Math.abs(mov.value) : -Math.abs(mov.value) })
  }
  return withRefs(rows)
}

export function parsePdfLines(lines: PdfLine[], source: Source, today: string): ParsedTx[] {
  return source === 'cartao' ? parseCardPdf(lines, today) : parseAccountPdf(lines)
}
