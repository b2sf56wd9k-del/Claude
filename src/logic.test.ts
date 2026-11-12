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
    expect(totalXp(ev)).toBe(240)
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
