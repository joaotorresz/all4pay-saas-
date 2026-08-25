"use client";

/**
 * Cadastros › Contas bancárias.
 *
 * A conta é onde o dinheiro mora — e onde o TXT contábil vai buscar o código do
 * Domínio. A regra que dá caráter à tela é o CARTÃO DE CRÉDITO: escolhido o
 * tipo, aparecem (e passam a ser obrigatórios) o dia de fechamento e o de
 * vencimento da fatura. Sem os dois, a fatura não fecha nem vence, e o cartão
 * viraria uma conta que nunca cobra.
 */
import * as React from "react";
import { Card, Button, Input, Select, DateField, CurrencyInput, BRL } from "@/components/ui";
import { FormModal } from "@/components/lancamentos/FormModal";
import { useToast } from "@/components/listas/ListChrome";
import {
  TIPOS_CONTA, validarContaBancaria, filtrarRegistros,
  type ContaBancaria, type TipoConta, type FiltroStatus,
} from "@/core/registros";
import { listContasBancarias, salvarContaBancaria, removerContaBancaria, BANCOS, novoIdRegistro } from "@/lib/registros";
import {
  CabecalhoRegistro, FiltrosRegistro, TabelaRegistro, VazioRegistro, AcaoLinha,
  EtiquetaStatus, Campo, BlocoForm, SwitchAtivo, InputDia, OPCOES_STATUS,
} from "./kit";

const rotuloTipo = (t: TipoConta) => TIPOS_CONTA.find((x) => x.id === t)?.label ?? t;
const hoje = () => new Date().toISOString().slice(0, 10);

const vazia = (): ContaBancaria => ({
  id: "", nome: "", banco: "", tipo: "corrente", agencia: "", numero: "",
  dataSaldoInicial: hoje(), saldoInicial: 0, codigoContabil: "",
  diaFechamento: null, diaVencimento: null, ativo: true,
});

export function ContasBancariasView() {
  const [itens, setItens] = React.useState<ContaBancaria[]>([]);
  const [busca, setBusca] = React.useState("");
  const [banco, setBanco] = React.useState("");
  const [tipo, setTipo] = React.useState("");
  const [status, setStatus] = React.useState<FiltroStatus>("todos");
  const [editando, setEditando] = React.useState<ContaBancaria | null>(null);
  const { show, node } = useToast();

  React.useEffect(() => { setItens(listContasBancarias()); }, []);

  const visiveis = React.useMemo(() => {
    const base = filtrarRegistros(itens, busca, (c) => [c.nome, c.banco, c.agencia, c.numero, c.id], status);
    return base.filter((c) => (!banco || c.banco === banco) && (!tipo || c.tipo === tipo));
  }, [itens, busca, banco, tipo, status]);

  const linhasXLSX = React.useMemo(() => [
    ["ID", "Nome", "Banco", "Tipo", "Agência", "Conta", "Saldo inicial", "Data do saldo", "Código Domínio", "Fechamento", "Vencimento", "Status"],
    ...visiveis.map((c) => [
      c.id, c.nome, c.banco, rotuloTipo(c.tipo), c.agencia, c.numero, c.saldoInicial,
      c.dataSaldoInicial, c.codigoContabil, c.diaFechamento ?? "", c.diaVencimento ?? "", c.ativo ? "Ativo" : "Inativo",
    ]),
  ], [visiveis]);

  return (
    <div className="flex flex-col gap-5 pb-4">
      <CabecalhoRegistro
        subtitulo="Gerencie as contas bancárias da empresa."
        acaoNova={{ label: "Nova conta bancária", onClick: () => setEditando(vazia()) }}
        exportar={{ nomeArquivo: "contas-bancarias", aba: "Contas bancárias", linhas: linhasXLSX }}
      />

      <FiltrosRegistro
        busca={busca}
        onBusca={setBusca}
        placeholder="Banco, agência ou conta…"
        campos={[
          { label: "Banco", value: banco, onChange: setBanco, options: [{ value: "", label: "Todos os bancos" }, ...BANCOS.map((b) => ({ value: b, label: b }))] },
          { label: "Tipo de conta", value: tipo, onChange: setTipo, options: [{ value: "", label: "Todos os tipos" }, ...TIPOS_CONTA.map((t) => ({ value: t.id, label: t.label }))] },
          { label: "Status", value: status, onChange: (v) => setStatus(v as FiltroStatus), options: OPCOES_STATUS },
        ]}
      />

      <TabelaRegistro
        itens={visiveis}
        vazio={
          <VazioRegistro
            texto={itens.length === 0
              ? "Nenhuma conta bancária cadastrada. Cadastre a primeira para começar a conciliar o extrato."
              : "Nenhuma conta bancária encontrada com esses filtros."}
            acao={itens.length === 0
              ? <Button variant="primary" onClick={() => setEditando(vazia())}>Nova conta bancária</Button>
              : undefined}
          />
        }
        colunas={[
          { chave: "nome", label: "Conta", render: (c) => (
            <div className="flex flex-col">
              <span className="text-ink">{c.nome}</span>
              <span className="text-caption text-faint">{c.banco}{c.agencia && ` · Ag. ${c.agencia}`}{c.numero && ` · C/C ${c.numero}`}</span>
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
          { chave: "saldo", label: "Saldo inicial", alinhar: "direita", render: (c) => <BRL value={c.saldoInicial} /> },
          { chave: "status", label: "Status", render: (c) => <EtiquetaStatus ativo={c.ativo} /> },
        ]}
        acoes={(c) => (
          <>
            <AcaoLinha label="Editar" icone="edit" onClick={() => setEditando(c)} />
            <AcaoLinha
              label="Excluir"
              icone="trash-2"
              perigo
              onClick={() => { setItens(removerContaBancaria(c.id)); show("Conta removida."); }}
            />
          </>
        )}
      />

      {editando && (
        <FormularioConta
          inicial={editando}
          onClose={() => setEditando(null)}
          onSalvo={(c) => {
            setItens(salvarContaBancaria(c));
            setEditando(null);
            show(c.id ? "Conta salva." : "Conta criada.");
          }}
        />
      )}
      {node}
    </div>
  );
}

/* ------------------------------- formulário ------------------------------- */

function FormularioConta({
  inicial, onClose, onSalvo,
}: { inicial: ContaBancaria; onClose: () => void; onSalvo: (c: ContaBancaria) => void }) {
  const [f, setF] = React.useState<ContaBancaria>({ ...inicial, id: inicial.id || novoIdRegistro() });
  const [erros, setErros] = React.useState<Record<string, string>>({});
  const set = <K extends keyof ContaBancaria>(k: K, v: ContaBancaria[K]) => setF((s) => ({ ...s, [k]: v }));

  const salvar = () => {
    const e = validarContaBancaria(f);
    setErros(e);
    if (Object.keys(e).length > 0) return;
    onSalvo(f);
  };

  return (
    <FormModal title={inicial.id ? "Editar conta bancária" : "Nova conta bancária"} size="medium" onClose={onClose} onSave={salvar}>
      <Campo label="Nome da conta" obrigatorio erro={erros.nome}>
        <Input value={f.nome} onChange={(e) => set("nome", e.target.value)} placeholder="Ex.: Conta Principal, Conta Investimentos" />
      </Campo>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Campo label="Banco" obrigatorio erro={erros.banco}>
          <Select
            value={f.banco}
            onChange={(v) => set("banco", v)}
            placeholder="Selecione o banco"
            options={BANCOS.map((b) => ({ value: b, label: b }))}
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
        <Campo label="Data do saldo inicial">
          <DateField value={f.dataSaldoInicial} onChange={(v) => set("dataSaldoInicial", v)} />
        </Campo>
        <Campo label="Saldo inicial">
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
      </BlocoForm>
    </FormModal>
  );
}
