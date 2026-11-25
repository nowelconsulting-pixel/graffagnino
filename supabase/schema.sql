-- Schéma prévu pour Supabase (PostgreSQL). NON EXÉCUTÉ : préparé pour la suite.
-- Les colonnes reprennent exactement les champs utilisés par la maquette.

-- Profils : complète auth.users (Supabase Auth gère email et mot de passe).
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null unique,
  nom         text not null,
  fonction    text default '',
  telephone   text default '',
  role        text not null default 'user' check (role in ('admin', 'user')),
  actif       boolean not null default true,
  created_at  timestamptz not null default now()
);

create table public.prospects (
  id                 uuid primary key default gen_random_uuid(),
  nom                text not null,
  zone_id            text,               -- référence de la carte (S01, C11…) ; les zones restent dans la carte
  adresse            text default '',
  commune            text default '',
  statut             text not null default 'a_prospecter' check (statut in (
                       'a_prospecter','decideur_a_identifier','contact_a_etablir','contact_etabli',
                       'en_discussion','visite_a_organiser','negociation','accord','refuse')),
  proprietaire_nom   text default '',
  proprietaire_type  text default '',
  decideur_nom       text default '',
  decideur_fonction  text default '',
  telephone          text default '',
  email              text default '',
  responsable_id     uuid references public.profiles(id),
  prochaine_action   text default '',
  date_relance       date,
  notes              text default '',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table public.exchanges (
  id           uuid primary key default gen_random_uuid(),
  prospect_id  uuid not null references public.prospects(id) on delete cascade,
  date         date not null default current_date,
  type         text not null check (type in ('appel','email','rdv','visite','note')),
  commentaire  text not null,
  auteur_id    uuid references public.profiles(id),
  created_at   timestamptz not null default now()
);

-- Mise à jour automatique de updated_at (fiche modifiée ou échange ajouté).
create function public.touch_prospect() returns trigger language plpgsql as $$
begin
  if tg_table_name = 'prospects' then new.updated_at = now(); return new; end if;
  update public.prospects set updated_at = now() where id = new.prospect_id; return new;
end $$;
create trigger prospects_touch before update on public.prospects for each row execute function public.touch_prospect();
create trigger exchanges_touch after insert on public.exchanges for each row execute function public.touch_prospect();

-- Droits (mêmes règles que js/services/permissions.js).
create function public.is_admin() returns boolean language sql stable security definer as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin' and actif)
$$;
create function public.is_active() returns boolean language sql stable security definer as $$
  select exists (select 1 from public.profiles where id = auth.uid() and actif)
$$;

alter table public.profiles  enable row level security;
alter table public.prospects enable row level security;
alter table public.exchanges enable row level security;

create policy profiles_read   on public.profiles for select using (public.is_active());
create policy profiles_admin  on public.profiles for all    using (public.is_admin()) with check (public.is_admin());

create policy prospects_read   on public.prospects for select using (public.is_active());
create policy prospects_insert on public.prospects for insert with check (public.is_admin() or (public.is_active() and responsable_id = auth.uid()));
create policy prospects_update on public.prospects for update
  using (public.is_admin() or (public.is_active() and (responsable_id is null or responsable_id = auth.uid())))
  with check (public.is_admin() or responsable_id = auth.uid());
create policy prospects_delete on public.prospects for delete using (public.is_admin());

create policy exchanges_read   on public.exchanges for select using (public.is_active());
create policy exchanges_insert on public.exchanges for insert with check (
  public.is_admin() or (auteur_id = auth.uid() and exists (
    select 1 from public.prospects p where p.id = prospect_id and (p.responsable_id is null or p.responsable_id = auth.uid()))));
create policy exchanges_delete on public.exchanges for delete using (public.is_admin() or auteur_id = auth.uid());
