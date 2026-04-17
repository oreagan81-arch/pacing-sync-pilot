import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { COURSE_IDS, TOGETHER_LOGIC_COURSE_ID } from './course-ids';

export interface AutoLogic {
  mathEvenOdd: boolean;
  mathTestTriple: boolean;
  readingTestPhrases: string[];
  fridayNoHomework: boolean;
  historyScienceNoAssign: boolean;
  frontPageProtection: boolean;
  pagePublishDefault: boolean;
  togetherLogicCourseId: number;
}

export interface AppConfig {
  courseIds: Record<string, number>;
  assignmentPrefixes: Record<string, string>;
  quarterColors: Record<string, string>;
  powerUpMap: Record<string, string>;
  spellingWordBank: Record<string, string[]>;
  autoLogic: AutoLogic;
  canvasBaseUrl: string;
}

export const ConfigContext = createContext<AppConfig | null>(null);

export function useConfig(): AppConfig | null {
  return useContext(ConfigContext);
}

export function useRequiredConfig(): AppConfig {
  const config = useContext(ConfigContext);
  if (!config) throw new Error('Config not loaded');
  return config;
}

export async function loadConfig(): Promise<AppConfig> {
  const { data, error } = await supabase
    .from('system_config')
    .select('*')
    .eq('id', 'current')
    .single();

  if (error || !data) throw new Error('Failed to load system config');

  return {
    courseIds: data.course_ids as Record<string, number>,
    assignmentPrefixes: data.assignment_prefixes as Record<string, string>,
    quarterColors: data.quarter_colors as Record<string, string>,
    powerUpMap: data.power_up_map as Record<string, string>,
    spellingWordBank: data.spelling_word_bank as Record<string, string[]>,
    autoLogic: data.auto_logic as unknown as AutoLogic,
    canvasBaseUrl: data.canvas_base_url || 'https://thalesacademy.instructure.com',
  };
}
