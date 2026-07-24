'use client';

import {createClient} from '@/lib/supabase/client';
import {mediaPath} from '@/lib/media';
import type {PrivacyLevel} from '@/lib/database.types';

/**
 * Client-side media pipeline: compression + thumb/preview versions are
 * generated in the browser (keeps serverless functions light; the DB
 * quota trigger is the hard enforcement either way). The photos ROW is
 * inserted first so quotas reject before any bytes move; files follow,
 * and on failure the row is removed again.
 */

const PREVIEW_EDGE = 1600;
const THUMB_EDGE = 320;

export type UploadInput = {
  file: File;
  familyId: string;
  taken: {year: number | null; month: number | null; day: number | null};
  location: string | null;
  description: string | null;
  eventId: string | null;
  privacy: PrivacyLevel;
  taggedPersonIds: string[];
};

export type UploadLimits = {
  maxPhotoBytes: number;
  maxVideoBytes: number;
  maxVideoDurationSec: number;
};

export type UploadResult = {ok: true; photoId: string} | {ok: false; error: string};

async function scaleToJpeg(
  bitmap: ImageBitmap,
  maxEdge: number,
  quality: number
): Promise<{blob: Blob; width: number; height: number}> {
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('canvas_unavailable');
  context.drawImage(bitmap, 0, 0, width, height);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) => (result ? resolve(result) : reject(new Error('encode_failed'))),
      'image/jpeg',
      quality
    );
  });
  return {blob, width, height};
}

function videoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(video.src);
      resolve(video.duration);
    };
    video.onerror = () => {
      URL.revokeObjectURL(video.src);
      reject(new Error('video_unreadable'));
    };
    video.src = URL.createObjectURL(file);
  });
}

export async function uploadMedia(
  input: UploadInput,
  limits: UploadLimits
): Promise<UploadResult> {
  const supabase = createClient();
  const isVideo = input.file.type.startsWith('video/');
  const isImage = input.file.type.startsWith('image/');
  if (!isVideo && !isImage) return {ok: false, error: 'photos.errors.unsupportedType'};

  // Resolve the uploader up front: an expired session must fail as an
  // auth error, not as a malformed-uuid DB error mid-upload.
  const {
    data: {user}
  } = await supabase.auth.getUser();
  if (!user) return {ok: false, error: 'errors.not_authenticated'};

  const photoId = crypto.randomUUID();

  try {
    if (isVideo) {
      if (input.file.size > limits.maxVideoBytes) {
        return {ok: false, error: 'errors.file_size_exceeded'};
      }
      let duration: number;
      try {
        duration = await videoDuration(input.file);
      } catch {
        return {ok: false, error: 'photos.errors.videoUnreadable'};
      }
      if (duration > limits.maxVideoDurationSec) {
        return {ok: false, error: 'errors.video_duration_exceeded'};
      }

      const ext = input.file.name.split('.').pop()?.toLowerCase() ?? 'mp4';
      const originalPath = mediaPath(input.familyId, photoId, 'original', ext);
      const {error: rowError} = await supabase.from('photos').insert({
        id: photoId,
        family_id: input.familyId,
        uploaded_by: user.id,
        kind: 'video',
        storage_path_original: originalPath,
        file_size_bytes: input.file.size,
        duration_seconds: Math.round(duration * 10) / 10,
        taken_year: input.taken.year,
        taken_month: input.taken.month,
        taken_day: input.taken.day,
        location: input.location,
        description: input.description,
        event_id: input.eventId,
        privacy: input.privacy
      });
      if (rowError) return {ok: false, error: mapDbError(rowError.message)};

      const {error: uploadError} = await supabase.storage
        .from('media')
        .upload(originalPath, input.file, {contentType: input.file.type});
      if (uploadError) {
        await supabase.from('photos').delete().eq('id', photoId);
        return {ok: false, error: 'photos.errors.uploadFailed'};
      }
    } else {
      // Photo: compress the original, derive preview + thumbnail.
      let bitmap: ImageBitmap;
      try {
        bitmap = await createImageBitmap(input.file);
      } catch {
        return {ok: false, error: 'photos.errors.imageUnreadable'};
      }
      const original = await scaleToJpeg(bitmap, Math.max(bitmap.width, bitmap.height), 0.9);
      const preview = await scaleToJpeg(bitmap, PREVIEW_EDGE, 0.82);
      const thumb = await scaleToJpeg(bitmap, THUMB_EDGE, 0.75);
      bitmap.close();

      if (original.blob.size > limits.maxPhotoBytes) {
        return {ok: false, error: 'errors.file_size_exceeded'};
      }

      const originalPath = mediaPath(input.familyId, photoId, 'original', 'jpg');
      const previewPath = mediaPath(input.familyId, photoId, 'preview', 'jpg');
      const thumbPath = mediaPath(input.familyId, photoId, 'thumb', 'jpg');

      const {error: rowError} = await supabase.from('photos').insert({
        id: photoId,
        family_id: input.familyId,
        uploaded_by: user.id,
        kind: 'photo',
        storage_path_original: originalPath,
        storage_path_preview: previewPath,
        storage_path_thumb: thumbPath,
        file_size_bytes: original.blob.size,
        width: original.width,
        height: original.height,
        taken_year: input.taken.year,
        taken_month: input.taken.month,
        taken_day: input.taken.day,
        location: input.location,
        description: input.description,
        event_id: input.eventId,
        privacy: input.privacy
      });
      if (rowError) return {ok: false, error: mapDbError(rowError.message)};

      const uploads = [
        supabase.storage
          .from('media')
          .upload(originalPath, original.blob, {contentType: 'image/jpeg'}),
        supabase.storage
          .from('media')
          .upload(previewPath, preview.blob, {contentType: 'image/jpeg'}),
        supabase.storage
          .from('media')
          .upload(thumbPath, thumb.blob, {contentType: 'image/jpeg'})
      ];
      const results = await Promise.all(uploads);
      if (results.some((result) => result.error)) {
        await supabase.storage.from('media').remove([originalPath, previewPath, thumbPath]);
        await supabase.from('photos').delete().eq('id', photoId);
        return {ok: false, error: 'photos.errors.uploadFailed'};
      }
    }

    if (input.taggedPersonIds.length > 0) {
      // Tag failures do not fail the upload.
      await supabase.from('photo_persons').insert(
        input.taggedPersonIds.map((personId) => ({photo_id: photoId, person_id: personId}))
      );
    }

    return {ok: true, photoId};
  } catch {
    return {ok: false, error: 'photos.errors.uploadFailed'};
  }
}

function mapDbError(message: string): string {
  if (message.includes('media_quota_exceeded')) return 'errors.media_quota_exceeded';
  if (message.includes('file_size_exceeded')) return 'errors.file_size_exceeded';
  if (message.includes('video_duration_exceeded')) return 'errors.video_duration_exceeded';
  return 'errors.unexpected';
}
