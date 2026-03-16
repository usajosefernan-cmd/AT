import { createClient } from "@supabase/supabase-js";

// Make sure to set these in .env.local or .env.production
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

if (!supabaseUrl || !supabaseAnonKey) {
    console.warn("⚠️ VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set to use Authentication.");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
