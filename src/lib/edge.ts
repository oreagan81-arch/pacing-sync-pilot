import { supabase } from '@/integrations/supabase/client';

export async function callEdge<T>(fnName: string, body: object): Promise<T> {
  const { data, error } = await supabase.functions.invoke(fnName, { body });
  if (error) throw new Error(`${fnName}: ${error.message}`);
  return data as T;
}
