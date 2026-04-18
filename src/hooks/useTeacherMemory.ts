import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { MemoryHit } from '@/types/thales';

export function useMemoryPatterns() {
  return useQuery({
    queryKey: ['teacher_memory'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('teacher_memory')
        .select('*')
        .order('confidence', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });
}

export function useSuggestedPatterns() {
  return useQuery({
    queryKey: ['teacher_patterns'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('teacher_patterns')
        .select('*')
        .order('confidence', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });
}

export function useEditHistory(limit = 50) {
  return useQuery({
    queryKey: ['teacher_feedback_log', limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('teacher_feedback_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data || [];
    },
  });
}

const HITS_KEY = 'thales.memory.hits';

export function readMemoryHits(): MemoryHit[] {
  try {
    const raw = localStorage.getItem(HITS_KEY);
    if (!raw) return [
      { source: 'memory', count: 0 },
      { source: 'template', count: 0 },
      { source: 'ai', count: 0 },
    ];
    const parsed = JSON.parse(raw) as Record<string, number>;
    return [
      { source: 'memory', count: parsed.memory || 0 },
      { source: 'template', count: parsed.template || 0 },
      { source: 'ai', count: parsed.ai || 0 },
    ];
  } catch {
    return [];
  }
}

export function useMemoryHits() {
  return useQuery({
    queryKey: ['memory_hits'],
    queryFn: async () => readMemoryHits(),
    staleTime: 5_000,
  });
}
