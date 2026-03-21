import { createClient } from "@supabase/supabase-js";

// Make sure to set these in .env.local or .env.production
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

if (!supabaseUrl || !supabaseAnonKey) {
    console.warn("⚠️ VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set to use Authentication.");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * Get Authorization headers for API calls.
 * Returns { Authorization: 'Bearer <token>' } or empty object if not authenticated.
 */
export async function getAuthHeaders(): Promise<Record<string, string>> {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
        return { Authorization: `Bearer ${session.access_token}` };
    }
    return {};
}
