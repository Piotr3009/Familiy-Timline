'use client';

import {useRef, useState} from 'react';
import {useRouter} from 'next/navigation';
import {useTranslations} from 'next-intl';
import {createClient} from '@/lib/supabase/client';
import {avatarPath} from '@/lib/media';
import {Alert, Button} from '@/components/ui';

const AVATAR_MAX_EDGE = 512;

/** Client-side square-ish resize before upload — avatars stay tiny. */
async function resizeImage(file: File, maxEdge: number): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('canvas_unavailable');
  context.drawImage(bitmap, 0, 0, width, height);
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('encode_failed'))),
      'image/jpeg',
      0.85
    );
  });
}

export function AvatarUpload({
  personId,
  familyId
}: {
  personId: string;
  familyId: string;
}) {
  const t = useTranslations('persons');
  const tCommon = useTranslations();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setBusy(true);
    setError(null);
    try {
      const blob = await resizeImage(file, AVATAR_MAX_EDGE);
      const supabase = createClient();
      const path = avatarPath(familyId, personId, 'jpg');
      const {error: uploadError} = await supabase.storage
        .from('avatars')
        .upload(path, blob, {contentType: 'image/jpeg', upsert: true});
      if (uploadError) throw uploadError;
      const {error: updateError} = await supabase
        .from('persons')
        .update({avatar_url: path})
        .eq('id', personId);
      if (updateError) throw updateError;
      router.refresh();
    } catch {
      setError('persons.avatarUploadFailed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void handleFile(file);
          event.target.value = '';
        }}
      />
      <Button
        type="button"
        variant="secondary"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
      >
        {busy ? tCommon('common.working') : t('changeAvatar')}
      </Button>
      {error ? <Alert tone="error">{tCommon(error)}</Alert> : null}
    </div>
  );
}
