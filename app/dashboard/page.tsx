import Link from 'next/link'
import { getDashboard } from '@/lib/supabase/dashboard'

export const metadata = {
  title: 'Tableau de bord vendeur — SenMarket',
}

const STATUTS_LABEL: { [key: string]: string } = {
  en_attente: 'En attente',
  confirmee: 'Confirmée',
  preparation: 'Préparation',
  expediee: 'Expédiée',
  livree: 'Livrée',
  annulee: 'Annulée',
}

export default async function DashboardPage() {
  let dashboard: Awaited<ReturnType<typeof getDashboard>> | null = null
  let erreur: string | null = null

  try {
    dashboard = await getDashboard()
  } catch (e) {
    erreur = e instanceof Error ? e.message : 'Erreur inconnue'
  }

  if (erreur) {
    return (
      <main style={styles.page}>
        <div style={styles.erreur}>
          Impossible de charger votre tableau de bord pour le moment.
          <br />
          <small>{erreur}</small>
        </div>
      </main>
    )
  }

  if (!dashboard || !dashboard.connecte) {
    return (
      <main style={styles.page}>
        <p style={styles.vide}>
          Vous devez être connecté pour accéder à votre tableau de bord.{' '}
          <Link href="/login" style={styles.lien}>
            Se connecter
          </Link>
        </p>
      </main>
    )
  }

  if (dashboard.boutiques.length === 0) {
    return (
      <main style={styles.page}>
        <h1 style={styles.titre}>Tableau de bord vendeur</h1>
        <p style={styles.vide}>
          Aucune boutique n&apos;est associée à votre compte pour le moment.
        </p>
      </main>
    )
  }

  return (
    <main style={styles.page}>
      <h1 style={styles.titre}>Tableau de bord vendeur</h1>

      {dashboard.boutiques.map(({ boutique, produits, commandes, stats, topProduits }) => (
        <section key={boutique.id} style={styles.section}>
          <div style={styles.enteteBoutique}>
            <h2 style={styles.nomBoutique}>
              {boutique.nom}
              {boutique.verifie && ' ✅'}
              {!boutique.actif && <span style={styles.badgeInactif}>Boutique désactivée</span>}
            </h2>
            <div style={styles.metaBoutique}>
              Devise : {boutique.devise} · {'★'.repeat(Math.round(boutique.note))} ({boutique.note}) ·{' '}
              {boutique.nb_produits} produit{boutique.nb_produits > 1 ? 's' : ''} actif
              {boutique.nb_produits > 1 ? 's' : ''} · {boutique.nb_ventes} vente
              {boutique.nb_ventes > 1 ? 's' : ''}
            </div>
          </div>

          {stats && (
            <div style={styles.statsGrille}>
              <div style={styles.statCarte}>
                <div style={styles.statValeur}>{stats.total_commandes}</div>
                <div style={styles.statLabel}>Commandes comptées</div>
              </div>
              <div style={styles.statCarte}>
                <div style={styles.statValeur}>
                  {stats.panier_moyen ?? 0} {boutique.devise}
                </div>
                <div style={styles.statLabel}>Panier moyen</div>
              </div>
              <div style={styles.statCarte}>
                <div style={styles.statValeur}>{stats.nb_clients}</div>
                <div style={styles.statLabel}>Clients identifiés</div>
              </div>
              <div style={styles.statCarte}>
                <div style={styles.statValeur}>{stats.couverture_pct}%</div>
                <div style={styles.statLabel}>Commandes avec téléphone</div>
              </div>
              {stats.meilleur_client_nom && (
                <div style={styles.statCarte}>
                  <div style={styles.statValeur}>{stats.meilleur_client_nom}</div>
                  <div style={styles.statLabel}>
                    Meilleur client ({stats.meilleur_client_ca} {boutique.devise})
                  </div>
                </div>
              )}
            </div>
          )}

          {topProduits.length > 0 && (
            <div style={styles.bloc}>
              <h3 style={styles.sousTitre}>Meilleures ventes</h3>
              <ul style={styles.listeSimple}>
                {topProduits.map((tp) => (
                  <li key={tp.produit_id} style={styles.ligneListe}>
                    {tp.nom_produit} — {tp.total_ventes} vendu{tp.total_ventes > 1 ? 's' : ''} ({tp.total_revenu}{' '}
                    {boutique.devise})
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div style={styles.bloc}>
            <h3 style={styles.sousTitre}>Produits ({produits.length})</h3>
            {produits.length === 0 ? (
              <p style={styles.vide}>Aucun produit pour cette boutique.</p>
            ) : (
              <div style={styles.tableWrap}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Nom</th>
                      <th style={styles.th}>Prix</th>
                      <th style={styles.th}>Stock</th>
                      <th style={styles.th}>Ventes</th>
                      <th style={styles.th}>Statut</th>
                    </tr>
                  </thead>
                  <tbody>
                    {produits.map((p) => (
                      <tr key={p.id}>
                        <td style={styles.td}>{p.nom}</td>
                        <td style={styles.td}>
                          {p.prix} {boutique.devise}
                        </td>
                        <td style={styles.td}>{p.stock}</td>
                        <td style={styles.td}>{p.ventes}</td>
                        <td style={styles.td}>
                          {p.actif ? (
                            <span style={styles.pastilleActif}>Actif</span>
                          ) : (
                            <span style={styles.pastilleInactif}>Inactif</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div style={styles.bloc}>
            <h3 style={styles.sousTitre}>Commandes récentes ({commandes.length})</h3>
            {commandes.length === 0 ? (
              <p style={styles.vide}>Aucune commande pour cette boutique.</p>
            ) : (
              <div style={styles.tableWrap}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Client</th>
                      <th style={styles.th}>Téléphone</th>
                      <th style={styles.th}>Statut</th>
                      <th style={styles.th}>Origine</th>
                      <th style={styles.th}>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {commandes.map((c) => (
                      <tr key={c.id}>
                        <td style={styles.td}>{c.client_nom ?? '—'}</td>
                        <td style={styles.td}>{c.client_telephone ?? '—'}</td>
                        <td style={styles.td}>{STATUTS_LABEL[c.statut] ?? c.statut}</td>
                        <td style={styles.td}>{c.origine}</td>
                        <td style={styles.td}>{new Date(c.created_at).toLocaleDateString('fr-FR')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      ))}
    </main>
  )
}

const styles: { [key: string]: React.CSSProperties } = {
  page: {
    fontFamily: "'DM Sans', system-ui, sans-serif",
    background: '#FAF7F2',
    color: '#1A1A1A',
    minHeight: '100vh',
    padding: '24px clamp(16px, 5vw, 64px)',
  },
  titre: { fontFamily: "'Playfair Display', serif", fontSize: 28, fontWeight: 900, marginBottom: 24 },
  vide: { color: '#7A7A7A' },
  lien: { color: '#006B3C', fontWeight: 700, textDecoration: 'none' },
  section: {
    background: '#FFFFFF',
    border: '1px solid #E8E2D9',
    borderRadius: 18,
    padding: 20,
    marginBottom: 28,
  },
  enteteBoutique: { marginBottom: 16 },
  nomBoutique: {
    fontFamily: "'Playfair Display', serif",
    fontSize: 20,
    fontWeight: 900,
    margin: 0,
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  badgeInactif: {
    fontSize: 11,
    fontWeight: 700,
    color: '#fff',
    background: 'rgba(196,30,58,.85)',
    borderRadius: 6,
    padding: '3px 8px',
  },
  metaBoutique: { color: '#7A7A7A', fontSize: 13, marginTop: 4 },
  statsGrille: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
    gap: 12,
    marginBottom: 20,
  },
  statCarte: {
    background: '#F4EEE4',
    borderRadius: 12,
    padding: '12px 14px',
  },
  statValeur: { fontSize: 18, fontWeight: 900, color: '#006B3C' },
  statLabel: { fontSize: 11, color: '#7A7A7A', marginTop: 2 },
  bloc: { marginTop: 20 },
  sousTitre: { fontSize: 15, fontWeight: 800, marginBottom: 10 },
  listeSimple: { margin: 0, paddingLeft: 18, fontSize: 13, color: '#3D3D3D' },
  ligneListe: { marginBottom: 4 },
  tableWrap: { overflowX: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: {
    textAlign: 'left',
    padding: '8px 10px',
    borderBottom: '2px solid #E8E2D9',
    color: '#7A7A7A',
    fontSize: 11,
    textTransform: 'uppercase',
  },
  td: { padding: '8px 10px', borderBottom: '1px solid #F0EBE3' },
  pastilleActif: {
    fontSize: 11,
    fontWeight: 700,
    color: '#006B3C',
    background: 'rgba(0,107,60,.1)',
    borderRadius: 6,
    padding: '2px 8px',
  },
  pastilleInactif: {
    fontSize: 11,
    fontWeight: 700,
    color: '#7A7A7A',
    background: '#F0EBE3',
    borderRadius: 6,
    padding: '2px 8px',
  },
  erreur: {
    background: 'rgba(196,30,58,.08)',
    border: '1px solid rgba(196,30,58,.25)',
    borderRadius: 12,
    padding: 20,
    color: '#C41E3A',
    maxWidth: 480,
    margin: '40px auto',
  },
}
