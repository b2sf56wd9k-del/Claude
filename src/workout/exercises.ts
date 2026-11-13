// Biblioteca de exercícios: como fazer, erro comum e o esquema (posição inicial e final).
import type { Purpose } from '../health'
import type { FigureDef, Pose } from './figure'

export interface ExerciseDef {
  id: string
  name: string
  purpose: Purpose
  muscles: string
  /** kg = com carga externa; corpo = só o peso do corpo */
  load: 'kg' | 'corpo'
  /** incremento de carga sugerido, em kg */
  step: number
  unit: 'reps' | 's'
  perSide?: boolean
  cues: string[]
  mistake: string
  fig: FigureDef
  /** exercícios que podem substituir este quando o aparelho está ocupado */
  alts?: string[]
}

/** em pé, de lado, braços soltos */
const stand = (x: number, over: Partial<Pose> = {}): Pose => ({ foot: [x, 108], torso: 180, armU: 0, armL: 0, legU: 0, legL: 0, ...over })
/** deitado no banco reto, pés no chão */
const lying = (over: Partial<Pose> = {}): Pose => ({ hip: [50, 78], torso: 90, armU: 180, armL: 180, legU: -75, legL: 0, ...over })
const FLAT_BENCH = { t: 'rect', x: 40, y: 81, w: 60, h: 7 } as const
const frontStand = (over: Partial<Pose> = {}): Pose => ({ torso: 180, armU: 8, armL: 8, legU: 4, legL: 0, ...over })
const pulldown = (over: Partial<Pose> = {}): Pose => ({ hip: [56, 88], torso: 188, armU: 172, armL: 176, legU: 88, legL: 0, ...over })

const LIST: ExerciseDef[] = [
  {
    id: 'pogo', name: 'Saltos pogo', purpose: 'corrida', muscles: 'Panturrilha e tendão de Aquiles', load: 'corpo', step: 0, unit: 'reps',
    cues: ['Joelhos quase retos: o salto vem do tornozelo.', 'Toque o chão com a ponta do pé e saia o mais rápido possível.', 'Tronco alto, braços ajudam no ritmo.'],
    mistake: 'Dobrar os joelhos e "afundar" a cada salto, transformando em agachamento.',
    fig: { a: stand(70, { armU: 15, armL: 70, legU: 6, legL: -6 }), b: { ...stand(70, { armU: 30, armL: 80 }), foot: [70, 96], toe: 40 } },
  },
  {
    id: 'agachamento', name: 'Agachamento com barra', purpose: 'corrida', muscles: 'Quadríceps, glúteos e core', load: 'kg', step: 5, unit: 'reps', alts: ['leg-press'],
    cues: ['Pés na largura dos ombros, barra apoiada no trapézio.', 'Desça empurrando o quadril para trás e os joelhos para fora, até a coxa ficar paralela ao chão.', 'Suba empurrando o chão, com o peito aberto.'],
    mistake: 'Deixar os joelhos caírem para dentro ou tirar os calcanhares do chão.',
    fig: {
      a: stand(66, { armU: -25, armL: 172 }),
      b: stand(66, { torso: 150, armU: -25, armL: 172, legU: 78, legL: -22 }),
      props: [{ t: 'load', kind: 'bar', at: 'shoulder', dx: -3, dy: -1 }],
    },
  },
  {
    id: 'leg-press', name: 'Leg press', purpose: 'corrida', muscles: 'Quadríceps e glúteos', load: 'kg', step: 10, unit: 'reps', alts: ['agachamento'],
    cues: ['Pés na largura do quadril, no meio da plataforma.', 'Desça até os joelhos chegarem perto de 90 graus, sem tirar o quadril do banco.', 'Empurre sem travar os joelhos no final.'],
    mistake: 'Descer demais e deixar a lombar descolar do encosto.',
    fig: {
      a: { hip: [46, 94], torso: -150, armU: 20, armL: 60, legU: 120, legL: 120 },
      b: { hip: [46, 94], torso: -150, armU: 20, armL: 60, legU: 165, legL: 95 },
      props: [{ t: 'line', x1: 20, y1: 60, x2: 44, y2: 100 }, { t: 'load', kind: 'bar', at: 'foot', dx: 6 }],
    },
  },
  {
    id: 'supino', name: 'Supino reto', purpose: 'estetica', muscles: 'Peitoral, ombros e tríceps', load: 'kg', step: 2.5, unit: 'reps', alts: ['flexao'],
    cues: ['Escápulas juntas e apoiadas no banco, pés firmes no chão.', 'Desça a barra até a linha do peito, cotovelos a uns 45 graus do tronco.', 'Empurre de volta até estender os braços.'],
    mistake: 'Abrir os cotovelos a 90 graus e quicar a barra no peito.',
    fig: { a: lying(), b: lying({ armU: 0, armL: 180 }), props: [FLAT_BENCH, { t: 'load', kind: 'bar', at: 'hand' }] },
  },
  {
    id: 'flexao', name: 'Flexão de braço', purpose: 'estetica', muscles: 'Peitoral, ombros e tríceps', load: 'corpo', step: 0, unit: 'reps', alts: ['supino'],
    cues: ['Mãos um pouco mais abertas que os ombros.', 'Corpo em linha reta da cabeça ao calcanhar.', 'Desça até o peito quase tocar o chão e empurre.'],
    mistake: 'Deixar o quadril cair ou subir, quebrando a linha do corpo.',
    fig: {
      a: { foot: [16, 106], torso: 111, armU: 0, armL: 0, legU: -69, legL: -69, toe: 0 },
      b: { foot: [16, 106], torso: 102, armU: -50, armL: 50, legU: -78, legL: -78, toe: 0 },
    },
  },
  {
    id: 'supino-inclinado', name: 'Supino inclinado com halteres', purpose: 'estetica', muscles: 'Parte superior do peitoral e ombros', load: 'kg', step: 2, unit: 'reps',
    cues: ['Banco a cerca de 30 graus.', 'Desça os halteres ao lado do peito, com os punhos acima dos cotovelos.', 'Suba aproximando os halteres, sem bater um no outro.'],
    mistake: 'Inclinar demais o banco, o que tira o trabalho do peito e joga para o ombro.',
    fig: {
      a: { hip: [50, 86], torso: 125, armU: 125, armL: 180, legU: -80, legL: 0 },
      b: { hip: [50, 86], torso: 125, armU: 30, armL: 180, legU: -80, legL: 0 },
      props: [{ t: 'line', x1: 47, y1: 92, x2: 84, y2: 66 }, { t: 'rect', x: 34, y: 91, w: 22, h: 6 }, { t: 'load', kind: 'db', at: 'hand' }],
    },
  },
  {
    id: 'remada-curvada', name: 'Remada curvada', purpose: 'estetica', muscles: 'Dorsais, trapézio e bíceps', load: 'kg', step: 2.5, unit: 'reps', alts: ['remada-baixa'],
    cues: ['Incline o tronco a cerca de 45 graus, coluna reta e joelhos soltos.', 'Puxe a barra em direção ao umbigo, cotovelos rentes ao corpo.', 'Desça controlando até estender os braços.'],
    mistake: 'Usar o balanço do tronco para subir a carga.',
    fig: {
      a: stand(58, { torso: 118, legU: 25, legL: -12 }),
      b: stand(58, { torso: 118, armU: -55, armL: 35, legU: 25, legL: -12 }),
      props: [{ t: 'load', kind: 'bar', at: 'hand' }],
    },
  },
  {
    id: 'remada-baixa', name: 'Remada baixa na polia', purpose: 'estetica', muscles: 'Dorsais, trapézio e bíceps', load: 'kg', step: 5, unit: 'reps', alts: ['remada-curvada'],
    cues: ['Sente com os joelhos levemente dobrados e a coluna reta.', 'Puxe o pegador até o abdômen, juntando as escápulas.', 'Volte devagar, sem arredondar as costas.'],
    mistake: 'Balançar o tronco para a frente e para trás a cada repetição.',
    fig: {
      a: { hip: [48, 92], torso: 172, armU: 85, armL: 88, legU: 82, legL: 68 },
      b: { hip: [48, 92], torso: 186, armU: -25, armL: 95, legU: 82, legL: 68 },
      props: [{ t: 'rect', x: 34, y: 94, w: 26, h: 6 }, { t: 'rect', x: 98, y: 86, w: 6, h: 24 }, { t: 'cable', x: 126, y: 74, at: 'hand' }],
    },
  },
  {
    id: 'bulgaro', name: 'Afundo búlgaro', purpose: 'corrida', muscles: 'Quadríceps e glúteos, uma perna por vez', load: 'kg', step: 2, unit: 'reps', perSide: true,
    cues: ['Peito do pé de trás apoiado no banco, pé da frente bem à frente.', 'Desça reto até a coxa da frente ficar paralela ao chão.', 'Suba empurrando com o calcanhar da frente.'],
    mistake: 'Ficar perto demais do banco, jogando o joelho muito à frente do pé.',
    fig: {
      a: stand(84, { torso: 176, legU: 12, legL: -6, leg2U: -38, leg2L: -100 }),
      b: stand(84, { torso: 166, legU: 78, legL: -14, leg2U: -12, leg2L: -96 }),
      props: [{ t: 'rect', x: 22, y: 88, w: 24, h: 22 }, { t: 'load', kind: 'db', at: 'hand' }],
    },
  },
  {
    id: 'elevacao-lateral', name: 'Elevação lateral', purpose: 'estetica', muscles: 'Deltoide lateral (largura dos ombros)', load: 'kg', step: 1, unit: 'reps',
    cues: ['Cotovelos levemente dobrados, halteres ao lado do corpo.', 'Suba os braços para os lados até a altura dos ombros.', 'Desça em 2 a 3 segundos, sem soltar.'],
    mistake: 'Encolher os ombros e subir com impulso do tronco.',
    fig: { view: 'front', a: frontStand(), b: frontStand({ armU: 80, armL: 88 }), props: [{ t: 'load', kind: 'db', at: 'hand' }] },
  },
  {
    id: 'panturrilha-pe', name: 'Panturrilha em pé', purpose: 'prevencao', muscles: 'Gastrocnêmio', load: 'kg', step: 5, unit: 'reps',
    cues: ['Ponta dos pés no degrau, calcanhares para fora.', 'Desça o calcanhar abaixo do degrau e segure 2 segundos.', 'Suba o mais alto possível, com joelhos retos.'],
    mistake: 'Fazer repetições curtas e rápidas, quicando embaixo.',
    fig: {
      a: { ...stand(62), foot: [61, 105], toe: 110 },
      b: { ...stand(62), foot: [63, 97], toe: 50 },
      props: [{ t: 'rect', x: 62, y: 103, w: 26, h: 7 }, { t: 'load', kind: 'db', at: 'hand' }],
    },
  },
  {
    id: 'copenhagen', name: 'Prancha Copenhagen', purpose: 'prevencao', muscles: 'Adutores e oblíquos', load: 'corpo', step: 0, unit: 's', perSide: true,
    cues: ['De lado, antebraço no chão e a perna de cima apoiada no banco.', 'Eleve o quadril até o corpo formar uma linha reta.', 'Mais fácil: apoie o joelho no banco em vez do pé.'],
    mistake: 'Deixar o quadril cair ou girar para a frente.',
    fig: {
      a: { hip: [64, 105], torso: 116, armU: 0, armL: 90, legU: -106, legL: -106, toe: 180 },
      b: { hip: [64, 98], torso: 104, armU: 0, armL: 90, legU: -97, legL: -97, toe: 180 },
      props: [{ t: 'rect', x: 8, y: 95, w: 26, h: 15 }],
    },
  },
  {
    id: 'salto-caixa', name: 'Salto sobre caixa', purpose: 'corrida', muscles: 'Potência de pernas', load: 'corpo', step: 0, unit: 'reps',
    cues: ['Agache um pouco, jogue os braços para trás e salte com força máxima.', 'Aterrisse leve, com os pés inteiros na caixa.', 'Desça caminhando, nunca saltando para trás.'],
    mistake: 'Fazer rápido e cansado: aqui vale a qualidade de cada salto, não o volume.',
    fig: {
      a: stand(36, { torso: 140, armU: -45, armL: -25, legU: 62, legL: -20 }),
      b: { ...stand(96, { armU: 30, armL: 70 }), foot: [96, 92] },
      props: [{ t: 'rect', x: 80, y: 94, w: 38, h: 16 }],
    },
  },
  {
    id: 'terra-romeno', name: 'Levantamento terra romeno', purpose: 'corrida', muscles: 'Posterior de coxa, glúteos e lombar', load: 'kg', step: 5, unit: 'reps',
    cues: ['Barra junto às coxas, joelhos levemente dobrados.', 'Empurre o quadril para trás, descendo a barra rente às pernas até o meio da canela.', 'Suba contraindo os glúteos, sem arquear as costas.'],
    mistake: 'Arredondar a coluna ou transformar o movimento em agachamento.',
    fig: {
      a: stand(64),
      b: stand(64, { torso: 104, legU: 22, legL: 2 }),
      props: [{ t: 'load', kind: 'bar', at: 'hand' }],
    },
  },
  {
    id: 'desenvolvimento', name: 'Desenvolvimento com halteres', purpose: 'estetica', muscles: 'Ombros e tríceps', load: 'kg', step: 2, unit: 'reps',
    cues: ['Halteres na altura das orelhas, cotovelos abaixo dos punhos.', 'Empurre para cima até quase estender os braços.', 'Abdômen firme, sem arquear a lombar.'],
    mistake: 'Inclinar o tronco para trás para ajudar a subir.',
    fig: { view: 'front', a: frontStand({ armU: 62, armL: 180 }), b: frontStand({ armU: 165, armL: 180 }), props: [{ t: 'load', kind: 'db', at: 'hand' }] },
  },
  {
    id: 'puxada', name: 'Puxada alta', purpose: 'estetica', muscles: 'Dorsais (largura das costas) e bíceps', load: 'kg', step: 5, unit: 'reps', alts: ['puxada-neutra'],
    cues: ['Pegada um pouco mais aberta que os ombros, peito alto.', 'Puxe a barra até a parte de cima do peito, levando os cotovelos para baixo.', 'Volte devagar até estender os braços.'],
    mistake: 'Puxar atrás da nuca ou deitar o tronco para trás.',
    fig: {
      a: pulldown(),
      b: pulldown({ torso: 194, armU: 25, armL: 168 }),
      props: [{ t: 'rect', x: 42, y: 90, w: 26, h: 6 }, { t: 'cable', x: 62, y: 4, at: 'hand' }, { t: 'load', kind: 'db', at: 'hand' }],
    },
  },
  {
    id: 'puxada-neutra', name: 'Puxada alta pegada neutra', purpose: 'estetica', muscles: 'Dorsais e bíceps', load: 'kg', step: 5, unit: 'reps', alts: ['puxada'],
    cues: ['Use o pegador em V ou barra com as palmas viradas uma para a outra.', 'Puxe até o peito, cotovelos rentes ao corpo.', 'Volte devagar, sentindo alongar as costas.'],
    mistake: 'Encurtar o movimento, sem estender os braços em cima.',
    fig: {
      a: pulldown(),
      b: pulldown({ torso: 196, armU: 12, armL: 165 }),
      props: [{ t: 'rect', x: 42, y: 90, w: 26, h: 6 }, { t: 'cable', x: 62, y: 4, at: 'hand' }, { t: 'load', kind: 'db', at: 'hand' }],
    },
  },
  {
    id: 'elevacao-pelvica', name: 'Elevação pélvica com barra', purpose: 'corrida', muscles: 'Glúteos e posterior de coxa', load: 'kg', step: 5, unit: 'reps',
    cues: ['Escápulas apoiadas no banco, barra sobre o quadril, pés na largura do quadril.', 'Suba o quadril até o tronco ficar paralelo ao chão.', 'Segure 1 segundo em cima apertando os glúteos.'],
    mistake: 'Arquear a lombar em cima em vez de terminar com os glúteos.',
    fig: {
      a: { hip: [58, 98], torso: -118, head: -100, armU: 100, armL: 110, legU: 112, legL: 8 },
      b: { hip: [60, 85], torso: -90, head: -75, armU: 92, armL: 92, legU: 90, legL: 0 },
      props: [{ t: 'rect', x: 12, y: 88, w: 24, h: 22 }, { t: 'load', kind: 'bar', at: 'hip', dy: -5 }],
    },
  },
  {
    id: 'rosca-direta', name: 'Rosca direta', purpose: 'estetica', muscles: 'Bíceps', load: 'kg', step: 2.5, unit: 'reps',
    cues: ['Cotovelos colados ao corpo, palmas para a frente.', 'Suba a barra até a altura dos ombros.', 'Desça em 2 a 3 segundos até estender.'],
    mistake: 'Jogar os cotovelos para a frente e balançar o tronco.',
    fig: { a: stand(66, { armU: 4, armL: 8 }), b: stand(66, { armU: 6, armL: 158 }), props: [{ t: 'load', kind: 'bar', at: 'hand' }] },
  },
  {
    id: 'rosca-martelo', name: 'Rosca martelo', purpose: 'estetica', muscles: 'Bíceps e braquial (espessura do braço)', load: 'kg', step: 1, unit: 'reps',
    cues: ['Halteres com as palmas viradas para o corpo.', 'Suba sem girar o punho, cotovelos parados.', 'Desça controlando.'],
    mistake: 'Subir os dois braços com impulso do quadril.',
    fig: { a: stand(66, { armU: 4, armL: 8 }), b: stand(66, { armU: 6, armL: 155 }), props: [{ t: 'load', kind: 'db', at: 'hand' }] },
  },
  {
    id: 'triceps-polia', name: 'Tríceps na polia', purpose: 'estetica', muscles: 'Tríceps', load: 'kg', step: 2.5, unit: 'reps',
    cues: ['Cotovelos colados às costelas, tronco levemente inclinado.', 'Empurre a barra para baixo até estender os braços.', 'Suba só até o antebraço passar um pouco da horizontal.'],
    mistake: 'Deixar os cotovelos abrirem e subirem junto com a barra.',
    fig: {
      a: stand(58, { torso: 172, armU: 8, armL: 118 }),
      b: stand(58, { torso: 172, armU: 8, armL: 12 }),
      props: [{ t: 'rect', x: 96, y: 6, w: 6, h: 104 }, { t: 'cable', x: 96, y: 10, at: 'hand' }, { t: 'load', kind: 'db', at: 'hand' }],
    },
  },
  {
    id: 'triceps-testa', name: 'Tríceps testa', purpose: 'estetica', muscles: 'Tríceps', load: 'kg', step: 2.5, unit: 'reps',
    cues: ['Deitado, braços estendidos acima do peito.', 'Dobre só os cotovelos, descendo a barra em direção à testa.', 'Estenda de volta sem mover os ombros.'],
    mistake: 'Abrir os cotovelos para os lados.',
    fig: { a: lying({ armU: 175, armL: 180 }), b: lying({ armU: 168, armL: 78 }), props: [FLAT_BENCH, { t: 'load', kind: 'bar', at: 'hand' }] },
  },
  {
    id: 'panturrilha-sentado', name: 'Panturrilha sentado', purpose: 'prevencao', muscles: 'Sóleo, o músculo que mais trabalha na corrida', load: 'kg', step: 5, unit: 'reps',
    cues: ['Joelhos a 90 graus, apoio da máquina logo acima dos joelhos.', 'Desça os calcanhares o máximo que conseguir.', 'Suba e segure 1 segundo em cima.'],
    mistake: 'Usar pouca amplitude: o ganho está na parte de baixo do movimento.',
    fig: {
      a: { foot: [78, 104], torso: 180, armU: 40, armL: 75, legU: 84, legL: 0, toe: 105 },
      b: { foot: [80, 97], torso: 180, armU: 40, armL: 75, legU: 103, legL: 0, toe: 50 },
      props: [{ t: 'rect', x: 40, y: 84, w: 28, h: 6 }, { t: 'rect', x: 80, y: 102, w: 20, h: 8 }, { t: 'load', kind: 'bar', at: 'knee', dy: -8 }],
    },
  },
  {
    id: 'pallof', name: 'Pallof press', purpose: 'prevencao', muscles: 'Core (resistência à rotação)', load: 'kg', step: 2.5, unit: 'reps', perSide: true,
    cues: ['De lado para a polia, pegador junto ao peito.', 'Estenda os braços à frente sem deixar o tronco girar.', 'Segure 2 segundos e volte.'],
    mistake: 'Deixar o quadril ou os ombros rodarem na direção da polia.',
    fig: { a: stand(60, { armU: 25, armL: 150 }), b: stand(60, { armU: 88, armL: 90 }), props: [{ t: 'load', kind: 'db', at: 'hand' }] },
  },
  {
    id: 'remada-unilateral', name: 'Remada unilateral com halter', purpose: 'estetica', muscles: 'Dorsais e trapézio, um lado por vez', load: 'kg', step: 2, unit: 'reps', perSide: true,
    cues: ['Uma mão apoiada no banco, tronco quase paralelo ao chão.', 'Puxe o halter em direção ao quadril, cotovelo rente ao corpo.', 'Desça até estender o braço, sem girar o tronco.'],
    mistake: 'Girar o tronco para cima a cada puxada.',
    fig: {
      a: stand(46, { torso: 102, arm2U: 5, arm2L: 5, legU: 22, legL: -8 }),
      b: stand(46, { torso: 102, armU: -65, armL: 20, arm2U: 5, arm2L: 5, legU: 22, legL: -8 }),
      props: [{ t: 'rect', x: 68, y: 88, w: 40, h: 6 }, { t: 'load', kind: 'db', at: 'hand' }],
    },
  },
  {
    id: 'step-up', name: 'Step-up no banco', purpose: 'corrida', muscles: 'Quadríceps e glúteos, uma perna por vez', load: 'kg', step: 2, unit: 'reps', perSide: true,
    cues: ['Um pé inteiro em cima do banco.', 'Suba usando só a perna de cima, sem impulso da de baixo.', 'Desça devagar, em 3 segundos.'],
    mistake: 'Empurrar com o pé que está no chão.',
    fig: {
      a: { foot: [84.5, 94], torso: 170, armU: 0, armL: 0, legU: 69, legL: 0, leg2U: 0, leg2L: 0 },
      b: { foot: [84.5, 94], torso: 180, armU: 0, armL: 0, legU: 0, legL: 0, leg2U: -8, leg2L: -30 },
      props: [{ t: 'rect', x: 74, y: 96, w: 38, h: 14 }, { t: 'load', kind: 'db', at: 'hand' }],
    },
  },
  {
    id: 'nordica', name: 'Flexão nórdica', purpose: 'prevencao', muscles: 'Posterior de coxa', load: 'corpo', step: 0, unit: 'reps',
    cues: ['Ajoelhado, com os tornozelos presos (em um aparelho ou por um parceiro).', 'Desça o tronco para a frente o mais devagar possível, quadril estendido.', 'Apare a queda com as mãos e volte empurrando o chão.'],
    mistake: 'Dobrar o quadril e descer "sentando" para a frente.',
    fig: {
      a: { knee: [62, 104], torso: 180, armU: 20, armL: 150, legU: 0, legL: -90, toe: 180 },
      b: { knee: [62, 104], torso: 128, armU: 95, armL: 150, legU: -52, legL: -90, toe: 180 },
      props: [{ t: 'rect', x: 30, y: 94, w: 12, h: 7 }],
    },
  },
  {
    id: 'prancha', name: 'Prancha frontal', purpose: 'prevencao', muscles: 'Core', load: 'corpo', step: 0, unit: 's',
    cues: ['Cotovelos abaixo dos ombros, corpo em linha reta.', 'Contraia abdômen e glúteos como se fosse levar um soco.', 'Respire normalmente; pare quando perder a posição.'],
    mistake: 'Deixar a lombar afundar ou o quadril subir.',
    fig: { a: { hip: [60, 97], torso: 98, head: 85, armU: 0, armL: 90, legU: -82, legL: -82, toe: 0 } },
  },
]

export const EXERCISES: Record<string, ExerciseDef> = Object.fromEntries(LIST.map((e) => [e.id, e]))
export const EXERCISE_LIST = LIST
