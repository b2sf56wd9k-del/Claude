import { useEffect, useState } from 'react'
import { VIEW, WIDTH, mix, skeleton, type Bone, type FigureDef, type Pose, type Skeleton } from './figure'

/** Uma parte do corpo: cápsula com um contorno da cor do fundo, que separa as partes sobrepostas. */
function Part({ b, cls }: { b: Bone; cls: string }) {
  const w = WIDTH[b.seg]
  const xy = { x1: b.from[0], y1: b.from[1], x2: b.to[0], y2: b.to[1] }
  return (
    <>
      <line className="fig-gap" {...xy} strokeWidth={w + 2.4} />
      <line className={cls} {...xy} strokeWidth={w} />
    </>
  )
}

function Body({ def, sk, ghost }: { def: FigureDef; sk: Skeleton; ghost?: boolean }) {
  const hot = (b: Bone) => !ghost && !b.back && b.seg !== 'foot' && def.hot?.includes(b.seg)
  const cls = (b: Bone) => (hot(b) ? 'fig-hot' : b.back ? 'fig-back' : 'fig-skin')
  const torsoHot = !ghost && def.hot?.includes('torso')
  // de frente: pernas, tronco, cabeça e por último os braços, que passam na frente do corpo
  const legs = sk.torsoPoly ? sk.bones.filter((b) => b.seg === 'foot' || b.seg === 'legU' || b.seg === 'legL') : []
  const rest = sk.torsoPoly ? sk.bones.filter((b) => !legs.includes(b)) : sk.bones
  return (
    <g className={ghost ? 'fig-ghost' : 'fig-body'}>
      {!ghost &&
        def.props?.map((p, i) =>
          p.t === 'cable' ? <line key={i} className="fig-cable" x1={p.x} y1={p.y} x2={sk.joints[p.at][0]} y2={sk.joints[p.at][1]} /> : null,
        )}
      {legs.map((b, i) => (
        <Part key={`l${i}`} b={b} cls={cls(b)} />
      ))}
      {sk.torsoPoly && <polygon className={torsoHot ? 'fig-hot fig-torso' : 'fig-skin fig-torso'} points={sk.torsoPoly.map((p) => p.join(',')).join(' ')} />}
      {sk.torsoPoly && <circle className="fig-head" cx={sk.head[0]} cy={sk.head[1]} r={7} />}
      {rest.map((b, i) => (
        <Part key={i} b={b} cls={cls(b)} />
      ))}
      {!sk.torsoPoly && <circle className="fig-head" cx={sk.head[0]} cy={sk.head[1]} r={7} />}
      {def.props?.map((p, i) => {
        if (p.t !== 'load' || ghost) return null
        const at = p.at === 'hand' && def.view === 'front' ? [sk.joints.hand, sk.joints.hand2] : [sk.joints[p.at]]
        return at.map((j, k) => {
          const x = j[0] + (p.dx ?? 0)
          const y = j[1] + (p.dy ?? 0)
          return p.kind === 'bar' ? (
            <g key={`${i}-${k}`} className="fig-load">
              <circle cx={x} cy={y} r={8} />
              <circle className="fig-hub" cx={x} cy={y} r={2.2} />
            </g>
          ) : (
            <rect key={`${i}-${k}`} className="fig-load" x={x - 6} y={y - 3.5} width={12} height={7} rx={2.5} />
          )
        })
      })}
    </g>
  )
}

/**
 * Esquema do exercício. Parado mostra o início (apagado) e o fim; animado vai e volta entre os dois.
 * As partes do corpo que mais trabalham aparecem na cor de destaque.
 */
export default function Figure({ def, animate = false, label }: { def: FigureDef; animate?: boolean; label: string }) {
  const [t, setT] = useState(1)
  const moving = animate && !!def.b
  useEffect(() => {
    if (!moving) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    let raf = 0
    const start = performance.now()
    const tick = (now: number) => {
      // ciclo de 3 s: pausa no início, vai, pausa no fim, volta
      const c = ((now - start) % 3000) / 3000
      const x = c < 0.1 ? 0 : c < 0.45 ? (c - 0.1) / 0.35 : c < 0.6 ? 1 : (1 - c) / 0.4
      setT(x * x * (3 - 2 * x))
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [moving])

  const pose: Pose = def.b ? mix(def.a, def.b, moving ? t : 1) : def.a
  return (
    <svg className="fig" viewBox={`0 0 ${VIEW.w} ${VIEW.h}`} role="img" aria-label={`Esquema: ${label}`}>
      <line className="fig-floor" x1={6} y1={VIEW.floor} x2={VIEW.w - 6} y2={VIEW.floor} />
      {def.props?.map((p, i) =>
        p.t === 'rect' ? (
          <rect key={i} className="fig-prop" x={p.x} y={p.y} width={p.w} height={p.h} rx={2} />
        ) : p.t === 'line' ? (
          <line key={i} className="fig-prop-line" x1={p.x1} y1={p.y1} x2={p.x2} y2={p.y2} />
        ) : null,
      )}
      {def.b && !moving && <Body def={def} sk={skeleton(def, def.a)} ghost />}
      <Body def={def} sk={skeleton(def, pose)} />
    </svg>
  )
}
