import { useEffect, useRef } from 'react'
import { useFocusStore } from '../stores/focusStore'
import { getSocket } from '../services/socket'

export function useFocusMode() {
  const { setFocused } = useFocusStore()
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        const focused = document.visibilityState === 'visible'
        setFocused(focused)
        if (!focused) {
          getSocket().emit('FOCUS_LOST', { timestamp: Date.now() })
        }
      }, 800)
    }

    const handleBlur = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        setFocused(false)
        getSocket().emit('FOCUS_LOST', { timestamp: Date.now() })
      }, 800)
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('blur', handleBlur)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('blur', handleBlur)
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [setFocused])
}
