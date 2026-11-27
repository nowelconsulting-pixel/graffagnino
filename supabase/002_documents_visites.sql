-- GRAFFAGNINO · Prospection — photos, documents et visites terrain.
-- À exécuter UNE fois, après schema.sql : SQL Editor → New query → coller → Run.

-- Position GPS d'un échange (visite terrain saisie sur mobile).
alter table public.exchanges
  add column if not exists lat double precision,
  add column if not exists lon double precision,
  add column if not exists precision_m integer;

-- Documents rattachés à une fiche (et éventuellement à un échange) : photos, plans, conventions…
create table public.documents (
  id           uuid primary key default gen_random_uuid(),
  prospect_id  uuid not null references public.prospects(id) on delete cascade,
  exchange_id  uuid references public.exchanges(id) on delete set null,
  chemin       text not null unique,          -- emplacement du fichier dans le stockage « documents »
  nom          text not null,
  type_mime    text not null default '',
  taille       bigint not null default 0,
  categorie    text not null default 'autre' check (categorie in ('photo','plan','convention','autre')),
  auteur_id    uuid references public.profiles(id) default auth.uid(),
  created_at   timestamptz not null default now()
);
create index documents_prospect_idx on public.documents (prospect_id);

alter table public.documents enable row level security;

-- Mêmes règles que les échanges : lecture par les comptes actifs, ajout sur une fiche modifiable,
-- suppression par l'auteur (fiche modifiable) ou un administrateur.
create policy documents_read on public.documents for select to authenticated using (public.is_active());
create policy documents_insert on public.documents for insert to authenticated with check (
  public.is_admin() or (public.is_active() and auteur_id = auth.uid() and exists (
    select 1 from public.prospects p where p.id = prospect_id and (p.responsable_id is null or p.responsable_id = auth.uid()))));
create policy documents_delete on public.documents for delete to authenticated using (
  public.is_admin() or (public.is_active() and auteur_id = auth.uid() and exists (
    select 1 from public.prospects p where p.id = prospect_id and (p.responsable_id is null or p.responsable_id = auth.uid()))));

revoke all on public.documents from anon;
grant select, insert, delete on public.documents to authenticated;

-- Espace de stockage privé : fichiers lisibles uniquement par les comptes actifs, via des liens temporaires.
-- 20 Mo par fichier ; photos, PDF, documents bureautiques.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 20971520, array[
  'image/jpeg','image/png','image/webp','image/heic','image/heif','application/pdf',
  'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
on conflict (id) do nothing;

create policy documents_fichiers_lecture on storage.objects for select to authenticated
  using (bucket_id = 'documents' and public.is_active());
create policy documents_fichiers_ajout on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and public.is_active());
create policy documents_fichiers_suppression on storage.objects for delete to authenticated
  using (bucket_id = 'documents' and (public.is_admin() or owner_id = auth.uid()::text));
