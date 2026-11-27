-- GRAFFAGNINO · Prospection — suppression des fiches : administrateur, ou responsable de la fiche
-- (celui qui crée une fiche en devient responsable). Peut être relancé sans risque.
drop policy if exists prospects_delete on public.prospects;
create policy prospects_delete on public.prospects for delete to authenticated
  using (public.is_admin() or (public.is_active() and responsable_id = auth.uid()));

-- Les fichiers d'une fiche supprimée par son responsable doivent pouvoir être retirés du stockage.
drop policy if exists documents_fichiers_suppression on storage.objects;
create policy documents_fichiers_suppression on storage.objects for delete to authenticated
  using (bucket_id = 'documents' and (public.is_admin() or owner_id = auth.uid()::text or exists (
    select 1 from public.prospects p where p.id::text = split_part(name, '/', 1) and p.responsable_id = auth.uid())));
