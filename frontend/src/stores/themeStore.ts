import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type ThemeName = 'calm' | 'focus' | 'night' | 'highContrast' | 'minimal'

interface ThemeState {
  theme: ThemeName
  setTheme: (theme: ThemeName) => void
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: 'calm',
      setTheme: (theme) => set({ theme }),
    }),
    { name: 'bb-theme' }
  )
)
