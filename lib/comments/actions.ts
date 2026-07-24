'use server';

import {revalidatePath} from 'next/cache';
import {createClient} from '@/lib/supabase/server';
import {getFamilyContext} from '@/lib/family';
import {dbErrorKey} from '@/lib/errors';
import {getAppConfig} from '@/lib/config';
import type {ActionState} from '@/lib/persons/actions';

function targetPath(targetType: string, targetId: string): string {
  return targetType === 'event' ? `/events/${targetId}` : `/photos/${targetId}`;
}

export async function addCommentAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const targetType = String(formData.get('targetType') ?? '');
  const targetId = String(formData.get('targetId') ?? '');
  const body = String(formData.get('body') ?? '').trim();
  if ((targetType !== 'event' && targetType !== 'photo') || !targetId) {
    return {error: 'errors.unexpected'};
  }
  if (!body) return {error: 'comments.errors.empty'};

  const ctx = await getFamilyContext();
  if (ctx === 'no-user' || ctx === 'no-family') return {error: 'errors.not_authenticated'};
  const supabase = await createClient();

  const config = await getAppConfig(supabase);
  if (body.length > config.maxCommentLength) return {error: 'comments.errors.tooLong'};

  // family_id is derived by the DB trigger from the target; RLS checks
  // that the author may actually see the target.
  const {error} = await supabase.from('comments').insert({
    family_id: ctx.family.id,
    target_type: targetType,
    target_id: targetId,
    author_user_id: ctx.user.id,
    body
  });
  if (error) {
    if (error.code === '42501') return {error: 'comments.errors.notAllowed'};
    return {error: dbErrorKey(error)};
  }

  revalidatePath(targetPath(targetType, targetId));
  return {error: null, ok: true};
}

/** Body edit — only the author, only inside the config edit window. */
export async function editCommentAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const commentId = String(formData.get('commentId') ?? '');
  const targetType = String(formData.get('targetType') ?? '');
  const targetId = String(formData.get('targetId') ?? '');
  const body = String(formData.get('body') ?? '').trim();
  if (!commentId) return {error: 'errors.unexpected'};
  if (!body) return {error: 'comments.errors.empty'};

  const supabase = await createClient();
  const {data: updated, error} = await supabase
    .from('comments')
    .update({body})
    .eq('id', commentId)
    .select('id')
    .maybeSingle();
  if (error) return {error: dbErrorKey(error)};
  if (!updated) return {error: 'comments.errors.editWindowOver'};

  if (targetId) revalidatePath(targetPath(targetType, targetId));
  return {error: null, ok: true};
}

/** Soft delete via the definer function (author own / admin any). */
export async function deleteCommentAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const commentId = String(formData.get('commentId') ?? '');
  const targetType = String(formData.get('targetType') ?? '');
  const targetId = String(formData.get('targetId') ?? '');
  if (!commentId) return {error: 'errors.unexpected'};

  const supabase = await createClient();
  const {error} = await supabase.rpc('delete_comment', {p_comment: commentId});
  if (error) return {error: dbErrorKey(error)};

  if (targetId) revalidatePath(targetPath(targetType, targetId));
  return {error: null, ok: true};
}
