import { useState } from 'react'
import { questCount, toISO } from '../game'
import { GOALS, PURPOSES, assess, composition, strengthPlan, targets, weekLayout, type Goal, type HealthProfile, type Measurement, type Sex } from '../health'
import { MEASURE_XP, latestMeasurement, useStore } from '../store'

const num = (s: string) => {
  const n = parseFloat(s.replace(',', '.'))
  return isFinite(n) && n > 0 ? n : undefined
}
const fmt = (n: number | null | undefined, unit = '') => (n == null ? '—' : `${String(n).replace('.', ',')}${unit}`)

export default function Health() {
  const { health, healthReady, measurements, quests, events, saveHealth, addMeasurement, removeMeasurement, advance } = useStore()
  const [editing, setEditing] = useState(!healthReady)
  const today = toISO(new Date())
  const last = latestMeasurement(measurements)
  const comp = last ? composition(health, last) : null
  const tg = last ? targets(health, last, new Date().getFullYear()) : null
  const findings = assess(health, measurements)
  const plan = strengthPlan(health.goal, health.strengthDays)
  const forca = quests.find((q) => q.id === 'forca')
  const done = forca ? questCount(events, forca, today) : 0

  return (
    <>
      <h1>Saúde</h1>

      {editing ? (
        <ProfileForm
          initial={health}
          onSave={(p) => {
            saveHealth(p)
            setEditing(false)
          }}
          onCancel={healthReady ? () => setEditing(false) : undefined}
        />
      ) : (
        <div className="card">
          <div className="row">
            <div className="grow">
              <p>{GOALS.find((g) => g.id === health.goal)!.name}</p>
              <p className="small muted">
                Corrida {health.runDays}x · Musculação {health.strengthDays ? `${health.strengthDays}x` : 'não'} por semana
              </p>
            </div>
            <button className="btn ghost sm" onClick={() => setEditing(true)}>
              Alterar
            </button>
          </div>
        </div>
      )}

      <h2>Composição corporal</h2>
      <div className="card">
        {!comp || !last ? (
          <p className="muted">Registre sua primeira medição abaixo para liberar a avaliação e as metas de alimentação.</p>
        ) : (
          <>
            <div className="kv">
              <span>Peso</span>
              <b>{fmt(last.weightKg, ' kg')}</b>
            </div>
            <div className="kv">
              <span>IMC</span>
              <b>{fmt(comp.bmi)}</b>
            </div>
            <div className="kv">
              <span>Gordura corporal{comp.source ? ` (${comp.source})` : ''}</span>
              <b>{comp.bodyFatPct == null ? '—' : `${fmt(comp.bodyFatPct, '%')} · ${comp.category}`}</b>
            </div>
            <div className="kv">
              <span>Massa magra</span>
              <b>{fmt(comp.leanKg, ' kg')}</b>
            </div>
            <div className="kv">
              <span>Massa gorda</span>
              <b>{fmt(comp.fatKg, ' kg')}</b>
            </div>
            {comp.bodyFatPct == null && (
              <p className="notice">Informe cintura e pescoço{health.sex === 'f' ? ' e quadril' : ''} (ou o % de uma bioimpedância) para calcular gordura e massa magra.</p>
            )}
          </>
        )}
        {findings.length > 0 && (
          <div style={{ marginTop: 12 }}>
            {findings.map((f, i) => (
              <div className={`finding ${f.ok ? 'ok' : 'bad'}`} key={i}>
                <span className="ic">{f.ok ? '✓' : '!'}</span>
                <span>{f.text}</span>
              </div>
            ))}
          </div>
        )}
        {measurements.length === 1 && <p className="notice">A avaliação da evolução aparece a partir da segunda medição, com pelo menos uma semana de intervalo.</p>}
      </div>

      <MeasureForm sex={health.sex} today={today} onAdd={addMeasurement} />

      {measurements.length > 0 && (
        <div className="card">
          {[...measurements].reverse().slice(0, 8).map((m) => {
            const c = composition(health, m)
            return (
              <div className="kv" key={m.date}>
                <span className="num">
                  {m.date.slice(8)}/{m.date.slice(5, 7)}/{m.date.slice(2, 4)}
                </span>
                <span className="row" style={{ gap: 8 }}>
                  <b>
                    {fmt(m.weightKg, ' kg')}
                    {c.bodyFatPct != null ? ` · ${fmt(c.bodyFatPct, '%')}` : ''}
                  </b>
                  <button className="btn ghost sm" aria-label={`Excluir medição de ${m.date}`} onClick={() => confirm('Excluir esta medição?') && removeMeasurement(m.date)}>
                    ×
                  </button>
                </span>
              </div>
            )
          })}
        </div>
      )}

      <h2>Alimentação</h2>
      <div className="card">
        {!tg ? (
          <p className="muted">As metas aparecem depois da primeira medição.</p>
        ) : (
          <>
            <div className="kv">
              <span>Meta diária</span>
              <b>{tg.kcal.toLocaleString('pt-BR')} kcal</b>
            </div>
            <div className="kv">
              <span className="muted small">Gasto estimado {tg.tdee.toLocaleString('pt-BR')} kcal · basal {tg.bmr.toLocaleString('pt-BR')} kcal</span>
            </div>
            <div className="macros">
              <div>
                <b>{tg.proteinG} g</b>
                <span>proteína</span>
              </div>
              <div>
                <b>{tg.carbsG} g</b>
                <span>carboidrato</span>
              </div>
              <div>
                <b>{tg.fatG} g</b>
                <span>gordura</span>
              </div>
            </div>
            <ul className="tips">
              <li>Água: cerca de {fmt(tg.waterL, ' L')} por dia, mais 500 ml por hora de treino.</li>
              <li>Divida a proteína em 3 a 4 refeições de {Math.round(tg.proteinG / 4 / 5) * 5}–{Math.round(tg.proteinG / 3 / 5) * 5} g.</li>
              <li>Concentre carboidrato antes e depois das corridas; no dia do longão, pode passar da meta.</li>
              {health.goal === 'emagrecer' && <li>Não faça déficit em dia de tiro ou longão: compense nos dias de descanso.</li>}
            </ul>
            <p className="notice">Valores estimados por fórmulas a partir do seu peso, altura, idade e treinos. São um ponto de partida; não substituem nutricionista ou médico.</p>
          </>
        )}
      </div>

      <h2>Musculação{plan ? ` · ${done}/${health.strengthDays} na semana` : ''}</h2>
      {!plan ? (
        <div className="card">
          <p className="muted">Musculação desativada. Toque em Alterar, no topo, para escolher 2 ou 3 vezes por semana.</p>
        </div>
      ) : (
        <>
          <div className="card">
            <p className="small">{plan.summary}</p>
            <ul className="tips">
              {plan.principles.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
            <p className="notice">Semana sugerida: {weekLayout(health.runDays, health.strengthDays)}</p>
            <ul className="tips">
              {plan.tips.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </div>
          {plan.workouts.map((w) => (
            <div className="card workout" key={w.name}>
              <div className="row" style={{ marginBottom: 8 }}>
                <div className="grow">
                  <h3>{w.name}</h3>
                  <p className="small muted">{w.focus}</p>
                </div>
                <button className="btn sm" disabled={done >= health.strengthDays} onClick={() => advance('forca')}>
                  Treino feito
                </button>
              </div>
              {w.exercises.map((e) => (
                <div className="ex" key={e.name}>
                  <span>
                    {e.name} <span className="tag">{PURPOSES[e.purpose]}</span>
                    {e.note && <span className="muted small"> — {e.note}</span>}
                  </span>
                  <b>{e.sets}</b>
                </div>
              ))}
            </div>
          ))}
          <details className="card">
            <summary>Base científica do plano</summary>
            {plan.studies.map((st) => (
              <div className="study" key={st.ref}>
                <p className="small">{st.finding}</p>
                <p className="small muted">{st.ref}</p>
              </div>
            ))}
            <p className="notice">O plano aplica as conclusões desses estudos; a escolha exata de exercícios e a divisão dos dias são minhas, não saíram prontas de um estudo.</p>
          </details>
        </>
      )}
    </>
  )
}

function ProfileForm(p: { initial: HealthProfile; onSave: (h: HealthProfile) => void; onCancel?: () => void }) {
  const [h, setH] = useState(p.initial)
  const [birth, setBirth] = useState(String(p.initial.birthYear))
  const [height, setHeight] = useState(String(p.initial.heightCm))
  const by = Math.round(num(birth) ?? 0)
  const ht = num(height) ?? 0
  const valid = by >= 1920 && by <= new Date().getFullYear() - 10 && ht >= 120 && ht <= 230
  return (
    <div className="card">
      <div className="form">
        <label className="field">
          Sexo
          <select value={h.sex} onChange={(e) => setH({ ...h, sex: e.target.value as Sex })}>
            <option value="m">Masculino</option>
            <option value="f">Feminino</option>
          </select>
        </label>
        <label className="field">
          Ano de nascimento
          <input type="number" value={birth} onChange={(e) => setBirth(e.target.value)} />
        </label>
        <label className="field">
          Altura (cm)
          <input type="number" value={height} onChange={(e) => setHeight(e.target.value)} />
        </label>
        <label className="field">
          Corridas por semana
          <select value={h.runDays} onChange={(e) => setH({ ...h, runDays: +e.target.value })}>
            {[0, 1, 2, 3, 4, 5, 6].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label className="field full">
          Objetivo
          <select value={h.goal} onChange={(e) => setH({ ...h, goal: e.target.value as Goal })}>
            {GOALS.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field full">
          Musculação por semana
          <select value={h.strengthDays} onChange={(e) => setH({ ...h, strengthDays: +e.target.value as 0 | 2 | 3 })}>
            <option value={0}>Não faço por enquanto</option>
            <option value={2}>2 vezes</option>
            <option value={3}>3 vezes</option>
          </select>
        </label>
      </div>
      <div className="row" style={{ marginTop: 16 }}>
        <button className="btn" disabled={!valid} onClick={() => p.onSave({ ...h, birthYear: by, heightCm: ht })}>
          Salvar
        </button>
        {p.onCancel && (
          <button className="btn ghost" onClick={p.onCancel}>
            Cancelar
          </button>
        )}
      </div>
    </div>
  )
}

function MeasureForm(p: { sex: Sex; today: string; onAdd: (m: Measurement) => void }) {
  const [open, setOpen] = useState(false)
  const [f, setF] = useState({ date: p.today, weight: '', bf: '', waist: '', neck: '', hip: '' })
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value })
  const weight = num(f.weight)
  const valid = !!weight && weight >= 30 && weight <= 300 && /^\d{4}-\d{2}-\d{2}$/.test(f.date) && f.date <= p.today

  if (!open) {
    return (
      <button className="btn" style={{ margin: '12px 0' }} onClick={() => setOpen(true)}>
        Nova medição
      </button>
    )
  }
  return (
    <div className="card" style={{ margin: '12px 0' }}>
      <div className="form">
        <label className="field">
          Data
          <input type="text" inputMode="numeric" value={f.date} onChange={set('date')} placeholder="AAAA-MM-DD" />
        </label>
        <label className="field">
          Peso (kg)
          <input type="text" inputMode="decimal" value={f.weight} onChange={set('weight')} autoFocus />
        </label>
        <label className="field">
          Cintura (cm)
          <input type="text" inputMode="decimal" value={f.waist} onChange={set('waist')} />
        </label>
        <label className="field">
          Pescoço (cm)
          <input type="text" inputMode="decimal" value={f.neck} onChange={set('neck')} />
        </label>
        {p.sex === 'f' && (
          <label className="field">
            Quadril (cm)
            <input type="text" inputMode="decimal" value={f.hip} onChange={set('hip')} />
          </label>
        )}
        <label className="field">
          % de gordura (se tiver)
          <input type="text" inputMode="decimal" value={f.bf} onChange={set('bf')} />
        </label>
      </div>
      <p className="notice">
        Meça em jejum, sempre no mesmo horário. Cintura na altura do umbigo. A primeira medição de cada semana vale +{MEASURE_XP} XP.
      </p>
      <div className="row" style={{ marginTop: 12 }}>
        <button
          className="btn"
          disabled={!valid}
          onClick={() => {
            p.onAdd({ date: f.date, weightKg: weight!, bodyFatPct: num(f.bf), waistCm: num(f.waist), neckCm: num(f.neck), hipCm: num(f.hip) })
            setOpen(false)
            setF({ date: p.today, weight: '', bf: '', waist: '', neck: '', hip: '' })
          }}
        >
          Salvar medição
        </button>
        <button className="btn ghost" onClick={() => setOpen(false)}>
          Cancelar
        </button>
      </div>
    </div>
  )
}
