import {cookies} from 'next/headers';
import {createServerClient} from '@supabase/ssr';
import type {Database} from '@/lib/database.types';

/**
 * Server-side Supabase client bound to the request cookies (RLS applies:
 * queries run as the signed-in user). Use in Server Components, server
 * actions and route handlers.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({name, value, options}) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component — safe to ignore because the
            // middleware refreshes sessions.
          }
        }
      }
    }
  );
}
