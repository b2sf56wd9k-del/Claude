// Sincronização opcional com um projeto Supabase do próprio usuário.
// Dois documentos: "personal" (jogo, saúde, Strava — só do dono) e "finance" (gastos — dono + convidados).
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { create } from 'zustand'
import { use } from './platform'
import { useStore, type Data } from './store'

const CFG_KEY = 'ascensao-cloud'
const META_KEY = 'ascensao-cloud-meta'

export type Personal = Pick<Data, 'name' | 'startDate' | 'quests' | 'events' | 'health' | 'healthReady' | 'measurements' | 'strava' | 'sessions' | 'activeSession'>
export type Finance = Pick<Data, 'people' | 'txs' | 'categories' | 'rules'>
type Kind = 'personal' | 'finance'

export const personalOf = (d: Data): Personal => ({
  name: d.name, startDate: d.startDate, quests: d.quests, events: d.events,
  health: d.health, healthReady: d.healthReady, measurements: d.measurements, strava: d.strava,
  sessions: d.sessions, activeSession: d.activeSession,
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
    sessions: union(local.sessions, remote.sessions, (s) => s.id).sort((a, b) => a.startedAt - b.startedAt),
    activeSession: local.activeSession ?? remote.activeSession ?? null,
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
  /** onde os dados ficam: projeto Supabase ou banco do próprio artefato */
  mode: 'supabase' | 'artifact'
  /** primeira sincronização concluída (ou falhou) */
  ready: boolean
  /** dados pessoais sincronizam (falso para convidados sem identidade no artefato) */
  personal: boolean
  /** pode gravar os gastos compartilhados */
  canWrite: boolean
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
  mode: 'supabase', ready: false, personal: true, canWrite: true,
  configured: false, email: null, status: 'off', error: null, lastSync: null, financeOwner: true, members: [],
}))

let client: SupabaseClient | null = null

interface Remote {
  data: Partial<Personal & Finance>
  stamp: string
}
/** Onde os documentos ficam guardados. */
interface Backend {
  /** resolve o que for preciso antes de sincronizar */
  prepare(): Promise<void>
  enabled(kind: Kind): boolean
  load(kind: Kind): Promise<Remote | null>
  save(kind: Kind, data: Personal | Finance, stamp: string, exists: boolean): Promise<void>
}
let backend: Backend | null = null
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
  const p = changed(['name', 'startDate', 'quests', 'events', 'health', 'healthReady', 'measurements', 'strava', 'sessions', 'activeSession'])
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
    backend = null
    useCloud.setState({ email: null, status: 'idle', error: null, members: [], financeOwner: true })
    return
  }
  backend = supabaseBackend
  markFirstAccess()
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
  keepInSync()
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

const supabaseBackend: Backend = {
  async prepare() {
    if (financeId) return
    // Se alguém compartilhou os gastos comigo, uso o documento dessa pessoa; senão, o meu.
    const { data, error } = await client!.from('docs').select('id, owner').like('id', 'finance:%')
    if (error) throw new Error(error.message)
    financeId = data?.find((d) => d.owner !== uid)?.id ?? `finance:${uid}`
  },
  enabled: () => true,
  async load(kind) {
    const id = kind === 'personal' ? `personal:${uid}` : financeId!
    const { data: remote, error } = await client!.from('docs').select('data, updated_at, owner, members').eq('id', id).maybeSingle()
    if (error) throw new Error(error.message)
    if (!remote) return null
    if (kind === 'finance') useCloud.setState({ financeOwner: remote.owner === uid, members: remote.members ?? [] })
    return { data: remote.data, stamp: remote.updated_at }
  },
  async save(kind, data, stamp, exists) {
    const id = kind === 'personal' ? `personal:${uid}` : financeId!
    const res = exists
      ? await client!.from('docs').update({ data, updated_at: stamp }).eq('id', id)
      : await client!.from('docs').insert({ id, data, updated_at: stamp })
    if (res.error) throw new Error(res.error.message)
  },
}

/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Banco do artefato. Cada parte vira um documento-base mais um documento por mês
 * (eventos de XP ou lançamentos), para nenhum passar do limite de tamanho.
 *   data/users/<id>/base, data/users/<id>/ev-AAAA-MM   pessoal, privado de cada pessoa
 *   finance/config, finance/tx-AAAA-MM                 gastos, compartilhados
 */
function artifactBackend(db: any, myId: string | null, canWrite: boolean): Backend {
  const written = new Map<string, string>()
  // listas que crescem com o tempo, cada uma dividida em um documento por mês
  const spec = {
    personal: { col: () => `data/users/${myId}`, base: 'base', lists: [['events', 'ev-'], ['sessions', 'se-']] },
    finance: { col: () => 'finance', base: 'config', lists: [['txs', 'tx-']] },
  } as const
  const put = async (path: string, body: unknown) => {
    const json = JSON.stringify(body)
    if (written.get(path) === json) return
    await db.doc(path).set(JSON.parse(json))
    written.set(path, json)
  }
  return {
    async prepare() {},
    enabled: (kind) => (kind === 'personal' ? !!myId : canWrite),
    async load(kind) {
      const sp = spec[kind]
      const snap = await db.collection(sp.col()).limit(1000).get()
      let base: any = null
      const out: Record<string, any[]> = Object.fromEntries(sp.lists.map(([key]) => [key, []]))
      for (const d of [...snap.docs].sort((a: any, b: any) => (a.id < b.id ? -1 : 1))) {
        const body = JSON.parse(JSON.stringify(d.data() ?? {}))
        written.set(`${sp.col()}/${d.id}`, JSON.stringify(body))
        if (d.id === sp.base) base = body
        for (const [key, prefix] of sp.lists) if (d.id.startsWith(prefix)) out[key].push(...(body[key] ?? []))
      }
      if (!base) return null
      const { stamp, ...rest } = base
      return { data: { ...rest, ...out }, stamp }
    },
    async save(kind, data, stamp) {
      const sp = spec[kind]
      const rest: any = { ...(data as any) }
      for (const [key, prefix] of sp.lists) {
        const months = new Map<string, any[]>()
        for (const it of (rest[key] ?? []) as any[]) {
          const m = String(it.date).slice(0, 7)
          months.set(m, [...(months.get(m) ?? []), it])
        }
        delete rest[key]
        // meses que existiam e ficaram vazios também precisam ser regravados
        for (const path of written.keys()) {
          const id = path.slice(sp.col().length + 1)
          if (path.startsWith(sp.col() + '/') && id.startsWith(prefix) && !months.has(id.slice(prefix.length))) months.set(id.slice(prefix.length), [])
        }
        for (const [m, arr] of months) await put(`${sp.col()}/${prefix}${m}`, { [key]: arr })
      }
      await put(`${sp.col()}/${sp.base}`, { ...rest, stamp })
    },
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

async function syncDoc(kind: Kind) {
  const be = backend!
  if (!be.enabled(kind)) return
  const slice = () => (kind === 'personal' ? personalOf(useStore.getState()) : financeOf(useStore.getState()))
  const remote = await be.load(kind)

  if (remote && remote.stamp !== meta.seen[kind]) {
    // A nuvem mudou desde a última vez: sem pendências locais ela substitui; com pendências, junta.
    const next = !meta.dirty[kind]
      ? remote.data
      : kind === 'personal'
        ? mergePersonal(slice() as Personal, remote.data)
        : mergeFinance(slice() as Finance, remote.data)
    apply(next)
    meta.seen[kind] = remote.stamp
    saveMeta()
  }

  if (meta.dirty[kind] || !remote) {
    const stamp = new Date().toISOString()
    meta.dirty[kind] = false
    try {
      await be.save(kind, slice(), stamp, !!remote)
    } catch (e) {
      meta.dirty[kind] = true
      saveMeta()
      throw e
    }
    meta.seen[kind] = stamp
    saveMeta()
  }
}

export async function sync() {
  if (!backend || !uid) return
  if (running) {
    again = true
    return
  }
  running = true
  useCloud.setState({ status: 'syncing' })
  try {
    await backend.prepare()
    await syncDoc('personal')
    await syncDoc('finance')
    useCloud.setState({ status: 'idle', error: null, lastSync: new Date().toISOString(), ready: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e)
    useCloud.setState({
      ready: true,
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

function markFirstAccess() {
  // Primeiro acesso neste aparelho: o que já existe aqui precisa ser preservado e enviado.
  if (meta.seen.personal || meta.seen.finance) return
  const s = useStore.getState()
  meta.dirty = { personal: s.events.length > 0 || s.measurements.length > 0 || s.healthReady || s.sessions.length > 0, finance: s.txs.length > 0 }
  saveMeta()
}

function keepInSync() {
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && schedule(500))
  setInterval(() => document.visibilityState === 'visible' && void sync(), 60000)
}

/** Dentro de um artefato do Claude: usa o banco do próprio artefato, com a conta Claude de quem abre. */
export async function initArtifactCloud() {
  useCloud.setState({ mode: 'artifact', status: 'syncing' })
  const [db, user] = await Promise.all([use('db'), use('user')])
  if (!db) {
    useCloud.setState({ ready: true, status: 'off', error: 'Sem acesso ao armazenamento do artefato: os dados ficam só neste aparelho. Abra o artefato logado na sua conta Claude.' })
    return
  }
  const [id, owner, canWrite] = user ? await Promise.all([user.id(), user.isOwner(), user.canEdit()]) : [null, false, false]
  backend = artifactBackend(db, id, canWrite)
  uid = id ?? 'convidado'
  useCloud.setState({ configured: true, email: 'conta Claude', financeOwner: owner, personal: !!id, canWrite })
  markFirstAccess()
  keepInSync()
  if (canWrite) {
    // aviso em tempo real quando a outra pessoa grava os gastos
    try {
      db.doc('finance/config').onSnapshot(() => schedule(300), () => {})
    } catch {
      /* sem tempo real: a sincronização periódica continua */
    }
  }
  await sync()
}
