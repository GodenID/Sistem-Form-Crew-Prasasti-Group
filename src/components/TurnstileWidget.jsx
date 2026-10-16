import { useEffect, useRef } from 'react'

let scriptPromise = null

function loadTurnstileScript() {
  if (typeof window !== 'undefined' && window.turnstile) return Promise.resolve()
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
      script.async = true
      script.defer = true
      script.onload = () => resolve()
      script.onerror = () => {
        scriptPromise = null
        reject(new Error('turnstile-script-load-failed'))
      }
      document.head.appendChild(script)
    })
  }
  return scriptPromise
}

// Checkbox "saya bukan robot" Cloudflare Turnstile (explicit render).
// resetSignal: naikkan angkanya untuk me-reset widget (mis. sesudah kirim).
function TurnstileWidget({ siteKey, onVerify, onExpire, onError, resetSignal }) {
  const containerRef = useRef(null)
  const widgetIdRef = useRef(null)
  const callbacksRef = useRef({ onVerify, onExpire, onError })
  callbacksRef.current = { onVerify, onExpire, onError }

  useEffect(() => {
    if (!siteKey) return undefined
    let cancelled = false
    loadTurnstileScript().then(() => {
      if (cancelled || !containerRef.current || !window.turnstile) return
      try {
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          callback: (token) => callbacksRef.current.onVerify?.(token),
          'expired-callback': () => callbacksRef.current.onExpire?.(),
          'error-callback': (code) => callbacksRef.current.onError?.(code || 'render-error'),
          retry: 'auto',
          'refresh-expired': 'auto',
          theme: 'light',
        })
      } catch {
        callbacksRef.current.onError?.('render-error')
      }
    }).catch(() => {
      if (!cancelled) callbacksRef.current.onError?.('script-load')
    })
    return () => {
      cancelled = true
      try {
        if (widgetIdRef.current !== null && window.turnstile) window.turnstile.remove(widgetIdRef.current)
      } catch {
        // Abaikan bila widget sudah dibersihkan browser.
      }
      widgetIdRef.current = null
    }
  }, [siteKey])

  useEffect(() => {
    if (resetSignal > 0 && widgetIdRef.current !== null && window.turnstile) {
      try {
        window.turnstile.reset(widgetIdRef.current)
      } catch {
        // Abaikan bila widget belum siap.
      }
    }
  }, [resetSignal])

  if (!siteKey) return null
  return <div ref={containerRef} className="turnstile-widget" role="group" aria-label="Verifikasi keamanan" />
}

export default TurnstileWidget
