"use client";

/**
 * Cadastros › Projetos e Centros de custo.
 *
 * ⚠️ **A morada é o BANCO** — `projects` e `cost_centers`, as tabelas que os
 * lançamentos referenciam por UUID. Antes as duas telas gravavam no
 * `localStorage` cru com id numérico ("5001"): em produção, escolher um projeto
 * num lançamento era RECUSADO, e a recusa mandava criar o projeto de novo aqui —
 * que gravava no mesmo lugar. Não havia saída. Leitura e escrita passam por
 * `lib/cadastros-hierarquia`, e o erro do banco vem para a tela com a frase dele.
 *
 * São a MESMA tela em duas roupas — lista filtrável + modal — e a diferença
 * está nos campos: projeto tem período, previsões, CLIENTE e CENTRO
 * responsável, e uma SITUAÇÃO declarada (encerrado recusa lançamento novo no
 * banco); centro de custo tem código, código contábil do Domínio e GRUPO (a
 * hierarquia sintético → analítico).
 */
import * as React from "react";
import { Button, Input, Textarea, DateField, CurrencyInput, BRL, Select } from "@/components/ui";
import { FormModal } from "@/components/lancamentos/FormModal";
import { useToast } from "@/components/listas/ListChrome";
import { usePartiesByRole } from "@/components/lancamentos/hooks";
import { filtrarRegistros, type FiltroStatus } from "@/core/registros";
import {
  achatarArvore, caminhoDe, fechaCiclo, validarCentro, validarProjeto,
  type CentroCustoCadastro, type ProjetoCadastro,
} from "@/core/registros/hierarquia";
import {
  useProjetos, useSalvarProjeto, useDefinirStatusProjeto,
  useCentrosCusto, useSalvarCentroCusto, useDefinirCentroAtivo,
  usePendenciasAntigas, useTrazerAntigo,
} from "./hooks";
import {
  CabecalhoRegistro, FiltrosRegistro, TabelaRegistro, VazioRegistro, AcaoLinha,
  EtiquetaStatus, Campo, OPCOES_STATUS, ErroGravacao, BlocoAntigos,
} from "./kit";

const fmtDia = (iso: string) => (iso ? iso.split("-").reverse().join("/") : "—");
const erroTexto = (e: unknown) => (e instanceof Error ? e.message : "O banco recusou a gravação.");

/* ================================= projetos ================================= */

const projetoVazio = (): ProjetoCadastro => ({
  id: "", nome: "", codigo: "", descricao: "", dataInicial: "", dataFinal: "",
  previsaoReceita: 0, previsaoDespesa: 0, clienteId: null, centroId: null, status: "ativo",
});

export function ProjetosRegistroView() {
  const projetos = useProjetos();
  const centros = useCentrosCusto();
  const clientes = usePartiesByRole("customer");
  const mudarStatus = useDefinirStatusProjeto();
  const trazer = useTrazerAntigo("projetos");
  const itens = React.useMemo(() => projetos.data ?? [], [projetos.data]);
  const antigos = usePendenciasAntigas("projetos", projetos.data ? { projetos: projetos.data } : null);

  const [busca, setBusca] = React.useState("");
  const [status, setStatus] = React.useState<FiltroStatus>("todos");
  const [editando, setEditando] = React.useState<ProjetoCadastro | null>(null);
  const [trazendo, setTrazendo] = React.useState<string | null>(null);

  // `?novo=1` — o endereço que o painel Criar usa abre esta tela com o
  // formulário já aberto (é o que dá link compartilhável à criação).
  React.useEffect(() => {
    if (new URLSearchParams(window.location.search).get("novo")) setEditando(projetoVazio());
  }, []);
  const { show, node } = useToast();

  const nomeCliente = React.useMemo(
    () => new Map((clientes.data ?? []).map((p) => [p.id, p.name])), [clientes.data],
  );
  const nomeCentro = React.useMemo(
    () => new Map((centros.data ?? []).map((c) => [c.id, c.nome])), [centros.data],
  );

  // ⚠️ A situação é DECLARADA (ativo × encerrado), não deduzida da data final:
  // um projeto vencido pode ainda receber a última nota, e um cancelado antes
  // do fim não pode receber mais nada. É ela que o banco lê.
  const visiveis = React.useMemo(
    () => filtrarRegistros(
      itens.map((p) => ({ ...p, ativo: p.status === "ativo" })),
      busca,
      (p) => [p.nome, p.codigo, p.descricao, p.id, nomeCliente.get(p.clienteId ?? "")],
      status,
    ),
    [itens, busca, status, nomeCliente],
  );

  const linhas = React.useMemo(() => [
    ["ID", "Nome", "Código", "Cliente", "Centro responsável", "Início", "Fim", "Receita prevista", "Despesa prevista", "Resultado previsto", "Situação"],
    ...visiveis.map((p) => [
      p.id, p.nome, p.codigo, nomeCliente.get(p.clienteId ?? "") ?? "", nomeCentro.get(p.centroId ?? "") ?? "",
      p.dataInicial, p.dataFinal, p.previsaoReceita, p.previsaoDespesa, p.previsaoReceita - p.previsaoDespesa,
      p.status === "ativo" ? "Ativo" : "Encerrado",
    ]),
  ], [visiveis, nomeCliente, nomeCentro]);

  return (
    <div className="flex flex-col gap-5 pb-4">
      <CabecalhoRegistro
        subtitulo="Centros de resultado temporais — um lançamento, uma campanha, um cliente — com previsão de receita e despesa."
        acaoNova={{ label: "Novo projeto", onClick: () => setEditando(projetoVazio()) }}
        exportar={{ nomeArquivo: "projetos", aba: "Projetos", linhas }}
      />
      <BlocoAntigos
        oQue="projetos"
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
        busca={busca} onBusca={setBusca} placeholder="Nome, código, cliente ou descrição…"
        campos={[{ label: "Situação", value: status, onChange: (v) => setStatus(v as FiltroStatus), options: [
          { value: "todos", label: "Todos" },
          { value: "ativos", label: "Ativos" },
          { value: "inativos", label: "Encerrados" },
        ] }]}
      />
      {projetos.error ? (
        <ErroGravacao mensagem={`Não foi possível ler os projetos: ${erroTexto(projetos.error)}`} />
      ) : (
        <TabelaRegistro
          itens={visiveis}
          vazio={
            <VazioRegistro
              texto={projetos.isLoading
                ? "Carregando os projetos…"
                : itens.length === 0
                  ? "Nenhum projeto ainda. Um projeto permite medir o realizado contra o previsto de uma campanha ou de um cliente."
                  : "Nenhum projeto encontrado com esses filtros."}
              acao={!projetos.isLoading && itens.length === 0
                ? <Button variant="primary" onClick={() => setEditando(projetoVazio())}>Criar primeiro projeto</Button>
                : undefined}
            />
          }
          colunas={[
            { chave: "nome", label: "Projeto", render: (p) => (
              <div className="flex flex-col">
                <span className="text-ink">{p.nome}</span>
                <span className="text-caption text-faint">
                  {[p.codigo, nomeCliente.get(p.clienteId ?? ""), nomeCentro.get(p.centroId ?? "")].filter(Boolean).join(" · ") || "—"}
                </span>
              </div>
            ) },
            { chave: "periodo", label: "Vigência", render: (p) => (
              <span className="text-muted tabular-nums">{fmtDia(p.dataInicial)} → {fmtDia(p.dataFinal)}</span>
            ) },
            { chave: "receita", label: "Receita prevista", alinhar: "direita", render: (p) => <BRL value={p.previsaoReceita} /> },
            { chave: "despesa", label: "Despesa prevista", alinhar: "direita", render: (p) => <BRL value={p.previsaoDespesa} /> },
            { chave: "resultado", label: "Resultado previsto", alinhar: "direita", render: (p) => <BRL value={p.previsaoReceita - p.previsaoDespesa} /> },
            { chave: "status", label: "Situação", render: (p) => <EtiquetaStatus ativo={p.status === "ativo"} rotuloInativo="Encerrado" /> },
          ]}
          acoes={(p) => (
            <>
              <AcaoLinha label="Editar" icone="edit" onClick={() => setEditando(p)} />
              <AcaoLinha
                label={p.status === "ativo" ? "Encerrar" : "Reabrir"}
                icone={p.status === "ativo" ? "eye-off" : "eye"}
                onClick={() => mudarStatus.mutate(
                  { id: p.id, status: p.status === "ativo" ? "encerrado" : "ativo" },
                  {
                    onSuccess: () => show(p.status === "ativo" ? `Projeto "${p.nome}" encerrado — não recebe lançamento novo.` : `Projeto "${p.nome}" reaberto.`),
                    onError: (e) => show(erroTexto(e)),
                  },
                )}
              />
            </>
          )}
        />
      )}
      {editando && (
        <FormProjeto
          inicial={editando}
          todos={itens}
          centros={centros.data ?? []}
          clientes={(clientes.data ?? []).map((c) => ({ value: c.id, label: c.name }))}
          onClose={() => setEditando(null)}
          onSalvo={(p, novo) => {
            setEditando(null);
            show(novo ? `Projeto "${p.nome}" criado.` : `Projeto "${p.nome}" salvo.`);
          }}
        />
      )}
      {node}
    </div>
  );
}

function FormProjeto({
  inicial, todos, centros, clientes, onClose, onSalvo,
}: {
  inicial: ProjetoCadastro; todos: ProjetoCadastro[]; centros: CentroCustoCadastro[];
  clientes: { value: string; label: string }[];
  onClose: () => void; onSalvo: (p: ProjetoCadastro, novo: boolean) => void;
}) {
  const salvarProjeto = useSalvarProjeto();
  const [f, setF] = React.useState<ProjetoCadastro>(inicial);
  const [erros, setErros] = React.useState<Record<string, string>>({});
  const [erroBanco, setErroBanco] = React.useState<string | null>(null);
  const set = <K extends keyof ProjetoCadastro>(k: K, v: ProjetoCadastro[K]) => setF((s) => ({ ...s, [k]: v }));

  const salvar = () => {
    const e = validarProjeto(f, todos);
    setErros(e);
    setErroBanco(null);
    if (Object.keys(e).length > 0) return;
    salvarProjeto.mutate(f, {
      onSuccess: (p) => onSalvo(p, !inicial.id),
      onError: (err) => setErroBanco(erroTexto(err)),
    });
  };

  return (
    <FormModal title={inicial.id ? "Editar projeto" : "Novo projeto"} size="medium" onClose={onClose} onSave={salvar} saving={salvarProjeto.isPending}>
      <ErroGravacao mensagem={erroBanco} />
      <Campo label="Nome do projeto" obrigatorio erro={erros.nome}>
        <Input value={f.nome} onChange={(e) => set("nome", e.target.value)} placeholder="Ex.: Lançamento Turma 12" />
      </Campo>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Campo label="Código">
          <Input value={f.codigo} onChange={(e) => set("codigo", e.target.value)} placeholder="PRJ-2026" />
        </Campo>
        <Campo label="Situação" ajuda="Encerrado não recebe lançamento novo.">
          <Select
            value={f.status}
            onChange={(v) => set("status", v === "encerrado" ? "encerrado" : "ativo")}
            options={[{ value: "ativo", label: "Ativo" }, { value: "encerrado", label: "Encerrado" }]}
          />
        </Campo>
        <Campo label="Cliente">
          <Select
            value={f.clienteId ?? ""}
            onChange={(v) => set("clienteId", v || null)}
            placeholder="Sem cliente"
            options={[{ value: "", label: "Sem cliente" }, ...clientes]}
          />
        </Campo>
        <Campo label="Centro de custo responsável">
          <Select
            value={f.centroId ?? ""}
            onChange={(v) => set("centroId", v || null)}
            placeholder="Sem centro"
            options={[
              { value: "", label: "Sem centro" },
              ...centros.filter((c) => c.ativo || c.id === f.centroId).map((c) => ({ value: c.id, label: caminhoDe(centros, c.id) })),
            ]}
          />
        </Campo>
      </div>
      <Campo label="Descrição">
        <Textarea value={f.descricao} onChange={(e) => set("descricao", e.target.value)} rows={2} />
      </Campo>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Campo label="Data inicial"><DateField value={f.dataInicial} onChange={(v) => set("dataInicial", v)} /></Campo>
        <Campo label="Data final" erro={erros.periodo}><DateField value={f.dataFinal} onChange={(v) => set("dataFinal", v)} /></Campo>
        <Campo label="Receita prevista"><CurrencyInput value={f.previsaoReceita} onValueChange={(v) => set("previsaoReceita", v)} /></Campo>
        <Campo label="Despesa prevista"><CurrencyInput value={f.previsaoDespesa} onValueChange={(v) => set("previsaoDespesa", v)} /></Campo>
      </div>
    </FormModal>
  );
}

/* ============================== centros de custo ============================== */

const centroVazio = (): CentroCustoCadastro => ({
  id: "", nome: "", codigo: "", codigoContabil: "", descricao: "", ativo: true, paiId: null,
});

export function CentrosCustoRegistroView() {
  const centros = useCentrosCusto();
  const ativar = useDefinirCentroAtivo();
  const trazer = useTrazerAntigo("centros");
  const itens = React.useMemo(() => centros.data ?? [], [centros.data]);
  const antigos = usePendenciasAntigas("centros", centros.data ? { centros: centros.data } : null);

  const [busca, setBusca] = React.useState("");
  const [status, setStatus] = React.useState<FiltroStatus>("todos");
  const [editando, setEditando] = React.useState<CentroCustoCadastro | null>(null);
  const [trazendo, setTrazendo] = React.useState<string | null>(null);

  // `?novo=1` — o endereço que o painel Criar usa abre esta tela com o
  // formulário já aberto (é o que dá link compartilhável à criação).
  React.useEffect(() => {
    if (new URLSearchParams(window.location.search).get("novo")) setEditando(centroVazio());
  }, []);
  const { show, node } = useToast();

  /** A árvore (grupo → centro), filtrada; o nível vem da árvore INTEIRA. */
  const visiveis = React.useMemo(() => {
    const casam = new Set(
      filtrarRegistros(itens, busca, (c) => [c.nome, c.codigo, c.codigoContabil, c.descricao, c.id], status).map((c) => c.id),
    );
    return achatarArvore(itens)
      .filter(({ item }) => casam.has(item.id))
      .map(({ item, nivel }) => ({ ...item, nivel }));
  }, [itens, busca, status]);

  const temFilho = React.useMemo(() => new Set(itens.map((c) => c.paiId).filter(Boolean) as string[]), [itens]);

  const linhas = React.useMemo(() => [
    ["ID", "Nome", "Grupo", "Código", "Código Domínio", "Descrição", "Status"],
    ...visiveis.map((c) => [
      c.id, c.nome, itens.find((x) => x.id === c.paiId)?.nome ?? "", c.codigo, c.codigoContabil, c.descricao,
      c.ativo ? "Ativo" : "Inativo",
    ]),
  ], [visiveis, itens]);

  return (
    <div className="flex flex-col gap-5 pb-4">
      <CabecalhoRegistro
        subtitulo="Áreas que consomem recurso, em grupos — o recorte que o DRE por centro de custo usa."
        acaoNova={{ label: "Novo centro de custo", onClick: () => setEditando(centroVazio()) }}
        exportar={{ nomeArquivo: "centros-de-custo", aba: "Centros de custo", linhas }}
      />
      <BlocoAntigos
        oQue="centros de custo"
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
        busca={busca} onBusca={setBusca} placeholder="Nome, código ou descrição…"
        campos={[{ label: "Status", value: status, onChange: (v) => setStatus(v as FiltroStatus), options: OPCOES_STATUS }]}
      />
      {centros.error ? (
        <ErroGravacao mensagem={`Não foi possível ler os centros de custo: ${erroTexto(centros.error)}`} />
      ) : (
        <TabelaRegistro
          itens={visiveis}
          vazio={
            <VazioRegistro
              texto={centros.isLoading
                ? "Carregando os centros de custo…"
                : itens.length === 0
                  ? "Nenhum centro de custo ainda. Eles permitem ratear um lançamento entre áreas e ver o DRE por centro."
                  : "Nenhum centro de custo encontrado com esses filtros."}
              acao={!centros.isLoading && itens.length === 0
                ? <Button variant="primary" onClick={() => setEditando(centroVazio())}>Criar primeiro centro</Button>
                : undefined}
            />
          }
          colunas={[
            { chave: "nome", label: "Centro de custo", render: (c) => (
              <div className="flex flex-col" style={{ paddingLeft: c.nivel * 20 }}>
                <span className={`text-ink ${temFilho.has(c.id) ? "font-semibold" : ""}`}>{c.nome}</span>
                {c.descricao && <span className="text-caption text-faint">{c.descricao}</span>}
              </div>
            ) },
            { chave: "codigo", label: "Código", render: (c) => <span className="text-muted tabular-nums">{c.codigo || "—"}</span> },
            { chave: "dominio", label: "Cód. Domínio", render: (c) => <span className="text-muted tabular-nums">{c.codigoContabil || "—"}</span> },
            { chave: "status", label: "Status", render: (c) => <EtiquetaStatus ativo={c.ativo} /> },
          ]}
          acoes={(c) => (
            <>
              <AcaoLinha label="Editar" icone="edit" onClick={() => setEditando(c)} />
              <AcaoLinha
                label={c.ativo ? "Desativar" : "Reativar"}
                icone={c.ativo ? "eye-off" : "eye"}
                onClick={() => ativar.mutate({ id: c.id, ativo: !c.ativo }, {
                  onSuccess: () => show(c.ativo ? `Centro "${c.nome}" desativado.` : `Centro "${c.nome}" reativado.`),
                  onError: (e) => show(erroTexto(e)),
                })}
              />
            </>
          )}
        />
      )}
      {editando && (
        <FormCentro
          inicial={editando}
          todos={itens}
          onClose={() => setEditando(null)}
          onSalvo={(c, novo) => {
            setEditando(null);
            show(novo ? `Centro "${c.nome}" criado.` : `Centro "${c.nome}" salvo.`);
          }}
        />
      )}
      {node}
    </div>
  );
}

function FormCentro({
  inicial, todos, onClose, onSalvo,
}: {
  inicial: CentroCustoCadastro; todos: CentroCustoCadastro[];
  onClose: () => void; onSalvo: (c: CentroCustoCadastro, novo: boolean) => void;
}) {
  const salvarCentro = useSalvarCentroCusto();
  const [f, setF] = React.useState<CentroCustoCadastro>(inicial);
  const [erros, setErros] = React.useState<Record<string, string>>({});
  const [erroBanco, setErroBanco] = React.useState<string | null>(null);
  const set = <K extends keyof CentroCustoCadastro>(k: K, v: CentroCustoCadastro[K]) => setF((s) => ({ ...s, [k]: v }));

  // O grupo só pode ser um centro que não fecha ciclo (nem ele mesmo, nem um
  // descendente dele) — a mesma regra do gatilho `centro_custo_hierarquia`.
  const grupos = todos.filter((c) => c.id !== f.id && !(f.id && fechaCiclo(todos, f.id, c.id)));

  const salvar = () => {
    const e = validarCentro(f, todos);
    setErros(e);
    setErroBanco(null);
    if (Object.keys(e).length > 0) return;
    salvarCentro.mutate(f, {
      onSuccess: (c) => onSalvo(c, !inicial.id),
      onError: (err) => setErroBanco(erroTexto(err)),
    });
  };

  return (
    <FormModal title={inicial.id ? "Editar centro de custo" : "Novo centro de custo"} size="medium" onClose={onClose} onSave={salvar} saving={salvarCentro.isPending}>
      <ErroGravacao mensagem={erroBanco} />
      <Campo label="Nome" obrigatorio erro={erros.nome}>
        <Input value={f.nome} onChange={(e) => set("nome", e.target.value)} placeholder="Ex.: Marketing" />
      </Campo>
      <Campo label="Grupo" erro={erros.paiId} ajuda="O centro sintético que agrupa este. Vazio = centro de primeiro nível.">
        <Select
          value={f.paiId ?? ""}
          onChange={(v) => set("paiId", v || null)}
          placeholder="Sem grupo"
          options={[{ value: "", label: "Sem grupo" }, ...grupos.map((c) => ({ value: c.id, label: caminhoDe(todos, c.id) }))]}
        />
      </Campo>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Campo label="Código" erro={erros.codigo}>
          <Input value={f.codigo} onChange={(e) => set("codigo", e.target.value)} placeholder="Ex.: CC-01" />
        </Campo>
        <Campo
          label="Código contábil (Domínio)"
          ajuda="Sai nas colunas CC do TXT contábil quando o lançamento tem um único centro de custo."
        >
          <Input value={f.codigoContabil} onChange={(e) => set("codigoContabil", e.target.value)} placeholder="Ex.: 12" />
        </Campo>
      </div>
      <Campo label="Descrição">
        <Textarea value={f.descricao} onChange={(e) => set("descricao", e.target.value)} rows={2} />
      </Campo>
    </FormModal>
  );
}
