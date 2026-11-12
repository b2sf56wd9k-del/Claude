// Confirmações e perguntas dentro da própria página (confirm/prompt do navegador não funcionam em artefatos).
import { useState } from 'react'
import { create } from 'zustand'

interface Req {
  message: string
  action: string
  input?: 'password'
  danger?: boolean
  resolve: (v: string | boolean | null) => void
}

const useDialog = create<{ req: Req | null }>(() => ({ req: null }))

export function confirmDialog(message: string, action = 'Confirmar', danger = false): Promise<boolean> {
  return new Promise((resolve) => useDialog.setState({ req: { message, action, danger, resolve: (v) => resolve(v === true) } }))
}

export function promptDialog(message: string, action = 'OK'): Promise<string | null> {
  return new Promise((resolve) =>
    useDialog.setState({ req: { message, action, input: 'password', resolve: (v) => resolve(typeof v === 'string' ? v : null) } }),
  )
}

export function DialogHost() {
  const req = useDialog((s) => s.req)
  const [text, setText] = useState('')
  if (!req) return null
  const close = (v: string | boolean | null) => {
    useDialog.setState({ req: null })
    setText('')
    req.resolve(v)
  }
  return (
    <div className="overlay" role="dialog" aria-modal="true">
      <div className="card modal">
        <p>{req.message}</p>
        {req.input && <input id="dialog-input" type="password" autoFocus value={text} onChange={(e) => setText(e.target.value)} style={{ marginTop: 12, width: '100%' }} />}
        <div className="row" style={{ marginTop: 16, justifyContent: 'flex-end' }}>
          <button className="btn ghost" onClick={() => close(req.input ? null : false)}>
            Cancelar
          </button>
          <button className={`btn ${req.danger ? 'danger' : ''}`} onClick={() => close(req.input ? text : true)}>
            {req.action}
          </button>
        </div>
      </div>
    </div>
  )
}
