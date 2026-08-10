"use client";

/**
 * Conciliação Bancária — Quadros · Conferência · Regras · Fechamentos.
 *
 * A regra é o que transforma conciliação em trabalho automático: ela casa uma
 * transação do OFX com um lançamento (ou manda criar um). A ORDEM da lista é a
 * prioridade — a primeira que casa vence, como num firewall —, e o desempate é
 * arrastar a regra para cima. Sem pesos, o usuário entende por que uma ganhou.
 */
import * as React from "react";
import { Card, Button, Icon, Input, Textarea, Select, Checkbox, BRL, Skeleton } from "@/components/ui";
import { FormModal } from "@/components/lancamentos/FormModal";
import { useToast } from "@/components/listas/ListChrome";
import { useAccounts, useRiscoInput } from "@/components/visao-geral/hooks";
import {
  TIPOS_OFX, FUNCOES_REGRA, validarRegra, statusDoTitulo,
  type RegraConciliacao, type TipoTransacaoOFX, type FuncaoRegra,
} from "@/core/movimentacoes";
import {
  listarRegrasConciliacao, salvarRegraConciliacao, removerRegraConciliacao,
  moverRegraConciliacao, novoIdMov,
} from "@/lib/movimentacoes";
import { previstoDaConta } from "@/core/indicadores";

const hoje = () => new Date().toISOString().slice(0, 10);
type Aba = "quadros" | "conferencia" | "regras" | "fechamentos";

export function ConciliacaoView() {
  const [aba, setAba] = React.useState<Aba>("quadros");

  return (
    <div className="flex flex-col gap-5 pb-4">
      <p className="m-0 text-label text-muted">
        Selecione uma conta para conciliar, ou acesse regras e fechamentos de período.
      </p>

      <div className="flex items-center gap-1 border-b border-border-soft overflow-x-auto">
        {([
          ["quadros", "Quadros"],
          ["conferencia", "Tabela para conferência"],
          ["regras", "Regras de conciliação"],
          ["fechamentos", "Fechamentos"],
        ] as [Aba, string][]).map(([id, label]) => {
          const on = aba === id;
          return (
            <button
              key={id}
              onClick={() => setAba(id)}
              className={`relative px-3 py-2 text-label whitespace-nowrap transition-colors ${on ? "text-ink font-medium" : "text-muted hover:text-ink"}`}
            >
              {label}
              {on && <span className="absolute left-0 -bottom-px w-full h-[2px] bg-ink rounded-pill" />}
            </button>
          );
        })}
      </div>

      {aba === "quadros" && <Quadros />}
      {aba === "conferencia" && <Conferencia />}
      {aba === "regras" && <Regras />}
      {aba === "fechamentos" && <Fechamentos />}
    </div>
  );
}

/* ================================= quadros ================================= */

/** Um cartão por conta, com quanto falta conciliar — a fila de trabalho. */
function Quadros() {
  const { data: contas, isLoading } = useAccounts();
  const { data: input } = useRiscoInput();
  const [busca, setBusca] = React.useState("");

  const porConta = React.useMemo(() => {
    const lista = (contas?.accounts ?? []).filter((c) =>
      c.name.toLowerCase().includes(busca.trim().toLowerCase()));
    return lista.map((c) => {
      const ms = (input?.movements ?? []).filter((m) => m.accountId === c.id && m.status !== "cancelado");
      const pendentes = ms.filter((m) => m.status === "pendente");
      return {
        conta: c,
        total: ms.length,
        pendentes: pendentes.length,
        // Canônico: `magnitude` em vez de `Math.abs` solto na tela.
        valorPendente: input ? previstoDaConta(input, c.id).valor : 0,
      };
    });
  }, [contas, input, busca]);

  if (isLoading) return <Card><Skeleton className="h-[180px]" /></Card>;

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <div className="flex flex-col gap-[6px] max-w-[420px]">
          <label className="text-caption font-medium text-muted">Buscar</label>
          <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar conta bancária…" />
        </div>
      </Card>

      {porConta.length === 0 ? (
        <Card>
          <p className="m-0 py-12 text-center text-label text-muted">Nenhuma conta bancária encontrada.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {porConta.map((q) => (
            <Card key={q.conta.id} className="flex flex-col gap-2">
              <div className="flex items-start justify-between gap-3">
                <span className="text-label font-medium text-ink truncate">{q.conta.name}</span>
                <span className="text-caption text-faint tabular-nums shrink-0">{q.total} lanç.</span>
              </div>
              <div className="text-[22px] leading-none font-semibold text-ink tabular-nums">
                <BRL value={q.conta.balance} />
              </div>
              <div className="text-caption text-muted">Saldo em conta</div>
              <div className="mt-2 pt-2 border-t border-border-soft flex items-baseline justify-between gap-2">
                <span className="text-caption text-muted">A conciliar</span>
                <span className={`text-label tabular-nums ${q.pendentes ? "text-warning" : "text-positive"}`}>
                  {q.pendentes === 0 ? "tudo conciliado" : <>{q.pendentes} · <BRL value={q.valorPendente} /></>}
                </span>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

/* =============================== conferência =============================== */

/** A tabela de conferência: o que está aberto em cada conta, para bater linha a
 *  linha com o extrato do banco. */
function Conferencia() {
  const { data: input, isLoading } = useRiscoInput();
  const { data: contas } = useAccounts();
  const [conta, setConta] = React.useState("");

  const linhas = React.useMemo(() => {
    if (!input) return [];
    return input.movements
      .filter((m) => m.status !== "cancelado" && (!conta || m.accountId === conta))
      .sort((a, b) => (b.paid_date || b.due_date || "").localeCompare(a.paid_date || a.due_date || ""))
      .slice(0, 300);
  }, [input, conta]);

  const nomes = input?.partyNames ?? {};

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <div className="flex flex-col gap-[6px] max-w-[360px]">
          <label className="text-caption font-medium text-muted">Conta bancária</label>
          <Select
            value={conta} onChange={setConta}
            options={[{ value: "", label: "Todas as contas" }, ...(contas?.accounts ?? []).map((c) => ({ value: c.id, label: c.name }))]}
          />
        </div>
      </Card>

      {isLoading ? (
        <Card><Skeleton className="h-[240px]" /></Card>
      ) : (
        <Card padded={false} className="overflow-hidden">
          <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Tabela rolável">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-border-soft">
                  {["Data", "Contraparte", "Categoria", "Situação", "Valor"].map((h, i) => (
                    <th key={h} className={`px-6 py-3 text-[11px] font-medium tracking-[0.08em] text-faint ${i === 4 ? "text-right" : "text-left"}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {linhas.map((m) => {
                  const st = input ? statusDoTitulo(m, input.hoje) : "aberto";
                  return (
                    <tr key={m.id} className="border-b border-border-soft last:border-0">
                      <td className="px-6 py-2 text-label text-ink tabular-nums">
                        {(m.paid_date || m.due_date || "").slice(0, 10).split("-").reverse().join("/")}
                      </td>
                      <td className="px-6 py-2 text-label text-muted truncate max-w-[28ch]">
                        {(m.party_id && nomes[m.party_id]) || "—"}
                      </td>
                      <td className="px-6 py-2 text-label text-muted">{m.category ?? "—"}</td>
                      <td className="px-6 py-2">
                        <span className={`text-caption ${st === "liquidado" ? "text-positive" : st === "atrasado" ? "text-negative" : "text-warning"}`}>
                          {st === "liquidado" ? "Conciliado" : st === "atrasado" ? "Atrasado" : "A conciliar"}
                        </span>
                      </td>
                      <td className={`px-6 py-2 text-right text-label tabular-nums ${m.type === "entrada" ? "text-positive" : "text-ink"}`}>
                        {m.type === "entrada" ? "+" : "−"}<BRL value={Math.abs(m.amount)} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {linhas.length === 0 && (
            <p className="m-0 py-12 text-center text-label text-muted">Nenhum lançamento nesta conta.</p>
          )}
        </Card>
      )}
    </div>
  );
}

/* ================================= regras ================================= */

function Regras() {
  const { data: contas } = useAccounts();
  const [lista, setLista] = React.useState<RegraConciliacao[] | null>(null);
  const [editando, setEditando] = React.useState<RegraConciliacao | null>(null);
  const [fConta, setFConta] = React.useState("");
  const [fStatus, setFStatus] = React.useState("todas");
  const [fTipo, setFTipo] = React.useState("");
  const [fFuncao, setFFuncao] = React.useState("");
  const { show, node } = useToast();

  React.useEffect(() => { setLista(listarRegrasConciliacao()); }, []);

  const visiveis = (lista ?? []).filter((r) =>
    (!fConta || r.contas.includes(fConta))
    && (fStatus === "todas" || (fStatus === "ativas" ? r.ativa : !r.ativa))
    && (!fTipo || r.tipo === fTipo)
    && (!fFuncao || r.funcao === fFuncao));

  const nova = (): RegraConciliacao => ({
    id: novoIdMov("rc"), nome: "", descricao: "", contas: [],
    tipo: "conta_receber", funcao: "pesquisar_conciliar", contem: "",
    ativa: true, criadaEm: hoje(), usos: 0,
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <p className="m-0 text-label text-muted max-w-[70ch]">
          As regras casam transações do extrato (OFX) com lançamentos. A ordem da lista é a prioridade:
          a primeira regra que casa vence.
        </p>
        <Button variant="primary" onClick={() => setEditando(nova())}>
          <Icon name="plus" size={15} color="currentColor" />
          Nova regra
        </Button>
      </div>

      <Card>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Campo label="Conta bancária">
            <Select value={fConta} onChange={setFConta}
              options={[{ value: "", label: "Todas" }, ...(contas?.accounts ?? []).map((c) => ({ value: c.id, label: c.name }))]} />
          </Campo>
          <Campo label="Status">
            <Select value={fStatus} onChange={setFStatus}
              options={[{ value: "todas", label: "Todas" }, { value: "ativas", label: "Ativas" }, { value: "inativas", label: "Inativas" }]} />
          </Campo>
          <Campo label="Tipo da transação">
            <Select value={fTipo} onChange={setFTipo}
              options={[{ value: "", label: "Todos" }, ...TIPOS_OFX.map((t) => ({ value: t.id, label: t.label }))]} />
          </Campo>
          <Campo label="Função da regra">
            <Select value={fFuncao} onChange={setFFuncao}
              options={[{ value: "", label: "Todas" }, ...FUNCOES_REGRA.map((f) => ({ value: f.id, label: f.label }))]} />
          </Campo>
        </div>
      </Card>

      {lista === null ? (
        <Card><Skeleton className="h-[160px]" /></Card>
      ) : visiveis.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center gap-3 py-14 text-center">
            <span className="inline-flex items-center justify-center w-12 h-12 rounded-pill bg-surface-2">
              <Icon name="workflow" size={20} color="var(--color-text-tertiary)" />
            </span>
            <p className="m-0 text-label text-muted max-w-[46ch]">
              {(lista ?? []).length === 0
                ? "Nenhuma regra cadastrada. Uma regra faz o extrato conciliar sozinho na próxima importação."
                : "Nenhuma regra encontrada com esses filtros."}
            </p>
            <Button variant="primary" onClick={() => setEditando(nova())}>Nova regra</Button>
          </div>
        </Card>
      ) : (
        <Card padded={false} className="overflow-hidden">
          {visiveis.map((r, k) => (
            <div key={r.id} className="flex items-start gap-3 px-6 py-4 border-b border-border-soft last:border-0">
              <span className="text-caption text-faint tabular-nums w-[22px] shrink-0 pt-1">{k + 1}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-label font-medium ${r.ativa ? "text-ink" : "text-faint line-through"}`}>{r.nome}</span>
                  <span className="rounded-pill bg-surface-2 px-2 py-[1px] text-caption text-muted">
                    {TIPOS_OFX.find((t) => t.id === r.tipo)?.label}
                  </span>
                  <span className="rounded-pill bg-surface-2 px-2 py-[1px] text-caption text-muted">
                    {FUNCOES_REGRA.find((f) => f.id === r.funcao)?.label}
                  </span>
                </div>
                {r.descricao && <p className="m-0 mt-1 text-caption text-muted">{r.descricao}</p>}
                <div className="mt-1 text-caption text-faint">
                  {r.contas.length} {r.contas.length === 1 ? "conta" : "contas"}
                  {r.contem && <> · contém “{r.contem}”</>}
                  {" · "}usada {r.usos}×
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Acao label="Subir" icone="chevron-left" onClick={() => setLista(moverRegraConciliacao(r.id, -1))} />
                <Acao label="Descer" icone="chevron-right" onClick={() => setLista(moverRegraConciliacao(r.id, 1))} />
                <Acao label="Editar" icone="edit" onClick={() => setEditando(r)} />
                <Acao label="Excluir" icone="trash-2" perigo onClick={() => {
                  if (!window.confirm(`Excluir a regra "${r.nome}"?`)) return;
                  setLista(removerRegraConciliacao(r.id));
                  show("Regra removida.");
                }} />
              </div>
            </div>
          ))}
        </Card>
      )}

      {editando && (
        <FormRegra
          inicial={editando}
          contas={(contas?.accounts ?? []).map((c) => ({ id: c.id, nome: c.name }))}
          onClose={() => setEditando(null)}
          onSalvo={(r) => { setLista(salvarRegraConciliacao(r)); setEditando(null); show("Regra salva."); }}
        />
      )}
      {node}
    </div>
  );
}

function FormRegra({
  inicial, contas, onClose, onSalvo,
}: {
  inicial: RegraConciliacao;
  contas: { id: string; nome: string }[];
  onClose: () => void;
  onSalvo: (r: RegraConciliacao) => void;
}) {
  const [r, setR] = React.useState(inicial);
  const [erros, setErros] = React.useState<Record<string, string>>({});
  const set = <K extends keyof RegraConciliacao>(k: K, v: RegraConciliacao[K]) => setR((s) => ({ ...s, [k]: v }));

  const salvar = () => {
    const e = validarRegra(r);
    setErros(e);
    if (Object.keys(e).length > 0) return;
    onSalvo(r);
  };

  const ajuda = FUNCOES_REGRA.find((f) => f.id === r.funcao)?.ajuda;

  return (
    <FormModal title={inicial.nome ? "Editar regra" : "Nova regra de conciliação"} size="medium" onClose={onClose} onSave={salvar}>
      <Campo label="Nome" obrigatorio erro={erros.nome}>
        <Input value={r.nome} onChange={(e) => set("nome", e.target.value)} placeholder="Ex.: Tarifas do Itaú" />
      </Campo>
      <Campo label="Descrição" erro={erros.descricao} ajuda={`${r.descricao.length}/255 caracteres`}>
        <Textarea value={r.descricao} onChange={(e) => set("descricao", e.target.value.slice(0, 255))} rows={2} />
      </Campo>

      <Campo label="Contas bancárias" obrigatorio erro={erros.contas}>
        {contas.length === 0 ? (
          <span className="text-caption text-faint">Cadastre uma conta bancária primeiro.</span>
        ) : (
          <div className="rounded-md bg-surface-2 p-3 max-h-[140px] overflow-y-auto flex flex-col gap-2">
            {contas.map((c) => (
              <Checkbox
                key={c.id}
                checked={r.contas.includes(c.id)}
                onChange={() => set("contas", r.contas.includes(c.id)
                  ? r.contas.filter((x) => x !== c.id)
                  : [...r.contas, c.id])}
                label={c.nome}
              />
            ))}
          </div>
        )}
      </Campo>

      <Campo label="Tipo da transação OFX" obrigatorio erro={erros.tipo}>
        <Select value={r.tipo} onChange={(v) => set("tipo", v as TipoTransacaoOFX)}
          options={TIPOS_OFX.map((t) => ({ value: t.id, label: t.label }))} />
      </Campo>

      <Campo label="Função da regra" obrigatorio erro={erros.funcao} ajuda={ajuda}>
        <Select value={r.funcao} onChange={(v) => set("funcao", v as FuncaoRegra)}
          options={FUNCOES_REGRA.map((f) => ({ value: f.id, label: f.label }))} />
      </Campo>

      <Campo
        label="A descrição contém"
        ajuda="Opcional — restringe a regra a um trecho do texto do extrato (ex.: “TARIFA”)."
      >
        <Input value={r.contem} onChange={(e) => set("contem", e.target.value)} />
      </Campo>

      <Checkbox checked={r.ativa} onChange={(e) => set("ativa", e.target.checked)} label="Regra ativa" />
    </FormModal>
  );
}

/* =============================== fechamentos =============================== */

/** Fechamento de conciliação: até que data a conta está batida com o banco. */
function Fechamentos() {
  const { data: contas } = useAccounts();
  const { data: input } = useRiscoInput();

  const linhas = React.useMemo(() => (contas?.accounts ?? []).map((c) => {
    const ms = (input?.movements ?? []).filter((m) => m.accountId === c.id && m.status !== "cancelado");
    const conciliados = ms.filter((m) => m.status === "pago");
    // A data do fechamento é a do ÚLTIMO movimento conciliado: dali para trás
    // a conta bate com o banco; dali para frente, ainda não.
    const ate = conciliados
      .map((m) => (m.paid_date || m.due_date || "").slice(0, 10))
      .sort()
      .at(-1) ?? null;
    return { conta: c, ate, pendentes: ms.length - conciliados.length };
  }), [contas, input]);

  return (
    <Card padded={false} className="overflow-hidden">
      <div className="px-6 py-4 border-b border-border-soft">
        <span className="text-h3 font-semibold text-ink">Fechamentos de conciliação</span>
        <p className="m-0 mt-1 text-caption text-muted">
          Até que data cada conta está batida com o extrato do banco.
        </p>
      </div>
      {linhas.length === 0 ? (
        <p className="m-0 py-12 text-center text-label text-muted">Nenhuma conta bancária cadastrada.</p>
      ) : linhas.map((l) => (
        <div key={l.conta.id} className="flex items-center justify-between gap-4 px-6 py-4 border-b border-border-soft last:border-0">
          <div className="min-w-0">
            <div className="text-label text-ink truncate">{l.conta.name}</div>
            <div className="text-caption text-faint">
              {l.pendentes === 0 ? "Nada pendente" : `${l.pendentes} lançamentos a conciliar`}
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-label text-ink tabular-nums">
              {l.ate ? l.ate.split("-").reverse().join("/") : "—"}
            </div>
            <div className="text-caption text-faint">conciliado até</div>
          </div>
        </div>
      ))}
    </Card>
  );
}

/* --------------------------------- peças --------------------------------- */

function Campo({
  label, obrigatorio, erro, ajuda, children,
}: { label: string; obrigatorio?: boolean; erro?: string; ajuda?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-[6px]">
      <label className="text-caption font-medium text-muted">
        {label}{obrigatorio && <span className="text-negative"> *</span>}
      </label>
      {children}
      {erro ? <span className="text-caption text-negative">{erro}</span>
        : ajuda ? <span className="text-caption text-faint">{ajuda}</span> : null}
    </div>
  );
}

function Acao({ label, icone, onClick, perigo }: { label: string; icone: string; onClick: () => void; perigo?: boolean }) {
  return (
    <button
      onClick={onClick} aria-label={label} title={label}
      className={`p-[6px] rounded-md text-muted transition-colors hover:bg-surface-2 ${perigo ? "hover:text-negative" : "hover:text-ink"}`}
    >
      <Icon name={icone} size={15} color="currentColor" />
    </button>
  );
}
