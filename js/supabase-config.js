// Supabase project settings. The publishable key is intended for browser use;
// protect tables with Row Level Security and never put a secret/service key here.
const SUPABASE_URL = 'https://eyaoflmjxlikpfbylblz.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_vgE3EumM2kjSiHeX3sR2HA_k_R9mhgU';

if (!window.supabase) {
  console.error('Supabase JS did not load. Check your internet connection and CDN access.');
} else {
  window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}
