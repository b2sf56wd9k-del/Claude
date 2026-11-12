import { ATTRS, levelInfo, nextRank, rankFor, streak, toISO, totalXp, xpByAttr } from '../game'
import { useStore } from '../store'

export default function Status() {
  const name = useStore((s) => s.name)
  const events = useStore((s) => s.events)
  const today = toISO(new Date())

  const total = totalXp(events)
  const lv = levelInfo(total)
  const rank = rankFor(lv.level)
  const next = nextRank(lv.level)
  const byAttr = xpByAttr(events)
  const days = streak(events, today)
  const todayXp = events.filter((e) => e.date === today).reduce((s, e) => s + e.xp, 0)
  const recent = [...events].filter((e) => e.xp > 0).reverse().slice(0, 8)

  return (
    <>
      <div className="card">
        <div className="hero">
          <div className="rank" aria-label={`Rank ${rank}`}>
            <span>{rank}</span>
          </div>
          <div className="grow">
            <p className="muted small">{name}</p>
            <p className="level">Nível {lv.level}</p>
            <div className="meter gold" style={{ margin: '10px 0 6px' }}>
              <i style={{ width: `${(lv.into / lv.need) * 100}%` }} />
            </div>
            <p className="small muted num">
              {lv.into} / {lv.need} XP
              {next && ` · rank ${next.rank} no nível ${next.min}`}
            </p>
          </div>
        </div>
      </div>

      <div className="tiles">
        <div className="tile">
          <b>{days}</b>
          <span>{days === 1 ? 'dia seguido' : 'dias seguidos'}</span>
        </div>
        <div className="tile">
          <b>+{todayXp}</b>
          <span>XP hoje</span>
        </div>
        <div className="tile">
          <b>{total.toLocaleString('pt-BR')}</b>
          <span>XP total</span>
        </div>
      </div>

      <h2>Atributos</h2>
      <div className="card">
        {ATTRS.map((a) => {
          const info = levelInfo(byAttr[a.id], 60)
          return (
            <div className="attr" key={a.id} title={`${info.into} / ${info.need} XP`}>
              <span>{a.name}</span>
              <div className="meter">
                <i style={{ width: `${(info.into / info.need) * 100}%` }} />
              </div>
              <span className="lv">Nv {info.level}</span>
            </div>
          )
        })}
      </div>

      <h2>Últimas conquistas</h2>
      <div className="card">
        {recent.length === 0 && <p className="muted">Nada ainda. Conclua sua primeira missão na aba Missões.</p>}
        {recent.map((e) => (
          <div className="log" key={e.key}>
            <span>{e.label}</span>
            <span className="xp">+{e.xp} XP</span>
          </div>
        ))}
      </div>
    </>
  )
}
