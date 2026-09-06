-- FOUNDATION V1 -- etape 6 : abstraction paiement (structure uniquement).
--
-- Aucune integration Wave/Orange Money/CMI a ce stade -- uniquement
-- l'emplacement architectural. Table neuve + colonne nullable sur courses,
-- jamais lue par le moteur de dispatch/pricing actuel (creer_course,
-- creer_vente-equivalent). Le paiement reste 100% especes, non modelise,
-- exactement comme avant cette migration -- rien n'ecrit encore dans
-- payment_method_id.

create table public.payment_methods (
  id         uuid primary key default gen_random_uuid(),
  country_id uuid not null references public.countries(id),
  code       text not null,
  label      text not null,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  unique (country_id, code)
);

alter table public.payment_methods enable row level security;

create policy "payment_methods_lecture_publique" on public.payment_methods
for select to anon, authenticated
using (true);

alter table public.courses
  add column payment_method_id uuid references public.payment_methods(id);

create index idx_courses_payment_method_id on public.courses(payment_method_id);

insert into public.payment_methods (country_id, code, label)
select id, 'cash', 'Especes' from public.countries where code = 'MA';
