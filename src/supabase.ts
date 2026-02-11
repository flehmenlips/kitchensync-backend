// Supabase client for backend operations
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl) {
  throw new Error("Missing SUPABASE_URL environment variable");
}

// Prefer service role key for server-side operations (bypasses RLS)
// Fall back to anon key if service role not available
const apiKey = supabaseServiceRoleKey || supabaseAnonKey;

if (!apiKey) {
  throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY environment variable");
}

if (!supabaseServiceRoleKey) {
  console.warn("SUPABASE_SERVICE_ROLE_KEY not set - using anon key (RLS will be enforced)");
}

export const supabase = createClient(supabaseUrl, apiKey);
