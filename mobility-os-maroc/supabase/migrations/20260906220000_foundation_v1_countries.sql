-- FOUNDATION V1 -- etape 1 (validee) : countries + country_config.
--
-- Strictement additif : deux tables neuves, aucune colonne ajoutee ailleurs,
-- aucune fonction/RPC modifiee, aucun flux existant ne les lit ni ne les
-- ecrit. Le Maroc continue de fonctionner exactement comme avant cette
-- migration -- rien dans le code applicatif (webapp/) ne reference encore
-- ces tables.
--
-- country_config reste volontairement cle/valeur texte (pas de JSONB
-- fourre-tout, conformement au cahier des charges) -- les parametres
-- structurels stables (devise, prefixe telephonique, fuseau horaire)
-- restent des colonnes typees sur countries elle-meme ; country_config
-- n'est destinee qu'aux parametres sans structure stable (feature flags
-- fins), et reste vide tant qu'aucune cle n'a ete specifiee/validee.
--
-- RLS activee sans aucune policy sur les deux tables : verrouillage total
-- par defaut (ni lecture ni ecriture via anon/authenticated), le Senegal
-- (is_active=false, is_sandbox=true) ne pouvant ainsi generer strictement
-- aucun flux, y compris accidentel, tant qu'aucune policy n'est ajoutee
-- explicitement lors d'un chantier ulterieur.

create table public.countries (
  id                uuid primary key default gen_random_uuid(),
  code              text not null unique,
  name              text not null,
  currency          text not null,
  default_language  text not null default 'fr',
  timezone          text not null,
  phone_prefix      text not null,
  is_active         boolean not null default false,
  is_sandbox        boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

alter table public.countries enable row level security;

create table public.country_config (
  country_id   uuid not null references public.countries(id) on delete cascade,
  config_key   text not null,
  config_value text not null,
  primary key (country_id, config_key)
);

alter table public.country_config enable row level security;

insert into public.countries (code, name, currency, default_language, timezone, phone_prefix, is_active, is_sandbox)
values
  ('MA', 'Maroc', 'MAD', 'fr', 'Africa/Casablanca', '+212', true, false),
  ('SN', 'Senegal', 'XOF', 'fr', 'Africa/Dakar', '+221', false, true);
