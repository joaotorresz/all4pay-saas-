-- ═══════════════════════════════════════════════════════════════════════════
-- A4P-085 — O NOME DIGITADO NO CADASTRO NÃO CHEGAVA AO BANCO
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠️ **MEDIDO EM PRODUÇÃO (24/08/2026), em dado real, não em fixture.** Duas
-- contas criadas às 21:53 e 21:54 com "Teste Isolamento A" e "Teste Isolamento
-- B" digitados no campo "Nome da empresa" nasceram assim:
--
--   c20873ac-005b-4b39-ac92-1452bfa74e7f | joao+teste1 | joao+teste1@all4pay.com.br
--   5350fc34-88e1-4c32-b0b2-39dd6e45b6a3 | joao+teste2 | joao+teste2@all4pay.com.br
--
-- `organizations.name` guardou o LOCAL-PART DO E-MAIL, caractere por caractere.
-- O terceiro campo do cadastro de três campos era digitado, guardado no
-- navegador e descartado.
--
-- ⚠️ **O ESCRITOR SEMPRE FOI ESTE GATILHO — nunca a app, nunca uma RPC.** Ele
-- já lia `raw_user_meta_data->>'company'`; o que faltava era alguém ENVIAR.
-- `auth.signUp` só preenche esse campo por `options.data`, e as quatro portas
-- de cadastro chamavam `signUp` sem ele. O `coalesce` então caía no segundo
-- ramo — o e-mail — e o resultado tinha cara de dado.
--
-- ⚠️ **O RAMO DO E-MAIL SAI, e é essa a correção que dura.** Ligar só o lado
-- da app faria o nome chegar HOJE e o defeito voltar na primeira porta nova
-- que esquecesse de mandá-lo: o fallback continuaria ali, gravando um nome
-- plausível em silêncio. Um fallback que produz algo que PARECE dado é pior
-- que a ausência — ninguém abre um chamado por causa de um nome de empresa
-- estranho, apenas conclui que o sistema é assim.
--
-- ⚠️ **O ÚLTIMO RECURSO FICA, e a escolha é deliberada.** `handle_new_user`
-- dispara em `auth.users`: se ele levantar exceção, o CADASTRO INTEIRO falha.
-- Isso alcançaria caminhos que este repositório não controla — convite,
-- usuário criado pelo painel do Supabase, provedor externo — e trocaria "o
-- nome vem errado" por "ninguém consegue criar conta", que é infinitamente
-- pior. Então o recurso é 'Minha empresa': um rótulo que se ANUNCIA como
-- provisório, ao contrário de `joao+teste1`, que se disfarça de escolha.
--   A recusa do vazio mora na TELA, onde há alguém para responder.
--
-- ⚠️ **`left(…, 200)`**: `raw_user_meta_data` é preenchido pelo cliente. Sem
-- teto, um nome de 50 mil caracteres entra e passa a viajar em toda consulta
-- que lê a organização.
--
-- ⚠️ **`btrim` no servidor, além do `trim()` da tela.** A tela é conveniência;
-- a garantia é aqui, porque a tela pode ser trocada e este gatilho é o único
-- escritor. Acentos, espaços internos e caixa passam INTACTOS — só as bordas
-- caem.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_org  uuid;
  v_name text;
begin
  v_name := coalesce(
    nullif(btrim(new.raw_user_meta_data->>'company'), ''),
    -- ⚠️ NÃO reintroduza aqui um ramo derivado de `new.email`. Foi ele o
    -- defeito A4P-085: gravava o local-part com cara de nome escolhido.
    'Minha empresa'
  );
  insert into public.organizations (name) values (left(v_name, 200)) returning id into v_org;
  insert into public.organization_members (org_id, user_id, role) values (v_org, new.id, 'owner');
  perform public.seed_org(v_org);
  return new;
end;
$function$;
