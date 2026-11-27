-- GRAFFAGNINO · Prospection — schéma Supabase (PostgreSQL).
-- À exécuter UNE fois dans Supabase : SQL Editor → New query → coller → Run.
-- Les colonnes reprennent exactement les champs utilisés par l'application.
-- Les règles de sécurité (RLS) sont la vraie protection des données : la clé publique
-- de l'application ne donne accès à rien sans un compte connecté et actif.

-- =========================================================================
-- Tables
-- =========================================================================

-- Profils : complète auth.users (Supabase Auth gère email et mot de passe).
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null unique,
  nom         text not null,
  fonction    text not null default '',
  telephone   text not null default '',
  role        text not null default 'user' check (role in ('admin', 'user')),
  actif       boolean not null default true,
  created_at  timestamptz not null default now()
);

create table public.prospects (
  id                 uuid primary key default gen_random_uuid(),
  nom                text not null check (length(trim(nom)) > 0),
  zone_id            text,               -- référence de la carte (S01, C11…) ; les zones restent dans la carte
  adresse            text not null default '',
  commune            text not null default '',
  statut             text not null default 'a_prospecter' check (statut in (
                       'a_prospecter','decideur_a_identifier','contact_a_etablir','contact_etabli',
                       'en_discussion','visite_a_organiser','negociation','accord','refuse')),
  proprietaire_nom   text not null default '',
  proprietaire_type  text not null default '',
  decideur_nom       text not null default '',
  decideur_fonction  text not null default '',
  telephone          text not null default '',
  email              text not null default '',
  responsable_id     uuid references public.profiles(id),
  prochaine_action   text not null default '',
  date_relance       date,
  notes              text not null default '',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index prospects_zone_idx on public.prospects (zone_id);
create index prospects_responsable_idx on public.prospects (responsable_id);

create table public.exchanges (
  id           uuid primary key default gen_random_uuid(),
  prospect_id  uuid not null references public.prospects(id) on delete cascade,
  date         date not null default current_date,
  type         text not null check (type in ('appel','email','rdv','visite','note')),
  commentaire  text not null check (length(trim(commentaire)) > 0),
  auteur_id    uuid references public.profiles(id) default auth.uid(),
  created_at   timestamptz not null default now()
);
create index exchanges_prospect_idx on public.exchanges (prospect_id);

-- =========================================================================
-- Fonctions de droits (mêmes règles que js/services/permissions.js)
-- =========================================================================

create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin' and actif)
$$;

create function public.is_active() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = auth.uid() and actif)
$$;

-- =========================================================================
-- Déclencheurs
-- =========================================================================

-- Chaque compte créé dans Authentication → Users reçoit un profil « utilisateur ».
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, nom)
  values (new.id, lower(new.email), split_part(new.email, '@', 1))
  on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Mise à jour automatique de updated_at (fiche modifiée ou échange ajouté).
create function public.touch_prospect() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'prospects' then new.updated_at = now(); return new; end if;
  update public.prospects set updated_at = now() where id = new.prospect_id; return new;
end $$;
create trigger prospects_touch before update on public.prospects
  for each row execute function public.touch_prospect();
create trigger exchanges_touch after insert on public.exchanges
  for each row execute function public.touch_prospect();

-- Un utilisateur non administrateur ne peut attribuer une fiche qu'à lui-même.
create function public.guard_prospect() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if public.is_admin() then return new; end if;
  if tg_op = 'INSERT' then
    new.responsable_id = auth.uid();
  elsif new.responsable_id is distinct from old.responsable_id and new.responsable_id is distinct from auth.uid() then
    raise exception 'Seul un administrateur peut attribuer une fiche à quelqu''un d''autre.';
  end if;
  return new;
end $$;
create trigger prospects_guard before insert or update on public.prospects
  for each row execute function public.guard_prospect();

-- Il doit toujours rester au moins un administrateur actif.
create function public.guard_last_admin() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.role = 'admin' and old.actif and not (new.role = 'admin' and new.actif)
     and not exists (select 1 from public.profiles where id <> old.id and role = 'admin' and actif) then
    raise exception 'Il doit rester au moins un administrateur actif.';
  end if;
  return new;
end $$;
create trigger profiles_last_admin before update on public.profiles
  for each row execute function public.guard_last_admin();

-- =========================================================================
-- Règles de sécurité (Row Level Security)
-- =========================================================================

alter table public.profiles  enable row level security;
alter table public.prospects enable row level security;
alter table public.exchanges enable row level security;

-- Profils : chacun lit le sien (même désactivé, pour afficher le bon message) ;
-- les comptes actifs lisent tous les profils ; seuls les administrateurs les modifient.
create policy profiles_self   on public.profiles for select to authenticated using (id = auth.uid());
create policy profiles_read   on public.profiles for select to authenticated using (public.is_active());
create policy profiles_update on public.profiles for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Fiches : lecture par tous les comptes actifs ; création par tous (le créateur devient responsable) ;
-- modification de ses fiches et des fiches non attribuées ; suppression par les administrateurs.
create policy prospects_read   on public.prospects for select to authenticated using (public.is_active());
create policy prospects_insert on public.prospects for insert to authenticated with check (public.is_active());
create policy prospects_update on public.prospects for update to authenticated
  using      (public.is_admin() or (public.is_active() and (responsable_id is null or responsable_id = auth.uid())))
  with check (public.is_admin() or (public.is_active() and (responsable_id is null or responsable_id = auth.uid())));
create policy prospects_delete on public.prospects for delete to authenticated using (public.is_admin());

-- Échanges : lecture par tous les comptes actifs ; ajout sur une fiche modifiable ;
-- suppression par son auteur (sur une fiche modifiable) ou par un administrateur.
create policy exchanges_read   on public.exchanges for select to authenticated using (public.is_active());
create policy exchanges_insert on public.exchanges for insert to authenticated with check (
  public.is_admin() or (public.is_active() and auteur_id = auth.uid() and exists (
    select 1 from public.prospects p where p.id = prospect_id and (p.responsable_id is null or p.responsable_id = auth.uid()))));
create policy exchanges_delete on public.exchanges for delete to authenticated using (
  public.is_admin() or (public.is_active() and auteur_id = auth.uid() and exists (
    select 1 from public.prospects p where p.id = prospect_id and (p.responsable_id is null or p.responsable_id = auth.uid()))));

-- =========================================================================
-- Accès de l'API : rien pour les visiteurs anonymes, le strict nécessaire pour les comptes connectés.
-- =========================================================================

revoke all on public.profiles, public.prospects, public.exchanges from anon;
grant usage on schema public to authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.prospects, public.exchanges to authenticated;
revoke execute on function public.is_admin(), public.is_active() from anon;
grant execute on function public.is_admin(), public.is_active() to authenticated;

-- =========================================================================
-- Comptes déjà créés dans Authentication → Users avant ce script
-- =========================================================================

insert into public.profiles (id, email, nom)
select id, lower(email), split_part(email, '@', 1) from auth.users
on conflict (id) do nothing;

-- Pour nommer l'administrateur, exécuter ensuite (en remplaçant l'email) :
--   update public.profiles set role = 'admin' where email = 'email-de-l-administrateur@exemple.fr';
