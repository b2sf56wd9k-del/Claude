// Sincronização opcional com um projeto Supabase do próprio usuário.
// Dois documentos: "personal" (jogo, saúde, Strava — só do dono) e "finance" (gastos — dono + convidados).
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { create } from 'zustand'
import { useStore, type Data } from './store'

const CFG_KEY = 'ascensao-cloud'
const META_KEY = 'ascensao-cloud-meta'

export type Personal = Pick<Data, 'name' | 'startDate' | 'quests' | 'events' | 'health' | 'healthReady' | 'measurements' | 'strava'>
export type Finance = Pick<Data, 'people' | 'txs' | 'categories' | 'rules'>
type Kind = 'personal' | 'finance'

export const personalOf = (d: Data): Personal => ({
  name: d.name, startDate: d.startDate, quests: d.quests, events: d.events,
  health: d.health, healthReady: d.healthReady, measurements: d.measurements, strava: d.strava,
})
export const financeOf = (d: Data): Finance => ({ people: d.people, txs: d.txs, categories: d.categories, rules: d.rules })

/** Junta por chave: o que está neste aparelho vence; entra da nuvem só o que falta aqui. */
function union<T>(local: T[], remote: T[] | undefined, key: (x: T) => string | number): T[] {
  const have = new Set(local.map(key))
  return [...local, ...(remote ?? []).filter((x) => !have.has(key(x)))]
}

export function mergePersonal(local: Personal, remote: Partial<Personal>): Personal {
  return {
    ...local,
    startDate: remote.startDate && remote.startDate < local.startDate ? remote.startDate : local.startDate,
    quests: union(local.quests, remote.quests, (q) => q.id),
    events: union(local.events, remote.events, (e) => e.key),
    measurements: union(local.measurements, remote.measurements, (m) => m.date).sort((a, b) => (a.date < b.date ? -1 : 1)),
    healthReady: local.healthReady || !!remote.healthReady,
    health: local.healthReady || !remote.health ? local.health : remote.health,
    strava: local.strava ?? remote.strava ?? null,
  }
}

export function mergeFinance(local: Finance, remote: Partial<Finance>): Finance {
  return {
    people: local.people,
    txs: union(local.txs, remote.txs, (t) => t.id),
    categories: union(local.categories, remote.categories, (c) => c.id),
    rules: union(local.rules, remote.rules, (r) => r.pattern),
  }
}

// ---------- estado da conexão ----------

interface Cfg {
  url: string
  anonKey: string
}
interface Meta {
  seen: Partial<Record<Kind, string>>
  dirty: Record<Kind, boolean>
}

interface CloudState {
  configured: boolean
  email: string | null
  status: 'off' | 'idle' | 'syncing' | 'error'
  error: string | null
  lastSync: string | null
  /** este usuário é o dono do documento de gastos (pessoa 1) */
  financeOwner: boolean
  members: string[]
}

export const useCloud = create<CloudState>(() => ({
  configured: false, email: null, status: 'off', error: null, lastSync: null, financeOwner: true, members: [],
}))

let client: SupabaseClient | null = null
let uid: string | null = null
let financeId: string | null = null
let applying = false
let running = false
let again = false
let timer: ReturnType<typeof setTimeout> | undefined

const read = <T,>(k: string): T | null => {
  try {
    return JSON.parse(localStorage.getItem(k) ?? 'null')
  } catch {
    return null
  }
}
const write = (k: string, v: unknown) => {
  try {
    localStorage.setItem(k, JSON.stringify(v))
  } catch {
    /* armazenamento indisponível: a sincronização continua valendo só nesta sessão */
  }
}

let meta: Meta = read<Meta>(META_KEY) ?? { seen: {}, dirty: { personal: false, finance: false } }
const saveMeta = () => write(META_KEY, meta)

export const getConfig = () => read<Cfg>(CFG_KEY)

function schedule(ms = 3000) {
  clearTimeout(timer)
  timer = setTimeout(() => void sync(), ms)
}

// Marca como "pendente de envio" a parte que mudou neste aparelho.
useStore.subscribe((s, prev) => {
  if (applying || !uid) return
  const changed = (keys: (keyof Data)[]) => keys.some((k) => s[k] !== prev[k])
  const p = changed(['name', 'startDate', 'quests', 'events', 'health', 'healthReady', 'measurements', 'strava'])
  const f = changed(['people', 'txs', 'categories', 'rules'])
  if (!p && !f) return
  if (p) meta.dirty.personal = true
  if (f) meta.dirty.finance = true
  saveMeta()
  schedule()
})

async function onSession(userId: string | null, email: string | null) {
  if (userId === uid) return
  uid = userId
  financeId = null
  if (!userId) {
    meta = { seen: {}, dirty: { personal: false, finance: false } }
    saveMeta()
    useCloud.setState({ email: null, status: 'idle', error: null, members: [], financeOwner: true })
    return
  }
  // Primeiro acesso neste aparelho: o que já existe aqui precisa ser preservado e enviado.
  if (!meta.seen.personal && !meta.seen.finance) {
    const s = useStore.getState()
    meta.dirty = { personal: s.events.length > 0 || s.measurements.length > 0 || s.healthReady, finance: s.txs.length > 0 }
    saveMeta()
  }
  useCloud.setState({ email })
  await sync()
}

export function initCloud() {
  const cfg = getConfig()
  if (!cfg) return
  try {
    client = createClient(cfg.url, cfg.anonKey)
  } catch {
    useCloud.setState({ configured: false, status: 'error', error: 'Endereço ou chave do Supabase inválidos.' })
    return
  }
  useCloud.setState({ configured: true, status: 'idle', error: null })
  client.auth.onAuthStateChange((_e, session) => {
    // fora do callback, como a biblioteca recomenda, para não travar outras chamadas de autenticação
    setTimeout(() => void onSession(session?.user.id ?? null, session?.user.email ?? null), 0)
  })
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && schedule(500))
  setInterval(() => document.visibilityState === 'visible' && void sync(), 60000)
}

export function configure(url: string, anonKey: string) {
  write(CFG_KEY, { url: url.trim().replace(/\/+$/, ''), anonKey: anonKey.trim() })
  location.reload()
}

export function disconnect() {
  localStorage.removeItem(CFG_KEY)
  localStorage.removeItem(META_KEY)
  location.reload()
}

const friendly = (msg: string) =>
  /invalid login/i.test(msg) ? 'E-mail ou senha incorretos.'
  : /already registered/i.test(msg) ? 'Este e-mail já tem conta: use Entrar.'
  : /not confirmed/i.test(msg) ? 'Confirme o e-mail pelo link que o Supabase enviou e entre de novo.'
  : /password/i.test(msg) ? 'A senha precisa ter pelo menos 6 caracteres.'
  : /fetch|network/i.test(msg) ? 'Sem conexão com o Supabase. Confira o endereço do projeto e a internet.'
  : msg

export async function signIn(email: string, password: string, createAccount: boolean): Promise<string | null> {
  if (!client) return 'Configure o Supabase primeiro.'
  const cred = { email: email.trim().toLowerCase(), password }
  const { data, error } = createAccount ? await client.auth.signUp(cred) : await client.auth.signInWithPassword(cred)
  if (error) return friendly(error.message)
  if (createAccount && !data.session) return 'Conta criada. Confirme o e-mail pelo link enviado e depois toque em Entrar.'
  return null
}

export async function signOut() {
  await client?.auth.signOut()
}

/** Dá (ou tira) acesso aos gastos para outro e-mail. Só o dono do documento pode. */
export async function shareFinance(email: string): Promise<string | null> {
  if (!client || !uid || !financeId) return 'Entre na conta e aguarde a primeira sincronização.'
  if (!useCloud.getState().financeOwner) return 'Só quem criou os gastos pode alterar o compartilhamento.'
  const members = email.trim() ? [email.trim().toLowerCase()] : []
  const { error } = await client.from('docs').update({ members }).eq('id', financeId)
  if (error) return friendly(error.message)
  useCloud.setState({ members })
  return null
}

function apply(patch: Partial<Data>) {
  applying = true
  try {
    useStore.setState(patch)
  } finally {
    applying = false
  }
}

async function syncDoc(kind: Kind, id: string) {
  const db = client!
  const slice = () => (kind === 'personal' ? personalOf(useStore.getState()) : financeOf(useStore.getState()))
  const { data: remote, error } = await db.from('docs').select('data, updated_at, owner, members').eq('id', id).maybeSingle()
  if (error) throw new Error(error.message)

  if (remote && remote.updated_at !== meta.seen[kind]) {
    // A nuvem mudou desde a última vez: sem pendências locais ela substitui; com pendências, junta.
    const next = !meta.dirty[kind]
      ? remote.data
      : kind === 'personal'
        ? mergePersonal(slice() as Personal, remote.data)
        : mergeFinance(slice() as Finance, remote.data)
    apply(next)
    meta.seen[kind] = remote.updated_at
    saveMeta()
  }
  if (kind === 'finance' && remote) useCloud.setState({ financeOwner: remote.owner === uid, members: remote.members ?? [] })

  if (meta.dirty[kind] || !remote) {
    const updated_at = new Date().toISOString()
    meta.dirty[kind] = false
    const res = remote
      ? await db.from('docs').update({ data: slice(), updated_at }).eq('id', id)
      : await db.from('docs').insert({ id, data: slice(), updated_at })
    if (res.error) {
      meta.dirty[kind] = true
      saveMeta()
      throw new Error(res.error.message)
    }
    meta.seen[kind] = updated_at
    saveMeta()
  }
}

export async function sync() {
  if (!client || !uid) return
  if (running) {
    again = true
    return
  }
  running = true
  useCloud.setState({ status: 'syncing' })
  try {
    if (!financeId) {
      // Se alguém compartilhou os gastos comigo, uso o documento dessa pessoa; senão, o meu.
      const { data, error } = await client.from('docs').select('id, owner').like('id', 'finance:%')
      if (error) throw new Error(error.message)
      const shared = data?.find((d) => d.owner !== uid)
      financeId = shared?.id ?? `finance:${uid}`
    }
    const fid = financeId ?? `finance:${uid}`
    await syncDoc('personal', `personal:${uid}`)
    await syncDoc('finance', fid)
    useCloud.setState({ status: 'idle', error: null, lastSync: new Date().toISOString() })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    useCloud.setState({
      status: 'error',
      error: /relation .*docs.* does not exist|schema cache/i.test(msg) ? 'A tabela ainda não existe: rode o arquivo supabase/schema.sql no SQL Editor do Supabase.' : friendly(msg),
    })
  } finally {
    running = false
    if (again) {
      again = false
      schedule(500)
    }
  }
}
