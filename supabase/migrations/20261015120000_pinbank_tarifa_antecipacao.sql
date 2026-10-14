-- ═══════════════════════════════════════════════════════════════════════════
-- MAQUININHA PINBANK — a TARIFA FIXA por venda e a ANTECIPAÇÃO no contrato
--
-- O extrato de produção de 14/10/2026 mostrou duas cobranças que o vínculo não
-- sabia guardar: uma tarifa FIXA por venda (tirada antes da taxa da forma, que
-- é cobrada sobre o que sobra) e a ANTECIPAÇÃO do repasse no crédito, cobrada
-- ao mês pela regra do simulador de taxas. Sem elas o sistema lançava R$ 9,90,
-- R$ 9,81 e R$ 9,74 onde a Pinbank depositou R$ 8,91, R$ 8,69 e R$ 8,56.
--
-- As duas entram no MESMO `taxas` jsonb do vínculo — nenhuma coluna nova:
--
--   · `tarifa_fixa`     em REAIS (R$ 1,00 = 1), de 0 a 100, com centavos no
--                       máximo. É a única chave do `taxas` que não é fração.
--   · `antecipacao_mes` em FRAÇÃO AO MÊS (1,55% = 0.0155), de 0 a 10% ao mês:
--                       "1.55" é alguém que digitou o percentual (155% ao mês),
--                       e "0.155" é o "15,5" no lugar de "1,55" — que em 18x
--                       cobraria 137% da venda e deixaria o líquido NEGATIVO.
--
-- Esta migration só reescreve a VALIDAÇÃO de `pinbank_configurar_vinculo`. A
-- assinatura, quem pode chamar (só quem ADMINISTRA a empresa) e o que a função
-- grava não mudam. E ela passa a recusar, nomeados, os dois buracos da versão
-- anterior, que validava só as chaves com valor NUMÉRICO:
--
--   · chave que o contrato não tem ("debitoo", "mdr") — antes, gravada calada
--     se o valor não fosse número; e
--   · taxa que não é número ("2", true, {}) — antes, gravada calada e ignorada
--     pelo planejador, que só lê número: a venda entrava sem o custo, com um
--     aviso que não dizia que a taxa estava lá, escrita como texto.
--
-- `null` continua aceito: é "não cadastrada", o mesmo que omitir a chave.
--
-- Nada já gravado muda: a validação vale para a próxima configuração. Medido
-- em produção antes de escrever (14/10/2026): nenhum vínculo existe ainda —
-- não há taxa gravada que a regra nova recusaria.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.pinbank_configurar_vinculo(
  p_vinculo uuid, p_conta uuid, p_taxas jsonb, p_prazos jsonb, p_antecipado boolean, p_ativo boolean
)
returns void
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  v_org uuid := public.auth_org_id();
  k text;
  j jsonb;
  v numeric;
begin
  if v_org is null or not public.tem_permissao('administrar', v_org) then
    raise exception 'A4P-PINBANK: só quem administra a empresa configura a maquininha.'
      using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from public.pinbank_vinculos where id = p_vinculo and org_id = v_org and excluido_em is null) then
    raise exception 'A4P-PINBANK: maquininha não vinculada a esta empresa.' using errcode = 'no_data_found';
  end if;
  if p_conta is not null and not exists (
    select 1 from public.financial_accounts a where a.id = p_conta and a.org_id = v_org and a.excluido_em is null and a.ativo) then
    raise exception 'A4P-PINBANK: a conta do repasse precisa ser uma conta ATIVA desta empresa.' using errcode = 'check_violation';
  end if;
  if p_taxas is not null and jsonb_typeof(p_taxas) <> 'object' then
    raise exception 'A4P-PINBANK: as taxas do contrato precisam vir como objeto (chave: valor).' using errcode = 'check_violation';
  end if;
  -- Taxa é fração entre 0 e 1 (0,0199 = 1,99%). "2" quase sempre é alguém que
  -- digitou o percentual — e lançaria um custo de 200% em toda venda. A
  -- antecipação ao mês também é fração, até 10% ao mês; a tarifa fixa é a única
  -- em REAIS.
  for k, j in select key, value from jsonb_each(coalesce(p_taxas, '{}'::jsonb)) loop
    if k not in ('debito','credito_vista','parcelado','pix','voucher','tarifa_fixa','antecipacao_mes') then
      raise exception 'A4P-PINBANK: "%" não é uma taxa do contrato da maquininha.', k using errcode = 'check_violation';
    end if;
    continue when jsonb_typeof(j) = 'null';
    if jsonb_typeof(j) <> 'number' then
      raise exception 'A4P-PINBANK: a taxa % = % não é um número.', k, j using errcode = 'check_violation';
    end if;
    v := (j #>> '{}')::numeric;
    if k = 'tarifa_fixa' then
      if v < 0 or v > 100 or v <> round(v, 2) then
        raise exception 'A4P-PINBANK: tarifa fixa = % fora de R$ 0 a R$ 100 em centavos (em reais: R$ 1,00 = 1).', v
          using errcode = 'check_violation';
      end if;
    elsif k = 'antecipacao_mes' then
      if v < 0 or v > 0.1 then
        raise exception 'A4P-PINBANK: antecipação = % fora de 0 a 10%% ao mês (fração: 1,55%% = 0.0155).', v
          using errcode = 'check_violation';
      end if;
    elsif v < 0 or v >= 1 then
      raise exception 'A4P-PINBANK: taxa % = % fora de 0 a 1 (fração: 1,99%% = 0.0199).', k, v using errcode = 'check_violation';
    end if;
  end loop;
  for k, v in select key, (value #>> '{}')::numeric from jsonb_each(coalesce(p_prazos, '{}'::jsonb))
              where jsonb_typeof(value) = 'number' loop
    if k not in ('debito','credito','pix','antecipado') or v < 0 or v > 365 or v <> trunc(v) then
      raise exception 'A4P-PINBANK: prazo % = % fora de 0 a 365 dias inteiros.', k, v using errcode = 'check_violation';
    end if;
  end loop;

  update public.pinbank_vinculos
     set conta_id = p_conta,
         taxas = coalesce(p_taxas, '{}'::jsonb),
         prazos = coalesce(p_prazos, '{}'::jsonb),
         antecipado = coalesce(p_antecipado, false),
         ativo = coalesce(p_ativo, false),
         -- Quem ATIVA passa a responder pelos lançamentos.
         responsavel_id = case when coalesce(p_ativo, false) and not ativo then auth.uid() else responsavel_id end,
         ativado_em = case when coalesce(p_ativo, false) and not ativo then now() else ativado_em end
   where id = p_vinculo and org_id = v_org;
end;
$$;
