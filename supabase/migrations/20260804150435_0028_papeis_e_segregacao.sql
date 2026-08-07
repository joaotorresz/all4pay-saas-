-- ═══════════════════════════════════════════════════════════════════════════
-- ONDA 9 (parte 2) — PAPÉIS REAIS E SEGREGAÇÃO DE FUNÇÕES
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠️ Os papéis eram três — `owner`, `admin`, `member` — e os três escreviam
-- tudo. Não existia o contador que só lê, nem o assistente que lança mas não
-- aprova, nem a trava que impede a mesma pessoa de pedir e autorizar o próprio
-- pagamento. Numa ferramenta que move dinheiro, "todo mundo pode tudo" não é
-- simplicidade: é a ausência do controle que o resto do sistema pressupõe —
-- a escada de alçada do `core/institutional` decide QUEM aprova, e o banco
-- aceitava a decisão de qualquer um.
--
-- **A matriz mora no SERVIDOR e a interface PERGUNTA.** É a diferença entre
-- papel aplicado e papel desenhado: se a tela guardasse a própria cópia da
-- matriz, ela divergiria do banco no primeiro ajuste, e a divergência
-- apareceria como um botão que existe e não funciona — ou, pior, como um botão
-- que não existe para quem tinha direito.

/* ═══════════════════════════════════════════════════════════════════════════
 * 1. O VOCABULÁRIO DE PAPÉIS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ `member` continua válido e é lido como `lancador`. Reinterpretá-lo como
 * algo mais poderoso daria, em uma migration, poder de aprovação a todo mundo
 * que hoje é membro — exatamente o oposto do que esta parte existe para fazer.
 */
alter table public.organization_members drop constraint if exists organization_members_role_check;
alter table public.organization_members
  add constraint organization_members_role_check
  check (role in ('owner','admin','member','leitor','lancador','aprovador','fechador'));

create table if not exists public.role_permissions (
  papel text not null,
  acao  text not null,
  primary key (papel, acao)
);
alter table public.role_permissions enable row level security;

/* A matriz é pública para quem está autenticado: saber o que um papel pode
 * fazer não revela dado de ninguém, e a tela precisa dela para explicar por que
 * um botão não está disponível. */
drop policy if exists role_permissions_leitura on public.role_permissions;
create policy role_permissions_leitura on public.role_permissions
  for select to authenticated using (true);
revoke all on public.role_permissions from anon, authenticated;
grant select on public.role_permissions to authenticated;

delete from public.role_permissions;
insert into public.role_permissions (papel, acao) values
  -- ler: todos. Um papel que não lê não tem por que existir no sistema.
  ('leitor','ler'), ('lancador','ler'), ('aprovador','ler'), ('fechador','ler'),
  ('member','ler'), ('admin','ler'), ('owner','ler'),
  -- exportar: sai da empresa em arquivo. O leitor NÃO exporta — ver na tela e
  -- levar a base inteira embora são coisas diferentes.
  ('lancador','exportar'), ('aprovador','exportar'), ('fechador','exportar'),
  ('member','exportar'), ('admin','exportar'), ('owner','exportar'),
  -- lancar: criar/editar lançamento, venda, compra, cadastro.
  ('lancador','lancar'), ('aprovador','lancar'), ('fechador','lancar'),
  ('member','lancar'), ('admin','lancar'), ('owner','lancar'),
  -- baixar: liquidar título. Move dinheiro de verdade.
  ('lancador','baixar'), ('aprovador','baixar'), ('fechador','baixar'),
  ('member','baixar'), ('admin','baixar'), ('owner','baixar'),
  -- aprovar: decidir solicitação de alçada.
  ('aprovador','aprovar'), ('admin','aprovar'), ('owner','aprovar'),
  -- fechar: travar período, assinar fechamento.
  ('fechador','fechar'), ('admin','fechar'), ('owner','fechar'),
  -- administrar: usuários, papéis, integrações.
  ('admin','administrar'), ('owner','administrar'),
  -- cobranca: plano e assinatura. Só a titularidade.
  ('owner','cobranca');

/* ---------------------------------------------------------------------------
 * `tem_permissao()` — a autoridade. Papel × ação, **na organização da LINHA**.
 *
 * ⚠️ A primeira versão desta função perguntava pelo papel na organização ATIVA,
 * e o teste pegou o erro: um usuário que é `member` na empresa A e `owner` na
 * empresa B aprovava um pedido da empresa A com o papel que tem na B. É o mesmo
 * defeito do plano que vinha de outra empresa (0027), reaparecendo dentro do
 * conserto — a pergunta certa nunca é "o que eu sou", é "o que eu sou AQUI".
 *
 * A versão de um argumento existe para o caso comum (a linha é da organização
 * ativa, porque a RLS não deixaria ser outra) e delega para a de dois.
 * ------------------------------------------------------------------------- */
create or replace function public.tem_permissao(p_acao text, p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.organization_members om
      join public.role_permissions rp on rp.papel = om.role and rp.acao = p_acao
     where om.user_id = auth.uid()
       and om.org_id = p_org
  );
$$;
revoke execute on function public.tem_permissao(text, uuid) from public, anon;
grant execute on function public.tem_permissao(text, uuid) to authenticated;

create or replace function public.tem_permissao(p_acao text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.tem_permissao(p_acao, public.auth_org_id());
$$;
revoke execute on function public.tem_permissao(text) from public, anon;
grant execute on function public.tem_permissao(text) to authenticated;

/* O que EU posso fazer — a interface consome isto em vez de recalcular a
 * matriz por conta própria. */
create or replace function public.minhas_permissoes()
returns table (acao text, papel text)
language sql
stable
security definer
set search_path = public
as $$
  select rp.acao, om.role
    from public.organization_members om
    join public.role_permissions rp on rp.papel = om.role
   where om.user_id = auth.uid() and om.org_id = public.auth_org_id();
$$;
revoke execute on function public.minhas_permissoes() from public, anon;
grant execute on function public.minhas_permissoes() to authenticated;

/* ═══════════════════════════════════════════════════════════════════════════
 * 2. OS PAPÉIS APLICADOS NO SERVIDOR
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ Políticas RESTRITIVAS. Uma permissiva a mais só AMPLIA o acesso (elas se
 * somam por OU); a restritiva é a única que consegue TIRAR — e tirar é o
 * assunto aqui. A política de organização continua onde está: esta se soma a
 * ela por E, então nada passa a ver outra empresa por causa desta mudança.
 *
 * Nenhum usuário existente perde acesso: `owner`, `admin` e `member` têm
 * `lancar` e `baixar` na matriz acima.
 */
drop policy if exists movements_escrita_exige_papel on public.movements;
create policy movements_escrita_exige_papel on public.movements
  as restrictive for all to authenticated
  using (true)
  with check (public.tem_permissao('lancar'));

drop policy if exists accounts_escrita_exige_papel on public.financial_accounts;
create policy accounts_escrita_exige_papel on public.financial_accounts
  as restrictive for all to authenticated
  using (true)
  with check (public.tem_permissao('lancar'));

drop policy if exists org_state_escrita_exige_papel on public.org_state;
create policy org_state_escrita_exige_papel on public.org_state
  as restrictive for all to authenticated
  using (true)
  with check (public.tem_permissao('lancar'));

/* ⚠️ `with check` cobre INSERT e UPDATE; DELETE não tem `with check`, e por
 * isso precisa da sua própria restritiva com `using`. Sem ela, quem não pode
 * escrever ainda poderia APAGAR — e apagar um lançamento é a forma mais
 * completa de alterá-lo. */
drop policy if exists movements_delete_exige_papel on public.movements;
create policy movements_delete_exige_papel on public.movements
  as restrictive for delete to authenticated
  using (public.tem_permissao('lancar'));

drop policy if exists accounts_delete_exige_papel on public.financial_accounts;
create policy accounts_delete_exige_papel on public.financial_accounts
  as restrictive for delete to authenticated
  using (public.tem_permissao('lancar'));

drop policy if exists org_state_delete_exige_papel on public.org_state;
create policy org_state_delete_exige_papel on public.org_state
  as restrictive for delete to authenticated
  using (public.tem_permissao('lancar'));

/* ═══════════════════════════════════════════════════════════════════════════
 * 3. SEGREGAÇÃO DE FUNÇÕES — quem pede não autoriza
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Duas defesas, e elas não são redundantes:
 *
 *  - **A restrição de tabela** é estrutural: vale para qualquer caminho, hoje e
 *    depois, inclusive uma carga feita por fora do aplicativo.
 *  - **O gatilho** é o que carimba QUEM aprovou. Sem ele, `approver_id` é um
 *    campo que o cliente preenche — e um campo que o cliente preenche não
 *    prova nada: bastaria informar o nome de um colega para a restrição passar
 *    e a trilha registrar a aprovação na conta de outra pessoa.
 */
alter table public.approvals drop constraint if exists approvals_segregacao;
alter table public.approvals
  add constraint approvals_segregacao
  check (approver_id is null or requester_id is null or approver_id <> requester_id);

create or replace function public.approvals_segregacao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status and new.status in ('approved','rejected','returned') then
    -- ⚠️ `new.org_id`, não a organização ativa: ver a nota em `tem_permissao`.
    if not public.tem_permissao('aprovar', new.org_id) then
      raise exception 'Seu papel nesta organização não decide solicitações.';
    end if;
    -- ⚠️ A decisão é de quem está decidindo AGORA. Aceitar o `approver_id` que
    -- veio na requisição é aceitar que o cliente diga quem aprovou.
    new.approver_id := auth.uid();
    if new.requester_id is not distinct from auth.uid() then
      raise exception 'Segregação de funções: quem solicita não decide a própria solicitação.';
    end if;
    new.decided_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists approvals_segregacao_trg on public.approvals;
create trigger approvals_segregacao_trg
  before update on public.approvals
  for each row execute function public.approvals_segregacao();

/* Quem SOLICITA é quem está logado — pelo mesmo motivo. */
create or replace function public.approvals_solicitante()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.requester_id := coalesce(auth.uid(), new.requester_id);
  return new;
end;
$$;

drop trigger if exists approvals_solicitante_trg on public.approvals;
create trigger approvals_solicitante_trg
  before insert on public.approvals
  for each row execute function public.approvals_solicitante();
