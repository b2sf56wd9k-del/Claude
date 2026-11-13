import { useEffect, useState } from 'react'
import { VIEW, mix, skeleton, type FigureDef, type Pose, type Skeleton } from './figure'

function Body({ def, sk, ghost }: { def: FigureDef; sk: Skeleton; ghost?: boolean }) {
  const cls = ghost ? 'fig-ghost' : 'fig-body'
  return (
    <g className={cls}>
      {!ghost &&
        def.props?.map((p, i) =>
          p.t === 'cable' ? <line key={i} className="fig-cable" x1={p.x} y1={p.y} x2={sk.joints[p.at][0]} y2={sk.joints[p.at][1]} /> : null,
        )}
      {sk.bones.map((b, i) => (
        <line key={i} className={b.back ? 'fig-back' : undefined} x1={b.from[0]} y1={b.from[1]} x2={b.to[0]} y2={b.to[1]} />
      ))}
      <circle className="fig-head" cx={sk.head[0]} cy={sk.head[1]} r={6} />
      {def.props?.map((p, i) => {
        if (p.t !== 'load' || ghost) return null
        const at = p.at === 'hand' && def.view === 'front' ? [sk.joints.hand, sk.joints.hand2] : [sk.joints[p.at]]
        return at.map((j, k) => {
          const x = j[0] + (p.dx ?? 0)
          const y = j[1] + (p.dy ?? 0)
          return p.kind === 'bar' ? (
            <g key={`${i}-${k}`} className="fig-load">
              <circle cx={x} cy={y} r={7} />
              <circle className="fig-hub" cx={x} cy={y} r={2} />
            </g>
          ) : (
            <rect key={`${i}-${k}`} className="fig-load" x={x - 5} y={y - 3} width={10} height={6} rx={2} />
          )
        })
      })}
    </g>
  )
}

/**
 * Esquema do exercício. Parado mostra o início (apagado) e o fim; animado vai e volta entre os dois.
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
      {def.b && <Body def={def} sk={skeleton(def, def.a)} ghost />}
      <Body def={def} sk={skeleton(def, pose)} />
    </svg>
  )
}
