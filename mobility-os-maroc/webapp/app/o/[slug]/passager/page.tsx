// P2.1 (Operator Resolver) : meme composant que /passager, mais monte sous
// une route avec un segment [slug] — le composant resout lui-meme
// l'operateur depuis ce slug via useOperateurId(), au lieu de la variable
// d'environnement figee au build. Un seul deploiement sert donc plusieurs
// opérateurs, chacun sur sa propre URL /o/<slug>/passager.
export { default } from '@/app/passager/page'
