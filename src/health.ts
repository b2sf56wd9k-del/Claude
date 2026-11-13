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
// Princípios do plano de força. Prioridade: 1) desempenho na corrida, 2) estética e composição corporal.
// Os treinos em si ficam em workout/plan.ts e os exercícios em workout/exercises.ts.

/** Para que serve o exercício no plano */
export type Purpose = 'corrida' | 'estetica' | 'prevencao'
export const PURPOSES: Record<Purpose, string> = { corrida: 'Corrida', estetica: 'Estética', prevencao: 'Prevenção' }

export interface Study {
  ref: string
  finding: string
}
export interface StrengthPlan {
  summary: string
  principles: string[]
  tips: string[]
  studies: Study[]
}

export const STUDIES: Study[] = [
  {
    ref: 'Blagrove, Howatson e Hayes, Sports Medicine, 2018 (revisão sistemática)',
    finding: 'Treino de força melhorou a economia de corrida em 2 a 8% e tendeu a melhorar provas de 1,5 a 10 km, sem prejudicar a composição corporal. Recomendam 2 a 3 sessões por semana.',
  },
  {
    ref: 'Llanos-Lagos e colaboradores, Sports Medicine, 2024 (meta-análise)',
    finding: 'Cargas altas, pliometria e a combinação dos dois melhoram a economia de corrida; cargas submáximas e isometria sozinhas não mostraram efeito.',
  },
  {
    ref: 'Støren e colaboradores, Medicine & Science in Sports & Exercise, 2008',
    finding: 'Meio agachamento 4 × 4 com carga máxima, 3 vezes por semana por 8 semanas: +5% de economia de corrida e +21% de tempo até a exaustão, sem ganho de peso. Estudo pequeno (17 corredores).',
  },
  {
    ref: 'Schoenfeld, Ogborn e Krieger, Journal of Sports Sciences, 2017 (meta-análise)',
    finding: 'Hipertrofia cresce com o volume semanal: 10 ou mais séries por músculo na semana renderam bem mais que menos de 5.',
  },
  {
    ref: 'Schoenfeld, Ogborn e Krieger, Sports Medicine, 2016 (meta-análise)',
    finding: 'Treinar cada músculo 2 vezes por semana gerou mais hipertrofia do que 1 vez.',
  },
  {
    ref: 'Schumann e colaboradores, Sports Medicine, 2022 (meta-análise)',
    finding: 'Combinar aeróbico e força não comprometeu hipertrofia nem força máxima. A potência é que sofre, principalmente quando os dois treinos são na mesma sessão: separe corrida e força por pelo menos 3 horas.',
  },
  {
    ref: 'Lauersen, Bertelsen e Andersen, British Journal of Sports Medicine, 2014 (meta-análise)',
    finding: 'Em esportes em geral, treino de força reduziu lesões a menos de um terço e quase pela metade as lesões por sobrecarga. Alongamento não mostrou efeito protetor.',
  },
]

export function strengthPlan(goal: Goal, days: 0 | 2 | 3): StrengthPlan | null {
  if (days === 0) return null
  const tips = [
    'Separe a musculação da corrida por pelo menos 3 horas; se for no mesmo dia, corra primeiro quando o treino de corrida for o de qualidade.',
    'Evite o treino pesado de pernas na véspera do tiro ou do longão.',
    'Anote as cargas e tente superar o treino anterior: sem progressão não há ganho nem de força nem de músculo.',
    'Na semana de prova, mantenha a carga e corte o número de séries pela metade.',
  ]
  if (goal === 'emagrecer') tips.push('Em déficit calórico o objetivo na academia é manter as cargas: se a força cair, o déficit está grande demais.')
  if (goal === 'hipertrofia') tips.push('Com excedente calórico dá para somar 1 série aos exercícios de superior a cada 2 semanas, até 5 séries.')
  return {
    summary:
      days === 3
        ? 'Três sessões: duas com pernas pesadas (o que melhora a economia de corrida) e uma de superior com mais volume. Cada músculo do tronco é treinado 2 a 3 vezes por semana, com cerca de 10 séries semanais ou mais — a faixa que os estudos associam a mais hipertrofia.'
        : 'Duas sessões de corpo inteiro: pernas com carga alta para a corrida e superior com 8 a 10 repetições para a estética. Com 2 dias o volume de superior fica em cerca de 8 séries semanais por músculo: o ganho estético vem, mas mais devagar do que com 3 dias.',
    principles: [
      'Prioridade 1, corrida. Pernas com poucas repetições, carga alta e saltos: é o tipo de treino com efeito comprovado na economia de corrida, e quase não aumenta o peso corporal. Vem sempre primeiro na sessão e nunca é cortado.',
      'Prioridade 2, estética e composição corporal. Tronco e braços com 8 a 15 repetições perto da falha: constrói músculo onde não pesa na corrida.',
      'Reforço do corredor. Panturrilha, posterior, adutores e core: as estruturas que mais sofrem com a corrida.',
    ],
    tips,
    studies: STUDIES,
  }
}

/** Sugestão de semana encaixando a força entre as corridas. */
export function weekLayout(runDays: number, strengthDays: 0 | 2 | 3): string {
  if (runDays === 3 && strengthDays === 2) return 'Seg treino A · Ter corrida · Qua descanso · Qui corrida · Sex treino B · Sáb descanso · Dom longão'
  if (runDays === 3 && strengthDays === 3) return 'Seg treino A · Ter corrida · Qua treino B · Qui corrida · Sex descanso · Sáb treino C · Dom longão'
  return 'Alterne corrida e força, deixando ao menos um dia de descanso total na semana.'
}
