# Mobility OS Maroc — chantier prioritaire

**Statut : chantier principal, à partir du 2026-08-31, jusqu'à la présentation partenaire de samedi.**

Pendant cette phase, les autres chantiers (SENLINK, évolutions FlowPOS, autres développements non liés) sont en pause. Ce dossier centralise tout ce qui concerne Mobility OS Maroc : une plateforme de mobilité multi-services en marque blanche, destinée à être vendue à de vrais opérateurs de transport marocains.

## Règle directrice

> On ne développe pas une application pour impressionner. On construit un prototype destiné à être vendu à de vrais opérateurs de transport.

Chaque fonctionnalité décidée doit répondre à une seule question :

**« Est-ce que cela augmente la valeur du produit que l'opérateur peut acheter ? »**

Si la réponse est non, ou si elle est « ça fait joli », la fonctionnalité n'entre pas dans le prototype.

## Plan de travail

- [x] **Étape 1 — Aujourd'hui** : verrouiller le concept, le modèle économique, les utilisateurs, le MVP, le modèle white-label, les rôles FlowDynamicsAgency / partenaire. → [`01-concept-verrouille.md`](./01-concept-verrouille.md) — **Option A validée** : le partenaire est le premier opérateur pilote.
- [x] **Étape 2** : architecture fonctionnelle — parcours Passager, parcours Chauffeur, dashboard Opérateur, système de dispatch, GPS/cartographie, modèle multi-opérateur, architecture technique. → [`02-architecture-fonctionnelle.md`](./02-architecture-fonctionnelle.md)
- [x] **Étape 3** : maquettes des écrans, identité visuelle du projet, démonstration du parcours complet. → maquettes cliquables dans [`prototype/`](./prototype/index.html), script de démo dans [`03-maquettes-identite-demo.md`](./03-maquettes-identite-demo.md)
- [x] **Étape 4** : dossier commercial — présentation partenaire, EOI, modèle économique détaillé, proposition de déploiement. → dossier complet dans [`04-dossier-commercial/`](./04-dossier-commercial/00-dossier-commercial.md), support de présentation dans [`04-dossier-commercial/presentation-partenaire.pptx`](./04-dossier-commercial/presentation-partenaire.pptx)
- [x] **Étape 5 — Samedi** : matériel de présentation finalisé (checklist, déroulé minuté, notes de présentateur, FAQ). L'exécution en direct reste un événement réel, pas quelque chose que ce chantier peut cocher à l'avance. → [`05-jour-j.md`](./05-jour-j.md)

## Fichiers du chantier

| Fichier | Contenu | Étape |
|---|---|---|
| `01-concept-verrouille.md` | Concept, modèle économique, utilisateurs, MVP, white-label, rôles | 1 |
| `02-architecture-fonctionnelle.md` | Parcours Passager/Chauffeur, dashboard Opérateur, dispatch, GPS/cartographie, modèle multi-opérateur, architecture technique | 2 |
| `03-maquettes-identite-demo.md` | Identité visuelle, guide des maquettes, script de démonstration pas-à-pas | 3 |
| `prototype/` | Maquettes cliquables (HTML/CSS/JS statique) : app Passager, app Chauffeur, dashboard Opérateur | 3 |
| `04-dossier-commercial/00-dossier-commercial.md` | Synthèse qui relie concept, démo, modèle, stratégie, pilote et partenariat | 4 |
| `04-dossier-commercial/01-modele-economique-chiffre.md` | Chiffrage indicatif (setup fee, abonnement, commission, projection sur 3 mois) | 4 |
| `04-dossier-commercial/02-proposition-deploiement-pilote.md` | Plan de déploiement en 5 phases | 4 |
| `04-dossier-commercial/03-expression-interet-eoi.md` | Expression d'intérêt (EOI) à faire signer | 4 |
| `04-dossier-commercial/presentation-partenaire.pptx` | Support de présentation (11 diapositives, captures des maquettes + notes de présentateur intégrées) | 4 |
| `05-jour-j.md` | Checklist avant, déroulé minuté, FAQ objections, actions de clôture | 5 |

Le chantier des 5 étapes est complet. La suite dépend de l'issue de la présentation de samedi (voir `05-jour-j.md`, section "Après la présentation").
