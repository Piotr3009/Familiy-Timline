'use client';

import {useActionState, useState} from 'react';
import {useRouter} from 'next/navigation';
import {useTranslations} from 'next-intl';
import {
  addCommentAction,
  deleteCommentAction,
  editCommentAction
} from '@/lib/comments/actions';
import type {ActionState} from '@/lib/persons/actions';
import {Alert, Button, Textarea} from '@/components/ui';

const initialState: ActionState = {error: null};

export function AddCommentForm({
  targetType,
  targetId,
  maxLength
}: {
  targetType: 'event' | 'photo';
  targetId: string;
  maxLength: number;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [formKey, setFormKey] = useState(0);
  const [state, formAction, pending] = useActionState(
    async (prev: ActionState, formData: FormData) => {
      const result = await addCommentAction(prev, formData);
      if (result.ok) {
        setFormKey((value) => value + 1);
        router.refresh();
      }
      return result;
    },
    initialState
  );

  return (
    <form action={formAction} key={formKey} className="space-y-2">
      {state.error ? <Alert tone="error">{t(state.error)}</Alert> : null}
      <input type="hidden" name="targetType" value={targetType} />
      <input type="hidden" name="targetId" value={targetId} />
      <Textarea
        name="body"
        rows={2}
        required
        maxLength={maxLength}
        placeholder={t('comments.placeholder')}
        aria-label={t('comments.placeholder')}
      />
      <Button type="submit" disabled={pending}>
        {pending ? t('common.working') : t('comments.send')}
      </Button>
    </form>
  );
}

export function CommentControls({
  commentId,
  targetType,
  targetId,
  body,
  canEdit,
  canDelete,
  maxLength
}: {
  commentId: string;
  targetType: 'event' | 'photo';
  targetId: string;
  body: string;
  /** Author inside the edit window. */
  canEdit: boolean;
  /** Author (own) or family admin (any). */
  canDelete: boolean;
  maxLength: number;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [editState, editFormAction, editPending] = useActionState(
    async (prev: ActionState, formData: FormData) => {
      const result = await editCommentAction(prev, formData);
      if (result.ok) {
        setEditing(false);
        router.refresh();
      }
      return result;
    },
    initialState
  );
  const [deleteState, deleteFormAction, deletePending] = useActionState(
    async (prev: ActionState, formData: FormData) => {
      const result = await deleteCommentAction(prev, formData);
      if (result.ok) router.refresh();
      return result;
    },
    initialState
  );

  if (editing) {
    return (
      <form action={editFormAction} className="mt-2 space-y-2">
        {editState.error ? <Alert tone="error">{t(editState.error)}</Alert> : null}
        <input type="hidden" name="commentId" value={commentId} />
        <input type="hidden" name="targetType" value={targetType} />
        <input type="hidden" name="targetId" value={targetId} />
        <Textarea name="body" rows={2} required maxLength={maxLength} defaultValue={body} />
        <div className="flex gap-2">
          <Button type="submit" disabled={editPending}>
            {editPending ? t('common.working') : t('common.save')}
          </Button>
          <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
            {t('common.cancel')}
          </Button>
        </div>
      </form>
    );
  }

  if (!canEdit && !canDelete) return null;
  return (
    <span className="inline-flex items-center gap-3">
      {canEdit ? (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-xs text-amber hover:underline"
        >
          {t('common.edit')}
        </button>
      ) : null}
      {canDelete ? (
        <form action={deleteFormAction} className="inline-flex items-center gap-2">
          <input type="hidden" name="commentId" value={commentId} />
          <input type="hidden" name="targetType" value={targetType} />
          <input type="hidden" name="targetId" value={targetId} />
          <button
            type="submit"
            disabled={deletePending}
            className="text-xs text-danger hover:underline disabled:opacity-50"
          >
            {deletePending ? t('common.working') : t('common.delete')}
          </button>
          {deleteState.error ? (
            <span className="text-xs text-danger">{t(deleteState.error)}</span>
          ) : null}
        </form>
      ) : null}
    </span>
  );
}
