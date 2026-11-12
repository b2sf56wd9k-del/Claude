// Saúde: composição corporal, metas de alimentação e plano de musculação.
// Tudo aqui são estimativas por fórmulas populacionais — orientação geral, não prescrição.

export type Sex = 'm' | 'f'
export type Goal = 'emagrecer' | 'hipertrofia' | 'performance'

export const GOALS: { id: Goal; name: string }[] = [
  { id: 'emagrecer', name: 'Perder gordura' },
  { id: 'hipertrofia', name: 'Ganhar massa muscular' },
  { id: 'performance', name: 'Performance na corrida (manter peso)' },
]

export interface HealthProfile {
  sex: Sex
  birthYear: number
  heightCm: number
  goal: Goal
  runDays: number
  strengthDays: 0 | 2 | 3
}

export interface Measurement {
  date: string
  weightKg: number
  /** % de gordura medido (bioimpedância, dobras). Se vazio, é estimado pelas circunferências. */
  bodyFatPct?: number
  waistCm?: number
  neckCm?: number
  hipCm?: number
}

export const DEFAULT_PROFILE: HealthProfile = { sex: 'm', birthYear: 1990, heightCm: 175, goal: 'performance', runDays: 3, strengthDays: 2 }

const r1 = (n: number) => Math.round(n * 10) / 10

export function bmi(weightKg: number, heightCm: number): number {
  return r1(weightKg / Math.pow(heightCm / 100, 2))
}

/** Estimativa de % de gordura pelo método da Marinha dos EUA (circunferências). */
export function navyBodyFat(sex: Sex, heightCm: number, m: Measurement): number | null {
  if (!m.waistCm || !m.neckCm) return null
  let bf: number
  if (sex === 'm') {
    if (m.waistCm <= m.neckCm) return null
    bf = 495 / (1.0324 - 0.19077 * Math.log10(m.waistCm - m.neckCm) + 0.15456 * Math.log10(heightCm)) - 450
  } else {
    if (!m.hipCm) return null
    bf = 495 / (1.29579 - 0.35004 * Math.log10(m.waistCm + m.hipCm - m.neckCm) + 0.221 * Math.log10(heightCm)) - 450
  }
  return bf > 2 && bf < 60 ? r1(bf) : null
}

export interface Composition {
  bmi: number
  bodyFatPct: number | null
  /** de onde veio o % de gordura */
  source: 'medido' | 'estimado' | null
  fatKg: number | null
  leanKg: number | null
  category: string | null
}

const BF_BANDS: Record<Sex, [number, string][]> = {
  m: [[6, 'Muito baixo'], [14, 'Atleta'], [18, 'Em forma'], [25, 'Médio'], [Infinity, 'Elevado']],
  f: [[14, 'Muito baixo'], [21, 'Atleta'], [25, 'Em forma'], [32, 'Médio'], [Infinity, 'Elevado']],
}

export function composition(p: HealthProfile, m: Measurement): Composition {
  const est = navyBodyFat(p.sex, p.heightCm, m)
  const bf = m.bodyFatPct ?? est
  return {
    bmi: bmi(m.weightKg, p.heightCm),
    bodyFatPct: bf,
    source: m.bodyFatPct != null ? 'medido' : est != null ? 'estimado' : null,
    fatKg: bf != null ? r1((m.weightKg * bf) / 100) : null,
    leanKg: bf != null ? r1(m.weightKg * (1 - bf / 100)) : null,
    category: bf != null ? BF_BANDS[p.sex].find(([max]) => bf < max)![1] : null,
  }
}

export interface Targets {
  bmr: number
  tdee: number
  kcal: number
  proteinG: number
  fatG: number
  carbsG: number
  waterL: number
}

/** Metas diárias: gasto estimado (Katch-McArdle com massa magra, senão Mifflin-St Jeor) ajustado pelo objetivo. */
export function targets(p: HealthProfile, m: Measurement, year: number): Targets {
  const c = composition(p, m)
  const age = year - p.birthYear
  const bmr = c.leanKg != null ? 370 + 21.6 * c.leanKg : 10 * m.weightKg + 6.25 * p.heightCm - 5 * age + (p.sex === 'm' ? 5 : -161)
  const sessions = p.runDays + p.strengthDays
  const factor = sessions === 0 ? 1.2 : sessions <= 2 ? 1.375 : sessions <= 4 ? 1.5 : sessions <= 6 ? 1.6 : 1.725
  const tdee = bmr * factor
  const adjust = p.goal === 'emagrecer' ? 0.82 : p.goal === 'hipertrofia' ? 1.1 : 1
  // nunca abaixo do metabolismo basal
  const kcal = Math.max(bmr, tdee * adjust)
  const proteinG = m.weightKg * (p.goal === 'emagrecer' ? 2 : p.goal === 'hipertrofia' ? 1.8 : 1.6)
  const fatG = m.weightKg * 0.8
  const carbsG = Math.max(0, (kcal - proteinG * 4 - fatG * 9) / 4)
  const round5 = (n: number) => Math.round(n / 5) * 5
  return {
    bmr: Math.round(bmr),
    tdee: Math.round(tdee / 10) * 10,
    kcal: Math.round(kcal / 10) * 10,
    proteinG: round5(proteinG),
    fatG: round5(fatG),
    carbsG: round5(carbsG),
    waterL: r1((m.weightKg * 35) / 1000),
  }
}

export interface Finding {
  ok: boolean
  text: string
}

const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000)

/** Avalia a evolução comparando a última medição com a de ~4 semanas antes. */
export function assess(p: HealthProfile, list: Measurement[]): Finding[] {
  const ms = [...list].sort((a, b) => (a.date < b.date ? -1 : 1))
  if (ms.length < 2) return []
  const last = ms[ms.length - 1]
  const candidates = ms.filter((m) => daysBetween(m.date, last.date) >= 7)
  if (candidates.length === 0) return []
  const base = candidates.reduce((b, m) => (Math.abs(daysBetween(m.date, last.date) - 28) < Math.abs(daysBetween(b.date, last.date) - 28) ? m : b))
  const weeks = daysBetween(base.date, last.date) / 7
  const perWeek = (last.weightKg - base.weightKg) / weeks
  const pct = (perWeek / base.weightKg) * 100
  const rate = `${perWeek > 0 ? '+' : ''}${perWeek.toFixed(2).replace('.', ',')} kg por semana`
  const out: Finding[] = []

  if (p.goal === 'emagrecer') {
    if (pct < -1) out.push({ ok: false, text: `Peso caindo rápido demais (${rate}). Isso costuma custar músculo e rendimento na corrida: suba cerca de 200 kcal por dia.` })
    else if (pct <= -0.25) out.push({ ok: true, text: `Perda de peso no ritmo certo (${rate}).` })
    else out.push({ ok: false, text: `Peso praticamente parado (${rate}). Reduza cerca de 150 kcal por dia ou confira se as porções estão batendo com a meta.` })
  } else if (p.goal === 'hipertrofia') {
    if (pct > 0.5) out.push({ ok: false, text: `Ganho de peso rápido demais (${rate}): boa parte tende a ser gordura. Reduza cerca de 150 kcal por dia.` })
    else if (pct >= 0.1) out.push({ ok: true, text: `Ganho de peso no ritmo certo (${rate}).` })
    else out.push({ ok: false, text: `Peso sem subir (${rate}). Aumente cerca de 150 kcal por dia, de preferência em carboidrato perto dos treinos.` })
  } else {
    if (Math.abs(pct) <= 0.25) out.push({ ok: true, text: `Peso estável (${rate}), como esperado para o objetivo.` })
    else out.push({ ok: false, text: `Peso variando (${rate}). Ajuste cerca de 150 kcal por dia ${pct < 0 ? 'para cima' : 'para baixo'} para estabilizar.` })
  }

  const a = composition(p, base)
  const b = composition(p, last)
  if (a.leanKg != null && b.leanKg != null && a.fatKg != null && b.fatKg != null) {
    const lean = b.leanKg - a.leanKg
    const fat = b.fatKg - a.fatKg
    const f = (n: number) => `${n > 0 ? '+' : ''}${n.toFixed(1).replace('.', ',')} kg`
    if (lean <= -0.5 && p.goal !== 'hipertrofia') {
      out.push({ ok: false, text: `Massa magra caiu (${f(lean)}). Garanta a meta de proteína todos os dias e não pule os treinos de força.` })
    } else if (p.goal === 'hipertrofia' && lean < 0.2 && fat > 0.5) {
      out.push({ ok: false, text: `O ganho veio mais de gordura (${f(fat)}) do que de massa magra (${f(lean)}). Reduza o excedente calórico.` })
    } else {
      out.push({ ok: true, text: `Massa magra ${f(lean)}, gordura ${f(fat)} no período.` })
    }
  }
  return out
}

// ---------- musculação ----------

export interface Exercise {
  name: string
  sets: string
  note?: string
}
export interface Workout {
  name: string
  focus: string
  exercises: Exercise[]
}
export interface StrengthPlan {
  summary: string
  tips: string[]
  workouts: Workout[]
}

const E = (name: string, sets: string, note?: string): Exercise => ({ name, sets, note })

const PLANS: Record<Goal, { summary: string; tips: string[]; workouts: Workout[] }> = {
  performance: {
    summary: 'Força para correr melhor: cargas altas com poucas repetições, exercícios unilaterais, panturrilha e core. Pouco volume, para não atrapalhar a corrida.',
    tips: [
      'Evite treino pesado de pernas na véspera do treino de tiro ou do longão.',
      'Termine cada série com 2 repetições "sobrando": o objetivo é força, não exaustão.',
      'Na semana de prova, faça só um treino leve.',
    ],
    workouts: [
      {
        name: 'Treino A',
        focus: 'Pernas (força) e core',
        exercises: [
          E('Agachamento livre ou no smith', '4 × 5', 'carga alta, descida controlada'),
          E('Levantamento terra romeno', '3 × 6'),
          E('Afundo búlgaro', '3 × 8 cada perna'),
          E('Panturrilha em pé', '4 × 8', 'pausa de 2 s embaixo'),
          E('Prancha frontal', '3 × 40 s'),
          E('Pallof press', '3 × 10 cada lado'),
        ],
      },
      {
        name: 'Treino B',
        focus: 'Posterior, unilateral e tronco',
        exercises: [
          E('Elevação pélvica com barra', '4 × 6'),
          E('Step-up no banco', '3 × 8 cada perna'),
          E('Stiff unilateral com halter', '3 × 8 cada perna'),
          E('Panturrilha sentado (sóleo)', '4 × 10'),
          E('Remada curvada', '3 × 8'),
          E('Prancha lateral', '3 × 30 s cada lado'),
        ],
      },
      {
        name: 'Treino C',
        focus: 'Potência e membros superiores',
        exercises: [
          E('Saltos pogo (tornozelo rígido)', '3 × 15', 'contatos rápidos com o chão'),
          E('Salto sobre caixa', '4 × 4', 'desça caminhando'),
          E('Agachamento frontal ou goblet', '3 × 6'),
          E('Flexão nórdica (posterior)', '3 × 5'),
          E('Supino com halteres', '3 × 8'),
          E('Puxada alta ou barra fixa', '3 × 8'),
          E('Prancha Copenhagen (adutores)', '2 × 20 s cada lado'),
        ],
      },
    ],
  },
  hipertrofia: {
    summary: 'Ganho de massa: corpo inteiro em cada sessão, 8 a 12 repetições perto da falha, aumentando carga ou repetições a cada semana.',
    tips: [
      'Progressão é o que gera resultado: anote as cargas e tente superar o treino anterior.',
      'Descanse 1,5 a 2 minutos entre as séries.',
      'Coloque o treino de pernas mais pesado longe do longão.',
    ],
    workouts: [
      {
        name: 'Treino A',
        focus: 'Corpo inteiro, ênfase em empurrar',
        exercises: [
          E('Agachamento livre ou leg press', '4 × 8–10'),
          E('Supino reto', '4 × 8–10'),
          E('Remada baixa', '3 × 10–12'),
          E('Desenvolvimento com halteres', '3 × 10'),
          E('Cadeira extensora', '3 × 12'),
          E('Tríceps na polia', '3 × 12'),
          E('Abdominal na polia', '3 × 12'),
        ],
      },
      {
        name: 'Treino B',
        focus: 'Corpo inteiro, ênfase em puxar',
        exercises: [
          E('Levantamento terra romeno', '4 × 8–10'),
          E('Puxada alta ou barra fixa', '4 × 8–10'),
          E('Supino inclinado com halteres', '3 × 10'),
          E('Afundo búlgaro', '3 × 10 cada perna'),
          E('Mesa flexora', '3 × 12'),
          E('Rosca direta', '3 × 12'),
          E('Panturrilha em pé', '4 × 10–12'),
        ],
      },
      {
        name: 'Treino C',
        focus: 'Corpo inteiro, volume complementar',
        exercises: [
          E('Leg press', '4 × 10–12'),
          E('Remada curvada', '4 × 8–10'),
          E('Crucifixo ou peck deck', '3 × 12'),
          E('Elevação lateral', '4 × 12–15'),
          E('Elevação pélvica', '3 × 10'),
          E('Rosca martelo + tríceps testa', '3 × 12 cada'),
          E('Prancha frontal', '3 × 45 s'),
        ],
      },
    ],
  },
  emagrecer: {
    summary: 'Perda de gordura: o treino de força serve para preservar músculo enquanto a dieta faz o déficit. Exercícios compostos, 10 a 15 repetições, descanso curto.',
    tips: [
      'Mantenha as cargas: perder força durante a dieta é sinal de déficit grande demais.',
      'Descanse cerca de 1 minuto entre as séries.',
      'O gasto calórico extra vem da corrida; não transforme a musculação em cardio.',
    ],
    workouts: [
      {
        name: 'Treino A',
        focus: 'Corpo inteiro',
        exercises: [
          E('Agachamento goblet ou leg press', '3 × 12'),
          E('Supino com halteres', '3 × 12'),
          E('Remada baixa', '3 × 12'),
          E('Levantamento terra romeno', '3 × 10'),
          E('Desenvolvimento com halteres', '3 × 12'),
          E('Prancha frontal', '3 × 40 s'),
        ],
      },
      {
        name: 'Treino B',
        focus: 'Corpo inteiro',
        exercises: [
          E('Afundo caminhando', '3 × 12 cada perna'),
          E('Puxada alta', '3 × 12'),
          E('Flexão de braço', '3 × máximo', 'pare 2 antes da falha'),
          E('Elevação pélvica', '3 × 12'),
          E('Panturrilha em pé', '3 × 15'),
          E('Abdominal infra', '3 × 15'),
        ],
      },
      {
        name: 'Treino C',
        focus: 'Circuito de corpo inteiro',
        exercises: [
          E('Step-up no banco', '3 × 12 cada perna'),
          E('Remada unilateral com halter', '3 × 12 cada lado'),
          E('Supino inclinado com halteres', '3 × 12'),
          E('Mesa flexora', '3 × 12'),
          E('Elevação lateral', '3 × 15'),
          E('Prancha lateral', '3 × 30 s cada lado'),
        ],
      },
    ],
  },
}

export function strengthPlan(goal: Goal, days: 0 | 2 | 3): StrengthPlan | null {
  if (days === 0) return null
  const p = PLANS[goal]
  return { summary: p.summary, tips: p.tips, workouts: p.workouts.slice(0, days) }
}

/** Sugestão de semana encaixando a força entre as corridas. */
export function weekLayout(runDays: number, strengthDays: 0 | 2 | 3): string {
  if (runDays === 3 && strengthDays === 2) return 'Seg força A · Ter corrida · Qua força B · Qui corrida · Sex descanso · Sáb longão · Dom descanso'
  if (runDays === 3 && strengthDays === 3) return 'Seg força A · Ter corrida · Qua força B · Qui corrida · Sex força C (leve de pernas) · Sáb longão · Dom descanso'
  return 'Alterne corrida e força, deixando ao menos um dia de descanso total na semana.'
}
