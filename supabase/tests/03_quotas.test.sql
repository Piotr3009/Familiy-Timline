-- ============================================================
-- Media quota enforcement from public.config (DB is the source of
-- truth regardless of what the upload UI does).
-- ============================================================

-- Tighten the photo quota to 2 for the test.
reset role;
update public.config set value = '2' where key = 'max_photos_per_user';

select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000002', false);
set role authenticated;

do $$
begin
  -- Anna currently has 0 photos; 2 inserts fit the quota…
  insert into public.photos (family_id, uploaded_by, storage_path_original, file_size_bytes)
  values ('f0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000002',
          'f0000000-0000-4000-8000-000000000001/q1/original.jpg', 100),
         ('f0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000002',
          'f0000000-0000-4000-8000-000000000001/q2/original.jpg', 100);
  -- …the third must be rejected.
  begin
    insert into public.photos (family_id, uploaded_by, storage_path_original, file_size_bytes)
    values ('f0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000002',
            'f0000000-0000-4000-8000-000000000001/q3/original.jpg', 100);
    raise exception 'TEST: photo quota of 2 must reject the third upload';
  exception when others then
    if sqlerrm <> 'media_quota_exceeded' then raise; end if;
  end;
end $$;

-- Oversized photo (config: 10 MB).
do $$
begin
  begin
    insert into public.photos (family_id, uploaded_by, storage_path_original, file_size_bytes)
    values ('f0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000002',
            'f0000000-0000-4000-8000-000000000001/q4/original.jpg', 11 * 1024 * 1024);
    raise exception 'TEST: oversized photo must be rejected';
  exception when others then
    if sqlerrm <> 'file_size_exceeded' then raise; end if;
  end;
end $$;

-- Overlong video (config: 180 s).
do $$
begin
  begin
    insert into public.photos (family_id, uploaded_by, kind, storage_path_original,
                               file_size_bytes, duration_seconds)
    values ('f0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000002',
            'video', 'f0000000-0000-4000-8000-000000000001/q5/original.mp4', 1000, 200);
    raise exception 'TEST: overlong video must be rejected';
  exception when others then
    if sqlerrm <> 'video_duration_exceeded' then raise; end if;
  end;
end $$;

-- A video without a duration violates the schema.
do $$
begin
  begin
    insert into public.photos (family_id, uploaded_by, kind, storage_path_original, file_size_bytes)
    values ('f0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000002',
            'video', 'f0000000-0000-4000-8000-000000000001/q6/original.mp4', 1000);
    raise exception 'TEST: video without duration must be rejected';
  exception when sqlstate '23514' then null; -- check_violation
  end;
end $$;

-- Restore config and clean up test rows.
reset role;
update public.config set value = '500' where key = 'max_photos_per_user';
delete from public.photos where storage_path_original like '%/q_/original.%';

select 'quota tests passed' as ok;
