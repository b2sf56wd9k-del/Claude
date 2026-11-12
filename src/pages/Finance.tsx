import { useRef, useState } from 'react'
import { toISO } from '../game'
import { brl, monthLabel, monthOf, shiftMonth, summarize } from '../finance/categorize'
import { decodeBytes, parseStatement, type ParsedTx, type Source } from '../finance/parse'
import { extractPdfLines, parsePdfLines } from '../finance/pdf'
import { useCloud } from '../cloud'
import { BUDGET_XP, IMPORT_XP, useStore } from '../store'

export default function Finance() {
  const { txs, categories, people, events, importParsed, setTxCategory, setBudget, addCategory, closeMonth } = useStore()
  const thisMonth = monthOf(toISO(new Date()))
  const [month, setMonth] = useState(() => txs.reduce((m, t) => (monthOf(t.date) > m ? monthOf(t.date) : m), '') || thisMonth)
  const [owner, setOwner] = useState<number | null>(null)
  const [editBudgets, setEditBudgets] = useState(false)
  const [showAll, setShowAll] = useState(false)

  const sum = summarize(txs, categories, month, owner)
  const months = Array.from({ length: 6 }, (_, i) => shiftMonth(month, i - 5))
  const history = months.map((m) => ({ m, spent: Math.max(0, summarize(txs, categories, m, owner).spent) }))
  const maxSpent = Math.max(1, ...history.map((h) => h.spent))

  const expenseCats = categories.filter((c) => c.kind === 'expense')
  const rows = expenseCats
    .map((c) => ({ c, spent: sum.byCategory[c.id] ?? 0 }))
    .filter((r) => editBudgets || r.spent !== 0 || r.c.budget)
    .sort((a, b) => b.spent - a.spent)
  const maxCat = Math.max(1, ...rows.map((r) => r.spent))
  const totalBudget = expenseCats.reduce((s, c) => s + (c.budget ?? 0), 0)

  const monthTxs = txs
    .filter((t) => monthOf(t.date) === month && (owner === null || t.owner === owner))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
  const shown = showAll ? monthTxs : monthTxs.slice(0, 30)

  const closed = events.some((e) => e.key === `closed:${month}`)
  const canClose = month < thisMonth && !closed && monthTxs.length > 0 && totalBudget > 0
  const [closeMsg, setCloseMsg] = useState('')

  return (
    <>
      <h1>Gastos</h1>

      <div className="monthnav">
        <button className="btn ghost sm" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Mês anterior">
          ‹
        </button>
        <b>{monthLabel(month, true)}</b>
        <button className="btn ghost sm" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Próximo mês">
          ›
        </button>
      </div>

      <div className="chips" style={{ marginBottom: 12 }}>
        {[{ v: null as number | null, label: 'Casal' }, ...people.map((label, v) => ({ v: v as number | null, label }))].map((o) => (
          <button key={String(o.v)} className={`chip ${owner === o.v ? 'on' : ''}`} onClick={() => setOwner(o.v)}>
            {o.label}
          </button>
        ))}
      </div>

      <div className="tiles money">
        <div className="tile">
          <b>{brl(sum.spent)}</b>
          <span>gastos{owner === null && totalBudget > 0 ? ` de ${brl(totalBudget)}` : ''}</span>
        </div>
        <div className="tile">
          <b>{brl(sum.income)}</b>
          <span>receitas</span>
        </div>
        <div className="tile">
          <b>{brl(sum.income - sum.spent)}</b>
          <span>saldo do mês</span>
        </div>
      </div>

      <h2>Gastos por mês</h2>
      <div className="card">
        <div className="cols">
          {history.map((h) => (
            <button
              key={h.m}
              className={`col ${h.m === month ? 'on' : ''}`}
              onClick={() => setMonth(h.m)}
              aria-label={`${monthLabel(h.m, true)}: ${brl(h.spent)}`}
            >
              <em>{brl(h.spent)}</em>
              <i style={{ height: `${(h.spent / maxSpent) * 84}%` }} />
              <span>{monthLabel(h.m)}</span>
            </button>
          ))}
        </div>
      </div>

      <h2>Por tipo de gasto</h2>
      <div className="card">
        {rows.length === 0 && <p className="muted">Sem lançamentos neste mês. Importe um extrato abaixo.</p>}
        {rows.map(({ c, spent }) => {
          const budget = owner === null ? c.budget : undefined
          const ratio = budget ? spent / budget : spent / maxCat
          const level = budget ? (ratio > 1 ? 'danger' : ratio > 0.85 ? 'warn' : '') : ''
          return (
            <div className="cat" key={c.id}>
              <div className="head">
                <span>{c.name}</span>
                <span className="num">
                  {brl(spent)}
                  {budget ? <span className="muted"> / {brl(budget)}</span> : null}
                </span>
              </div>
              <div className={`meter ${level}`}>
                <i style={{ width: `${Math.min(1, Math.max(0, ratio)) * 100}%` }} />
              </div>
              {budget && ratio > 1 ? <p className="over">▲ Estourou em {brl(spent - budget)}</p> : null}
              {editBudgets && (
                <label className="row small muted" style={{ marginTop: 8 }}>
                  Orçamento mensal (R$)
                  <input
                    type="number"
                    min={0}
                    step={50}
                    style={{ width: 120 }}
                    defaultValue={c.budget ?? ''}
                    onBlur={(e) => setBudget(c.id, +e.target.value || 0)}
                  />
                </label>
              )}
            </div>
          )
        })}
        {editBudgets && <NewCategory onAdd={addCategory} />}
        <div className="row wrap" style={{ marginTop: 12 }}>
          <button className="btn ghost sm" onClick={() => setEditBudgets(!editBudgets)}>
            {editBudgets ? 'Concluir' : 'Definir orçamentos'}
          </button>
          {canClose && (
            <button
              className="btn sm"
              onClick={() => {
                const won = closeMonth(month)
                setCloseMsg(`Mês fechado: ${won} orçamento(s) cumprido(s), +${won * BUDGET_XP} XP em Finanças.`)
              }}
            >
              Fechar mês e receber XP
            </button>
          )}
        </div>
        {closeMsg && <p className="notice">{closeMsg}</p>}
        {closed && !closeMsg && <p className="notice">Mês fechado.</p>}
      </div>

      <h2>Importar extrato</h2>
      <Importer people={people} onImport={importParsed} onDone={(m) => m && setMonth(m)} />

      <h2>Lançamentos · {monthTxs.length}</h2>
      <div className="card">
        {monthTxs.length === 0 && <p className="muted">Nenhum lançamento.</p>}
        {shown.map((t) => (
          <div className="tx" key={t.id}>
            <div className="row">
              <span className="desc grow" title={t.description}>
                {t.description}
              </span>
              <span className={`amt ${t.amount > 0 ? 'in' : ''}`}>{brl(t.amount)}</span>
            </div>
            <div className="row" style={{ marginTop: 4 }}>
              <span className="small muted grow">
                {t.date.slice(8, 10)}/{t.date.slice(5, 7)} · {t.source === 'conta' ? 'Conta' : 'Cartão'} · {people[t.owner]}
              </span>
              <select value={t.categoryId} onChange={(e) => setTxCategory(t.id, e.target.value)} aria-label={`Categoria de ${t.description}`}>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ))}
        {monthTxs.length > shown.length && (
          <button className="btn ghost sm" style={{ marginTop: 12 }} onClick={() => setShowAll(true)}>
            Mostrar todos ({monthTxs.length})
          </button>
        )}
        {monthTxs.length > 0 && (
          <p className="notice">Ao trocar a categoria, o app aprende e aplica a todos os lançamentos do mesmo estabelecimento.</p>
        )}
      </div>
    </>
  )
}

function NewCategory({ onAdd }: { onAdd: (name: string) => void }) {
  const [name, setName] = useState('')
  return (
    <div className="row" style={{ marginTop: 12 }}>
      <input type="text" className="grow" placeholder="Nova categoria" value={name} onChange={(e) => setName(e.target.value)} />
      <button
        className="btn ghost sm"
        disabled={!name.trim()}
        onClick={() => {
          onAdd(name)
          setName('')
        }}
      >
        Adicionar
      </button>
    </div>
  )
}

function Importer(p: {
  people: [string, string]
  onImport: (parsed: ParsedTx[], source: Source, owner: number) => { added: number; skipped: number }
  onDone: (month: string | null) => void
}) {
  const [source, setSource] = useState<Source>('cartao')
  // quem recebeu o compartilhamento é a pessoa 2
  const [owner, setOwner] = useState(() => (useCloud.getState().financeOwner ? 0 : 1))
  const [msg, setMsg] = useState('')
  const input = useRef<HTMLInputElement>(null)

  async function handle(files: FileList | null) {
    if (!files?.length) return
    const lines: string[] = []
    const before = useStore.getState().txs.length
    for (const f of Array.from(files)) {
      try {
        const buf = await f.arrayBuffer()
        const isPdf = /\.pdf$/i.test(f.name)
        const parsed = isPdf
          ? parsePdfLines(await extractPdfLines(buf, () => prompt(`"${f.name}" é protegido por senha. Digite a senha do PDF:`)), source, toISO(new Date()))
          : parseStatement(f.name, decodeBytes(buf), source)
        const r = p.onImport(parsed, source, owner)
        const out = parsed.filter((t) => t.amount < 0).reduce((s, t) => s - t.amount, 0)
        const inn = parsed.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0)
        lines.push(
          parsed.length === 0
            ? `${f.name}: nenhum lançamento reconhecido.`
            : `${f.name}: ${r.added} novo(s)${r.skipped ? `, ${r.skipped} já importado(s)` : ''}. No arquivo: saídas ${brl(out)}, entradas ${brl(inn)}${isPdf ? ' — confira com o total do PDF.' : '.'}`,
        )
      } catch (e) {
        lines.push(`${f.name}: não consegui ler o arquivo${e instanceof Error && e.message ? ` (${e.message})` : ''}.`)
      }
    }
    const fresh = useStore.getState().txs.slice(before)
    setMsg(lines.join('\n'))
    p.onDone(fresh.length ? fresh.reduce((m, t) => (monthOf(t.date) > m ? monthOf(t.date) : m), '') : null)
    if (input.current) input.current.value = ''
  }

  return (
    <div className="card">
      <div className="form">
        <label className="field">
          Origem
          <select value={source} onChange={(e) => setSource(e.target.value as Source)}>
            <option value="cartao">Cartão de crédito</option>
            <option value="conta">Conta corrente</option>
          </select>
        </label>
        <label className="field">
          De quem
          <select value={owner} onChange={(e) => setOwner(+e.target.value)}>
            {p.people.map((n, i) => (
              <option key={i} value={i}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>
      <input ref={input} type="file" accept=".pdf,.ofx,.qfx,.csv,.txt" multiple hidden onChange={(e) => handle(e.target.files)} />
      <button className="btn" style={{ marginTop: 12 }} onClick={() => input.current?.click()}>
        Escolher arquivos (PDF, OFX ou CSV)
      </button>
      <p className="notice">
        {msg || `Cada mês novo importado vale +${IMPORT_XP} XP em Finanças. Reimportar o mesmo arquivo não duplica lançamentos.`}
      </p>
    </div>
  )
}
