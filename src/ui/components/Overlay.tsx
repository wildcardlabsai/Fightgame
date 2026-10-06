import { useEffect, type ReactNode } from 'react'

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="modal-back" onClick={onClose} role="presentation">
      <div className={`modal${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3 className="display">{title}</h3>
          <button className="linkbtn" onClick={onClose} aria-label="Close">Close ✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}

/** Number input with −/+ buttons and a step, clamped to [min, max]. */
export function Stepper({ label, value, onChange, step, min = 0, max, format, hint, disabled }: {
  label: string; value: number; onChange: (n: number) => void; step: number; min?: number; max?: number
  format?: (n: number) => string; hint?: string; disabled?: boolean
}) {
  const clamp = (n: number) => Math.max(min, max === undefined ? n : Math.min(max, n))
  return (
    <div className="stepper">
      <div className="stepper-label">{label}{hint && <small className="dim"> {hint}</small>}</div>
      <div className="stepper-ctl">
        <button type="button" className="btn small ghost" disabled={disabled} onClick={() => onChange(clamp(value - step))} aria-label={`Decrease ${label}`}>−</button>
        <input className="input num" inputMode="numeric" disabled={disabled} aria-label={label} value={format ? format(value) : String(value)}
          onChange={(e) => { const n = Number(e.target.value.replace(/[^0-9.]/g, '')); if (!Number.isNaN(n)) onChange(clamp(n)) }} />
        <button type="button" className="btn small ghost" disabled={disabled} onClick={() => onChange(clamp(value + step))} aria-label={`Increase ${label}`}>+</button>
      </div>
    </div>
  )
}
