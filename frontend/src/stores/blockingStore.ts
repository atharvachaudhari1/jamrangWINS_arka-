import { create } from 'zustand'

export interface BlockEntry {
  _id?: string
  value: string
  label: string
  enabled?: boolean
  notes?: string
}

export interface BlockingSchedule {
  enabled: boolean
  startTime: string
  endTime: string
  days: number[]
}

export interface BlockingRules {
  isEnabled: boolean
  blockedSites: BlockEntry[]
  blockedApps: BlockEntry[]
  whitelist: BlockEntry[]
  schedule: BlockingSchedule
  pausedUntil?: string | null
}

interface BlockingState {
  rules: BlockingRules
  loading: boolean
  saving: boolean
  setRules: (rules: BlockingRules) => void
  setLoading: (v: boolean) => void
  setSaving: (v: boolean) => void
}

const DEFAULT_RULES: BlockingRules = {
  isEnabled: false,
  blockedSites: [],
  blockedApps: [],
  whitelist: [],
  schedule: {
    enabled: false,
    startTime: '09:00',
    endTime: '17:00',
    days: [1, 2, 3, 4, 5],
  },
  pausedUntil: null,
}

export const useBlockingStore = create<BlockingState>((set) => ({
  rules: DEFAULT_RULES,
  loading: false,
  saving: false,
  setRules: (rules) => set({ rules }),
  setLoading: (loading) => set({ loading }),
  setSaving: (saving) => set({ saving }),
}))
