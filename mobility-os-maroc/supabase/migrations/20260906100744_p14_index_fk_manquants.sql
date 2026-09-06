-- P14 (audit du 2026-09-06, priorite 1 de l'ordre de chantier valide par
-- l'equipe : FK -> RLS -> Dashboard operateur -> pg_net -> SMS) : indexe les
-- 3 cles etrangeres signalees sans index de couverture par l'auditeur
-- Supabase (get_advisors, categorie performance). Sans impact fonctionnel --
-- purement une optimisation de lecture (jointures, DELETE/UPDATE en cascade
-- sur la table referencee). Volume actuel faible (235 courses, 512
-- course_events, 1 trajet interville) donc aucun gain mesurable aujourd'hui,
-- mais evite une degradation quand le pilote grossira. Verifie post-migration
-- via get_advisors(performance) : les 3 alertes unindexed_foreign_keys ont
-- disparu, remplacees par des alertes unused_index attendues a ce volume
-- (meme statut que les index deja existants sur avis_courses/operateurs/
-- zones_operateur).

create index if not exists idx_course_events_chauffeur_id on public.course_events (chauffeur_id);
create index if not exists idx_courses_trajet_interville_id on public.courses (trajet_interville_id);
create index if not exists idx_trajets_intervilles_operateur_id on public.trajets_intervilles (operateur_id);
