-- GRAFFAGNINO · Prospection — RETOUR ARRIÈRE de la V2 (à n'utiliser qu'en cas de problème grave).
-- À exécuter après avoir republié l'ancienne version du site dans Netlify (Deploys → version précédente → Publish deploy).
-- Effet : les statuts reviennent à l'ancienne liste ; les nouvelles tables et colonnes sont CONSERVÉES (sans effet
-- sur l'ancienne application) : rien n'est perdu si l'on revient ensuite à la V2.

begin;
alter table public.prospects disable trigger prospects_touch;
alter table public.prospects disable trigger prospects_guard;
alter table public.prospects drop constraint if exists prospects_abandon_motif;
alter table public.prospects drop constraint if exists prospects_statut_check;

-- Fiches inchangées depuis la migration : statut d'origine exact ; autres fiches : correspondance la plus proche.
update public.prospects set statut = case
    when statut_v1 is not null and statut = (case statut_v1
        when 'a_prospecter' then 'repere' when 'decideur_a_identifier' then 'qualifie' when 'contact_a_etablir' then 'interlocuteur'
        when 'contact_etabli' then 'discussion' when 'en_discussion' then 'discussion' when 'visite_a_organiser' then 'discussion'
        when 'negociation' then 'negociation' when 'accord' then 'accord' when 'refuse' then 'abandonne' end) then statut_v1
    when statut = 'repere'        then 'a_prospecter'
    when statut = 'qualifie'      then 'decideur_a_identifier'
    when statut = 'interlocuteur' then 'contact_a_etablir'
    when statut = 'discussion'    then 'en_discussion'
    when statut = 'negociation'   then 'negociation'
    when statut in ('accord','signe','installe') then 'accord'
    when statut = 'abandonne'     then 'refuse'
    else statut end;

alter table public.prospects alter column statut set default 'a_prospecter';
alter table public.prospects add constraint prospects_statut_check check (statut in (
  'a_prospecter','decideur_a_identifier','contact_a_etablir','contact_etabli','en_discussion','visite_a_organiser','negociation','accord','refuse'));
alter table public.prospects enable trigger prospects_touch;
alter table public.prospects enable trigger prospects_guard;
drop trigger if exists prospects_v2_avant on public.prospects;
drop trigger if exists prospects_v2_journal on public.prospects;
drop trigger if exists exchanges_v2_journal on public.exchanges;
update public.parametres set valeur = '5'::jsonb, updated_at = now() where cle = 'schema_version';
commit;
