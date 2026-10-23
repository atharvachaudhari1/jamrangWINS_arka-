import { create } from 'zustand'

interface TimerState {
  isRunning: boolean
  elapsed: number
  mode: 'pomodoro' | 'deep' | 'deadline'
  sessionId: string | null
  start: (mode: TimerState['mode']) => void
  pause: () => void
  reset: () => void
  tick: () => void
  setSessionId: (id: string) => void
}

export const useTimerStore = create<TimerState>((set) => ({
  isRunning: false,
  elapsed: 0,
  mode: 'pomodoro',
  sessionId: null,
  start: (mode) => set({ isRunning: true, mode }),
  pause: () => set({ isRunning: false }),
  reset: () => set({ isRunning: false, elapsed: 0, sessionId: null }),
  tick: () => set((s) => ({ elapsed: s.elapsed + 1 })),
  setSessionId: (id) => set({ sessionId: id }),
}))
