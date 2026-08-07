create table if not exists maq_settings (
  id int primary key default 1,
  active_range int not null default 1 check (active_range between 1 and 5),
  antecipacao_mensal numeric not null default 0.019,
  antecipa_default boolean not null default false,
  online_default boolean not null default false,
  selic numeric not null default 0.145,
  updated_at timestamptz default now(),
  constraint maq_only_one_settings check (id = 1)
);

create table if not exists maq_mcc_category (
  mcc int primary key,
  descricao text not null,
  is_default boolean not null default false
);

create table if not exists maq_cnae_mcc (
  cnae int primary key,
  mcc int not null references maq_mcc_category(mcc),
  descricao_cnae text
);

create table if not exists maq_installment (
  code text primary key,
  group_code text not null,
  days int,
  ord int not null,
  label text not null
);

create table if not exists maq_cost_rate (
  mcc int not null references maq_mcc_category(mcc),
  range int not null check (range between 1 and 5),
  group_code text not null,
  brand text not null,
  taxa numeric not null,
  primary key (mcc, range, group_code, brand)
);

create table if not exists maq_customer_rate (
  mcc int not null references maq_mcc_category(mcc),
  range int not null check (range between 1 and 5),
  group_code text not null,
  brand text not null,
  taxa numeric not null,
  primary key (mcc, range, group_code, brand)
);

create table if not exists maq_online_spread (
  installment_code text not null references maq_installment(code),
  brand text not null,
  taxa numeric not null,
  primary key (installment_code, brand)
);

alter table maq_settings      enable row level security;
alter table maq_mcc_category  enable row level security;
alter table maq_cnae_mcc      enable row level security;
alter table maq_installment   enable row level security;
alter table maq_cost_rate     enable row level security;
alter table maq_customer_rate enable row level security;
alter table maq_online_spread enable row level security;

create or replace function maq_is_admin() returns boolean language sql stable security definer as $$
  select exists (select 1 from platform_admins p where p.user_id = auth.uid());
$$;

do $$
declare t text;
begin
  foreach t in array array['maq_settings','maq_mcc_category','maq_cnae_mcc','maq_installment','maq_cost_rate','maq_customer_rate','maq_online_spread'] loop
    execute format('drop policy if exists maq_admin_all on %I;', t);
    execute format('create policy maq_admin_all on %I for all using (maq_is_admin()) with check (maq_is_admin());', t);
  end loop;
end $$;