import { useEffect, useState } from 'react'
import { initArtifactCloud, initCloud, useCloud } from './cloud'
import { DialogHost } from './dialog'
import { inArtifact } from './platform'
import { finishStravaLogin, syncStrava, useStore } from './store'
import Status from './pages/Status'
import Quests from './pages/Quests'
import Health from './pages/Health'
import Workout from './pages/Workout'
import Finance from './pages/Finance'
import Settings from './pages/Settings'

const TABS = [
  { id: 'status', label: 'Status', el: <Status /> },
  { id: 'quests', label: 'Missões', el: <Quests /> },
  { id: 'workout', label: 'Treino', el: <Workout /> },
  { id: 'health', label: 'Saúde', el: <Health /> },
  { id: 'finance', label: 'Gastos', el: <Finance /> },
  { id: 'settings', label: 'Ajustes', el: <Settings /> },
]

if (inArtifact) void initArtifactCloud()
else initCloud()

/** Volta do login do Strava (?code=...) e leitura automática dos treinos, no máximo a cada 15 minutos. */
async function stravaStartup(): Promise<string | null> {
  const q = new URLSearchParams(location.search)
  let msg: string | null = null
  if (q.get('state') === 'strava') {
    history.replaceState(null, '', location.pathname)
    try {
      if (q.get('error') || !q.get('code')) throw new Error('Login no Strava cancelado.')
      if (!(q.get('scope') ?? '').includes('activity:read')) throw new Error('Marque a permissão de ver atividades ao autorizar o Strava.')
      await finishStravaLogin(q.get('code')!)
      msg = 'Strava conectado.'
    } catch (e) {
      msg = e instanceof Error ? e.message : 'Falha ao conectar o Strava.'
    }
  }
  const st = useStore.getState().strava
  if ((st?.refreshToken || st?.connector) && (!st.lastSync || Date.now() - Date.parse(st.lastSync) > 15 * 60000)) {
    try {
      const n = await syncStrava()
      if (n) msg = `${msg ? msg + ' ' : ''}${n} treino(s) do Strava contabilizado(s).`
    } catch (e) {
      msg ??= e instanceof Error ? e.message : null
    }
  }
  return msg
}

let started = false

export default function App() {
  const [tab, setTab] = useState('status')
  const [toast, setToast] = useState<string | null>(null)
  const loading = useCloud((c) => c.mode === 'artifact' && !c.ready)
  useEffect(() => {
    const run = () => void stravaStartup().then((m) => m && setToast(m))
    if (!started) {
      started = true
      run()
    }
    const onVisible = () => document.visibilityState === 'visible' && run()
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])
  return (
    <div className="app">
      <main>
        {loading && <p className="toast">Carregando seus dados salvos…</p>}
        {toast && (
          <button className="toast" onClick={() => setToast(null)}>
            {toast} ✕
          </button>
        )}
        {TABS.find((t) => t.id === tab)!.el}
      </main>
      <DialogHost />
      <nav className="tabs">
        {TABS.map((t) => (
          <button key={t.id} className={t.id === tab ? 'on' : ''} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  )
}
