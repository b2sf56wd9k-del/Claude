import { useRef, useState } from 'react'
import { toISO } from '../game'
import { useCloud } from '../cloud'
import { confirmDialog } from '../dialog'
import { inArtifact, use } from '../platform'
import { snapshot, useStore, type Data } from '../store'
import { CloudCard, StravaCard } from './Connections'

export default function Settings() {
  const { name, people, setProfile, replaceAll, reset } = useStore()
  const loggedIn = useCloud((c) => !!c.email)
  const [msg, setMsg] = useState('')
  const input = useRef<HTMLInputElement>(null)

  function exportBackup() {
    // as chaves do Strava não vão para o arquivo
    const { strava: _strava, ...data } = snapshot()
    const filename = `ascensao-backup-${toISO(new Date())}.json`
    if (inArtifact) {
      // dentro do artefato o arquivo sai pelo salvamento do próprio Claude
      void (async () => {
        const dl = await use('downloads')
        if (!dl) return setMsg('Salvar arquivos não está disponível nesta visualização.')
        try {
          await dl.save({ filename, data: JSON.stringify(data) })
          setMsg('Backup salvo.')
        } catch (e) {
          setMsg((e as { code?: string })?.code === 'declined' ? 'Backup cancelado.' : 'Não foi possível salvar o backup aqui.')
        }
      })()
      return
    }
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = filename
    a.click()
    URL.revokeObjectURL(a.href)
  }

  async function importBackup(file: File | undefined) {
    if (!file) return
    try {
      const d = JSON.parse(await file.text()) as Data
      if (!Array.isArray(d.quests) || !Array.isArray(d.events) || !Array.isArray(d.txs) || !Array.isArray(d.categories)) {
        throw new Error('formato')
      }
      if (!(await confirmDialog('Restaurar este backup substitui todos os dados atuais. Continuar?', 'Restaurar', true))) return
      replaceAll(d)
      setMsg('Backup restaurado.')
    } catch {
      setMsg('Este arquivo não é um backup válido.')
    }
  }

  return (
    <>
      <h1>Ajustes</h1>

      <div className="card">
        <div className="form">
          <label className="field full">
            Seu nome de jogador
            <input type="text" value={name} onChange={(e) => setProfile({ name: e.target.value })} />
          </label>
          <label className="field">
            Pessoa 1 (gastos)
            <input type="text" value={people[0]} onChange={(e) => setProfile({ people: [e.target.value, people[1]] })} />
          </label>
          <label className="field">
            Pessoa 2 (gastos)
            <input type="text" value={people[1]} onChange={(e) => setProfile({ people: [people[0], e.target.value] })} />
          </label>
        </div>
      </div>

      <h2>Nuvem e compartilhamento</h2>
      <CloudCard />

      <h2>Strava</h2>
      <StravaCard />

      <h2>Backup</h2>
      <div className="card">
        <p className="small muted">
          O backup guarda tudo em um arquivo, para você ter uma cópia fora do app.
        </p>
        <div className="row wrap" style={{ marginTop: 12 }}>
          <button className="btn" onClick={exportBackup}>
            Exportar backup
          </button>
          <button className="btn ghost" onClick={() => input.current?.click()}>
            Restaurar backup
          </button>
          <input ref={input} type="file" accept=".json" hidden onChange={(e) => importBackup(e.target.files?.[0])} />
        </div>
        {msg && <p className="notice">{msg}</p>}
      </div>

      <h2>Zona de perigo</h2>
      <div className="card">
        <button
          className="btn danger"
          disabled={loggedIn}
          onClick={async () => {
            if (await confirmDialog('Apagar todo o progresso, missões e lançamentos deste aparelho? Não dá para desfazer.', 'Apagar tudo', true)) reset()
          }}
        >
          Apagar tudo e recomeçar
        </button>
        {loggedIn && <p className="notice">{inArtifact ? 'Com os dados guardados na conta Claude, apagar tudo fica desativado para não apagar os gastos compartilhados.' : 'Saia da conta da nuvem antes de apagar: assim a limpeza vale só para este aparelho e não apaga os gastos compartilhados.'}</p>}
      </div>
    </>
  )
}
