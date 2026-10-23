import { useEffect } from 'react'
import { useThemeStore, ThemeName } from '../stores/themeStore'

const themeVars: Record<ThemeName, Record<string, string>> = {
  calm: {
    '--bg-primary': '#f0f4f8',
    '--bg-secondary': '#ffffff',
    '--text-primary': '#1a202c',
    '--text-secondary': '#4a5568',
    '--accent': '#667eea',
    '--accent-light': '#ebf4ff',
  },
  focus: {
    '--bg-primary': '#1a1a2e',
    '--bg-secondary': '#16213e',
    '--text-primary': '#e2e8f0',
    '--text-secondary': '#a0aec0',
    '--accent': '#e94560',
    '--accent-light': '#2d1b2e',
  },
  night: {
    '--bg-primary': '#0d1117',
    '--bg-secondary': '#161b22',
    '--text-primary': '#c9d1d9',
    '--text-secondary': '#8b949e',
    '--accent': '#58a6ff',
    '--accent-light': '#1f3148',
  },
  highContrast: {
    '--bg-primary': '#000000',
    '--bg-secondary': '#1a1a1a',
    '--text-primary': '#ffffff',
    '--text-secondary': '#ffff00',
    '--accent': '#00ff00',
    '--accent-light': '#003300',
  },
  minimal: {
    '--bg-primary': '#fafafa',
    '--bg-secondary': '#ffffff',
    '--text-primary': '#212121',
    '--text-secondary': '#757575',
    '--accent': '#212121',
    '--accent-light': '#f5f5f5',
  },
}

export function useTheme() {
  const { theme, setTheme } = useThemeStore()

  useEffect(() => {
    const vars = themeVars[theme]
    const root = document.documentElement
    Object.entries(vars).forEach(([key, value]) => {
      root.style.setProperty(key, value)
    })
  }, [theme])

  return { theme, setTheme }
}
