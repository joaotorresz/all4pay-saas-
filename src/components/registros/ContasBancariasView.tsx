"use client";

/**
 * Cadastros › Contas bancárias.
 *
 * ⚠️ **A morada é `financial_accounts`** — a MESMA tabela de onde os lançamentos
 * tiram a conta. Antes esta tela lia e gravava só `org_state` com id numérico:
 * uma conta criada aqui não aparecia em lançamento nenhum, e a conta do
 * cadastro inicial não aparecia aqui (a tela dizia "Nenhuma conta cadastrada"
 * numa empresa com quatro). Leitura e escrita passam por
 * `lib/cadastros-hierarquia`, e o erro do banco vem para a tela com a frase dele.
 *
 * A regra que dá caráter à tela é o CARTÃO DE CRÉDITO: escolhido o tipo,
 * aparecem (e passam a ser obrigatórios) o dia de fechamento e o de vencimento
 * da fatura — o banco cobra a mesma coisa (`financial_accounts_dias_do_cartao`).
 *
 * ⚠️ **Conta não se exclui, se DESATIVA.** Ela carrega histórico; desativada,
 * sai das escolhas e o banco recusa lançamento NOVO nela, e tudo o que já
 * passou por ela continua no extrato, no DRE e no razão.
 */
import * as React from "react";
import { Button, Input, Select, DateField, CurrencyInput, BRL } from "@/components/ui";
import { FormModal } from "@/components/lancamentos/FormModal";
import { useToast } from "@/components/listas/ListChrome";
import {
  TIPOS_CONTA, validarContaBancaria, filtrarRegistros,
  type ContaBancaria, type TipoConta, type FiltroStatus,
} from "@/core/registros";
import { BANCOS_CONTA, rotuloDoBanco, contaComNomeRepetido } from "@/core/registros/hierarquia";
import {
  useContasBancarias, useSalvarContaBancaria, useDefinirContaAtiva,
  usePendenciasAntigas, useTrazerAntigo,
} from "./hooks";
import {
  CabecalhoRegistro, FiltrosRegistro, TabelaRegistro, VazioRegistro, AcaoLinha,
  EtiquetaStatus, Campo, BlocoForm, SwitchAtivo, InputDia, OPCOES_STATUS,
  ErroGravacao, BlocoAntigos,
} from "./kit";

const rotuloTipo = (t: TipoConta) => TIPOS_CONTA.find((x) => x.id === t)?.label ?? t;
const hoje = () => new Date().toISOString().slice(0, 10);
const erroTexto = (e: unknown) => (e instanceof Error ? e.message : "O banco recusou a gravação.");

const vazia = (): ContaBancaria => ({
  id: "", nome: "", banco: "", tipo: "corrente", agencia: "", numero: "",
  dataSaldoInicial: hoje(), saldoInicial: 0, codigoContabil: "",
  diaFechamento: null, diaVencimento: null, ativo: true,
});

export function ContasBancariasView() {
  const contas = useContasBancarias();
  const ativar = useDefinirContaAtiva();
  const trazer = useTrazerAntigo("contas");
  const itens = React.useMemo(() => contas.data ?? [], [contas.data]);
  const antigos = usePendenciasAntigas("contas", contas.data ? { contas: contas.data } : null);

  const [busca, setBusca] = React.useState("");
  const [banco, setBanco] = React.useState("");
  const [tipo, setTipo] = React.useState("");
  const [status, setStatus] = React.useState<FiltroStatus>("todos");
  const [editando, setEditando] = React.useState<ContaBancaria | null>(null);
  const [trazendo, setTrazendo] = React.useState<string | null>(null);

  // `?novo=1` — o endereço que o painel Criar usa abre esta tela com o
  // formulário já aberto (é o que dá link compartilhável à criação).
  React.useEffect(() => {
    if (new URLSearchParams(window.location.search).get("novo")) setEditando(vazia());
  }, []);
  const { show, node } = useToast();

  const visiveis = React.useMemo(() => {
    const base = filtrarRegistros(itens, busca, (c) => [c.nome, rotuloDoBanco(c.banco), c.agencia, c.numero, c.id], status);
    return base.filter((c) => (!banco || c.banco === banco) && (!tipo || c.tipo === tipo));
  }, [itens, busca, banco, tipo, status]);

  const linhasXLSX = React.useMemo(() => [
    ["ID", "Nome", "Banco", "Tipo", "Agência", "Conta", "Saldo atual", "Saldo inicial", "Data do saldo", "Conferido", "Código Domínio", "Fechamento", "Vencimento", "Status"],
    ...visiveis.map((c) => [
      c.id, c.nome, rotuloDoBanco(c.banco), rotuloTipo(c.tipo), c.agencia, c.numero, c.saldoAtual ?? 0, c.saldoInicial,
      c.dataSaldoInicial, c.saldoInicialConferido ? "Sim" : "Não", c.codigoContabil,
      c.diaFechamento ?? "", c.diaVencimento ?? "", c.ativo ? "Ativo" : "Inativo",
    ]),
  ], [visiveis]);

  const alternarAtiva = (c: ContaBancaria) => {
    ativar.mutate({ id: c.id, ativo: !c.ativo }, {
      onSuccess: () => show(c.ativo ? `Conta "${c.nome}" desativada.` : `Conta "${c.nome}" reativada.`),
      onError: (e) => show(erroTexto(e)),
    });
  };

  return (
    <div className="flex flex-col gap-5 pb-4">
      <CabecalhoRegistro
        subtitulo="As contas da empresa — as mesmas que os lançamentos, o extrato e a conciliação usam."
        acaoNova={{ label: "Nova conta bancária", onClick: () => setEditando(vazia()) }}
        exportar={{ nomeArquivo: "contas-bancarias", aba: "Contas bancárias", linhas: linhasXLSX }}
      />

      <BlocoAntigos
        oQue="contas"
        itens={antigos}
        trazendo={trazendo}
        onTrazer={(i) => {
          const p = antigos.find((x) => x.chave === i.chave);
          if (!p) return;
          setTrazendo(i.chave);
          trazer.mutate(p, {
            onSuccess: (msg) => show(msg),
            onError: (e) => show(erroTexto(e)),
            onSettled: () => setTrazendo(null),
          });
        }}
      />

      <FiltrosRegistro
        busca={busca}
        onBusca={setBusca}
        placeholder="Nome, banco, agência ou conta…"
        campos={[
          { label: "Banco", value: banco, onChange: setBanco, options: [{ value: "", label: "Todos os bancos" }, ...BANCOS_CONTA.map((b) => ({ value: b.id, label: b.label }))] },
          { label: "Tipo de conta", value: tipo, onChange: setTipo, options: [{ value: "", label: "Todos os tipos" }, ...TIPOS_CONTA.map((t) => ({ value: t.id, label: t.label }))] },
          { label: "Status", value: status, onChange: (v) => setStatus(v as FiltroStatus), options: OPCOES_STATUS },
        ]}
      />

      {contas.error ? (
        <ErroGravacao mensagem={`Não foi possível ler as contas: ${erroTexto(contas.error)}`} />
      ) : (
        <TabelaRegistro
          itens={visiveis}
          vazio={
            <VazioRegistro
              texto={contas.isLoading
                ? "Carregando as contas…"
                : itens.length === 0
                  ? "Nenhuma conta bancária cadastrada. Cadastre a primeira para começar a lançar e conciliar o extrato."
                  : "Nenhuma conta bancária encontrada com esses filtros."}
              acao={!contas.isLoading && itens.length === 0
                ? <Button variant="primary" onClick={() => setEditando(vazia())}>Nova conta bancária</Button>
                : undefined}
            />
          }
          colunas={[
            { chave: "nome", label: "Conta", render: (c) => (
              <div className="flex flex-col">
                <span className="text-ink">{c.nome}</span>
                <span className="text-caption text-faint">{rotuloDoBanco(c.banco)}{c.agencia && ` · Ag. ${c.agencia}`}{c.numero && ` · C/C ${c.numero}`}</span>
              </div>
            ) },
            { chave: "tipo", label: "Tipo", render: (c) => (
              <div className="flex flex-col">
                <span className="text-muted">{rotuloTipo(c.tipo)}</span>
                {c.tipo === "cartao" && c.diaFechamento && c.diaVencimento && (
                  <span className="text-caption text-faint tabular-nums">fecha dia {c.diaFechamento} · vence dia {c.diaVencimento}</span>
                )}
              </div>
            ) },
            { chave: "codigo", label: "Cód. Domínio", render: (c) => <span className="text-muted tabular-nums">{c.codigoContabil || "—"}</span> },
            { chave: "saldo", label: "Saldo atual", alinhar: "direita", render: (c) => <BRL value={c.saldoAtual ?? 0} /> },
            { chave: "status", label: "Status", render: (c) => <EtiquetaStatus ativo={c.ativo} /> },
          ]}
          acoes={(c) => (
            <>
              <AcaoLinha label="Editar" icone="edit" onClick={() => setEditando(c)} />
              <AcaoLinha
                label={c.ativo ? "Desativar" : "Reativar"}
                icone={c.ativo ? "eye-off" : "eye"}
                onClick={() => alternarAtiva(c)}
              />
            </>
          )}
        />
      )}

      {editando && (
        <FormularioConta
          inicial={editando}
          todas={itens}
          onClose={() => setEditando(null)}
          onSalvo={(c, nova) => {
            setEditando(null);
            show(nova ? `Conta "${c.nome}" criada.` : `Conta "${c.nome}" salva.`);
          }}
        />
      )}
      {node}
    </div>
  );
}

/* ------------------------------- formulário ------------------------------- */

function FormularioConta({
  inicial, todas, onClose, onSalvo,
}: {
  inicial: ContaBancaria; todas: ContaBancaria[];
  onClose: () => void; onSalvo: (c: ContaBancaria, nova: boolean) => void;
}) {
  const salvarConta = useSalvarContaBancaria();
  const [f, setF] = React.useState<ContaBancaria>(inicial);
  const [erros, setErros] = React.useState<Record<string, string>>({});
  const [erroBanco, setErroBanco] = React.useState<string | null>(null);
  const set = <K extends keyof ContaBancaria>(k: K, v: ContaBancaria[K]) => setF((s) => ({ ...s, [k]: v }));

  const salvar = () => {
    const e = validarContaBancaria(f);
    if (contaComNomeRepetido(f, todas)) e.nome = "Já existe uma conta com este nome nesta empresa.";
    if (f.saldoInicialConferido && !f.dataSaldoInicial) e.dataSaldoInicial = "Informe a data do saldo conferido.";
    setErros(e);
    setErroBanco(null);
    if (Object.keys(e).length > 0) return;
    salvarConta.mutate(f, {
      onSuccess: (c) => onSalvo(c, !inicial.id),
      onError: (err) => setErroBanco(erroTexto(err)),
    });
  };

  return (
    <FormModal
      title={inicial.id ? "Editar conta bancária" : "Nova conta bancária"}
      size="medium"
      onClose={onClose}
      onSave={salvar}
      saving={salvarConta.isPending}
    >
      <ErroGravacao mensagem={erroBanco} />
      <Campo label="Nome da conta" obrigatorio erro={erros.nome}>
        <Input value={f.nome} onChange={(e) => set("nome", e.target.value)} placeholder="Ex.: Conta Principal, Conta Investimentos" />
      </Campo>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Campo label="Banco" obrigatorio erro={erros.banco}>
          <Select
            value={f.banco}
            onChange={(v) => set("banco", v)}
            placeholder="Selecione o banco"
            options={BANCOS_CONTA.map((b) => ({ value: b.id, label: b.label }))}
          />
        </Campo>
        <Campo label="Tipo de conta" obrigatorio erro={erros.tipo}>
          <Select
            value={f.tipo}
            onChange={(v) => set("tipo", v as TipoConta)}
            options={TIPOS_CONTA.map((t) => ({ value: t.id, label: t.label }))}
          />
        </Campo>
      </div>

      {/* A regra condicional: só o cartão tem fatura, e ela precisa dos dois dias. */}
      {f.tipo === "cartao" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-card bg-surface-2 p-4">
          <Campo label="Dia de fechamento da fatura" obrigatorio erro={erros.diaFechamento}>
            <InputDia value={f.diaFechamento} onChange={(v) => set("diaFechamento", v)} placeholder="Ex.: 20" />
          </Campo>
          <Campo label="Dia de vencimento da fatura" obrigatorio erro={erros.diaVencimento}>
            <InputDia value={f.diaVencimento} onChange={(v) => set("diaVencimento", v)} placeholder="Ex.: 28" />
          </Campo>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Campo label="Agência">
          <Input value={f.agencia} onChange={(e) => set("agencia", e.target.value)} placeholder="Ex.: 1234" />
        </Campo>
        <Campo label="Número da conta">
          <Input value={f.numero} onChange={(e) => set("numero", e.target.value)} placeholder="Ex.: 12345-6" />
        </Campo>
        <Campo label="Data do saldo inicial" erro={erros.dataSaldoInicial}>
          <DateField value={f.dataSaldoInicial} onChange={(v) => set("dataSaldoInicial", v)} />
        </Campo>
        <Campo
          label="Saldo inicial"
          ajuda={inicial.id ? "Mudar o saldo inicial não mexe no saldo atual — quem o move são as baixas e a conciliação." : "A conta nasce com este saldo."}
        >
          <CurrencyInput value={f.saldoInicial} onValueChange={(v) => set("saldoInicial", v)} />
        </Campo>
      </div>

      {/* ⚠️ A CONFIRMAÇÃO é o que separa uma abertura REAL do preenchimento
          padrão. Só marcada, esta conta vira a fonte "informada" da abertura
          conferida e a reconciliação do Razão pode fechar. Sem ela, o `0` de
          fábrica fingiria um saldo que ninguém declarou. */}
      <BlocoForm titulo="Conferência do saldo de abertura">
        <SwitchAtivo
          checked={!!f.saldoInicialConferido}
          onChange={(v) => set("saldoInicialConferido", v)}
          label="Confirmo que este é o saldo real da conta na data acima"
        />
        <p className="text-caption text-faint mt-1 max-w-[60ch]">
          Marque só quando o valor e a data forem o saldo de abertura de verdade.
          É o que permite ao Razão conferir o caixa contra o extrato; sem a
          confirmação, a conta aparece como <strong>não conferida</strong>.
        </p>
      </BlocoForm>

      <Campo
        label="Código contábil (Domínio)"
        ajuda="Código da conta no Domínio. Usado na geração do TXT contábil. Aplica-se a contas correntes, cartões e aplicações."
      >
        <Input value={f.codigoContabil} onChange={(e) => set("codigoContabil", e.target.value)} placeholder="Ex.: 7" />
      </Campo>

      <BlocoForm titulo="Status">
        <SwitchAtivo checked={f.ativo} onChange={(v) => set("ativo", v)} label="Conta ativa" />
        {!f.ativo && (
          <p className="text-caption text-faint m-0">
            Conta inativa sai das escolhas e não recebe lançamento novo; o histórico dela continua.
          </p>
        )}
      </BlocoForm>
    </FormModal>
  );
}
