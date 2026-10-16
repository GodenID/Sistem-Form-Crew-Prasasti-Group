import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'

const ToastContext = createContext(null)
const DEFAULT_DURATION = 4200

function ToastIcon({ type }) {
  if (type === 'success') {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg>
  }
  if (type === 'error') {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8v5M12 17h.01" /><path d="M10.3 4.4 2.7 18a2 2 0 0 0 1.7 3h15.2a2 2 0 0 0 1.7-3L13.7 4.4a2 2 0 0 0-3.4 0Z" /></svg>
  }
  return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7h.01" /></svg>
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const toastsRef = useRef([])
  const timersRef = useRef(new Map())
  const idRef = useRef(0)

  const removeToast = useCallback((id) => {
    const timer = timersRef.current.get(id)
    if (timer) window.clearTimeout(timer)
    timersRef.current.delete(id)
    const next = toastsRef.current.filter((toast) => toast.id !== id)
    toastsRef.current = next
    setToasts(next)
  }, [])

  const notify = useCallback((type, title, message = '', options = {}) => {
    const duplicate = toastsRef.current.find((toast) => toast.type === type && toast.title === title && toast.message === message)
    if (duplicate) return duplicate.id

    idRef.current += 1
    const id = `toast-${Date.now()}-${idRef.current}`
    const duration = options.duration ?? DEFAULT_DURATION
    const toast = { id, type, title, message, duration }
    const next = [...toastsRef.current, toast].slice(-4)
    toastsRef.current = next
    setToasts(next)

    if (duration > 0) {
      const timer = window.setTimeout(() => removeToast(id), duration)
      timersRef.current.set(id, timer)
    }
    return id
  }, [removeToast])

  useEffect(() => () => {
    timersRef.current.forEach((timer) => window.clearTimeout(timer))
    timersRef.current.clear()
  }, [])

  const api = useMemo(() => ({
    success: (title, message, options) => notify('success', title, message, options),
    error: (title, message, options) => notify('error', title, message, options),
    info: (title, message, options) => notify('info', title, message, options),
    dismiss: removeToast,
  }), [notify, removeToast])

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast-viewport" aria-live="polite" aria-relevant="additions removals">
        {toasts.map((toast) => (
          <article className={`app-toast is-${toast.type}`} key={toast.id} role={toast.type === 'error' ? 'alert' : 'status'}>
            <span className="toast-icon"><ToastIcon type={toast.type} /></span>
            <div className="toast-copy">
              <strong>{toast.title}</strong>
              {toast.message && <p>{toast.message}</p>}
            </div>
            <button type="button" onClick={() => removeToast(toast.id)} aria-label={`Tutup notifikasi ${toast.title}`}>×</button>
            {toast.duration > 0 && <span className="toast-timer" style={{ '--toast-duration': `${toast.duration}ms` }} aria-hidden="true" />}
          </article>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast harus digunakan di dalam ToastProvider.')
  return context
}
