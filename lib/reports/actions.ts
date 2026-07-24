'use server';

import {createClient} from '@/lib/supabase/server';
import {getFamilyContext} from '@/lib/family';

export type ReportState = {error: string | null; ok?: boolean};

export async function reportPersonAction(
  _prev: ReportState,
  formData: FormData
): Promise<ReportState> {
  const personId = String(formData.get('personId') ?? '');
  const reason = String(formData.get('reason') ?? '').trim();
  if (!personId || !reason) return {error: 'report.errors.reasonRequired'};
  if (reason.length > 2000) return {error: 'report.errors.reasonTooLong'};

  const ctx = await getFamilyContext();
  if (ctx === 'no-user' || ctx === 'no-family') return {error: 'errors.not_authenticated'};

  const supabase = await createClient();
  const {error} = await supabase.from('reports').insert({
    family_id: ctx.family.id,
    reported_person_id: personId,
    reported_by: ctx.user.id,
    reason
  });
  if (error) return {error: 'errors.unexpected'};
  return {error: null, ok: true};
}
