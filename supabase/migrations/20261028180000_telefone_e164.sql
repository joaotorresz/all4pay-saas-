-- O telefone do contato passa a ser gravado em E.164 (+5511998388744).
--
-- Por quê: o cadastro guardava o número como foi digitado ("11998388744",
-- "(11) 99838-8744"), e a Twilio recusa o envio de WhatsApp sem o país —
-- 400 "The 'To' number 11998388744 is not a valid phone number", medido em
-- produção em 28/10/2026. O envio também passou a normalizar
-- (`enderecoWhatsapp`), mas o dado gravado é o que todo leitor vê; ele tem de
-- nascer certo, por qualquer caminho que escreva (tela, importação, RPC, psql).
--
-- A regra é a de `telefoneE164` (src/lib/telefone.ts), espelhada aqui:
--   · já começa com "+"                      → "+" + dígitos (o país fica)
--   · 10 ou 11 dígitos (DDD + número)          → "+55" + dígitos
--   · 12 ou 13 dígitos começando por 55        → "+" + dígitos
--   · vazio                                    → nulo
--   · qualquer outra coisa                     → como veio (não se adivinha país)
--
-- `telefone_canonico` (a comparação do SAIR/VOLTAR e da autorização) tira o 55
-- e os símbolos, então o número antigo e o novo continuam o MESMO telefone.

create or replace function public.telefone_e164(p text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when b = '' then null
    when d = '' then b
    when b like '+%' then '+' || d
    when length(d) in (10, 11) then '+55' || d
    when length(d) in (12, 13) and d like '55%' then '+' || d
    else b
  end
  from (
    select btrim(coalesce(p, '')) as b,
           regexp_replace(coalesce(p, ''), '\D', '', 'g') as d
  ) x
$$;

comment on function public.telefone_e164(text) is
  'Telefone em E.164 (+55 para DDD + número). Espelho de telefoneE164 em src/lib/telefone.ts.';

create or replace function public.parties_telefone_e164()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.phone := public.telefone_e164(new.phone);
  return new;
end;
$$;

revoke execute on function public.parties_telefone_e164() from public, anon, authenticated;

drop trigger if exists parties_telefone_e164 on public.parties;
create trigger parties_telefone_e164
  before insert or update of phone on public.parties
  for each row execute function public.parties_telefone_e164();

-- Os já cadastrados: só as linhas que MUDAM (o resto nem é tocado).
update public.parties
   set phone = public.telefone_e164(phone)
 where phone is distinct from public.telefone_e164(phone);
