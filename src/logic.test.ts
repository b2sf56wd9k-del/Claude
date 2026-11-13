import { describe, expect, it } from 'vitest'
import {
  DEFAULT_QUESTS, advanceQuest, completePenalty, levelInfo, penaltyState, questCount, rankFor, streak, totalXp, undoQuest, weekStart,
} from './game'
import { parseAmount, parseCSV, parseDate, parseOFX } from './finance/parse'
import { DEFAULT_CATEGORIES, DEFAULT_RULES, categorize, merchantKey, summarize, type Tx } from './finance/categorize'

const Q = DEFAULT_QUESTS
const q = (id: string) => Q.find((x) => x.id === id)!
const doDailies = (ev: ReturnType<typeof advanceQuest>, date: string) =>
  Q.filter((x) => x.freq === 'daily').reduce((e, x) => advanceQuest(e, Q, x, date), ev)

describe('jogo', () => {
  it('níveis e ranks', () => {
    expect(levelInfo(0).level).toBe(1)
    expect(levelInfo(100).level).toBe(2)
    expect(levelInfo(99)).toMatchObject({ level: 1, into: 99, need: 100 })
    expect(rankFor(1)).toBe('E')
    expect(rankFor(10)).toBe('D')
    expect(rankFor(80)).toBe('S')
  })
  it('semana começa na segunda', () => {
    expect(weekStart('2026-11-12')).toBe('2026-11-09')
    expect(weekStart('2026-11-15')).toBe('2026-11-09')
    expect(weekStart('2026-11-16')).toBe('2026-11-16')
  })
  it('missão semanal distribui o XP e respeita a meta', () => {
    let ev = advanceQuest([], Q, q('corrida'), '2026-11-09')
    ev = advanceQuest(ev, Q, q('corrida'), '2026-11-10')
    expect(questCount(ev, q('corrida'), '2026-11-12')).toBe(2)
    ev = advanceQuest(ev, Q, q('corrida'), '2026-11-11')
    ev = advanceQuest(ev, Q, q('corrida'), '2026-11-12')
    ev = advanceQuest(ev, Q, q('corrida'), '2026-11-13')
    expect(totalXp(ev)).toBe(180)
    expect(questCount(ev, q('corrida'), '2026-11-16')).toBe(0)
  })
  it('bônus diário entra e sai ao desfazer', () => {
    let ev = doDailies([], '2026-11-12')
    expect(totalXp(ev)).toBe(20 + 10 + 20 + 30)
    ev = undoQuest(ev, Q, q('agua'), '2026-11-12')
    expect(totalXp(ev)).toBe(40)
  })
  it('sequência e penalidade', () => {
    let ev = doDailies([], '2026-11-09')
    ev = doDailies(ev, '2026-11-10')
    expect(streak(ev, '2026-11-10')).toBe(2)
    expect(streak(ev, '2026-11-11')).toBe(2) // hoje ainda em andamento
    expect(penaltyState(ev, Q, '2026-11-09', '2026-11-11')).toBe('none')
    // dia 11 falhou
    expect(streak(ev, '2026-11-12')).toBe(0)
    expect(penaltyState(ev, Q, '2026-11-09', '2026-11-12')).toBe('pending')
    ev = completePenalty(ev, '2026-11-12')
    expect(penaltyState(ev, Q, '2026-11-09', '2026-11-12')).toBe('done')
    expect(streak(ev, '2026-11-12')).toBe(3)
    // primeiro dia de uso nunca gera penalidade
    expect(penaltyState([], Q, '2026-11-12', '2026-11-12')).toBe('none')
  })
})

describe('extratos', () => {
  it('valores e datas', () => {
    expect(parseAmount('1.234,56')).toBe(1234.56)
    expect(parseAmount('-R$ 12,30')).toBe(-12.3)
    expect(parseAmount('1234.56')).toBe(1234.56)
    expect(parseAmount('-45.9')).toBe(-45.9)
    expect(parseDate('05/11/2026')).toBe('2026-11-05')
    expect(parseDate('2026-11-05')).toBe('2026-11-05')
  })
  it('OFX', () => {
    const ofx = `OFXHEADER:100\n<OFX><BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261103120000[-3:BRT]<TRNAMT>-45.90<FITID>abc1<MEMO>IFOOD *RESTAURANTE</STMTTRN>
<STMTTRN>\n<TRNTYPE>CREDIT</TRNTYPE>\n<DTPOSTED>20261105</DTPOSTED>\n<TRNAMT>5000.00</TRNAMT>\n<FITID>abc2</FITID>\n<MEMO>Salario</MEMO>\n</STMTTRN>
</BANKTRANLIST></OFX>`
    const tx = parseOFX(ofx)
    expect(tx).toEqual([
      { ref: 'abc1', date: '2026-11-03', description: 'IFOOD *RESTAURANTE', amount: -45.9 },
      { ref: 'abc2', date: '2026-11-05', description: 'Salario', amount: 5000 },
    ])
  })
  it('CSV de cartão (gasto positivo vira negativo)', () => {
    const csv = 'date,title,amount\n2026-11-01,Uber *Trip,23.50\n2026-11-02,"Mercado, Extra",150.00\n2026-11-03,Pagamento recebido,-500.00\n2026-11-01,Uber *Trip,23.50\n'
    const tx = parseCSV(csv, 'cartao')
    expect(tx.map((t) => t.amount)).toEqual([-23.5, -150, 500, -23.5])
    expect(tx[1].description).toBe('Mercado, Extra')
    expect(new Set(tx.map((t) => t.ref)).size).toBe(4)
  })
  it('CSV de conta com ponto e vírgula e preâmbulo', () => {
    const csv = 'Extrato de conta\nData;Histórico;Valor (R$)\n05/11/2026;PIX ENVIADO JOAO;-1.200,00\n06/11/2026;SALARIO;8.000,00\n'
    expect(parseCSV(csv, 'conta')).toMatchObject([
      { date: '2026-11-05', description: 'PIX ENVIADO JOAO', amount: -1200 },
      { date: '2026-11-06', amount: 8000 },
    ])
  })
})

describe('categorias', () => {
  it('classifica por regra', () => {
    expect(categorize('IFOOD *RESTAURANTE', -45, 'cartao', DEFAULT_RULES)).toBe('restaurantes')
    expect(categorize('MERCADO LIVRE*LOJA', -45, 'cartao', DEFAULT_RULES)).toBe('compras')
    expect(categorize('Pagamento de fatura', -900, 'conta', DEFAULT_RULES)).toBe('transferencias')
    expect(categorize('Salario', 5000, 'conta', DEFAULT_RULES)).toBe('receita')
    expect(categorize('XYZ', -10, 'conta', DEFAULT_RULES)).toBe('outros')
  })
  it('chave do estabelecimento ignora parcelas e números', () => {
    expect(merchantKey('LOJA ABC 03/10')).toBe(merchantKey('Loja ABC 04/10'))
    expect(merchantKey('PAG*Padaria 1234')).toBe('pag padaria')
  })
  it('resumo do mês ignora fatura e separa por pessoa', () => {
    const t = (id: string, amount: number, categoryId: string, owner = 0, date = '2026-11-05'): Tx =>
      ({ id, amount, categoryId, owner, date, description: id, source: 'conta' })
    const txs = [t('a', -100, 'mercado'), t('b', -50, 'mercado', 1), t('c', 20, 'mercado'), t('d', -900, 'transferencias'), t('e', 5000, 'receita'), t('f', -70, 'lazer', 0, '2026-10-30')]
    expect(summarize(txs, DEFAULT_CATEGORIES, '2026-11', null)).toEqual({ spent: 130, income: 5000, byCategory: { mercado: 130 } })
    expect(summarize(txs, DEFAULT_CATEGORIES, '2026-11', 1).spent).toBe(50)
  })
})

import { parseAccountPdf, parseCardPdf, type PdfLine } from './finance/pdf'
import { assess, composition, strengthPlan, targets, type HealthProfile } from './health'

/** monta uma linha como o pdf.js entrega: trechos com posição; números alinhados à direita na coluna */
const L = (...cells: [string, number][]): PdfLine => ({
  text: cells.map((c) => c[0]).join(' '),
  items: cells.map(([str, right]) => ({ str, w: str.length * 5, x: right - str.length * 5 })),
})

describe('PDF', () => {
  it('extrato de conta: sinal pela coluna, data herdada e histórico em duas linhas', () => {
    const lines = [
      L(['Data', 60], ['Histórico', 200], ['Docto.', 300], ['Crédito (R$)', 400], ['Débito (R$)', 480], ['Saldo (R$)', 560]),
      L(['01/10/2026', 60], ['SALDO ANTERIOR', 200], ['1.000,00', 560]),
      L(['02/10/2026', 60], ['TRANSFERENCIA PIX', 200], ['1234567', 300], ['150,00', 480], ['850,00', 560]),
      L(['DES: MARIA SILVA 02/10', 200]),
      L(['PAGTO ELETRON COBRANCA', 200], ['7654321', 300], ['200,00', 480]),
      L(['05/10/2026', 60], ['CREDITO DE SALARIO', 200], ['55', 300], ['9.500,00', 400], ['10.150,00', 560]),
      L(['Total', 60], ['9.500,00', 400], ['350,00', 480], ['10.150,00', 560]),
    ]
    expect(parseAccountPdf(lines).map(({ ref: _r, ...t }) => t)).toEqual([
      { date: '2026-10-02', description: 'TRANSFERENCIA PIX DES: MARIA SILVA 02/10', amount: -150 },
      { date: '2026-10-02', description: 'PAGTO ELETRON COBRANCA', amount: -200 },
      { date: '2026-10-05', description: 'CREDITO DE SALARIO', amount: 9500 },
    ])
  })
  it('extrato de conta sem cabeçalho posicionado: sinal pela variação do saldo', () => {
    const one = (text: string): PdfLine => ({ text, items: [{ str: text, x: 0, w: 500 }] })
    const tx = parseAccountPdf([one('01/10/2026 SALDO ANTERIOR 1.000,00'), one('02/10/2026 COMPRA DEBITO 150,00 850,00'), one('03/10/2026 DEPOSITO 300,00 1.150,00')])
    expect(tx.map((t) => t.amount)).toEqual([-150, 300])
  })
  it('fatura de cartão: ano pelo vencimento, crédito com sinal, parcela antiga vai para o mês da fatura', () => {
    const one = (text: string): PdfLine => ({ text, items: [{ str: text, x: 0, w: 500 }] })
    const tx = parseCardPdf(
      [
        one('Vencimento 10/01/2026 Total da fatura 1.234,56'),
        one('Data Histórico de Lançamentos Valor'),
        one('20/12 SUPERMERCADO EXTRA SAO PAULO 350,00'),
        one('02/01 UBER *TRIP SAO PAULO 23,50'),
        one('15/08 LOJA XPTO 05/10 CAMPINAS 199,00'),
        one('28/12 PAGTO. POR DEB EM C/C 1.500,00-'),
        one('Total para 10/01 2.072,50'),
      ],
      '2026-01-05',
    )
    expect(tx.map(({ ref: _r, ...t }) => t)).toEqual([
      { date: '2025-12-20', description: 'SUPERMERCADO EXTRA SAO PAULO', amount: -350 },
      { date: '2026-01-02', description: 'UBER *TRIP SAO PAULO', amount: -23.5 },
      { date: '2025-12-01', description: 'LOJA XPTO 05/10 CAMPINAS', amount: -199 },
      { date: '2025-12-28', description: 'PAGTO. POR DEB EM C/C', amount: 1500 },
    ])
  })
})

describe('saúde', () => {
  const p: HealthProfile = { sex: 'm', birthYear: 1990, heightCm: 178, goal: 'emagrecer', runDays: 3, strengthDays: 2 }
  it('composição corporal', () => {
    const c = composition(p, { date: '2026-11-01', weightKg: 80, waistCm: 88, neckCm: 38 })
    expect(c.bmi).toBe(25.2)
    expect(c.source).toBe('estimado')
    expect(c.bodyFatPct).toBeGreaterThan(15)
    expect(c.bodyFatPct).toBeLessThan(22)
    expect(c.leanKg! + c.fatKg!).toBeCloseTo(80, 0)
    expect(composition(p, { date: 'x', weightKg: 80, bodyFatPct: 15 })).toMatchObject({ source: 'medido', fatKg: 12, leanKg: 68, category: 'Em forma' })
    expect(composition(p, { date: 'x', weightKg: 80 }).bodyFatPct).toBeNull()
  })
  it('metas de alimentação', () => {
    const t = targets(p, { date: 'x', weightKg: 80 }, 2026)
    // Mifflin: 800 + 1112.5 - 180 + 5 = 1737.5; x1.6 = 2780; x0.82 = 2280
    expect(t).toMatchObject({ bmr: 1738, tdee: 2780, kcal: 2280, proteinG: 160, fatG: 65 })
    expect(t.proteinG * 4 + t.fatG * 9 + t.carbsG * 4).toBeGreaterThan(t.kcal - 40)
    expect(t.proteinG * 4 + t.fatG * 9 + t.carbsG * 4).toBeLessThan(t.kcal + 40)
    expect(targets({ ...p, goal: 'hipertrofia' }, { date: 'x', weightKg: 80 }, 2026).kcal).toBeGreaterThan(t.tdee)
  })
  it('avaliação da evolução', () => {
    expect(assess(p, [{ date: '2026-10-01', weightKg: 82 }])).toEqual([])
    const ok = assess(p, [{ date: '2026-10-01', weightKg: 82 }, { date: '2026-10-29', weightKg: 80 }])
    expect(ok[0].ok).toBe(true)
    const fast = assess(p, [{ date: '2026-10-01', weightKg: 82 }, { date: '2026-10-15', weightKg: 79 }])
    expect(fast[0].ok).toBe(false)
    const lean = assess(p, [{ date: '2026-10-01', weightKg: 82, bodyFatPct: 20 }, { date: '2026-10-29', weightKg: 80, bodyFatPct: 21 }])
    expect(lean[1]).toMatchObject({ ok: false })
  })
  it('plano de musculação segue os dias escolhidos', () => {
    expect(strengthPlan('performance', 0)).toBeNull()
    expect(strengthPlan('performance', 3)!.studies.length).toBeGreaterThan(4)
  })
})

import { applyActivities, questFor } from './strava'
import { mergeFinance, mergePersonal, type Finance, type Personal } from './cloud'
import { DEFAULT_PROFILE } from './health'

describe('Strava', () => {
  const act = (id: number, sport_type: string, date: string, distance = 0) => ({ id, name: `Treino ${id}`, sport_type, start_date_local: `${date}T06:30:00Z`, distance })
  it('mapeia o tipo de atividade para a missão', () => {
    expect(questFor(act(1, 'Run', '2026-11-10'))).toBe('corrida')
    expect(questFor(act(1, 'WeightTraining', '2026-11-10'))).toBe('forca')
    expect(questFor(act(1, 'Ride', '2026-11-10'))).toBeNull()
  })
  it('contabiliza cada atividade uma vez, na semana certa, até a meta', () => {
    const acts = [act(1, 'Run', '2026-11-03', 8000), act(2, 'Run', '2026-11-10', 10000), act(3, 'WeightTraining', '2026-11-11'), act(4, 'Ride', '2026-11-11')]
    const r1 = applyActivities([], Q, [], acts)
    expect(r1.added).toBe(3)
    expect(questCount(r1.events, q('corrida'), '2026-11-12')).toBe(1)
    expect(questCount(r1.events, q('corrida'), '2026-11-05')).toBe(1)
    expect(r1.events.find((e) => e.label.includes('10,0 km'))).toBeTruthy()
    const r2 = applyActivities(r1.events, Q, r1.seen, acts)
    expect(r2.added).toBe(0)
    expect(r2.events).toBe(r1.events)
    // quatro corridas na mesma semana com meta 3: a quarta não gera XP extra
    const many = [5, 6, 7, 8].map((i) => act(i, 'Run', '2026-11-1' + (i - 4)))
    expect(applyActivities([], Q, [], many).added).toBe(3)
  })
})

describe('nuvem', () => {
  const ev = (key: string) => ({ key, date: '2026-11-10', attr: 'mente' as const, xp: 10, label: key })
  const tx = (id: string, categoryId = 'outros') => ({ id, date: '2026-11-10', description: id, amount: -10, source: 'conta' as const, owner: 0, categoryId })
  it('junta dados pessoais sem duplicar', () => {
    const base: Personal = { name: 'A', startDate: '2026-11-10', quests: Q, events: [ev('a'), ev('b')], health: DEFAULT_PROFILE, healthReady: false, measurements: [], strava: null, sessions: [], activeSession: null, runPlan: [], race: null }
    const m = mergePersonal(base, { startDate: '2026-11-01', events: [ev('b'), ev('c')], measurements: [{ date: '2026-11-02', weightKg: 80 }], healthReady: true, health: { ...DEFAULT_PROFILE, heightCm: 180 } })
    expect(m.events.map((e) => e.key)).toEqual(['a', 'b', 'c'])
    expect(m.startDate).toBe('2026-11-01')
    expect(m.measurements).toHaveLength(1)
    expect(m.health.heightCm).toBe(180)
  })
  it('junta gastos: o aparelho vence nos lançamentos que já tem', () => {
    const local: Finance = { people: ['Eu', 'Esposa'], txs: [tx('1', 'mercado')], categories: DEFAULT_CATEGORIES, rules: [{ pattern: 'x', categoryId: 'lazer' }] }
    const m = mergeFinance(local, { txs: [tx('1'), tx('2')], rules: [{ pattern: 'x', categoryId: 'outros' }, { pattern: 'y', categoryId: 'saude' }] })
    expect(m.txs.map((t) => [t.id, t.categoryId])).toEqual([['1', 'mercado'], ['2', 'outros']])
    expect(m.rules).toHaveLength(2)
  })
})

import { WORKOUTS, buildSession, nextWorkout, records, suggest, type Session } from './workout/plan'
import { EXERCISES } from './workout/exercises'

describe('treino', () => {
  const sess = (id: string, workout: 'A' | 'B' | 'C', day: number, entries: Session['entries']): Session =>
    ({ id, workout, date: `2026-11-${String(day).padStart(2, '0')}`, minutes: 60, startedAt: day * 1e6, finishedAt: day * 1e6 + 1, entries })
  const squat = (kg: number, reps: number[]) => ({ ex: 'agachamento', target: 4, reps: [4, 5] as [number, number], rest: 150, sets: reps.map((r) => ({ kg, reps: r })) })

  it('todo exercício do plano existe na biblioteca', () => {
    for (const w of Object.values(WORKOUTS)) for (const it of w.items) expect(EXERCISES[it.ex], it.ex).toBeTruthy()
    for (const e of Object.values(EXERCISES)) for (const a of e.alts ?? []) expect(EXERCISES[a], a).toBeTruthy()
  })
  it('cabe no tempo e nunca corta o bloco de corrida', () => {
    for (const w of Object.values(WORKOUTS)) {
      const run = w.items.filter((i) => i.prio === 1).map((i) => i.ex)
      for (const m of [30, 45, 60, 75]) {
        const b = buildSession(w, m)
        expect(b.items.map((x) => x.item.ex)).toEqual(expect.arrayContaining(run))
        if (m >= 45) expect(b.minutes, `${w.id} ${m}`).toBeLessThanOrEqual(m)
      }
      // com menos tempo saem primeiro os isolados de estética
      const short = buildSession(w, 45)
      const iso = w.items.filter((i) => i.prio === 4).map((i) => i.ex)
      const base = w.items.filter((i) => i.prio === 2).map((i) => i.ex)
      if (short.dropped.some((d) => base.includes(d))) expect(short.dropped).toEqual(expect.arrayContaining(iso))
      expect(buildSession(w, 75).dropped).toEqual([])
    }
  })
  it('rotação dos treinos', () => {
    expect(nextWorkout([], 3)).toBe('A')
    expect(nextWorkout([sess('1', 'A', 1, [])], 3)).toBe('B')
    expect(nextWorkout([sess('1', 'A', 1, []), sess('2', 'B', 3, [])], 2)).toBe('A')
    expect(nextWorkout([sess('1', 'A', 1, []), sess('2', 'C', 3, [])], 3)).toBe('A')
  })
  it('progressão dupla', () => {
    expect(suggest([], 'agachamento', [4, 5], 4).kg).toBeNull()
    expect(suggest([sess('1', 'A', 1, [squat(80, [5, 5, 5, 5])])], 'agachamento', [4, 5], 4)).toMatchObject({ kg: 85, reps: 4 })
    expect(suggest([sess('1', 'A', 1, [squat(80, [5, 5, 4, 4])])], 'agachamento', [4, 5], 4)).toMatchObject({ kg: 80, reps: 5 })
  })
  it('recordes', () => {
    const first = sess('1', 'A', 1, [squat(80, [5, 5])])
    expect(records([], first)).toEqual([])
    expect(records([first], sess('2', 'A', 5, [squat(85, [5])]))).toEqual(['agachamento'])
    expect(records([first], sess('2', 'A', 5, [squat(80, [4])]))).toEqual([])
  })
})

import { peakWeek, phaseFor, sanitizeRuns, weekSchedule, type PlannedRun } from './workout/season'

describe('temporada', () => {
  const race = { name: 'Meia', date: '2027-03-14', km: 21.1 }
  it('fases até a prova', () => {
    expect(phaseFor('2026-11-16', null, '2026-11-16').id).toBe('livre')
    expect(phaseFor('2026-11-16', race, '2026-11-16').id).toBe('base')
    expect(phaseFor('2027-02-01', race, '2027-02-01').id).toBe('especifica')
    expect(phaseFor('2027-02-25', race, '2026-11-16').id).toBe('polimento')
    expect(phaseFor('2027-03-10', race, '2026-11-16').id).toBe('prova')
    expect(phaseFor('2027-03-16', race, '2026-11-16').id).toBe('recuperacao')
    // quarta semana desde o início é leve
    expect(phaseFor('2026-12-08', null, '2026-11-16').id).toBe('deload')
    expect(phaseFor('2026-12-15', null, '2026-11-16').id).toBe('livre')
  })
  it('a fase reduz séries de pernas e segura a carga', () => {
    const full = buildSession(WORKOUTS.A, 999)
    const taper = buildSession(WORKOUTS.A, 999, { legs: 0.6, upper: 1 })
    const sets = (b: typeof full, ex: string) => b.items.find((x) => x.item.ex === ex)!.sets
    expect(sets(taper, 'agachamento')).toBeLessThan(sets(full, 'agachamento'))
    expect(sets(taper, 'agachamento')).toBeGreaterThanOrEqual(2)
    expect(sets(taper, 'supino')).toBe(4)
    const s = { id: '1', workout: 'A' as const, date: '2026-11-01', minutes: 60, startedAt: 1, finishedAt: 2, entries: [{ ex: 'agachamento', target: 4, reps: [4, 5] as [number, number], rest: 150, sets: [5, 5, 5, 5].map((r) => ({ kg: 80, reps: r })) }] }
    expect(suggest([s], 'agachamento', [4, 5], 4, true).kg).toBe(80)
  })
  it('encaixa a musculação na semana de corrida', () => {
    // seg 16/11 ... ter tiro, qui leve, dom longão
    const runs: PlannedRun[] = [
      { date: '2026-11-17', kind: 'tiro', title: '8x400' },
      { date: '2026-11-19', kind: 'leve', title: '6 km' },
      { date: '2026-11-22', kind: 'longo', title: '16 km' },
    ]
    const wk = weekSchedule('2026-11-16', runs, 3, null)
    const day = (w: string) => wk.findIndex((d) => d.strength === w)
    expect(day('A')).toBeGreaterThanOrEqual(0)
    expect(day('B') - day('A')).toBeGreaterThanOrEqual(2)
    for (const w of ['A', 'B']) {
      expect(day(w)).not.toBe(0) // véspera do tiro
      expect(day(w)).not.toBe(5) // véspera do longão
      expect(day(w)).not.toBe(6) // dia do longão
    }
    expect(day('A')).toBe(1) // no mesmo dia do tiro
    expect(day('C')).not.toBe(6)
    expect(wk[1].note).toMatch(/3 horas/)
    // sem plano: semana padrão
    expect(weekSchedule('2026-11-16', [], 2, null).map((d) => d.strength ?? '-').join('')).toBe('A---B--')
    // semana da prova (domingo): um treino só, até quarta
    const rw = weekSchedule('2027-03-08', [{ date: '2027-03-14', kind: 'prova', title: 'Meia' }], 3, race)
    expect(rw.filter((d) => d.strength).length).toBe(1)
    expect(rw.findIndex((d) => d.strength)).toBeLessThanOrEqual(2)
  })
  it('limpa a leitura dos prints e detecta semana de pico', () => {
    expect(sanitizeRuns([{ date: '2026-11-17', kind: 'tiro', title: ' 8x400 ', km: '8' }, { date: '17/11', kind: 'x' }, { date: '2026-11-18', kind: 'voar', km: 999 }, null, { date: '2026-11-20', kind: 'descanso' }])).toEqual([
      { date: '2026-11-17', kind: 'tiro', title: '8x400', km: 8 },
      { date: '2026-11-18', kind: 'leve', title: '' },
    ])
    expect(sanitizeRuns('ignore')).toEqual([])
    const km = (date: string, k: number): PlannedRun => ({ date, kind: 'leve', title: '', km: k })
    const runs = [km('2026-11-03', 30), km('2026-11-10', 32), km('2026-11-17', 45), km('2026-11-24', 31)]
    expect(peakWeek('2026-11-16', runs)).toBe(true)
    expect(peakWeek('2026-11-09', runs)).toBe(false)
  })
})
