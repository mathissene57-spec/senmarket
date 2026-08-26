-- SenMarket - Phase 3A - Fondation backend (boutiques, produits, commandes)
--
-- Cette migration cree le modele de donnees et la RPC transactionnelle
-- creer_commande_complete() pour SenMarket, sous les invariants suivants :
--   - la devise appartient a la boutique, jamais au produit
--   - le panier/la commande sont mono-boutique (verifie serveur, pas seulement front)
--   - le prix effectif (prix ou prix_promo) est calcule et fige serveur
--   - le stock est verifie et decremente dans la meme transaction (FOR UPDATE)
--   - aucune commande n'existe avant le succes de la RPC (WhatsApp en est une consequence)
--   - suppression physique interdite (archivage via colonne statut uniquement)
--   - verifiee = badge de confiance, independant de la visibilite (statut = 'active')
--
-- Rollback : voir docs/rollback/phase3a_foundation_down.sql (execution manuelle
-- uniquement, ce fichier n'est PAS destine a etre execute automatiquement par
-- `supabase db reset`).

-- ============================================================
-- 1. Tables de reference
-- ============================================================

create table public.devises (
  code        text primary key,
  nom         text not null,
  symbole     text not null
);

insert into public.devises (code, nom, symbole) values
  ('MAD', 'Dirham marocain', 'DH'),
  ('XOF', 'Franc CFA (BCEAO)', 'CFA'),
  ('EUR', 'Euro', '€'),
  ('CAD', 'Dollar canadien', 'CAD$');

create table public.categories (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique not null,
  nom         text not null,
  icone       text,
  ordre       int not null default 0
);

insert into public.categories (slug, nom, icone, ordre) values
  ('mode', 'Mode',      '👗', 1),
  ('alim', 'Cuisine',   '🍲', 2),
  ('beau', 'Beaute',    '💄', 3),
  ('bij',  'Bijoux',    '💍', 4),
  ('tech', 'Tech',      '📱', 5),
  ('mais', 'Maison',    '🏠', 6),
  ('serv', 'Services',  '🛠️', 7);

-- ============================================================
-- 2. boutiques
-- ============================================================

create table public.boutiques (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users(id) on delete cascade,
  nom           text not null check (char_length(nom) between 1 and 120),
  slug          text unique not null,
  devise        text not null references public.devises(code),
  categorie_id  uuid references public.categories(id),
  ville         text,
  telephone     text,
  whatsapp      text not null,
  logo_url      text,
  description   text,
  verifiee      boolean not null default false,
  statut        text not null default 'active' check (statut in ('active','suspendue','archivee')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index idx_boutiques_owner on public.boutiques(owner_id);
create index idx_boutiques_statut on public.boutiques(statut);

-- ============================================================
-- 3. produits
-- ============================================================

create table public.produits (
  id            uuid primary key default gen_random_uuid(),
  boutique_id   uuid not null references public.boutiques(id) on delete restrict,
  categorie_id  uuid references public.categories(id),
  nom           text not null check (char_length(nom) between 1 and 160),
  slug          text not null,
  description   text,
  prix          numeric(12,2) not null check (prix > 0),
  prix_promo    numeric(12,2) check (prix_promo is null or (prix_promo > 0 and prix_promo < prix)),
  promo_debut   timestamptz,
  promo_fin     timestamptz,
  stock         int not null default 0 check (stock >= 0),
  livraison     boolean not null default false,
  statut        text not null default 'actif' check (statut in ('actif','rupture','archive')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (boutique_id, slug),
  constraint chk_promo_dates check (promo_debut is null or promo_fin is null or promo_fin >= promo_debut)
);

create index idx_produits_boutique on public.produits(boutique_id);
create index idx_produits_boutique_statut on public.produits(boutique_id, statut);
create index idx_produits_categorie on public.produits(categorie_id);

-- ============================================================
-- 4. commande_seq
-- ============================================================

create sequence public.commande_seq;

-- ============================================================
-- 5. commandes
-- ============================================================

create table public.commandes (
  id                  uuid primary key default gen_random_uuid(),
  numero              text unique not null,
  boutique_id         uuid not null references public.boutiques(id) on delete restrict,
  acheteur_id         uuid references auth.users(id) on delete set null,
  acheteur_nom        text not null check (char_length(acheteur_nom) between 1 and 120),
  acheteur_telephone  text not null check (char_length(acheteur_telephone) between 1 and 30),
  devise              text not null references public.devises(code),
  total               numeric(14,2) not null check (total >= 0),
  statut              text not null default 'en_attente'
                       check (statut in ('en_attente','confirmee','expediee','livree','annulee')),
  created_at          timestamptz not null default now()
);

create index idx_commandes_boutique on public.commandes(boutique_id);
create index idx_commandes_statut on public.commandes(statut);

-- ============================================================
-- 6. commande_lignes
-- ============================================================

create table public.commande_lignes (
  id                uuid primary key default gen_random_uuid(),
  commande_id       uuid not null references public.commandes(id) on delete cascade,
  produit_id        uuid not null references public.produits(id) on delete restrict,
  nom_produit       text not null,
  prix_unitaire     numeric(12,2) not null check (prix_unitaire > 0),
  quantite          int not null check (quantite > 0),
  sous_total        numeric(14,2) generated always as (prix_unitaire * quantite) stored
);

create index idx_lignes_commande on public.commande_lignes(commande_id);
create index idx_lignes_produit on public.commande_lignes(produit_id);

-- ============================================================
-- 7. RPC creer_commande_complete
-- ============================================================
-- SECURITY DEFINER verrouillee : search_path = '' + tous les objets
-- qualifies (public.*, auth.uid()) pour resister a une modification
-- ulterieure du search_path de l'environnement (recommandation Supabase).
-- Aucune table temporaire : panier plafonne a 50 lignes, agregation des
-- doublons via deux tableaux PL/pgSQL (uuid[], int[]) + unnest().
-- Toutes les lignes sont verrouillees (FOR UPDATE) et validees AVANT toute
-- creation de commande : aucune commande partiellement creee en cas d'echec.

create or replace function public.creer_commande_complete(
  p_boutique_id uuid,
  p_lignes jsonb,               -- [{"produit_id": "...", "quantite": 2}, ...]
  p_acheteur_nom text,
  p_acheteur_telephone text
) returns public.commandes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_acheteur_id   uuid := auth.uid();   -- NULL cote anon = guest checkout
  v_devise        text;
  v_produit       public.produits%rowtype;
  v_prix_effectif numeric(12,2);
  v_total         numeric(14,2) := 0;
  v_commande      public.commandes%rowtype;
  v_ligne         record;
  v_elem          jsonb;
  v_qte           int;
  v_pid           uuid;
  v_produit_ids   uuid[] := '{}';
  v_quantites     int[]  := '{}';
begin
  if p_lignes is null or jsonb_typeof(p_lignes) <> 'array' or jsonb_array_length(p_lignes) = 0 then
    raise exception 'Panier vide ou invalide';
  end if;
  if jsonb_array_length(p_lignes) > 50 then
    raise exception 'Panier trop volumineux';
  end if;
  if coalesce(trim(p_acheteur_nom), '') = '' or coalesce(trim(p_acheteur_telephone), '') = '' then
    raise exception 'Nom et telephone requis';
  end if;
  if length(p_acheteur_nom) > 120 then
    raise exception 'Nom trop long';
  end if;
  if length(p_acheteur_telephone) > 30 then
    raise exception 'Telephone trop long';
  end if;

  -- Validation stricte + collecte de chaque ligne (types, bornes)
  for v_elem in select * from jsonb_array_elements(p_lignes)
  loop
    if not (v_elem ? 'produit_id') or not (v_elem ? 'quantite') then
      raise exception 'Ligne de panier malformee : champs manquants';
    end if;

    begin
      v_pid := (v_elem->>'produit_id')::uuid;
    exception when others then
      raise exception 'produit_id invalide';
    end;

    if jsonb_typeof(v_elem->'quantite') <> 'number' then
      raise exception 'Quantite invalide';
    end if;
    if (v_elem->>'quantite') !~ '^[0-9]+$' then
      raise exception 'Quantite invalide (doit etre un entier positif)';
    end if;

    v_qte := (v_elem->>'quantite')::int;
    if v_qte < 1 or v_qte > 100 then
      raise exception 'Quantite hors limites (1 a 100)';
    end if;

    v_produit_ids := array_append(v_produit_ids, v_pid);
    v_quantites   := array_append(v_quantites, v_qte);
  end loop;

  select devise into v_devise from public.boutiques where id = p_boutique_id and statut = 'active';
  if v_devise is null then
    raise exception 'Boutique introuvable ou inactive';
  end if;

  -- PASSE 1 : agregation des doublons + verrouillage + validation COMPLETE
  -- de toutes les lignes avant toute ecriture. Ordre stable (produit_id)
  -- pour eviter les deadlocks entre transactions concurrentes.
  for v_ligne in
    select t.produit_id, sum(t.quantite) as quantite
    from unnest(v_produit_ids, v_quantites) as t(produit_id, quantite)
    group by t.produit_id
    order by t.produit_id
  loop
    select * into v_produit from public.produits where id = v_ligne.produit_id for update;

    if not found then
      raise exception 'Produit % introuvable', v_ligne.produit_id;
    end if;
    if v_produit.boutique_id <> p_boutique_id then
      raise exception 'Panier mono-boutique viole (produit %)', v_produit.id;
    end if;
    if v_produit.statut <> 'actif' then
      raise exception 'Produit % indisponible', v_produit.nom;
    end if;
    if v_produit.stock < v_ligne.quantite then
      raise exception 'Stock insuffisant pour %', v_produit.nom;
    end if;
  end loop;

  -- Toutes les lignes sont valides et verrouillees : creation de la commande
  insert into public.commandes (numero, boutique_id, acheteur_id, acheteur_nom, acheteur_telephone, devise, total, statut)
  values (
    'SM-' || lpad(nextval('public.commande_seq')::text, 6, '0'),
    p_boutique_id, v_acheteur_id, trim(p_acheteur_nom), trim(p_acheteur_telephone), v_devise, 0, 'en_attente'
  )
  returning * into v_commande;

  -- PASSE 2 : creation des lignes (prix calcule serveur) + decrement stock
  for v_ligne in
    select t.produit_id, sum(t.quantite) as quantite
    from unnest(v_produit_ids, v_quantites) as t(produit_id, quantite)
    group by t.produit_id
    order by t.produit_id
  loop
    select * into v_produit from public.produits where id = v_ligne.produit_id;

    v_prix_effectif := case
      when v_produit.prix_promo is not null
       and now() >= coalesce(v_produit.promo_debut, '-infinity')
       and now() <= coalesce(v_produit.promo_fin, 'infinity')
      then v_produit.prix_promo
      else v_produit.prix
    end;

    insert into public.commande_lignes (commande_id, produit_id, nom_produit, prix_unitaire, quantite)
    values (v_commande.id, v_produit.id, v_produit.nom, v_prix_effectif, v_ligne.quantite);

    update public.produits set stock = stock - v_ligne.quantite, updated_at = now() where id = v_produit.id;

    v_total := v_total + v_prix_effectif * v_ligne.quantite;
  end loop;

  update public.commandes set total = v_total where id = v_commande.id returning * into v_commande;

  return v_commande;
end;
$$;

revoke all on function public.creer_commande_complete(uuid, jsonb, text, text) from public;
grant execute on function public.creer_commande_complete(uuid, jsonb, text, text) to anon;
grant execute on function public.creer_commande_complete(uuid, jsonb, text, text) to authenticated;

-- ============================================================
-- 8. RLS
-- ============================================================

alter table public.devises enable row level security;
alter table public.categories enable row level security;
alter table public.boutiques enable row level security;
alter table public.produits enable row level security;
alter table public.commandes enable row level security;
alter table public.commande_lignes enable row level security;

-- Tables de reference : lecture publique, ecriture reservee aux migrations
create policy "devises_lecture" on public.devises
  for select to anon, authenticated using (true);
create policy "categories_lecture" on public.categories
  for select to anon, authenticated using (true);
grant select on public.devises to anon, authenticated;
grant select on public.categories to anon, authenticated;

-- boutiques
create policy "boutiques_lecture_publique" on public.boutiques
  for select to anon, authenticated using (statut = 'active');

create policy "boutiques_insert_owner" on public.boutiques
  for insert to authenticated
  with check (owner_id = (select auth.uid()));

create policy "boutiques_update_owner" on public.boutiques
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

grant select on public.boutiques to anon, authenticated;

revoke insert on public.boutiques from authenticated;
grant insert (owner_id, nom, slug, devise, categorie_id, ville, telephone, whatsapp, logo_url, description)
  on public.boutiques to authenticated;
-- verifiee et statut exclus : valeurs DEFAULT uniquement, non pilotables
-- par le vendeur (badge/disponibilite reserves a une fonction admin future).

revoke update on public.boutiques from authenticated;
grant update (nom, slug, categorie_id, ville, telephone, whatsapp, logo_url, description)
  on public.boutiques to authenticated;
-- owner_id, devise, statut, verifiee : jamais modifiables via UPDATE direct.

-- produits
create policy "produits_lecture_publique" on public.produits
  for select to anon, authenticated
  using (
    statut = 'actif'
    and exists (select 1 from public.boutiques b where b.id = produits.boutique_id and b.statut = 'active')
  );

create policy "produits_insert_owner" on public.produits
  for insert to authenticated
  with check (
    exists (select 1 from public.boutiques b where b.id = boutique_id and b.owner_id = (select auth.uid()))
  );

create policy "produits_update_owner" on public.produits
  for update to authenticated
  using (
    exists (select 1 from public.boutiques b where b.id = produits.boutique_id and b.owner_id = (select auth.uid()))
  )
  with check (
    exists (select 1 from public.boutiques b where b.id = produits.boutique_id and b.owner_id = (select auth.uid()))
  );

grant select on public.produits to anon, authenticated;

revoke insert on public.produits from authenticated;
grant insert (
  boutique_id,
  categorie_id,
  nom,
  slug,
  description,
  prix,
  prix_promo,
  promo_debut,
  promo_fin,
  stock,
  livraison,
  statut
)
on public.produits to authenticated;
-- Restriction explicite ajoutee en V3A.4, symetrique a boutiques, pour que
-- la migration soit autoportante et independante des default privileges du
-- projet Supabase. Aucune colonne "auto-certifiante" de type verifiee
-- n'existe sur produits : toutes les colonnes metier restent legitimement
-- pilotables par le vendeur des la creation.

revoke update on public.produits from authenticated;
grant update (nom, slug, description, prix, prix_promo, promo_debut, promo_fin, stock, livraison, statut, categorie_id)
  on public.produits to authenticated;
-- boutique_id exclu : transfert de produit entre boutiques impossible via UPDATE.

-- commandes / commande_lignes
create policy "commandes_lecture_vendeur_acheteur" on public.commandes
  for select to authenticated
  using (
    exists (select 1 from public.boutiques b where b.id = commandes.boutique_id and b.owner_id = (select auth.uid()))
    or acheteur_id = (select auth.uid())
  );

create policy "commandes_update_vendeur" on public.commandes
  for update to authenticated
  using (
    exists (select 1 from public.boutiques b where b.id = commandes.boutique_id and b.owner_id = (select auth.uid()))
  )
  with check (
    exists (select 1 from public.boutiques b where b.id = commandes.boutique_id and b.owner_id = (select auth.uid()))
  );

grant select on public.commandes to authenticated;
-- Pas de grant select a anon : un invite (acheteur_id NULL) ne peut jamais
-- matcher acheteur_id = auth.uid() sous RLS. Le numero/total/devise lui
-- sont communiques via la valeur de retour de la RPC elle-meme.

revoke update on public.commandes from authenticated;
grant update (statut) on public.commandes to authenticated;
-- Aucun GRANT INSERT/DELETE sur commandes : ecriture exclusivement via la
-- RPC (SECURITY DEFINER, proprietaire de la table donc hors-perimetre RLS).

create policy "lignes_lecture_vendeur_acheteur" on public.commande_lignes
  for select to authenticated
  using (
    exists (
      select 1 from public.commandes c join public.boutiques b on b.id = c.boutique_id
      where c.id = commande_lignes.commande_id
        and (b.owner_id = (select auth.uid()) or c.acheteur_id = (select auth.uid()))
    )
  );

grant select on public.commande_lignes to authenticated;
-- Aucun GRANT INSERT/UPDATE/DELETE sur commande_lignes : ecriture
-- exclusivement via la RPC.
