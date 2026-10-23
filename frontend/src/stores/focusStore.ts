import { create } from 'zustand'

interface FocusState {
  isFocused: boolean
  focusLostAt: Date | null
  setFocused: (v: boolean) => void
}

export const useFocusStore = create<FocusState>((set) => ({
  isFocused: true,
  focusLostAt: null,
  setFocused: (isFocused) =>
    set({ isFocused, focusLostAt: isFocused ? null : new Date() }),
}))
