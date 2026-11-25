/* Point d'entrée unique vers les données. L'interface n'appelle que GA.repo. */
window.GA = window.GA || {};

GA.repo = (function () {
  if (GA.config.dataSource === 'supabase') {
    if (!GA.createSupabaseRepository) throw new Error('Dépôt Supabase non chargé.');
    return GA.createSupabaseRepository(/* client Supabase */);
  }
  return GA.createLocalRepository(GA.config.storageKey, GA.DEMO);
})();
