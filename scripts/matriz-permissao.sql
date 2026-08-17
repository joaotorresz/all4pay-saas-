-- ═══════════════════════════════════════════════════════════════════════════
-- A MATRIZ DE PERMISSÃO — o servidor e o cliente têm de dizer a MESMA coisa
-- ═══════════════════════════════════════════════════════════════════════════
--
-- A ONDA 9 decidiu que "a matriz mora no servidor e a interface PERGUNTA", para
-- que uma cópia no cliente não divergisse. A decisão está certa e a assimetria
-- apareceu assim mesmo, pelo outro lado: em 17/08 o banco tinha OITO papéis e o
-- tipo `Papel` do cliente tinha SETE. O `contador_externo` entrou pela ONDA 13
-- no servidor e nunca chegou à interface — a tela de usuários não conseguia
-- oferecê-lo, e quem o recebesse por SQL apareceria com a string crua.
--
-- ⚠️ **Perguntar ao servidor só funciona se o cliente souber nomear a
-- resposta.** Esta guarda cobra a igualdade nos dois sentidos: papel no banco
-- sem correspondente no cliente é tão defeito quanto o contrário.
--
-- A lista abaixo é a matriz VIGENTE, medida em produção em 17/08/2026. Ela é
-- deliberadamente literal: se alguém mudar a permissão de um papel, tem de vir
-- aqui e escrever a mudança — é o momento em que a decisão fica registrada.
--
-- Espelho no cliente: `MATRIZ_DEMO` em `src/core/seguranca/index.ts`.
-- Guarda do espelho: bloco `permissao:` no `scripts/engine-audit.mts`.
--
-- Roda no job `isolamento` do CI, contra um banco construído do zero pelas
-- migrations.

\set ON_ERROR_STOP on

do $$
declare
  esperado text[][] := array[
    ['owner',            'administrar,aprovar,baixar,cobranca,exportar,fechar,lancar,ler'],
    ['admin',            'administrar,aprovar,baixar,exportar,fechar,lancar,ler'],
    ['aprovador',        'aprovar,baixar,exportar,lancar,ler'],
    ['fechador',         'baixar,exportar,fechar,lancar,ler'],
    ['lancador',         'baixar,exportar,lancar,ler'],
    ['member',           'baixar,exportar,lancar,ler'],
    ['contador_externo', 'exportar,fechar,ler'],
    ['leitor',           'ler']
  ];
  p text;
  querido text;
  obtido text;
  faltas int := 0;
  extras int;
begin
  for i in 1 .. array_length(esperado, 1) loop
    p := esperado[i][1];
    querido := esperado[i][2];
    select coalesce(string_agg(acao, ',' order by acao), '(nenhuma)')
      into obtido from role_permissions where papel = p;
    if obtido is distinct from querido then
      raise warning 'MATRIZ: papel % tem [%], esperado [%]', p, obtido, querido;
      faltas := faltas + 1;
    end if;
  end loop;

  -- ⚠️ E o outro sentido: papel no banco que a matriz declarada não conhece.
  -- Sem esta metade, acrescentar um papel poderoso por SQL passaria despercebido
  -- — que é exatamente como o `contador_externo` ficou invisível ao cliente.
  select count(*) into extras from (
    select distinct papel from role_permissions
    except select unnest(array['owner','admin','aprovador','fechador','lancador','member','contador_externo','leitor'])
  ) x;
  if extras > 0 then
    raise warning 'MATRIZ: % papel(is) no banco fora da matriz declarada', extras;
    faltas := faltas + extras;
  end if;

  if faltas > 0 then
    raise exception 'MATRIZ DE PERMISSÃO: % divergência(s) entre o banco e a matriz declarada', faltas;
  end if;
  raise notice 'MATRIZ DE PERMISSÃO: 8 papéis conferidos, nenhuma divergência';
end $$;

-- ⚠️ A INVARIANTE QUE NÃO PODE SER RELAXADA: quem só lê não escreve.
-- Ela é separada da lista acima de propósito. A lista é um retrato e envelhece
-- com o produto; esta é uma regra que não envelhece — no dia em que `leitor`
-- ganhar `lancar`, o papel deixou de ser leitor e alguém precisa dizer isso em
-- voz alta em vez de editar uma linha de tabela.
do $$
declare escreve int;
begin
  select count(*) into escreve from role_permissions
   where papel in ('leitor', 'contador_externo')
     and acao in ('lancar', 'baixar', 'aprovar', 'administrar', 'cobranca');
  if escreve > 0 then
    raise exception 'MATRIZ: papel de leitura/contador com % permissão(ões) de escrita', escreve;
  end if;
  raise notice 'MATRIZ: leitor e contador externo não escrevem — ok';
end $$;
