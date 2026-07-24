import {getFormatter, getTranslations} from 'next-intl/server';
import {createClient} from '@/lib/supabase/server';
import {getAppConfig} from '@/lib/config';
import {PersonAvatar} from '@/components/ui';
import {AddCommentForm, CommentControls} from '@/components/comments/CommentForms';

/**
 * Comment list + composer for an event or photo page. Visibility
 * follows the target object (RLS); soft-deleted comments are excluded.
 * The author may edit within the config window; author/admins delete.
 */
export async function CommentsSection({
  targetType,
  targetId,
  familyId,
  viewerUserId,
  viewerIsAdmin
}: {
  targetType: 'event' | 'photo';
  targetId: string;
  familyId: string;
  viewerUserId: string;
  viewerIsAdmin: boolean;
}) {
  const t = await getTranslations();
  const format = await getFormatter();
  const supabase = await createClient();
  const config = await getAppConfig(supabase);

  const {data: comments} = await supabase
    .from('comments')
    .select('*')
    .eq('target_type', targetType)
    .eq('target_id', targetId)
    .is('deleted_at', null)
    .order('created_at', {ascending: true});

  const authorIds = [...new Set((comments ?? []).map((comment) => comment.author_user_id))];
  const {data: authors} = authorIds.length
    ? await supabase
        .from('visible_persons')
        .select('user_id, first_name, last_name, avatar_url')
        .eq('family_id', familyId)
        .in('user_id', authorIds)
    : {data: []};
  const authorByUserId = new Map(
    (authors ?? [])
      .filter((person): person is typeof person & {user_id: string} => Boolean(person.user_id))
      .map((person) => [person.user_id, `${person.first_name} ${person.last_name}`])
  );

  const editWindowMs = config.commentEditWindowMin * 60 * 1000;
  const now = Date.now();

  return (
    <div className="space-y-3">
      {(comments ?? []).length === 0 ? (
        <p className="text-sm text-ink-muted">{t('comments.empty')}</p>
      ) : (
        <ul className="space-y-2.5">
          {(comments ?? []).map((comment) => {
            const authorName =
              authorByUserId.get(comment.author_user_id) ?? t('history.unknownActor');
            const isAuthor = comment.author_user_id === viewerUserId;
            const withinWindow =
              now - new Date(comment.created_at).getTime() < editWindowMs;
            const edited = comment.updated_at !== comment.created_at;
            return (
              <li key={comment.id} className="flex items-start gap-2.5">
                <PersonAvatar name={authorName} size="sm" />
                <div className="min-w-0 flex-1 rounded-lg bg-surface-sunken px-3 py-2">
                  <p className="flex flex-wrap items-baseline gap-x-2 text-xs text-ink-faint">
                    <span className="font-medium text-ink">{authorName}</span>
                    <span>{format.relativeTime(new Date(comment.created_at))}</span>
                    {edited ? <span>· {t('comments.edited')}</span> : null}
                  </p>
                  <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-ink">
                    {comment.body}
                  </p>
                  <div className="mt-1">
                    <CommentControls
                      commentId={comment.id}
                      targetType={targetType}
                      targetId={targetId}
                      body={comment.body}
                      canEdit={isAuthor && withinWindow}
                      canDelete={isAuthor || viewerIsAdmin}
                      maxLength={config.maxCommentLength}
                    />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <AddCommentForm
        targetType={targetType}
        targetId={targetId}
        maxLength={config.maxCommentLength}
      />
    </div>
  );
}
