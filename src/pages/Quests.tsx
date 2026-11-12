import { useState } from 'react'
import { ATTRS, DAILY_BONUS_XP, penaltyState, questCount, toISO, type Attr, type Quest } from '../game'
import { useStore } from '../store'

const attrShort = (id: Attr) => ATTRS.find((a) => a.id === id)!.short

const blank = (): Quest => ({ id: `q${Date.now()}`, title: '', attr: 'disciplina', xp: 20, freq: 'daily', target: 1, active: true })

export default function Quests() {
  const { quests, events, startDate, advance, undo, payPenalty, saveQuest, removeQuest } = useStore()
  const [editing, setEditing] = useState<Quest | null>(null)
  const [manage, setManage] = useState(false)
  const today = toISO(new Date())

  const active = quests.filter((q) => q.active)
  const dailies = active.filter((q) => q.freq === 'daily')
  const weeklies = active.filter((q) => q.freq === 'weekly')
  const penalty = penaltyState(events, quests, startDate, today)
  const dailiesDone = dailies.filter((q) => questCount(events, q, today) >= q.target).length

  const item = (q: Quest) => {
    const count = questCount(events, q, today)
    const done = count >= q.target
    return (
      <div className={`quest ${done ? 'done' : ''}`} key={q.id}>
        <button
          className={`check ${done ? 'done' : ''}`}
          aria-label={done ? `Desfazer: ${q.title}` : `Concluir: ${q.title}`}
          onClick={() => (done ? undo(q.id) : advance(q.id))}
        >
          {done ? '✓' : ''}
        </button>
        <div className="grow">
          <p className="title">{q.title}</p>
          <p className="small muted row" style={{ gap: 8, marginTop: 2 }}>
            <span className="tag">{attrShort(q.attr)}</span>
            <span className="num">+{q.xp} XP</span>
            {q.target > 1 && (
              <span className="num">
                {count}/{q.target} na semana
              </span>
            )}
          </p>
        </div>
        {q.target > 1 && count > 0 && !done && (
          <button className="btn ghost sm" onClick={() => undo(q.id)} aria-label={`Remover um registro de ${q.title}`}>
            −1
          </button>
        )}
      </div>
    )
  }

  return (
    <>
      <h1>Missões</h1>

      {penalty === 'pending' && (
        <div className="card penalty" style={{ marginBottom: 12 }}>
          <h3>Missão de penalidade</h3>
          <p className="small">
            As diárias de ontem ficaram incompletas. Faça uma caminhada de 20 minutos hoje para manter sua sequência — não vale XP.
          </p>
          <button className="btn sm" style={{ marginTop: 12 }} onClick={payPenalty}>
            Penalidade cumprida
          </button>
        </div>
      )}
      {penalty === 'done' && (
        <p className="small muted" style={{ marginBottom: 12 }}>
          Penalidade cumprida: sequência mantida.
        </p>
      )}

      <h2>
        Diárias · {dailiesDone}/{dailies.length}
      </h2>
      <div className="card">
        {dailies.length === 0 && <p className="muted">Nenhuma missão diária ativa.</p>}
        {dailies.map(item)}
        {dailies.length > 0 && (
          <p className="small muted" style={{ marginTop: 8 }}>
            Concluir todas no dia vale +{DAILY_BONUS_XP} XP de bônus e mantém a sequência.
          </p>
        )}
      </div>

      <h2>Semanais</h2>
      <div className="card">
        {weeklies.length === 0 && <p className="muted">Nenhuma missão semanal ativa.</p>}
        {weeklies.map(item)}
      </div>

      <div className="row" style={{ marginTop: 16 }}>
        <button className="btn" onClick={() => setEditing(blank())}>
          Nova missão
        </button>
        <button className="btn ghost" onClick={() => setManage(!manage)}>
          {manage ? 'Fechar lista' : 'Editar missões'}
        </button>
      </div>

      {manage && (
        <div className="card" style={{ marginTop: 12 }}>
          {quests.map((q) => (
            <div className="quest" key={q.id}>
              <div className="grow">
                <p>{q.title}</p>
                <p className="small muted">
                  {q.freq === 'daily' ? 'Diária' : `Semanal, ${q.target}x`} · {q.active ? 'ativa' : 'pausada'}
                </p>
              </div>
              <button className="btn ghost sm" onClick={() => setEditing(q)}>
                Editar
              </button>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <QuestForm
          quest={editing}
          isNew={!quests.some((q) => q.id === editing.id)}
          onSave={(q) => {
            saveQuest(q)
            setEditing(null)
          }}
          onRemove={() => {
            removeQuest(editing.id)
            setEditing(null)
          }}
          onCancel={() => setEditing(null)}
        />
      )}
    </>
  )
}

function QuestForm(p: { quest: Quest; isNew: boolean; onSave: (q: Quest) => void; onRemove: () => void; onCancel: () => void }) {
  const [q, setQ] = useState(p.quest)
  const set = (patch: Partial<Quest>) => setQ({ ...q, ...patch })
  const valid = q.title.trim() !== '' && q.xp > 0 && q.target >= 1
  return (
    <div className="card" style={{ marginTop: 12 }}>
      <div className="form">
        <label className="field full">
          Título
          <input type="text" value={q.title} onChange={(e) => set({ title: e.target.value })} autoFocus />
        </label>
        <label className="field">
          Atributo
          <select value={q.attr} onChange={(e) => set({ attr: e.target.value as Attr })}>
            {ATTRS.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Frequência
          <select
            value={q.freq}
            onChange={(e) => set({ freq: e.target.value as Quest['freq'], target: e.target.value === 'daily' ? 1 : q.target })}
          >
            <option value="daily">Diária</option>
            <option value="weekly">Semanal</option>
          </select>
        </label>
        {q.freq === 'weekly' && (
          <label className="field">
            Vezes por semana
            <input type="number" min={1} max={14} value={q.target} onChange={(e) => set({ target: Math.max(1, Math.round(+e.target.value)) })} />
          </label>
        )}
        <label className="field">
          XP ao completar
          <input type="number" min={1} value={q.xp} onChange={(e) => set({ xp: Math.round(+e.target.value) })} />
        </label>
        <label className="row full small">
          <input type="checkbox" checked={q.active} onChange={(e) => set({ active: e.target.checked })} />
          Missão ativa
        </label>
      </div>
      <div className="row wrap" style={{ marginTop: 16 }}>
        <button className="btn" disabled={!valid} onClick={() => p.onSave({ ...q, title: q.title.trim() })}>
          Salvar
        </button>
        <button className="btn ghost" onClick={p.onCancel}>
          Cancelar
        </button>
        {!p.isNew && (
          <button className="btn danger" onClick={p.onRemove}>
            Excluir
          </button>
        )}
      </div>
    </div>
  )
}
