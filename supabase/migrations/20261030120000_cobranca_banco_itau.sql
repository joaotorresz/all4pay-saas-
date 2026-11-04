-- ═══════════════════════════════════════════════════════════════════════════
-- COBRANÇA PELA CONTA BANCÁRIA — o ITAÚ entra na lista (30/10/2026)
-- Etapa 1 de `docs/rodada-11/cobranca-itau.md`: a base de vários bancos.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- A empresa que tem conta no Itaú vai poder emitir o boleto com Pix por lá,
-- como já faz com o Inter. Esta migration só abre a PORTA no banco de dados:
-- o provedor `itau` passa a caber na conexão e na cobrança. Quem decide se o
-- Itaú já emite é o servidor (`BANCOS_QUE_EMITEM` em `core/cobranca-banco`),
-- e ele recusa conectar o Itaú até a porta de rede dele existir.
--
-- ⚠️ **UMA CONTA RECEBE POR VEZ.** A reserva (`cobranca_banco_reservar`) já
-- recusava cobrar com duas contas conectadas ("deixe só a que deve
-- receber"); com dois bancos possíveis, a recusa sobe para o CONECTAR: ligar
-- o Itaú com o Inter vivo é recusado com a frase de desconectar o outro. Na
-- reserva a empresa só descobriria no primeiro título, depois de ter
-- configurado tudo.
--
-- ⚠️ **O BANCO DE DADOS CONFERE O PROVEDOR**, não só o CHECK: o conectar é
-- chamável por quem administra, e o texto de erro do CHECK não diria nada a
-- ninguém.
--
-- Sem `cascade`, sem mexer em dado: só restrições e a função.

-- 1. O provedor cabe nas duas tabelas.
alter table public.cobranca_banco_conexoes drop constraint if exists cobranca_banco_conexoes_provedor_check;
alter table public.cobranca_banco_conexoes
  add constraint cobranca_banco_conexoes_provedor_check check (provedor in ('inter', 'itau'));

alter table public.cobrancas_banco drop constraint if exists cobrancas_banco_provedor_check;
alter table public.cobrancas_banco
  add constraint cobrancas_banco_provedor_check check (provedor in ('inter', 'itau'));

-- 2. Conectar: o provedor conferido e uma conta por vez.
create or replace function public.cobranca_banco_conectar(
  p_id uuid,
  p_provedor text,
  p_ambiente text,
  p_client_id text,
  p_conta_corrente text,
  p_certificado_ate date,
  p_cifrado text
)
returns uuid
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  v_org uuid := public.auth_org_id();
  v_outro text;
begin
  if auth.uid() is null or v_org is null then
    raise exception 'A4P-COBRANCA-BANCO: entre no sistema para conectar o banco.' using errcode = 'insufficient_privilege';
  end if;
  if not public.tem_permissao('administrar', v_org) then
    raise exception 'A4P-COBRANCA-BANCO: só quem administra a empresa conecta a conta que recebe as cobranças.'
      using errcode = 'insufficient_privilege';
  end if;
  if p_provedor is null or p_provedor not in ('inter', 'itau') then
    raise exception 'A4P-COBRANCA-BANCO: banco desconhecido.' using errcode = 'invalid_parameter_value';
  end if;
  if p_id is null or p_cifrado is null or btrim(coalesce(p_client_id, '')) = '' then
    raise exception 'A4P-COBRANCA-BANCO: credencial incompleta.' using errcode = 'invalid_parameter_value';
  end if;

  -- Outro banco vivo? Uma conta recebe por vez.
  select provedor into v_outro from public.cobranca_banco_conexoes
   where org_id = v_org and provedor <> p_provedor and desligada_em is null
   limit 1;
  if v_outro is not null then
    raise exception 'A4P-COBRANCA-BANCO: a empresa já recebe pelo %. Desconecte essa conta antes de conectar outra.',
      case v_outro when 'inter' then 'Banco Inter' when 'itau' then 'Itaú' else v_outro end
      using errcode = 'unique_violation';
  end if;

  -- A anterior do mesmo banco sai junto com o segredo dela.
  delete from public.cobranca_banco_segredos s
   using public.cobranca_banco_conexoes c
   where s.conexao_id = c.id and c.org_id = v_org and c.provedor = p_provedor and c.desligada_em is null;
  update public.cobranca_banco_conexoes
     set desligada_em = now(), desligada_por = auth.uid()
   where org_id = v_org and provedor = p_provedor and desligada_em is null;

  insert into public.cobranca_banco_conexoes
    (id, org_id, provedor, ambiente, client_id, conta_corrente, certificado_ate, testada_em)
  values
    (p_id, v_org, p_provedor, p_ambiente, btrim(p_client_id),
     nullif(regexp_replace(coalesce(p_conta_corrente, ''), '\D', '', 'g'), ''),
     p_certificado_ate, now());
  insert into public.cobranca_banco_segredos (conexao_id, cifrado) values (p_id, p_cifrado);
  return p_id;
end;
$$;

revoke all on function public.cobranca_banco_conectar(uuid, text, text, text, text, date, text) from public, anon, authenticated, service_role;
grant execute on function public.cobranca_banco_conectar(uuid, text, text, text, text, date, text) to authenticated;
