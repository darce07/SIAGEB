import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const safeSupabaseUrl = supabaseUrl || 'https://example.supabase.co';
const safeSupabaseAnonKey = supabaseAnonKey || 'public-anon-key';

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Supabase env missing', { supabaseUrl, anonKey: Boolean(supabaseAnonKey) });
} else {
  console.log('Supabase env loaded', { url: supabaseUrl, anonKeyLength: supabaseAnonKey.length });
}

export const supabase = createClient(safeSupabaseUrl, safeSupabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
