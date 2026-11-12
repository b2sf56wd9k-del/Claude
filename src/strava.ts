// Strava: login OAuth e leitura de atividades direto do navegador.
// As chaves do aplicativo ficam guardadas só nos dados pessoais do usuário.
import { advanceQuest, type Quest, type XpEvent } from './game'

export interface StravaState {
  clientId: string
  clientSecret: string
  accessToken?: string
  refreshToken?: string
  /** epoch em segundos */
  expiresAt?: number
  athlete?: string
  /** ids de atividades já contabilizadas */
  seen: number[]
  lastSync?: string
}

export interface Activity {
  id: number
  name: string
  sport_type?: string
  type?: string
  start_date_local: string
  distance?: number
}

export const redirectUri = () => location.origin + location.pathname

export function authorizeUrl(clientId: string): string {
  const q = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri(),
    response_type: 'code',
    approval_prompt: 'auto',
    scope: 'activity:read_all',
    state: 'strava',
  })
  return `https://www.strava.com/oauth/authorize?${q}`
}

async function token(params: Record<string, string>) {
  const r = await fetch('https://www.strava.com/oauth/token', { method: 'POST', body: new URLSearchParams(params) })
  if (!r.ok) throw new Error(`Strava recusou o login (${r.status}). Confira o Client ID e o Client Secret.`)
  return (await r.json()) as { access_token: string; refresh_token: string; expires_at: number; athlete?: { firstname?: string; lastname?: string } }
}

export async function exchangeCode(st: StravaState, code: string): Promise<StravaState> {
  const t = await token({ client_id: st.clientId, client_secret: st.clientSecret, code, grant_type: 'authorization_code' })
  return {
    ...st,
    accessToken: t.access_token,
    refreshToken: t.refresh_token,
    expiresAt: t.expires_at,
    athlete: [t.athlete?.firstname, t.athlete?.lastname].filter(Boolean).join(' ') || st.athlete,
  }
}

export async function ensureFresh(st: StravaState, nowSec: number): Promise<StravaState> {
  if (!st.refreshToken) throw new Error('Strava não conectado.')
  if (st.accessToken && st.expiresAt && st.expiresAt - 300 > nowSec) return st
  const t = await token({ client_id: st.clientId, client_secret: st.clientSecret, refresh_token: st.refreshToken, grant_type: 'refresh_token' })
  return { ...st, accessToken: t.access_token, refreshToken: t.refresh_token, expiresAt: t.expires_at }
}

export async function fetchActivities(accessToken: string, afterSec: number): Promise<Activity[]> {
  const out: Activity[] = []
  for (let page = 1; page <= 5; page++) {
    const r = await fetch(`https://www.strava.com/api/v3/athlete/activities?after=${afterSec}&per_page=100&page=${page}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!r.ok) throw new Error(`Não consegui ler as atividades do Strava (${r.status}).`)
    const batch = (await r.json()) as Activity[]
    out.push(...batch)
    if (batch.length < 100) break
  }
  return out
}

const RUN = ['Run', 'TrailRun', 'VirtualRun']
const STRENGTH = ['WeightTraining', 'Crossfit', 'HighIntensityIntervalTraining', 'Workout']

/** Qual missão a atividade conclui */
export function questFor(a: Activity): 'corrida' | 'forca' | null {
  const t = a.sport_type ?? a.type ?? ''
  return RUN.includes(t) ? 'corrida' : STRENGTH.includes(t) ? 'forca' : null
}

/** Contabiliza atividades novas nas missões da semana em que aconteceram. */
export function applyActivities(events: XpEvent[], quests: Quest[], seen: number[], activities: Activity[]) {
  const known = new Set(seen)
  let added = 0
  const sorted = [...activities].sort((a, b) => (a.start_date_local < b.start_date_local ? -1 : 1))
  for (const a of sorted) {
    if (known.has(a.id)) continue
    known.add(a.id)
    const q = quests.find((x) => x.id === questFor(a) && x.active)
    if (!q) continue
    const km = a.distance ? ` · ${(a.distance / 1000).toFixed(1).replace('.', ',')} km` : ''
    const next = advanceQuest(events, quests, q, a.start_date_local.slice(0, 10), `Strava: ${a.name}${km}`)
    if (next !== events) added++
    events = next
  }
  return { events, seen: [...known], added }
}
