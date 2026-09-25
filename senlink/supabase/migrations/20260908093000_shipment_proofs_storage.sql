do $preflight$
begin
  if exists (select 1 from storage.buckets where id = 'shipment-proofs') then
    raise exception 'PREFLIGHT FAILED: bucket shipment-proofs existe déjà';
  end if;
end;
$preflight$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('shipment-proofs', 'shipment-proofs', true, 10485760, array['image/jpeg','image/png','image/webp']);

create policy shipment_proofs_public_read
on storage.objects for select
using (bucket_id = 'shipment-proofs');

create policy shipment_proofs_authenticated_insert
on storage.objects for insert
to authenticated
with check (bucket_id = 'shipment-proofs');
