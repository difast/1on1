import { useEffect } from 'react'

// Close-on-Escape for modals/overlays. Nielsen #3 (user control & freedom):
// a keyboard user must always be able to back out of a dialog.
export default function useEscapeKey(onEscape, active = true) {
  useEffect(() => {
    if (!active || typeof onEscape !== 'function') return
    const handler = (e) => { if (e.key === 'Escape') onEscape() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onEscape, active])
}
