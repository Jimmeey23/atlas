-- Serialize each member's follow-up update across serverless instances and append
-- its history in the same transaction. Existing documents are retained in place.
create or replace function public.atlas_save_followup(p_member_id text, p_record jsonb)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  doc_id uuid;
  previous jsonb;
  saved jsonb;
  history jsonb;
begin
  if p_member_id is null or length(p_member_id) < 1 or length(p_member_id) > 200
     or jsonb_typeof(p_record) <> 'object' then
    raise exception 'Invalid follow-up';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('atlas-followup:' || p_member_id, 0));
  select id, body->'record' into doc_id, previous
    from public.p57_documents where kind = 'followup' and title = p_member_id
    order by updated_at desc, id limit 1 for update;
  select coalesce(jsonb_agg(value order by ord), '[]'::jsonb) into history
    from (select value, ord from jsonb_array_elements(
      case when jsonb_typeof(previous->'history') = 'array' then previous->'history' else '[]'::jsonb end
      || jsonb_build_array(p_record)) with ordinality as h(value, ord)
      order by ord desc limit 100) h;
  saved := p_record || jsonb_build_object('history', history);
  if doc_id is null then
    insert into public.p57_documents(kind, title, page, body, updated_at)
      values ('followup', p_member_id, 6, jsonb_build_object('memberId', p_member_id, 'record', saved), now());
  else
    update public.p57_documents set body = jsonb_build_object('memberId', p_member_id, 'record', saved), updated_at = now()
      where id = doc_id;
  end if;
  return saved;
end;
$$;
revoke all on function public.atlas_save_followup(text,jsonb) from public, anon, authenticated;
grant execute on function public.atlas_save_followup(text,jsonb) to service_role;
