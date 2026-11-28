-- GRAFFAGNINO · Prospection — V2 : CRM orienté vente, réseau, secteurs et objectifs, journal, moteur de sourcing.
-- À exécuter UNE fois, après 005 : SQL Editor → New query → coller → Run. Durée : quelques secondes.
-- Sûr : tout est fait dans une seule transaction (tout ou rien) ; une copie des tables est faite avant
-- toute modification (schéma sauvegarde_v1) ; aucune donnée n'est supprimée ; relancer le script ne crée pas de doublon.
-- Retour arrière : supabase/006_retour_arriere.sql.

begin;

-- =========================================================================
-- 0. Sauvegarde des tables existantes (une seule fois)
-- =========================================================================
create schema if not exists sauvegarde_v1;
create table if not exists sauvegarde_v1.profiles   as table public.profiles;
create table if not exists sauvegarde_v1.prospects  as table public.prospects;
create table if not exists sauvegarde_v1.exchanges  as table public.exchanges;
create table if not exists sauvegarde_v1.documents  as table public.documents;
create table if not exists sauvegarde_v1.parametres as table public.parametres;
revoke all on all tables in schema sauvegarde_v1 from anon, authenticated;

-- =========================================================================
-- 1. Secteurs, objectifs, réseau (laboratoires et distributeurs)
-- =========================================================================
create table if not exists public.secteurs (
  id          uuid primary key default gen_random_uuid(),
  nom         text not null unique check (length(trim(nom)) > 0),
  actif       boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists public.objectifs (
  id          uuid primary key default gen_random_uuid(),
  nom         text not null check (length(trim(nom)) > 0),
  secteur_id  uuid references public.secteurs(id) on delete set null,
  cible       integer not null default 1 check (cible > 0),
  statut      text not null default 'actif' check (statut in ('actif','atteint','pause','archive')),
  date_cible  date,                       -- purement informative : aucune règle ne s'en sert
  notes       text not null default '',
  created_at  timestamptz not null default now()
);

create table if not exists public.sites (
  id                 uuid primary key default gen_random_uuid(),
  nom                text not null check (length(trim(nom)) > 0),
  type               text not null check (type in ('laboratoire','distributeur')),
  statut             text not null default 'en_service' check (statut in ('en_service','suspendu','retire','hypothetique')),
  adresse            text not null default '',
  commune            text not null default '',
  lat                double precision not null,
  lon                double precision not null,
  distance_max_km    numeric not null default 10,     -- laboratoire : rayon logistique par la route
  date_installation  date,
  prospect_id        uuid references public.prospects(id) on delete set null,
  secteur_id         uuid references public.secteurs(id) on delete set null,
  objectif_id        uuid references public.objectifs(id) on delete set null,
  infos              text not null default '',        -- modèle de machine, contact sur place, électricité, accès, horaires…
  created_by         uuid references public.profiles(id) default auth.uid(),
  created_at         timestamptz not null default now()
);

-- Premier contenu : le laboratoire et le distributeur pilote de Baillet-en-France, le secteur et l'objectif en cours.
insert into public.sites (nom, type, statut, adresse, commune, lat, lon, distance_max_km, infos)
select 'Laboratoire GRAFFAGNINO', 'laboratoire', 'en_service', '1/3 avenue du Bosquet', 'Baillet-en-France', 49.06365, 2.32388, 10, 'Laboratoire de production'
where not exists (select 1 from public.sites where type = 'laboratoire');
insert into public.sites (nom, type, statut, adresse, commune, lat, lon, infos)
select 'Distributeur pilote de Baillet', 'distributeur', 'en_service', '1/3 avenue du Bosquet', 'Baillet-en-France', 49.06365, 2.32388, 'Position exacte de la machine à préciser'
where not exists (select 1 from public.sites where type = 'distributeur');
insert into public.secteurs (nom) values ('Val-d''Oise') on conflict (nom) do nothing;
insert into public.objectifs (nom, secteur_id, cible, date_cible, notes)
select 'Deuxième distributeur', (select id from public.secteurs where nom = 'Val-d''Oise'), 1, date '2026-12-31', 'Objectif commercial à court terme ; la prospection continue ensuite.'
where not exists (select 1 from public.objectifs);

-- =========================================================================
-- 2. Sourcing : lieux, études, acteurs, concurrents
-- =========================================================================
create table if not exists public.lieux (
  id             uuid primary key default gen_random_uuid(),
  cle            text not null unique,            -- clé de dédoublonnage (source principale + identifiant)
  nom            text not null,
  typologie      text not null default '',
  lat            double precision not null,
  lon            double precision not null,
  adresse        text not null default '',
  commune        text not null default '',
  code_insee     text not null default '',
  niveau_preuve  text not null default 'B' check (niveau_preuve in ('A','B','C','D')),
  sources        jsonb not null default '[]',
  infos          jsonb not null default '{}',
  actif          boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists lieux_pos_idx on public.lieux (lat, lon);

create table if not exists public.etudes (
  id          uuid primary key default gen_random_uuid(),
  nom         text not null,
  params      jsonb not null default '{}',     -- territoire, laboratoire, typologies, profondeur, versions
  statut      text not null default 'terminee' check (statut in ('en_cours','terminee','erreur')),
  synthese    jsonb not null default '{}',
  created_by  uuid references public.profiles(id) default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.etude_lieux (
  etude_id       uuid not null references public.etudes(id) on delete cascade,
  lieu_id        uuid not null references public.lieux(id) on delete cascade,
  prescore       numeric,
  evaluation     jsonb not null default '{}',   -- dimensions, points forts, vigilance, à vérifier, score complet
  raison         text not null default '',
  decision       text not null default '' check (decision in ('','retenu','ecarte','attente')),
  decision_motif text not null default '',
  decided_by     uuid references public.profiles(id),
  decided_at     timestamptz,
  primary key (etude_id, lieu_id)
);

create table if not exists public.acteurs (
  id           uuid primary key default gen_random_uuid(),
  cle          text not null unique,          -- SIREN, ou « commune:<code INSEE> »
  siren        text,
  nom          text not null,
  type         text not null default 'entreprise' check (type in ('entreprise','fonciere','enseigne','collectivite','gestionnaire','autre')),
  infos        jsonb not null default '{}',   -- forme juridique, dirigeants publics, siège, coordonnées publiques
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.lieu_acteurs (
  lieu_id     uuid not null references public.lieux(id) on delete cascade,
  acteur_id   uuid not null references public.acteurs(id) on delete cascade,
  role        text not null check (role in ('proprietaire','exploitant','gestionnaire','collectivite','enseigne')),
  certitude   text not null default 'probable' check (certitude in ('verifie','probable','hypothese')),
  source      text not null default '',
  created_at  timestamptz not null default now(),
  primary key (lieu_id, acteur_id, role)
);

create table if not exists public.concurrents (
  id          uuid primary key default gen_random_uuid(),
  nom         text not null,
  type        text not null default 'distributeur' check (type in ('distributeur','pizzeria','autre')),
  lat         double precision not null,
  lon         double precision not null,
  source      text not null default 'terrain',
  confirme    boolean not null default true,
  notes       text not null default '',
  created_by  uuid references public.profiles(id) default auth.uid(),
  created_at  timestamptz not null default now()
);

-- =========================================================================
-- 3. Fiches : nouvelles colonnes (toutes facultatives, rien n'est supprimé)
-- =========================================================================
alter table public.prospects
  add column if not exists statut_v1               text,
  add column if not exists statut_depuis           timestamptz,
  add column if not exists bloque                  boolean not null default false,
  add column if not exists blocage_raison          text not null default '',
  add column if not exists blocage_precision       text not null default '',
  add column if not exists reexamen_le             date,
  add column if not exists motif_abandon           text,
  add column if not exists motif_abandon_precision text not null default '',
  add column if not exists statut_avant_abandon    text,
  add column if not exists modele_eco              text not null default '',
  add column if not exists montant                 numeric,
  add column if not exists montant_unite           text not null default '',
  add column if not exists duree_mois              integer,
  add column if not exists electricite             text not null default '',
  add column if not exists emplacement_precis      text not null default '',
  add column if not exists conditions_particulieres text not null default '',
  add column if not exists date_accord             date,
  add column if not exists date_accord_estimee     boolean not null default false,
  add column if not exists date_signature          date,
  add column if not exists date_installation       date,
  add column if not exists secteur_id              uuid references public.secteurs(id) on delete set null,
  add column if not exists objectif_id             uuid references public.objectifs(id) on delete set null,
  add column if not exists lieu_id                 uuid references public.lieux(id) on delete set null,
  add column if not exists typologie               text not null default '',
  add column if not exists analyse_entree          jsonb;     -- photographie de l'évaluation au moment de l'entrée au CRM

-- =========================================================================
-- 4. Conversion des statuts (sans toucher aux dates de mise à jour existantes)
-- =========================================================================
alter table public.prospects disable trigger prospects_touch;
alter table public.prospects disable trigger prospects_guard;
alter table public.prospects drop constraint if exists prospects_statut_check;

update public.prospects set statut_v1 = statut
 where statut_v1 is null and statut in ('a_prospecter','decideur_a_identifier','contact_a_etablir','contact_etabli','en_discussion','visite_a_organiser','negociation','accord','refuse');
update public.prospects set prochaine_action = 'Organiser la visite'
 where statut = 'visite_a_organiser' and coalesce(prochaine_action, '') = '';
update public.prospects set date_accord = coalesce(updated_at, created_at)::date, date_accord_estimee = true
 where statut = 'accord' and date_accord is null;
update public.prospects set motif_abandon = 'non_precise'
 where statut = 'refuse' and motif_abandon is null;
update public.prospects set statut = case statut
    when 'a_prospecter'          then 'repere'
    when 'decideur_a_identifier' then 'qualifie'
    when 'contact_a_etablir'     then 'interlocuteur'
    when 'contact_etabli'        then 'discussion'
    when 'en_discussion'         then 'discussion'
    when 'visite_a_organiser'    then 'discussion'
    when 'negociation'           then 'negociation'
    when 'accord'                then 'accord'
    when 'refuse'                then 'abandonne'
    else statut end
 where statut in ('a_prospecter','decideur_a_identifier','contact_a_etablir','contact_etabli','en_discussion','visite_a_organiser','negociation','accord','refuse');
update public.prospects set statut_depuis = coalesce(updated_at, created_at) where statut_depuis is null;

alter table public.prospects alter column statut set default 'repere';
alter table public.prospects add constraint prospects_statut_check check (statut in
  ('repere','qualifie','interlocuteur','discussion','negociation','accord','signe','installe','abandonne'));
alter table public.prospects drop constraint if exists prospects_abandon_motif;
alter table public.prospects add constraint prospects_abandon_motif check (statut <> 'abandonne' or motif_abandon is not null);

alter table public.prospects enable trigger prospects_touch;
alter table public.prospects enable trigger prospects_guard;

-- Échanges : nouveau type « proposition ».
alter table public.exchanges drop constraint if exists exchanges_type_check;
alter table public.exchanges add constraint exchanges_type_check check (type in ('appel','email','rdv','visite','note','proposition'));

-- =========================================================================
-- 5. Contacts multiples
-- =========================================================================
create table if not exists public.contacts (
  id           uuid primary key default gen_random_uuid(),
  prospect_id  uuid not null references public.prospects(id) on delete cascade,
  acteur_id    uuid references public.acteurs(id) on delete set null,
  nom          text not null default '',
  fonction     text not null default '',
  entreprise   text not null default '',
  telephone    text not null default '',
  email        text not null default '',
  role         text not null default 'autre' check (role in ('proprietaire','gestionnaire','exploitant','directeur','immobilier','decideur','collectivite','autre')),
  pouvoir      text not null default 'a_confirmer' check (pouvoir in ('decideur','prescripteur','sans_pouvoir','a_confirmer')),
  interet      text not null default 'non_exprime' check (interet in ('non_exprime','reserve','interesse','tres_interesse')),
  principal    boolean not null default false,
  notes        text not null default '',
  source       text not null default 'saisie',
  created_by   uuid references public.profiles(id) default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (length(trim(nom)) > 0 or length(trim(entreprise)) > 0)
);
create index if not exists contacts_prospect_idx on public.contacts (prospect_id);
create unique index if not exists contacts_un_principal on public.contacts (prospect_id) where principal;
create unique index if not exists contacts_migration_unique on public.contacts (prospect_id, source, role) where source = 'migration_v1';

-- Conversion des anciens champs décideur / propriétaire (les anciens champs restent intacts).
insert into public.contacts (prospect_id, nom, fonction, telephone, email, role, pouvoir, interet, principal, source, created_by)
select p.id, coalesce(nullif(trim(p.decideur_nom), ''), 'Décideur à nommer'), p.decideur_fonction, p.telephone, p.email,
       'decideur', 'a_confirmer', 'non_exprime', true, 'migration_v1', p.responsable_id
  from public.prospects p
 where (coalesce(trim(p.decideur_nom), '') <> '' or coalesce(trim(p.telephone), '') <> '' or coalesce(trim(p.email), '') <> '')
   and not exists (select 1 from public.contacts c where c.prospect_id = p.id and c.source = 'migration_v1' and c.role = 'decideur');
insert into public.contacts (prospect_id, entreprise, notes, role, principal, source, created_by)
select p.id, p.proprietaire_nom, case when coalesce(p.proprietaire_type, '') <> '' then 'Type : ' || p.proprietaire_type else '' end,
       'proprietaire', not exists (select 1 from public.contacts c where c.prospect_id = p.id and c.principal), 'migration_v1', p.responsable_id
  from public.prospects p
 where coalesce(trim(p.proprietaire_nom), '') <> ''
   and not exists (select 1 from public.contacts c where c.prospect_id = p.id and c.source = 'migration_v1' and c.role = 'proprietaire');

-- =========================================================================
-- 6. Journal automatique (tenu par la base, inaltérable)
-- =========================================================================
create table if not exists public.evenements (
  id           uuid primary key default gen_random_uuid(),
  prospect_id  uuid references public.prospects(id) on delete set null,
  prospect_nom text not null default '',
  type         text not null,
  auteur_id    uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  avant        jsonb,
  apres        jsonb,
  commentaire  text not null default ''
);
create index if not exists evenements_prospect_idx on public.evenements (prospect_id, created_at);
create index if not exists evenements_type_idx on public.evenements (type, created_at);

create or replace function public.journal(p_prospect uuid, p_nom text, p_type text, p_avant jsonb, p_apres jsonb, p_commentaire text default '')
returns void language sql security definer set search_path = '' as $$
  insert into public.evenements (prospect_id, prospect_nom, type, auteur_id, avant, apres, commentaire)
  values (p_prospect, coalesce(p_nom, ''), p_type, auth.uid(), p_avant, p_apres, coalesce(p_commentaire, ''));
$$;
revoke execute on function public.journal(uuid, text, text, jsonb, jsonb, text) from public, anon, authenticated;

-- Avant modification d'une fiche : date d'entrée dans le statut, mémoire du statut avant abandon, jalons datés.
create or replace function public.prospect_v2_avant() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.statut_depuis = coalesce(new.statut_depuis, now());
    return new;
  end if;
  if new.statut is distinct from old.statut then
    new.statut_depuis = now();
    if new.statut = 'abandonne' then new.statut_avant_abandon = old.statut; end if;
    if old.statut = 'abandonne' then new.motif_abandon = null; new.motif_abandon_precision = ''; end if;
    if new.statut = 'accord'   and new.date_accord is null       then new.date_accord = current_date; end if;
    if new.statut = 'signe'    and new.date_signature is null    then new.date_signature = current_date; end if;
    if new.statut = 'installe' and new.date_installation is null then new.date_installation = current_date; end if;
  end if;
  if not new.bloque then new.blocage_raison = ''; new.blocage_precision = ''; new.reexamen_le = null; end if;
  return new;
end $$;
drop trigger if exists prospects_v2_avant on public.prospects;
create trigger prospects_v2_avant before insert or update on public.prospects
  for each row execute function public.prospect_v2_avant();

-- Après modification d'une fiche : événements du journal.
create or replace function public.prospect_v2_journal() returns trigger
language plpgsql security definer set search_path = '' as $$
declare cond_avant jsonb; cond_apres jsonb;
begin
  if tg_op = 'INSERT' then
    perform public.journal(new.id, new.nom, 'creation', null, jsonb_build_object('statut', new.statut, 'responsable_id', new.responsable_id));
    return new;
  end if;
  if new.statut is distinct from old.statut then
    perform public.journal(new.id, new.nom, 'statut', jsonb_build_object('statut', old.statut), jsonb_build_object('statut', new.statut, 'motif', new.motif_abandon, 'precision', new.motif_abandon_precision));
  end if;
  if new.responsable_id is distinct from old.responsable_id then
    perform public.journal(new.id, new.nom, 'responsable', jsonb_build_object('responsable_id', old.responsable_id), jsonb_build_object('responsable_id', new.responsable_id));
  end if;
  if new.bloque is distinct from old.bloque or (new.bloque and (new.blocage_raison is distinct from old.blocage_raison or new.reexamen_le is distinct from old.reexamen_le)) then
    perform public.journal(new.id, new.nom, case when new.bloque then 'blocage' else 'deblocage' end,
      jsonb_build_object('bloque', old.bloque, 'raison', old.blocage_raison, 'reexamen_le', old.reexamen_le),
      jsonb_build_object('bloque', new.bloque, 'raison', new.blocage_raison, 'precision', new.blocage_precision, 'reexamen_le', new.reexamen_le));
  end if;
  cond_avant = jsonb_build_object('modele_eco', old.modele_eco, 'montant', old.montant, 'montant_unite', old.montant_unite, 'duree_mois', old.duree_mois,
    'electricite', old.electricite, 'emplacement_precis', old.emplacement_precis, 'conditions_particulieres', old.conditions_particulieres);
  cond_apres = jsonb_build_object('modele_eco', new.modele_eco, 'montant', new.montant, 'montant_unite', new.montant_unite, 'duree_mois', new.duree_mois,
    'electricite', new.electricite, 'emplacement_precis', new.emplacement_precis, 'conditions_particulieres', new.conditions_particulieres);
  if cond_avant is distinct from cond_apres then perform public.journal(new.id, new.nom, 'conditions', cond_avant, cond_apres); end if;
  if new.secteur_id is distinct from old.secteur_id or new.objectif_id is distinct from old.objectif_id then
    perform public.journal(new.id, new.nom, 'rattachement', jsonb_build_object('secteur_id', old.secteur_id, 'objectif_id', old.objectif_id),
      jsonb_build_object('secteur_id', new.secteur_id, 'objectif_id', new.objectif_id));
  end if;
  if new.date_accord is distinct from old.date_accord or new.date_signature is distinct from old.date_signature or new.date_installation is distinct from old.date_installation then
    perform public.journal(new.id, new.nom, 'jalons', jsonb_build_object('date_accord', old.date_accord, 'date_signature', old.date_signature, 'date_installation', old.date_installation),
      jsonb_build_object('date_accord', new.date_accord, 'date_signature', new.date_signature, 'date_installation', new.date_installation));
  end if;
  return new;
end $$;
drop trigger if exists prospects_v2_journal on public.prospects;
create trigger prospects_v2_journal after insert or update on public.prospects
  for each row execute function public.prospect_v2_journal();

create or replace function public.contact_v2_journal() returns trigger
language plpgsql security definer set search_path = '' as $$
declare nom_fiche text;
begin
  select nom into nom_fiche from public.prospects where id = coalesce(new.prospect_id, old.prospect_id);
  if tg_op = 'INSERT' then
    perform public.journal(new.prospect_id, nom_fiche, 'contact_ajout', null, to_jsonb(new) - 'created_by' - 'created_at' - 'updated_at');
  elsif tg_op = 'UPDATE' then
    new.updated_at = now();
    if (to_jsonb(new) - 'updated_at') is distinct from (to_jsonb(old) - 'updated_at') then
      perform public.journal(new.prospect_id, nom_fiche, 'contact_modif', to_jsonb(old) - 'created_by' - 'created_at' - 'updated_at', to_jsonb(new) - 'created_by' - 'created_at' - 'updated_at');
    end if;
    return new;
  else
    perform public.journal(old.prospect_id, nom_fiche, 'contact_suppr', to_jsonb(old) - 'created_by' - 'created_at' - 'updated_at', null);
    return old;
  end if;
  return new;
end $$;
drop trigger if exists contacts_journal_avant on public.contacts;
create trigger contacts_journal_avant before update on public.contacts
  for each row execute function public.contact_v2_journal();
drop trigger if exists contacts_journal_apres on public.contacts;
create trigger contacts_journal_apres after insert or delete on public.contacts
  for each row execute function public.contact_v2_journal();

create or replace function public.exchange_v2_journal() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.type = 'proposition' then
    perform public.journal(new.prospect_id, (select nom from public.prospects where id = new.prospect_id), 'proposition', null,
      jsonb_build_object('date', new.date, 'commentaire', new.commentaire, 'exchange_id', new.id));
  end if;
  return new;
end $$;
drop trigger if exists exchanges_v2_journal on public.exchanges;
create trigger exchanges_v2_journal after insert on public.exchanges
  for each row execute function public.exchange_v2_journal();

-- Un événement « migration » par fiche existante (une seule fois).
insert into public.evenements (prospect_id, prospect_nom, type, auteur_id, avant, apres, commentaire)
select p.id, p.nom, 'migration', null, jsonb_build_object('statut', p.statut_v1), jsonb_build_object('statut', p.statut), 'Passage à la V2'
  from public.prospects p
 where not exists (select 1 from public.evenements e where e.prospect_id = p.id and e.type = 'migration');

-- =========================================================================
-- 7. Attribution : le responsable peut transmettre son dossier à un autre utilisateur actif
-- =========================================================================
create or replace function public.guard_prospect() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if public.is_admin() then return new; end if;
  if tg_op = 'INSERT' then
    new.responsable_id = auth.uid();
  elsif new.responsable_id is distinct from old.responsable_id then
    if old.responsable_id = auth.uid() then
      if new.responsable_id is not null and not exists (select 1 from public.profiles where id = new.responsable_id and actif) then
        raise exception 'Le nouveau responsable doit être un utilisateur actif.';
      end if;
    elsif not (old.responsable_id is null and new.responsable_id = auth.uid()) then
      raise exception 'Seul le responsable du dossier, ou un administrateur, peut le transmettre.';
    end if;
  end if;
  return new;
end $$;

drop policy if exists prospects_update on public.prospects;
create policy prospects_update on public.prospects for update to authenticated
  using      (public.is_admin() or (public.is_active() and (responsable_id is null or responsable_id = auth.uid())))
  with check (public.is_admin() or public.is_active());   -- le changement de responsable est contrôlé par guard_prospect

-- =========================================================================
-- 8. Règles de sécurité des nouvelles tables
-- =========================================================================
alter table public.secteurs     enable row level security;
alter table public.objectifs    enable row level security;
alter table public.sites        enable row level security;
alter table public.lieux        enable row level security;
alter table public.etudes       enable row level security;
alter table public.etude_lieux  enable row level security;
alter table public.acteurs      enable row level security;
alter table public.lieu_acteurs enable row level security;
alter table public.concurrents  enable row level security;
alter table public.contacts     enable row level security;
alter table public.evenements   enable row level security;

do $$
declare t text;
begin
  -- Lecture par tous les comptes actifs.
  foreach t in array array['secteurs','objectifs','sites','lieux','etudes','etude_lieux','acteurs','lieu_acteurs','concurrents','contacts','evenements'] loop
    execute format('drop policy if exists %I on public.%I', t || '_lecture', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.is_active())', t || '_lecture', t);
  end loop;
  -- Sourcing et concurrence : travail commun des deux utilisateurs.
  foreach t in array array['lieux','etudes','etude_lieux','acteurs','lieu_acteurs','concurrents'] loop
    execute format('drop policy if exists %I on public.%I', t || '_ecriture', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.is_active())', t || '_ecriture', t);
    execute format('drop policy if exists %I on public.%I', t || '_modif', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.is_active()) with check (public.is_active())', t || '_modif', t);
  end loop;
  -- Référentiels : administrateurs.
  foreach t in array array['secteurs','objectifs'] loop
    execute format('drop policy if exists %I on public.%I', t || '_admin', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t || '_admin', t);
  end loop;
end $$;

drop policy if exists etudes_suppr on public.etudes;
create policy etudes_suppr on public.etudes for delete to authenticated using (public.is_admin() or created_by = auth.uid());
drop policy if exists concurrents_suppr on public.concurrents;
create policy concurrents_suppr on public.concurrents for delete to authenticated using (public.is_admin() or created_by = auth.uid());
drop policy if exists lieu_acteurs_suppr on public.lieu_acteurs;
create policy lieu_acteurs_suppr on public.lieu_acteurs for delete to authenticated using (public.is_active());

-- Réseau : administrateurs, ou responsable de la fiche installée.
drop policy if exists sites_ecriture on public.sites;
create policy sites_ecriture on public.sites for insert to authenticated with check (
  public.is_admin() or (public.is_active() and prospect_id is not null and exists (
    select 1 from public.prospects p where p.id = prospect_id and p.responsable_id = auth.uid())));
drop policy if exists sites_modif on public.sites;
create policy sites_modif on public.sites for update to authenticated using (
  public.is_admin() or (public.is_active() and prospect_id is not null and exists (
    select 1 from public.prospects p where p.id = prospect_id and p.responsable_id = auth.uid())));
drop policy if exists sites_suppr on public.sites;
create policy sites_suppr on public.sites for delete to authenticated using (public.is_admin());

-- Contacts : mêmes règles que les échanges.
drop policy if exists contacts_ajout on public.contacts;
create policy contacts_ajout on public.contacts for insert to authenticated with check (
  public.is_admin() or (public.is_active() and exists (
    select 1 from public.prospects p where p.id = prospect_id and (p.responsable_id is null or p.responsable_id = auth.uid()))));
drop policy if exists contacts_modif on public.contacts;
create policy contacts_modif on public.contacts for update to authenticated using (
  public.is_admin() or (public.is_active() and exists (
    select 1 from public.prospects p where p.id = prospect_id and (p.responsable_id is null or p.responsable_id = auth.uid()))));
drop policy if exists contacts_suppr on public.contacts;
create policy contacts_suppr on public.contacts for delete to authenticated using (
  public.is_admin() or (public.is_active() and exists (
    select 1 from public.prospects p where p.id = prospect_id and p.responsable_id = auth.uid())));

-- Journal : lecture seule pour tous (pas d'ajout, de modification ni de suppression par l'API).
revoke all on public.evenements from anon, authenticated;
grant select on public.evenements to authenticated;

revoke all on public.secteurs, public.objectifs, public.sites, public.lieux, public.etudes, public.etude_lieux,
  public.acteurs, public.lieu_acteurs, public.concurrents, public.contacts from anon;
grant select, insert, update, delete on public.secteurs, public.objectifs, public.sites, public.lieux, public.etudes,
  public.etude_lieux, public.acteurs, public.lieu_acteurs, public.concurrents, public.contacts to authenticated;

-- =========================================================================
-- 9. Réglages par défaut et version du schéma
-- =========================================================================
insert into public.parametres (cle, valeur) values
  ('seuils', '{"potentiel_eleve": 60, "immobile_jours": 21, "relance_jours": 7, "reexamen_jours": 30}'::jsonb)
on conflict (cle) do nothing;
insert into public.parametres (cle, valeur) values ('schema_version', '6'::jsonb)
on conflict (cle) do update set valeur = '6'::jsonb, updated_at = now();

commit;

-- Contrôles (à lire dans le résultat) : chaque ligne doit afficher ok = true.
select 'fiches conservées' as controle, (select count(*) from public.prospects) >= (select count(*) from sauvegarde_v1.prospects) as ok
union all select 'échanges conservés', (select count(*) from public.exchanges) >= (select count(*) from sauvegarde_v1.exchanges)
union all select 'documents conservés', (select count(*) from public.documents) >= (select count(*) from sauvegarde_v1.documents)
union all select 'statuts valides', not exists (select 1 from public.prospects where statut not in ('repere','qualifie','interlocuteur','discussion','negociation','accord','signe','installe','abandonne'))
union all select 'abandons avec motif', not exists (select 1 from public.prospects where statut = 'abandonne' and motif_abandon is null)
union all select 'un événement migration par fiche', (select count(distinct prospect_id) from public.evenements where type = 'migration') = (select count(*) from public.prospects)
union all select 'réseau initialisé', exists (select 1 from public.sites where type = 'laboratoire');
