/* Point d'entrée unique vers les données. L'interface n'appelle que GA.repo. */
window.GA = window.GA || {};

GA.repo = (function () {
  if (!window.supabase || !GA.createSupabaseRepository) throw new Error('Bibliothèque Supabase non chargée.');
  const client = window.supabase.createClient(GA.config.supabaseUrl, GA.config.supabaseKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: GA.config.sessionKey },
  });
  return GA.createSupabaseRepository(client);
})();
