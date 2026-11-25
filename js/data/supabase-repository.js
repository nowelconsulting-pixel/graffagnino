/* Dépôt Supabase — PRÉPARÉ, NON CONNECTÉ.
   Ce fichier n'est pas chargé par index.html. Il décrit l'interface à implémenter
   pour remplacer le dépôt de démonstration (local-repository.js) par Supabase.

   Étapes prévues :
   1. Créer le projet Supabase et exécuter supabase/schema.sql.
   2. Charger la bibliothèque supabase-js dans index.html.
   3. Implémenter chaque fonction ci-dessous (exemples en commentaire).
   4. Passer GA.config.dataSource à 'supabase' et charger ce fichier.

   Chaque fonction doit renvoyer les mêmes objets que le dépôt local
   (mêmes noms de champs que les colonnes de schema.sql). */
window.GA = window.GA || {};

GA.createSupabaseRepository = function (/* supabaseClient */) {
  const todo = name => async () => { throw new Error('Supabase non connecté : ' + name + ' reste à implémenter.'); };
  return {
    isPersistent: () => true,
    // Remplacé par Supabase Auth : supabase.auth.signInWithPassword({ email, password }),
    // puis lecture du profil dans la table profiles.
    authenticate: todo('authenticate'),
    // supabase.from('profiles').select('*').order('nom')
    listUsers: todo('listUsers'),
    getUser: todo('getUser'),
    // Création de compte : fonction serveur (Edge Function) avec la clé service, jamais côté navigateur.
    createUser: todo('createUser'),
    updateUser: todo('updateUser'),
    // supabase.from('prospects').select('*')
    listProspects: todo('listProspects'),
    getProspect: todo('getProspect'),
    createProspect: todo('createProspect'),
    updateProspect: todo('updateProspect'),
    deleteProspect: todo('deleteProspect'),
    // supabase.from('exchanges').select('*').eq('prospect_id', id).order('date', { ascending: false })
    listExchanges: todo('listExchanges'),
    addExchange: todo('addExchange'),
    deleteExchange: todo('deleteExchange'),
    resetDemo: todo('resetDemo'),
  };
};
