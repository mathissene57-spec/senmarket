import Link from 'next/link'

// P2.4 : la page d'accueil devient la vitrine de la plateforme (pitch aux
// operateurs prospects, CTA vers /onboarding), qui manquait depuis P2.3 —
// /onboarding existait mais n'etait relie a rien. Les liens directs du
// pilote historique (TransAtlas, routes a variable d'environnement figee)
// restent inchanges en pied de page pour ne rien casser.
const ATOUTS = [
  {
    titre: 'Dispatch temps réel',
    texte: "Chaque chauffeur disponible est notifié en direct, avec recherche à rayon progressif pour ne jamais laisser un passager sans réponse.",
  },
  {
    titre: 'Marque blanche complète',
    texte: 'Votre nom, vos couleurs, votre logo — vos apps passager et chauffeur portent votre identité, pas la nôtre.',
  },
  {
    titre: 'Zones tarifaires flexibles',
    texte: 'Définissez vos propres tarifs de base et prix au kilomètre, zone par zone, modifiables à tout moment depuis votre dashboard.',
  },
]

export default function Home() {
  return (
    <div style={{ fontFamily: 'inherit' }}>
      <div style={{ maxWidth: 880, margin: '0 auto', padding: '72px 24px 24px' }}>
        <p className="muted" style={{ textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700 }}>Mobility OS Maroc</p>
        <h1 style={{ fontSize: 40, lineHeight: 1.15, marginBottom: 12 }}>
          Votre plateforme de VTC en marque blanche, prête en une minute
        </h1>
        <p className="muted" style={{ fontSize: 17, maxWidth: 560 }}>
          Applications passager, chauffeur et dashboard opérateur — sur une vraie base de données,
          pas une démo figée. Créez votre opérateur et lancez votre flotte aujourd&apos;hui.
        </p>
        <div style={{ display: 'flex', gap: 12, marginTop: 28, flexWrap: 'wrap' }}>
          <Link className="btn accent" href="/onboarding" style={{ textDecoration: 'none', width: 'auto', padding: '14px 28px' }}>
            Créer mon opérateur
          </Link>
          <Link className="btn ghost" href="/dashboard" style={{ textDecoration: 'none', width: 'auto', padding: '14px 28px' }}>
            Déjà opérateur ? Accéder à mon dashboard
          </Link>
        </div>
      </div>

      <div style={{ maxWidth: 880, margin: '0 auto', padding: '24px 24px 56px', display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        {ATOUTS.map((a) => (
          <div key={a.titre} className="card" style={{ padding: 20 }}>
            <h3 style={{ marginTop: 0, marginBottom: 8, fontSize: 17 }}>{a.titre}</h3>
            <p className="muted" style={{ margin: 0 }}>{a.texte}</p>
          </div>
        ))}
      </div>

      <div style={{ maxWidth: 880, margin: '0 auto', padding: '0 24px 64px', borderTop: '1px solid #EEE', paddingTop: 24 }}>
        <p className="muted" style={{ marginBottom: 12 }}>Accès rapide au pilote de démonstration :</p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Link className="btn outline" href="/passager" style={{ textDecoration: 'none', width: 'auto', padding: '10px 18px', fontSize: 14 }}>App Passager</Link>
          <Link className="btn outline" href="/chauffeur" style={{ textDecoration: 'none', width: 'auto', padding: '10px 18px', fontSize: 14 }}>App Chauffeur</Link>
        </div>
      </div>
    </div>
  )
}
