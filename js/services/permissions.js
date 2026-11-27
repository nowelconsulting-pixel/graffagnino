/* Droits de la maquette. Les mêmes règles sont reprises dans supabase/schema.sql
   (politiques de sécurité au niveau des lignes), seule vraie protection une fois en ligne.

   Administrateur : tout, y compris utilisateurs, suppression et attribution des fiches.
   Utilisateur    : voit la carte et toutes les fiches ;
                    modifie les fiches dont il est responsable et les fiches non attribuées ;
                    crée des fiches (il en devient responsable) ; supprime les fiches dont il est responsable ;
                    n'attribue pas une fiche à quelqu'un d'autre. */
window.GA = window.GA || {};

GA.perm = {
  isAdmin: u => !!u && u.role === 'admin',
  canAccessAdmin: u => GA.perm.isAdmin(u),
  canCreateProspect: u => !!u,
  canEditProspect: (u, p) => !!u && (GA.perm.isAdmin(u) || !p.responsable_id || p.responsable_id === u.id),
  canDeleteProspect: (u, p) => !!u && (GA.perm.isAdmin(u) || (!!p && p.responsable_id === u.id)),
  canAssignOthers: u => GA.perm.isAdmin(u),
  canDeleteExchange: (u, p, e) => !!u && (GA.perm.isAdmin(u) || (e.auteur_id === u.id && GA.perm.canEditProspect(u, p))),
};
