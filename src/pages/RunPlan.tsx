import { useEffect, useRef, useState } from 'react'
import { toISO } from '../game'
import { use } from '../platform'
import { useStore } from '../store'
import { RUN_KINDS, sanitizeRuns, type PlannedRun, type RunKind } from '../workout/season'

const WEEK = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
const label = (iso: string) => `${WEEK[new Date(iso + 'T12:00:00').getDay()]} ${iso.slice(8, 10)}/${iso.slice(5, 7)}`

function RunRow(p: { run: PlannedRun; onChange: (r: PlannedRun) => void; onRemove: () => void }) {
  const r = p.run
  return (
    <div className="runrow">
      <div className="row">
        <b className="num grow">{label(r.date)}</b>
        <button className="btn ghost sm" aria-label={`Excluir corrida de ${label(r.date)}`} onClick={p.onRemove}>
          ×
        </button>
      </div>
      <div className="form" style={{ marginTop: 8 }}>
        <label className="field">
          Tipo
          <select value={r.kind} onChange={(e) => p.onChange({ ...r, kind: e.target.value as RunKind })}>
            {(Object.keys(RUN_KINDS) as RunKind[]).filter((k) => k !== 'descanso').map((k) => (
              <option key={k} value={k}>
                {RUN_KINDS[k].name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Km
          <input type="text" inputMode="decimal" defaultValue={r.km ?? ''} onBlur={(e) => p.onChange({ ...r, km: parseFloat(e.target.value.replace(',', '.')) || undefined })} />
        </label>
        <label className="field full">
          Treino
          <input type="text" defaultValue={r.title} onBlur={(e) => p.onChange({ ...r, title: e.target.value.trim() })} />
        </label>
      </div>
    </div>
  )
}

export default function RunPlan({ onBack }: { onBack: () => void }) {
  const { runPlan, saveRuns, removeRun } = useStore()
  const today = toISO(new Date())
  const [month, setMonth] = useState(today.slice(0, 7))
  const [draft, setDraft] = useState<PlannedRun[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [canRead, setCanRead] = useState(false)
  const [newDate, setNewDate] = useState(today)
  const input = useRef<HTMLInputElement>(null)
  const upcoming = runPlan.filter((r) => r.date >= today.slice(0, 8) + '01')

  // a leitura dos prints depende do Claude estar disponível nesta visualização, com envio de imagens
  useEffect(() => {
    void (async () => {
      const sample = await use('sample')
      const limits = sample ? await sample.limits().catch(() => null) : null
      setCanRead(!!limits?.images)
    })()
  }, [])

  async function read(files: FileList | null) {
    if (!files?.length) return
    setBusy(true)
    setMsg('')
    try {
      const sample = await use('sample')
      const raw = await sample.json(
        `As imagens são prints do plano de treinos de corrida que um treinador passou a um atleta (app Treinus ou parecido). ` +
          `Extraia cada treino de corrida com sua data. Mês de referência: ${month} (use-o quando o print mostrar só o dia do mês ou da semana). ` +
          `Classifique "kind" como: "tiro" (intervalado, tiros, fartlek, subidas), "ritmo" (tempo run, ritmo de prova, progressivo forte), ` +
          `"longo" (longão, o treino mais longo da semana), "prova" (competição) ou "leve" (rodagem, regenerativo, trote). ` +
          `"title" é um resumo curto do treino em português; "km" é a distância total em km se aparecer ou puder ser somada, senão omita. ` +
          `Não inclua dias de descanso nem treinos que não sejam de corrida, e não invente treinos que não estão nas imagens. ` +
          `Responda só com um array JSON, como: [{"date":"${month}-05","kind":"tiro","title":"8 x 400 m forte, 1 min de trote","km":8}]`,
        { images: files, cache: false },
      )
      const runs = sanitizeRuns(raw)
      if (runs.length === 0) setMsg('Não encontrei treinos de corrida nesses prints. Tente imagens mais nítidas ou cadastre abaixo.')
      else setDraft(runs)
    } catch (e) {
      const code = (e as { code?: string })?.code
      setMsg(
        code === 'not_granted' ? 'A leitura precisa da sua permissão para usar o Claude neste artefato.'
        : code === 'rate_limited' ? 'Muitas leituras seguidas. Espere um pouco e tente de novo.'
        : code === 'image_rejected' || code === 'images_unavailable' ? 'Não consegui usar essas imagens. Envie prints em PNG ou JPG.'
        : code === 'invalid_json' ? 'Não consegui entender os prints. Tente com menos imagens por vez.'
        : 'A leitura falhou agora. Tente de novo ou cadastre abaixo.',
      )
    }
    setBusy(false)
    if (input.current) input.current.value = ''
  }

  return (
    <>
      <button className="btn ghost sm" style={{ marginBottom: 12 }} onClick={onBack}>
        ‹ Voltar
      </button>
      <h1>Plano de corrida</h1>

      {draft ? (
        <>
          <div className="card">
            <p>Encontrei {draft.length} treino(s). Confira e corrija antes de salvar.</p>
            <p className="small muted" style={{ marginTop: 4 }}>
              A leitura é feita por IA a partir das imagens e pode errar datas ou tipos.
            </p>
            <div className="row wrap" style={{ marginTop: 12 }}>
              <button
                className="btn"
                onClick={() => {
                  saveRuns(draft)
                  setDraft(null)
                  setMsg(`${draft.length} treino(s) salvos no plano.`)
                }}
              >
                Salvar no plano
              </button>
              <button className="btn ghost" onClick={() => setDraft(null)}>
                Descartar
              </button>
            </div>
          </div>
          <div className="card">
            {draft.map((r, i) => (
              <RunRow key={r.date} run={r} onChange={(n) => setDraft(draft.map((x, j) => (j === i ? n : x)))} onRemove={() => setDraft(draft.filter((_, j) => j !== i))} />
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="card">
            <p className="small muted">
              Uma vez por mês, envie os prints dos treinos que seu treinador passou. O app usa o plano para encaixar a musculação: pernas pesadas longe da véspera dos
              tiros e do longão, e menos séries nas semanas de maior volume.
            </p>
            {canRead ? (
              <>
                <label className="field" style={{ marginTop: 12, maxWidth: 200 }}>
                  Mês dos prints
                  <input type="month" value={month} onChange={(e) => setMonth(e.target.value || today.slice(0, 7))} />
                </label>
                <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={(e) => read(e.target.files)} />
                <button className="btn" style={{ marginTop: 12 }} disabled={busy} onClick={() => input.current?.click()}>
                  {busy ? 'Lendo os prints…' : 'Enviar prints do plano'}
                </button>
              </>
            ) : (
              <p className="notice">A leitura automática dos prints só funciona com o app aberto pelo Claude, com sua permissão. Aqui você pode cadastrar os treinos à mão.</p>
            )}
            {msg && <p className="notice">{msg}</p>}
          </div>

          <h2>Treinos planejados · {upcoming.length}</h2>
          <div className="card">
            {upcoming.length === 0 && <p className="muted">Nenhum treino de corrida cadastrado para este mês em diante.</p>}
            {upcoming.map((r) => (
              <RunRow key={r.date + r.kind} run={r} onChange={(n) => saveRuns([n])} onRemove={() => removeRun(r.date)} />
            ))}
            <div className="row" style={{ marginTop: 12, alignItems: 'flex-end' }}>
              <label className="field grow">
                Adicionar corrida no dia
                <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
              </label>
              <button className="btn ghost" disabled={!/^\d{4}-\d{2}-\d{2}$/.test(newDate) || runPlan.some((r) => r.date === newDate)} onClick={() => saveRuns([{ date: newDate, kind: 'leve', title: '' }])}>
                Adicionar
              </button>
            </div>
          </div>
        </>
      )}
    </>
  )
}
