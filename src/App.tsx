import { useState } from 'react'
import Status from './pages/Status'
import Quests from './pages/Quests'
import Health from './pages/Health'
import Finance from './pages/Finance'
import Settings from './pages/Settings'

const TABS = [
  { id: 'status', label: 'Status', el: <Status /> },
  { id: 'quests', label: 'Missões', el: <Quests /> },
  { id: 'health', label: 'Saúde', el: <Health /> },
  { id: 'finance', label: 'Gastos', el: <Finance /> },
  { id: 'settings', label: 'Ajustes', el: <Settings /> },
]

export default function App() {
  const [tab, setTab] = useState('status')
  return (
    <div className="app">
      <main>{TABS.find((t) => t.id === tab)!.el}</main>
      <nav className="tabs">
        {TABS.map((t) => (
          <button key={t.id} className={t.id === tab ? 'on' : ''} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  )
}
