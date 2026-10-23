import { useEffect } from 'react'
import { useTimerStore } from '../stores/timerStore'

export function useTimer() {
  const { isRunning, tick } = useTimerStore()

  useEffect(() => {
    if (!isRunning) return
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [isRunning, tick])

  return useTimerStore()
}
