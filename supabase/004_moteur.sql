-- GRAFFAGNINO · Prospection — moteur de score des emplacements.
-- À exécuter après 003_position_fiches.sql : SQL Editor → New query → coller → Run.
-- Peut être relancé sans risque.

-- Résultat de la dernière analyse d'une fiche et évaluation terrain (bonus / malus).
-- « analyse » est un mot réservé de PostgreSQL : il s'écrit entre guillemets.
alter table public.prospects
  add column if not exists "analyse"            jsonb,
  add column if not exists terrain_acces        text not null default '',
  add column if not exists terrain_visibilite   text not null default '',
  add column if not exists terrain_attractivite text not null default '';

-- Réglages partagés du moteur (sites, distance maximale, malus…) : lus par tous, modifiés par les administrateurs.
create table if not exists public.parametres (
  cle         text primary key,
  valeur      jsonb not null,
  updated_at  timestamptz not null default now()
);
alter table public.parametres enable row level security;
drop policy if exists parametres_read  on public.parametres;
drop policy if exists parametres_write on public.parametres;
create policy parametres_read  on public.parametres for select to authenticated using (public.is_active());
create policy parametres_write on public.parametres for all    to authenticated using (public.is_admin()) with check (public.is_admin());
revoke all on public.parametres from anon;
grant select, insert, update, delete on public.parametres to authenticated;
