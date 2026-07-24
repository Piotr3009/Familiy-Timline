import 'server-only';
import {createClient as createSupabaseClient} from '@supabase/supabase-js';
import type {Database} from '@/lib/database.types';

/**
 * Service-role client — BYPASSES RLS. Server-only, never imported into
 * client bundles. Use exclusively for narrow, audited operations
 * (sending invitation emails, admin lookups in the claim flow).
 */
export function createAdminClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {auth: {autoRefreshToken: false, persistSession: false}}
  );
}
