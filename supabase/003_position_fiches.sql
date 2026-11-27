-- GRAFFAGNINO · Prospection — position des fiches (emplacements repérés sur la carte).
-- À exécuter UNE fois, après 002_documents_visites.sql : SQL Editor → New query → coller → Run.

alter table public.prospects
  add column if not exists lat double precision,
  add column if not exists lon double precision;
