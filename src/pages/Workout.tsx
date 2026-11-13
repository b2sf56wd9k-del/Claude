import { useEffect, useMemo, useState } from 'react'
import { confirmDialog } from '../dialog'
import { PURPOSES, strengthPlan, weekLayout } from '../health'
import { useStore } from '../store'
import Figure from '../workout/Figure'
import { EXERCISES, EXERCISE_LIST, type ExerciseDef } from '../workout/exercises'
import {
  WORKOUTS, buildSession, fmtKg, history, lastEntry, nextWorkout, repsLabel, sessionVolume, suggest, workoutIds,
  type Session, type SetLog, type WorkoutId,
} from '../workout/plan'

type View = { v: 'home' } | { v: 'history' } | { v: 'library' } | { v: 'exercise'; id: string; back: View } | { v: 'summary'; session: Session; records: string[]; xp: number }

const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
const clock = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.max(0, Math.floor(sec % 60))).padStart(2, '0')}`
const setText = (def: ExerciseDef, s: SetLog) => (def.load === 'kg' ? `${fmtKg(s.kg)} × ${s.reps}` : `${s.reps}${def.unit === 's' ? ' s' : ' reps'}`)

export default function Workout() {
  const active = useStore((s) => s.activeSession)
  const [view, setView] = useState<View>({ v: 'home' })
  if (active) return <Active onDone={(r) => setView(r ? { v: 'summary', ...r } : { v: 'home' })} />
  if (view.v === 'summary') return <Summary {...view} onClose={() => setView({ v: 'home' })} />
  if (view.v === 'exercise') return <ExerciseDetail id={view.id} onBack={() => setView(view.back)} />
  if (view.v === 'history') return <HistoryList onBack={() => setView({ v: 'home' })} onOpen={(id) => setView({ v: 'exercise', id, back: view })} />
  if (view.v === 'library') return <Library onBack={() => setView({ v: 'home' })} onOpen={(id) => setView({ v: 'exercise', id, back: view })} />
  return <Home go={setView} />
}

// ---------- início ----------

function Home({ go }: { go: (v: View) => void }) {
  const { health, sessions, startSession } = useStore()
  const days = health.strengthDays
  const ids = workoutIds(days || 2)
  const [workout, setWorkout] = useState<WorkoutId>(() => nextWorkout(sessions, days))
  const [minutes, setMinutes] = useState(() => sessions[sessions.length - 1]?.minutes ?? 60)
  const built = useMemo(() => buildSession(WORKOUTS[workout], minutes), [workout, minutes])
  const full = useMemo(() => buildSession(WORKOUTS[workout], 999).minutes, [workout])
  const plan = strengthPlan(health.goal, days || 2)!
  const suggested = nextWorkout(sessions, days)
  const lastDone = [...sessions].filter((s) => s.finishedAt).pop()

  return (
    <>
      <h1>Treino</h1>

      <div className="chips" style={{ marginBottom: 12 }}>
        {ids.map((id) => (
          <button key={id} className={`chip ${workout === id ? 'on' : ''}`} onClick={() => setWorkout(id)}>
            Treino {id}
            {id === suggested ? ' · hoje' : ''}
          </button>
        ))}
      </div>

      <div className="card">
        <p className="level" style={{ fontSize: 20 }}>
          {WORKOUTS[workout].focus}
        </p>
        <p className="small muted" style={{ marginTop: 4 }}>
          {lastDone ? `Último treino: ${lastDone.workout}, em ${dm(lastDone.date)}.` : 'Nenhum treino registrado ainda.'}
        </p>

        <p className="small" style={{ margin: '16px 0 8px' }}>
          Quanto tempo você tem hoje?
        </p>
        <div className="chips">
          {[30, 45, 60, 75].map((m) => (
            <button key={m} className={`chip ${minutes === m ? 'on' : ''}`} onClick={() => setMinutes(m)}>
              {m} min
            </button>
          ))}
        </div>
        <p className="notice">
          {built.items.length} exercícios, cerca de {built.minutes} min com aquecimento.
          {built.dropped.length > 0 && ` Ficam de fora hoje: ${built.dropped.map((d) => EXERCISES[d].name.toLowerCase()).join(', ')}.`}
          {built.dropped.length === 0 && built.trimmed && ' Algumas séries foram reduzidas para caber no tempo.'}
          {built.minutes > minutes + 3 && ` Este é o mínimo que mantém o bloco de corrida; o treino completo leva ${full} min.`}
        </p>
        <button className="btn big" style={{ marginTop: 12 }} onClick={() => startSession(workout, minutes)}>
          Começar treino {workout}
        </button>
      </div>

      <h2>Exercícios de hoje</h2>
      <div className="card">
        {built.items.map(({ item, sets }) => {
          const def = EXERCISES[item.ex]
          const sg = suggest(sessions, item.ex, item.reps, sets)
          return (
            <button className="exrow" key={item.ex} onClick={() => go({ v: 'exercise', id: item.ex, back: { v: 'home' } })}>
              <span className="thumb">
                <Figure def={def.fig} label={def.name} />
              </span>
              <span className="grow">
                <span className="exname">{def.name}</span>
                <span className="small muted">
                  {repsLabel(item.ex, sets, item.reps)}
                  {sg.kg ? ` · ${fmtKg(sg.kg)}` : ''}
                </span>
              </span>
              <span className="tag">{PURPOSES[def.purpose]}</span>
            </button>
          )
        })}
      </div>

      <div className="row wrap" style={{ marginTop: 16 }}>
        <button className="btn ghost" onClick={() => go({ v: 'history' })}>
          Cargas e histórico
        </button>
        <button className="btn ghost" onClick={() => go({ v: 'library' })}>
          Todos os exercícios
        </button>
      </div>

      <details className="card">
        <summary>Por que este treino</summary>
        <p className="small" style={{ marginTop: 8 }}>
          {plan.summary}
        </p>
        <ul className="tips">
          {plan.principles.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
        <p className="notice">Semana sugerida: {weekLayout(health.runDays, days || 2)}</p>
        <ul className="tips">
          {plan.tips.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
        {plan.studies.map((st) => (
          <div className="study" key={st.ref}>
            <p className="small">{st.finding}</p>
            <p className="small muted">{st.ref}</p>
          </div>
        ))}
        <p className="notice">O plano aplica as conclusões desses estudos; a escolha exata de exercícios e a divisão dos dias são minhas.</p>
      </details>
    </>
  )
}

// ---------- treino em andamento ----------

function Stepper(p: { id: string; label: string; value: string; step: number; onChange: (v: string) => void }) {
  const n = parseFloat(p.value.replace(',', '.')) || 0
  const bump = (d: number) => p.onChange(String(Math.max(0, Math.round((n + d) * 10) / 10)).replace('.', ','))
  return (
    <div className="stepper">
      <label htmlFor={p.id}>{p.label}</label>
      <div className="row" style={{ gap: 8 }}>
        <button className="btn ghost" aria-label={`Diminuir ${p.label}`} onClick={() => bump(-p.step)}>
          −
        </button>
        <input id={p.id} type="text" inputMode="decimal" value={p.value} onChange={(e) => p.onChange(e.target.value)} />
        <button className="btn ghost" aria-label={`Aumentar ${p.label}`} onClick={() => bump(p.step)}>
          +
        </button>
      </div>
    </div>
  )
}

function Active({ onDone }: { onDone: (r: { session: Session; records: string[]; xp: number } | null) => void }) {
  const { sessions, logSet, undoSet, swapExercise, cancelSession, finishSession } = useStore()
  const session = useStore((s) => s.activeSession)!
  const firstOpen = session.entries.findIndex((e) => e.sets.length < e.target)
  const [idx, setIdx] = useState(firstOpen < 0 ? 0 : firstOpen)
  const [restEnd, setRestEnd] = useState<number | null>(null)
  const [now, setNow] = useState(Date.now())
  const [swapping, setSwapping] = useState(false)

  const entry = session.entries[idx]
  const def = EXERCISES[entry.ex]
  const sg = useMemo(() => suggest(sessions, entry.ex, entry.reps, entry.target), [sessions, entry.ex, entry.reps, entry.target])
  const [kg, setKg] = useState('')
  const [reps, setReps] = useState('')

  // ao trocar de exercício, preenche com a sugestão; depois de uma série, mantém o que foi feito
  useEffect(() => {
    const prev = entry.sets[entry.sets.length - 1]
    setKg(prev ? String(prev.kg).replace('.', ',') : sg.kg ? String(sg.kg).replace('.', ',') : '')
    setReps(String(prev ? prev.reps : sg.reps))
    setSwapping(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, entry.ex])

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500)
    // mantém a tela acesa durante o treino, onde o aparelho permitir
    let lock: { release?: () => void } | undefined
    void (navigator as unknown as { wakeLock?: { request: (t: string) => Promise<{ release: () => void }> } }).wakeLock
      ?.request('screen')
      .then((l) => (lock = l))
      .catch(() => undefined)
    return () => {
      clearInterval(t)
      lock?.release?.()
    }
  }, [])

  const resting = restEnd !== null && restEnd > now
  useEffect(() => {
    if (restEnd !== null && restEnd <= now) {
      setRestEnd(null)
      try {
        navigator.vibrate?.(300)
      } catch {
        /* sem vibração neste aparelho */
      }
    }
  }, [restEnd, now])

  const doneSets = session.entries.reduce((s, e) => s + Math.min(e.sets.length, e.target), 0)
  const totalSets = session.entries.reduce((s, e) => s + e.target, 0)
  const kgN = parseFloat(kg.replace(',', '.')) || 0
  const repsN = Math.round(parseFloat(reps.replace(',', '.')) || 0)
  const valid = repsN > 0 && (def.load === 'corpo' || kgN > 0)
  const exDone = entry.sets.length >= entry.target

  function done() {
    logSet(idx, { kg: def.load === 'kg' ? kgN : 0, reps: repsN })
    const finishedEx = entry.sets.length + 1 >= entry.target
    const next = session.entries.findIndex((e, i) => i !== idx && e.sets.length < e.target)
    if (finishedEx && next < 0) return
    setRestEnd(Date.now() + entry.rest * 1000)
    if (finishedEx) setIdx(session.entries.findIndex((e, i) => i > idx && e.sets.length < e.target) >= 0 ? session.entries.findIndex((e, i) => i > idx && e.sets.length < e.target) : next)
  }

  async function finish() {
    const pending = totalSets - doneSets
    if (pending > 0 && !(await confirmDialog(`Ainda faltam ${pending} série(s). Encerrar o treino assim mesmo?`, 'Encerrar'))) return
    const snapshot = { ...session, finishedAt: Date.now() }
    const r = finishSession()
    onDone(r ? { session: snapshot, ...r } : null)
  }

  async function cancel() {
    if (doneSets > 0 && !(await confirmDialog('Descartar este treino? As séries registradas serão perdidas.', 'Descartar', true))) return
    cancelSession()
    onDone(null)
  }

  return (
    <>
      <div className="row" style={{ marginBottom: 8 }}>
        <h1 className="grow" style={{ margin: 0 }}>
          Treino {session.workout}
        </h1>
        <span className="num muted">{clock((now - session.startedAt) / 1000)}</span>
      </div>
      <div className="meter gold">
        <i style={{ width: `${(doneSets / totalSets) * 100}%` }} />
      </div>
      <p className="small muted num" style={{ margin: '6px 0 12px' }}>
        {doneSets} de {totalSets} séries
      </p>

      <div className="strip">
        {session.entries.map((e, i) => (
          <button
            key={i}
            className={`pill ${i === idx ? 'on' : ''} ${e.sets.length >= e.target ? 'done' : ''}`}
            aria-label={`${EXERCISES[e.ex].name}: ${e.sets.length} de ${e.target} séries`}
            onClick={() => setIdx(i)}
          >
            {e.sets.length >= e.target ? '✓' : i + 1}
          </button>
        ))}
      </div>

      {resting && (
        <div className="card rest">
          <div className="grow">
            <p className="small muted">Descanso</p>
            <p className="timer num">{clock((restEnd! - now) / 1000 + 0.99)}</p>
          </div>
          <button className="btn ghost sm" onClick={() => setRestEnd(restEnd! + 30000)}>
            +30 s
          </button>
          <button className="btn sm" onClick={() => setRestEnd(null)}>
            Pular
          </button>
        </div>
      )}

      <div className="card">
        <div className="bigfig">
          <Figure def={def.fig} animate label={def.name} />
        </div>
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <div className="grow">
            <p className="exname" style={{ fontSize: 18 }}>
              {def.name}
            </p>
            <p className="small muted">{def.muscles}</p>
          </div>
          <span className="tag">{PURPOSES[def.purpose]}</span>
        </div>
        <p className="target num">{repsLabel(entry.ex, entry.target, entry.reps)}</p>
        <p className="small" style={{ color: 'var(--text-2)' }}>
          {sg.text}
        </p>

        {entry.sets.length > 0 && (
          <div className="setlist">
            {entry.sets.map((s, i) => (
              <span key={i} className="setchip num">
                {i + 1}ª · {setText(def, s)}
              </span>
            ))}
          </div>
        )}

        {!exDone ? (
          <>
            <div className="steppers">
              {def.load === 'kg' && <Stepper id="set-kg" label="Carga (kg)" value={kg} step={def.step} onChange={setKg} />}
              <Stepper id="set-reps" label={def.unit === 's' ? 'Segundos' : 'Repetições'} value={reps} step={def.unit === 's' ? 5 : 1} onChange={setReps} />
            </div>
            <button className="btn big" disabled={!valid} onClick={done}>
              {entry.sets.length + 1}ª série feita
            </button>
          </>
        ) : (
          <p className="notice">Exercício concluído. Escolha o próximo acima ou encerre o treino.</p>
        )}

        <div className="row wrap" style={{ marginTop: 12 }}>
          {entry.sets.length > 0 && (
            <button className="btn ghost sm" onClick={() => undoSet(idx)}>
              Desfazer última série
            </button>
          )}
          {def.alts && entry.sets.length === 0 && (
            <button className="btn ghost sm" onClick={() => setSwapping(!swapping)}>
              Aparelho ocupado? Trocar
            </button>
          )}
        </div>
        {swapping &&
          def.alts?.map((a) => (
            <button className="exrow" key={a} onClick={() => swapExercise(idx, a)}>
              <span className="thumb">
                <Figure def={EXERCISES[a].fig} label={EXERCISES[a].name} />
              </span>
              <span className="grow exname">{EXERCISES[a].name}</span>
            </button>
          ))}

        <details className="howto" open={entry.sets.length === 0}>
          <summary>Como fazer</summary>
          <ol>
            {def.cues.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ol>
          <p className="small">
            <b>Erro comum:</b> {def.mistake}
          </p>
        </details>
      </div>

      <div className="row wrap" style={{ marginTop: 16 }}>
        <button className="btn" disabled={doneSets === 0} onClick={finish}>
          Encerrar treino
        </button>
        <button className="btn ghost" onClick={cancel}>
          Cancelar
        </button>
      </div>
    </>
  )
}

function Summary(p: { session: Session; records: string[]; xp: number; onClose: () => void }) {
  const s = p.session
  const sets = s.entries.reduce((t, e) => t + e.sets.length, 0)
  const min = Math.max(1, Math.round(((s.finishedAt ?? Date.now()) - s.startedAt) / 60000))
  return (
    <>
      <h1>Treino {s.workout} concluído</h1>
      <div className="tiles">
        <div className="tile">
          <b>{min} min</b>
          <span>duração</span>
        </div>
        <div className="tile">
          <b>{sets}</b>
          <span>séries</span>
        </div>
        <div className="tile">
          <b>{Math.round(sessionVolume(s)).toLocaleString('pt-BR')}</b>
          <span>kg movidos</span>
        </div>
      </div>
      <div className="card" style={{ marginTop: 12 }}>
        <p className="xp" style={{ fontSize: 18 }}>
          +{p.xp} XP em Força
        </p>
        {p.records.length > 0 ? (
          <>
            <p className="small muted" style={{ margin: '12px 0 4px' }}>
              Recordes pessoais hoje
            </p>
            {p.records.map((r) => (
              <div className="log" key={r}>
                <span>{EXERCISES[r].name}</span>
              </div>
            ))}
          </>
        ) : (
          <p className="small muted" style={{ marginTop: 8 }}>
            Sem recordes hoje. Os recordes aparecem a partir da segunda vez em cada exercício.
          </p>
        )}
      </div>
      <button className="btn big" style={{ marginTop: 16 }} onClick={p.onClose}>
        Fechar
      </button>
    </>
  )
}

// ---------- histórico e biblioteca ----------

function Back({ onBack }: { onBack: () => void }) {
  return (
    <button className="btn ghost sm" style={{ marginBottom: 12 }} onClick={onBack}>
      ‹ Voltar
    </button>
  )
}

function HistoryList(p: { onBack: () => void; onOpen: (id: string) => void }) {
  const sessions = useStore((s) => s.sessions)
  const done = [...sessions].filter((s) => s.finishedAt).reverse()
  const rows = EXERCISE_LIST.map((def) => ({ def, h: history(sessions, def.id) })).filter((r) => r.h.length > 0)
  return (
    <>
      <Back onBack={p.onBack} />
      <h1>Cargas e histórico</h1>
      {rows.length === 0 && (
        <div className="card">
          <p className="muted">Ainda não há treinos registrados. Depois do primeiro, cada exercício aparece aqui com a evolução da carga.</p>
        </div>
      )}
      {rows.length > 0 && (
        <div className="card">
          {rows.map(({ def, h }) => {
            const last = h[h.length - 1]
            const first = h[0]
            const delta = def.load === 'kg' ? last.topKg - first.topKg : last.bestReps - first.bestReps
            return (
              <button className="exrow" key={def.id} onClick={() => p.onOpen(def.id)}>
                <span className="grow">
                  <span className="exname">{def.name}</span>
                  <span className="small muted">
                    {dm(last.date)} · {h.length} {h.length === 1 ? 'sessão' : 'sessões'}
                  </span>
                </span>
                <span className="num" style={{ textAlign: 'right' }}>
                  {setText(def, { kg: last.topKg, reps: last.bestReps })}
                  {h.length > 1 && delta !== 0 && (
                    <span className="small muted" style={{ display: 'block' }}>
                      {delta > 0 ? '▲ +' : '▼ '}
                      {def.load === 'kg' ? fmtKg(delta) : `${delta}`}
                    </span>
                  )}
                </span>
              </button>
            )
          })}
        </div>
      )}
      {done.length > 0 && (
        <>
          <h2>Treinos feitos</h2>
          <div className="card">
            {done.slice(0, 20).map((s) => (
              <div className="kv" key={s.id}>
                <span>
                  {dm(s.date)} · Treino {s.workout}
                </span>
                <b>
                  {s.entries.reduce((t, e) => t + e.sets.length, 0)} séries · {Math.round(((s.finishedAt ?? s.startedAt) - s.startedAt) / 60000)} min
                </b>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  )
}

function Library(p: { onBack: () => void; onOpen: (id: string) => void }) {
  return (
    <>
      <Back onBack={p.onBack} />
      <h1>Todos os exercícios</h1>
      <div className="card">
        {EXERCISE_LIST.map((def) => (
          <button className="exrow" key={def.id} onClick={() => p.onOpen(def.id)}>
            <span className="thumb">
              <Figure def={def.fig} label={def.name} />
            </span>
            <span className="grow">
              <span className="exname">{def.name}</span>
              <span className="small muted">{def.muscles}</span>
            </span>
            <span className="tag">{PURPOSES[def.purpose]}</span>
          </button>
        ))}
      </div>
    </>
  )
}

/** Evolução de um número ao longo das sessões (uma série só; os valores exatos estão na tabela abaixo). */
function Trend({ points, unit }: { points: { label: string; value: number }[]; unit: string }) {
  const W = 320
  const H = 110
  const pad = { l: 8, r: 44, t: 14, b: 20 }
  const vals = points.map((p) => p.value)
  const lo = Math.min(...vals)
  const hi = Math.max(...vals)
  const span = hi - lo || 1
  const x = (i: number) => pad.l + (points.length === 1 ? 0.5 : i / (points.length - 1)) * (W - pad.l - pad.r)
  const y = (v: number) => pad.t + (1 - (v - lo) / span) * (H - pad.t - pad.b)
  const last = points[points.length - 1]
  const f = (v: number) => `${String(Math.round(v * 10) / 10).replace('.', ',')}${unit}`
  return (
    <svg className="trend" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Evolução: de ${f(points[0].value)} para ${f(last.value)}`}>
      <line className="grid" x1={pad.l} y1={y(lo)} x2={W - pad.r} y2={y(lo)} />
      {hi !== lo && <line className="grid" x1={pad.l} y1={y(hi)} x2={W - pad.r} y2={y(hi)} />}
      <polyline className="line" points={points.map((p, i) => `${x(i)},${y(p.value)}`).join(' ')} />
      {points.map((p, i) => (
        <circle key={i} className={i === points.length - 1 ? 'dot end' : 'dot'} cx={x(i)} cy={y(p.value)} r={i === points.length - 1 ? 5 : 4}>
          <title>
            {p.label}: {f(p.value)}
          </title>
        </circle>
      ))}
      <text className="lbl strong" x={x(points.length - 1) + 9} y={y(last.value) + 4}>
        {f(last.value)}
      </text>
      <text className="lbl" x={pad.l} y={H - 5}>
        {points[0].label}
      </text>
      {points.length > 1 && (
        <text className="lbl" x={W - pad.r} y={H - 5} textAnchor="end">
          {last.label}
        </text>
      )}
    </svg>
  )
}

function ExerciseDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const sessions = useStore((s) => s.sessions)
  const def = EXERCISES[id]
  const h = history(sessions, id)
  const last = lastEntry(sessions, id)
  const kg = def.load === 'kg'
  return (
    <>
      <Back onBack={onBack} />
      <h1>{def.name}</h1>
      <div className="card">
        <div className="bigfig">
          <Figure def={def.fig} animate label={def.name} />
        </div>
        <div className="row">
          <p className="small muted grow">{def.muscles}</p>
          <span className="tag">{PURPOSES[def.purpose]}</span>
        </div>
        <ol className="cues">
          {def.cues.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ol>
        <p className="small">
          <b>Erro comum:</b> {def.mistake}
        </p>
        <p className="notice">O esquema mostra a posição inicial (apagada) e a final. É uma referência; se tiver dúvida na execução, peça para um professor da academia olhar.</p>
      </div>

      <h2>{kg ? 'Evolução da carga' : 'Evolução'}</h2>
      <div className="card">
        {h.length === 0 ? (
          <p className="muted">Ainda sem registros deste exercício.</p>
        ) : (
          <>
            {h.length > 1 && <Trend unit={kg ? ' kg' : def.unit === 's' ? ' s' : ''} points={h.map((x) => ({ label: dm(x.date), value: kg ? x.topKg : x.bestReps }))} />}
            {[...h].reverse().slice(0, 12).map((x) => (
              <div className="kv" key={x.date + x.sets.length}>
                <span className="num">{dm(x.date)}</span>
                <b className="small">{x.sets.map((s) => (kg ? `${String(s.kg).replace('.', ',')}×${s.reps}` : `${s.reps}`)).join(' · ')}</b>
              </div>
            ))}
            {kg && last && <p className="notice">Maior carga até hoje: {fmtKg(Math.max(...h.map((x) => x.topKg)))}. 1RM estimado: {fmtKg(Math.max(...h.map((x) => x.est)))}.</p>}
          </>
        )}
      </div>
    </>
  )
}
