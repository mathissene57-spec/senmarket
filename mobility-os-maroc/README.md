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
- [ ] **Étape 4** : dossier commercial — présentation partenaire, EOI, modèle économique détaillé, proposition de déploiement.
- [ ] **Étape 5 — Samedi** : présentation au partenaire (concept → démonstration → modèle commercial → stratégie → pilote → proposition de partenariat).

## Fichiers du chantier

| Fichier | Contenu | Étape |
|---|---|---|
| `01-concept-verrouille.md` | Concept, modèle économique, utilisateurs, MVP, white-label, rôles | 1 |
| `02-architecture-fonctionnelle.md` | Parcours Passager/Chauffeur, dashboard Opérateur, dispatch, GPS/cartographie, modèle multi-opérateur, architecture technique | 2 |
| `03-maquettes-identite-demo.md` | Identité visuelle, guide des maquettes, script de démonstration pas-à-pas | 3 |
| `prototype/` | Maquettes cliquables (HTML/CSS/JS statique) : app Passager, app Chauffeur, dashboard Opérateur | 3 |

D'autres fichiers seront ajoutés au fur et à mesure (architecture, maquettes, dossier commercial) pour garder chaque étape traçable et validable séparément avant de passer à la suivante.
