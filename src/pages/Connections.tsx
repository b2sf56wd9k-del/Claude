import { useState } from 'react'
import { configure, disconnect, getConfig, shareFinance, signIn, signOut, sync, useCloud } from '../cloud'
import { authorizeUrl, redirectUri } from '../strava'
import { syncStrava, useStore } from '../store'

const when = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'nunca'

export function CloudCard() {
  const cloud = useCloud()
  const cfg = getConfig()
  const [url, setUrl] = useState(cfg?.url ?? '')
  const [key, setKey] = useState(cfg?.anonKey ?? '')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [partner, setPartner] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  const login = async (create: boolean) => {
    setBusy(true)
    setMsg((await signIn(email, password, create)) ?? '')
    setBusy(false)
  }

  if (!cloud.configured) {
    return (
      <div className="card">
        <p className="small muted">
          Para usar em mais de um aparelho e dividir os gastos, conecte um projeto Supabase (gratuito). Cole aqui o endereço do projeto e a chave pública
          ("anon" ou "publishable").
        </p>
        <div className="form" style={{ marginTop: 12 }}>
          <label className="field full">
            Endereço do projeto
            <input type="text" placeholder="https://xxxx.supabase.co" value={url} onChange={(e) => setUrl(e.target.value)} />
          </label>
          <label className="field full">
            Chave pública
            <input type="text" value={key} onChange={(e) => setKey(e.target.value)} />
          </label>
        </div>
        <button className="btn" style={{ marginTop: 12 }} disabled={!/^https:\/\/.+/.test(url.trim()) || key.trim().length < 20} onClick={() => configure(url, key)}>
          Conectar
        </button>
        {cloud.error && <p className="notice">{cloud.error}</p>}
      </div>
    )
  }

  if (!cloud.email) {
    return (
      <div className="card">
        <div className="form">
          <label className="field full">
            E-mail
            <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="field full">
            Senha
            <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
        </div>
        <div className="row wrap" style={{ marginTop: 12 }}>
          <button className="btn" disabled={busy || !email || password.length < 6} onClick={() => login(false)}>
            Entrar
          </button>
          <button className="btn ghost" disabled={busy || !email || password.length < 6} onClick={() => login(true)}>
            Criar conta
          </button>
          <button className="btn ghost" onClick={() => confirm('Desconectar este aparelho do Supabase? Os dados locais continuam aqui.') && disconnect()}>
            Trocar projeto
          </button>
        </div>
        {msg && <p className="notice">{msg}</p>}
      </div>
    )
  }

  return (
    <div className="card">
      <p>
        <span className={`status-dot ${cloud.status !== 'error' ? 'on' : ''}`} />
        {cloud.email}
      </p>
      <p className="small muted" style={{ marginTop: 4 }}>
        {cloud.status === 'syncing' ? 'Sincronizando…' : cloud.status === 'error' ? `Erro: ${cloud.error}` : `Sincronizado em ${when(cloud.lastSync)}`}
      </p>
      {cloud.financeOwner ? (
        <>
          <label className="field" style={{ marginTop: 12 }}>
            Dividir os gastos com (e-mail da conta da outra pessoa)
            <input type="email" placeholder={cloud.members[0] ?? 'email@exemplo.com'} value={partner} onChange={(e) => setPartner(e.target.value)} />
          </label>
          <p className="small muted" style={{ marginTop: 4 }}>
            {cloud.members.length ? `Compartilhado com ${cloud.members.join(', ')}.` : 'Ainda não compartilhado.'} Só os gastos são divididos; missões e saúde ficam
            só na sua conta.
          </p>
        </>
      ) : (
        <p className="small muted" style={{ marginTop: 12 }}>
          Você está usando os gastos compartilhados pela outra conta.
        </p>
      )}
      <div className="row wrap" style={{ marginTop: 12 }}>
        {cloud.financeOwner && (
          <button
            className="btn"
            disabled={busy || (!partner.trim() && cloud.members.length === 0)}
            onClick={async () => {
              setBusy(true)
              setMsg((await shareFinance(partner)) ?? (partner.trim() ? 'Compartilhado.' : 'Compartilhamento removido.'))
              setPartner('')
              setBusy(false)
            }}
          >
            {partner.trim() || cloud.members.length === 0 ? 'Compartilhar' : 'Parar de compartilhar'}
          </button>
        )}
        <button className="btn ghost" onClick={() => void sync()}>
          Sincronizar agora
        </button>
        <button className="btn ghost" onClick={() => void signOut()}>
          Sair
        </button>
      </div>
      {msg && <p className="notice">{msg}</p>}
    </div>
  )
}

export function StravaCard() {
  const strava = useStore((s) => s.strava)
  const setStrava = useStore((s) => s.setStrava)
  const [id, setId] = useState(strava?.clientId ?? '')
  const [secret, setSecret] = useState(strava?.clientSecret ?? '')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  if (strava?.refreshToken) {
    return (
      <div className="card">
        <p>
          <span className="status-dot on" />
          Conectado{strava.athlete ? ` como ${strava.athlete}` : ''}
        </p>
        <p className="small muted" style={{ marginTop: 4 }}>
          Última leitura: {when(strava.lastSync)}. Corridas concluem a missão de corrida; musculação, Crossfit e HIIT concluem a de força. Com o Strava ligado, não
          marque esses treinos à mão para não contar em dobro.
        </p>
        <div className="row wrap" style={{ marginTop: 12 }}>
          <button
            className="btn"
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              try {
                const n = await syncStrava()
                setMsg(n ? `${n} treino(s) novo(s) contabilizado(s).` : 'Nenhum treino novo.')
              } catch (e) {
                setMsg(e instanceof Error ? e.message : 'Falha ao ler o Strava.')
              }
              setBusy(false)
            }}
          >
            Buscar treinos agora
          </button>
          <button className="btn ghost" onClick={() => confirm('Desconectar o Strava?') && setStrava(null)}>
            Desconectar
          </button>
        </div>
        {msg && <p className="notice">{msg}</p>}
      </div>
    )
  }

  return (
    <div className="card">
      <p className="small muted">
        Crie um aplicativo em strava.com/settings/api e, em "Authorization Callback Domain", informe <b>{location.hostname}</b>. Depois cole aqui o Client ID e o Client
        Secret.
      </p>
      <div className="form" style={{ marginTop: 12 }}>
        <label className="field">
          Client ID
          <input type="text" inputMode="numeric" value={id} onChange={(e) => setId(e.target.value)} />
        </label>
        <label className="field">
          Client Secret
          <input type="password" autoComplete="off" value={secret} onChange={(e) => setSecret(e.target.value)} />
        </label>
      </div>
      <button
        className="btn"
        style={{ marginTop: 12 }}
        disabled={!/^\d+$/.test(id.trim()) || secret.trim().length < 20}
        onClick={() => {
          setStrava({ clientId: id.trim(), clientSecret: secret.trim(), seen: [] })
          location.href = authorizeUrl(id.trim())
        }}
      >
        Conectar ao Strava
      </button>
      <p className="notice">O Strava vai devolver você para {redirectUri()}</p>
    </div>
  )
}
