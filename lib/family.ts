import type {User} from '@supabase/supabase-js';
import {createClient} from '@/lib/supabase/server';
import type {Family, FamilyRole, VisiblePerson} from '@/lib/database.types';

export type FamilyContext = {
  user: User;
  family: Family;
  role: FamilyRole;
  /**
   * The user's own claimed person profile in this family, read through
   * visible_persons (the owner always sees their own life details). The
   * base persons table no longer exposes life-detail columns to clients.
   */
  person: VisiblePerson | null;
};

/**
 * Resolves the signed-in user's family membership. Stage 1 assumes one
 * family per user (the first membership); the schema already supports
 * more for later stages.
 */
export async function getFamilyContext(): Promise<FamilyContext | 'no-user' | 'no-family'> {
  const supabase = await createClient();
  const {
    data: {user}
  } = await supabase.auth.getUser();
  if (!user) return 'no-user';

  const {data: membership} = await supabase
    .from('family_members')
    .select('family_id, role')
    .eq('user_id', user.id)
    .order('created_at', {ascending: true})
    .limit(1)
    .maybeSingle();
  if (!membership) return 'no-family';

  const {data: family} = await supabase
    .from('families')
    .select('*')
    .eq('id', membership.family_id)
    .maybeSingle();
  if (!family) return 'no-family';

  const {data: person} = await supabase
    .from('visible_persons')
    .select('*')
    .eq('family_id', family.id)
    .eq('user_id', user.id)
    .maybeSingle();

  return {user, family, role: membership.role, person: person ?? null};
}
