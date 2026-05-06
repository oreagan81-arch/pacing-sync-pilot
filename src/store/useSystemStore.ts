import { create } from 'zustand';
import { upsertPacingFromGAS } from '@/lib/gas-import';

export type HintOverride = 'evens' | 'odds' | 'none' | null;

export interface PacingCell {
  value: string;
  lessonNum: string;
  isTest: boolean;
  isReview: boolean;
  isNoClass: boolean;
  hint_override?: HintOverride;
}

export interface PacingData {
  dates: string[];
  subjects: Record<string, PacingCell[]>; // 5-item arrays (Mon-Fri)
}

interface SystemState {
  selectedMonth: string;
  selectedWeek: number;
  pacingData: PacingData | null;
  isLoading: boolean;
  systemStatus: 'online' | 'offline' | 'checking';

  setSelectedMonth: (m: string) => void;
  setSelectedWeek: (w: number) => void;
  clearCache: () => void;
  setPacingData: (d: PacingData | null) => void;
  setIsLoading: (l: boolean) => void;
  setSystemStatus: (s: 'online' | 'offline' | 'checking') => void;

  fetchHealthCheck: () => Promise<void>;
  fetchPacingData: (month: string, week: number) => Promise<void>;
}

const GAS_URL = import.meta.env.VITE_GOOGLE_APPS_SCRIPT_URL;

const API_SUBJECT_MAP: Record<string, string> = {
  Math: 'Math',
  Reading: 'Reading',
  Spelling: 'Spelling',
  English: 'Language Arts',
  'Language Arts': 'Language Arts',
  History: 'History',
  Science: 'Science',
};

export const useSystemStore = create<SystemState>((set, get) => ({
  selectedMonth: '',
  selectedWeek: 0,
  pacingData: null,
  isLoading: false,
  systemStatus: 'checking',

  setSelectedMonth: (m) => set({ selectedMonth: m }),
  setSelectedWeek: (w) => set({ selectedWeek: w }),
  clearCache: () => set({ pacingData: null }),
  setPacingData: (d) => set({ pacingData: d }),
  setIsLoading: (l) => set({ isLoading: l }),
  setSystemStatus: (s) => set({ systemStatus: s }),

  fetchHealthCheck: async () => {
    set({ systemStatus: 'checking' });
    try {
      const res = await fetch(`${GAS_URL}?action=healthCheck`, { redirect: 'follow' });
      if (res.ok) {
        set({ systemStatus: 'online' });
      } else {
        set({ systemStatus: 'offline' });
      }
    } catch {
      set({ systemStatus: 'offline' });
    }
  },

  fetchPacingData: async (month: string, week: number) => {
    set({ isLoading: true });
    try {
      const res = await fetch(`${GAS_URL}?month=${encodeURIComponent(month)}&week=${week}`, {
        redirect: 'follow',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const raw = await res.json();
      const payload = raw.data || raw;

      const dates: string[] = payload.dates || [];
      const days: string[] = payload.days || ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
      const subjects: Record<string, PacingCell[]> = {};

      for (const [apiKey, values] of Object.entries(payload.subjects || {})) {
        const subjectName = API_SUBJECT_MAP[apiKey] || apiKey;
        if (!Array.isArray(values)) continue;

        subjects[subjectName] = (values as any[]).map((v) => {
          const val = String(v ?? '');
          const lower = val.toLowerCase();
          return {
            value: val,
            lessonNum: val.match(/\d+/)?.[0] || '',
            isTest: lower.includes('test'),
            isReview: lower.includes('review'),
            isNoClass: val === '-' || lower === 'no class' || val === '',
          };
        });
      }

      const pacing: PacingData = { dates, subjects };
      set({ pacingData: pacing, isLoading: false });
      // Persist to Supabase (best-effort; do not surface errors here)
      try {
        await upsertPacingFromGAS(month, week, pacing);
      } catch (e) {
        console.warn('upsertPacingFromGAS failed', e);
      }
    } catch {
      set({ pacingData: null, isLoading: false });
    }
  },
}));
