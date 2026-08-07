"use client";

/**
 * Cadastros › Projetos e Centros de custo.
 *
 * São a MESMA tela em duas roupas — lista filtrável + modal de criação — e a
 * diferença está só nos campos: projeto tem período e previsões (é um centro de
 * resultado TEMPORAL), centro de custo tem o código contábil do Domínio, que
 * sai nas colunas CC do TXT quando o lançamento tem um centro só.
 */
import * as React from "react";
import { Button, Input, Textarea, DateField, CurrencyInput, BRL } from "@/components/ui";
import { FormModal } from "@/components/lancamentos/FormModal";
import { useToast } from "@/components/listas/ListChrome";
import { filtrarRegistros, type FiltroStatus } from "@/core/registros";
import {
  listProjetos, addProjeto, updateProjeto, listCentrosCusto, addCentroCusto, updateCentroCusto,
  type Projeto, type CentroCusto,
} from "@/lib/iuli-cadastros";
import {
  CabecalhoRegistro, FiltrosRegistro, TabelaRegistro, VazioRegistro, AcaoLinha,
  EtiquetaStatus, Campo, OPCOES_STATUS,
} from "./kit";

const fmtDia = (iso: string) => (iso ? iso.split("-").reverse().join("/") : "—");

/* ================================= projetos ================================= */

export function ProjetosRegistroView() {
  const [itens, setItens] = React.useState<Projeto[]>([]);
  const [busca, setBusca] = React.useState("");
  const [status, setStatus] = React.useState<FiltroStatus>("todos");
  const [editando, setEditando] = React.useState<Projeto | null>(null);
  const [novo, setNovo] = React.useState(false);
  const { show, node } = useToast();

  React.useEffect(() => { setItens(listProjetos()); }, []);

  // Projeto não tem flag de ativo: quem decide é a VIGÊNCIA. Um projeto cuja
  // data final já passou está encerrado, e é isso que o filtro de status lê.
  const hoje = new Date().toISOString().slice(0, 10);
  const vigente = (p: Projeto) => !p.dataFinal || p.dataFinal >= hoje;

  const visiveis = React.useMemo(
    () => filtrarRegistros(
      itens.map((p) => ({ ...p, ativo: vigente(p) })),
      busca,
      (p) => [p.nome, p.codigo, p.descricao, p.id],
      status,
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [itens, busca, status],
  );

  const linhas = React.useMemo(() => [
    ["ID", "Nome", "Código", "Início", "Fim", "Receita prevista", "Despesa prevista", "Resultado previsto", "Situação"],
    ...visiveis.map((p) => [
      p.id, p.nome, p.codigo, p.dataInicial, p.dataFinal,
      p.previsaoReceita, p.previsaoDespesa, p.previsaoReceita - p.previsaoDespesa,
      vigente(p) ? "Vigente" : "Encerrado",
    ]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [visiveis]);

  return (
    <div className="flex flex-col gap-5 pb-4">
      <CabecalhoRegistro
        subtitulo="Centros de resultado temporais — um lançamento, uma campanha — com previsão de receita e despesa."
        acaoNova={{ label: "Novo projeto", onClick: () => setNovo(true) }}
        exportar={{ nomeArquivo: "projetos", aba: "Projetos", linhas }}
      />
      <FiltrosRegistro
        busca={busca} onBusca={setBusca} placeholder="Nome, código ou descrição…"
        campos={[{ label: "Status", value: status, onChange: (v) => setStatus(v as FiltroStatus), options: [
          { value: "todos", label: "Todos" },
          { value: "ativos", label: "Vigentes" },
          { value: "inativos", label: "Encerrados" },
        ] }]}
      />
      <TabelaRegistro
        itens={visiveis}
        vazio={
          <VazioRegistro
            texto={itens.length === 0
              ? "Nenhum projeto ainda. Um projeto permite medir o realizado contra o previsto de uma campanha ou lançamento."
              : "Nenhum projeto encontrado com esses filtros."}
            acao={itens.length === 0 ? <Button variant="primary" onClick={() => setNovo(true)}>Criar primeiro projeto</Button> : undefined}
          />
        }
        colunas={[
          { chave: "nome", label: "Projeto", render: (p) => (
            <div className="flex flex-col">
              <span className="text-ink">{p.nome}</span>
              {p.codigo && <span className="text-caption text-faint">{p.codigo}</span>}
            </div>
          ) },
          { chave: "periodo", label: "Vigência", render: (p) => (
            <span className="text-muted tabular-nums">{fmtDia(p.dataInicial)} → {fmtDia(p.dataFinal)}</span>
          ) },
          { chave: "receita", label: "Receita prevista", alinhar: "direita", render: (p) => <BRL value={p.previsaoReceita} /> },
          { chave: "despesa", label: "Despesa prevista", alinhar: "direita", render: (p) => <BRL value={p.previsaoDespesa} /> },
          { chave: "resultado", label: "Resultado previsto", alinhar: "direita", render: (p) => <BRL value={p.previsaoReceita - p.previsaoDespesa} /> },
          { chave: "status", label: "Situação", render: (p) => <EtiquetaStatus ativo={vigente(p)} /> },
        ]}
        acoes={(p) => <AcaoLinha label="Editar" icone="edit" onClick={() => setEditando(p)} />}
      />
      {(novo || editando) && (
        <FormProjeto
          inicial={editando}
          onClose={() => { setNovo(false); setEditando(null); }}
          onSalvo={(p) => {
            setItens(editando ? updateProjeto(p) : (xs) => [p, ...xs]);
            setNovo(false); setEditando(null);
            show(editando ? "Projeto salvo." : "Projeto criado.");
          }}
        />
      )}
      {node}
    </div>
  );
}

function FormProjeto({
  inicial, onClose, onSalvo,
}: { inicial?: Projeto | null; onClose: () => void; onSalvo: (p: Projeto) => void }) {
  const [f, setF] = React.useState({
    nome: inicial?.nome ?? "", codigo: inicial?.codigo ?? "", descricao: inicial?.descricao ?? "",
    dataInicial: inicial?.dataInicial ?? "", dataFinal: inicial?.dataFinal ?? "",
    previsaoReceita: inicial?.previsaoReceita ?? 0, previsaoDespesa: inicial?.previsaoDespesa ?? 0,
  });
  const [erro, setErro] = React.useState("");
  const set = (k: keyof typeof f, v: string | number) => setF((s) => ({ ...s, [k]: v }));

  const salvar = () => {
    if (!f.nome.trim()) { setErro("Informe o nome do projeto."); return; }
    onSalvo(inicial ? { ...inicial, ...f } : addProjeto(f));
  };

  return (
    <FormModal title={inicial ? "Editar projeto" : "Novo projeto"} size="medium" onClose={onClose} onSave={salvar}>
      <Campo label="Nome do projeto" obrigatorio erro={erro}>
        <Input value={f.nome} onChange={(e) => set("nome", e.target.value)} placeholder="Ex.: Lançamento Turma 12" />
      </Campo>
      <Campo label="Código">
        <Input value={f.codigo} onChange={(e) => set("codigo", e.target.value)} placeholder="PRJ-2026" />
      </Campo>
      <Campo label="Descrição">
        <Textarea value={f.descricao} onChange={(e) => set("descricao", e.target.value)} rows={2} />
      </Campo>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Campo label="Data inicial"><DateField value={f.dataInicial} onChange={(v) => set("dataInicial", v)} /></Campo>
        <Campo label="Data final"><DateField value={f.dataFinal} onChange={(v) => set("dataFinal", v)} /></Campo>
        <Campo label="Receita prevista"><CurrencyInput value={f.previsaoReceita} onValueChange={(v) => set("previsaoReceita", v)} /></Campo>
        <Campo label="Despesa prevista"><CurrencyInput value={f.previsaoDespesa} onValueChange={(v) => set("previsaoDespesa", v)} /></Campo>
      </div>
    </FormModal>
  );
}

/* ============================== centros de custo ============================== */

export function CentrosCustoRegistroView() {
  const [itens, setItens] = React.useState<CentroCusto[]>([]);
  const [busca, setBusca] = React.useState("");
  const [status, setStatus] = React.useState<FiltroStatus>("todos");
  const [editando, setEditando] = React.useState<CentroCusto | null>(null);
  const [novo, setNovo] = React.useState(false);
  const { show, node } = useToast();

  React.useEffect(() => { setItens(listCentrosCusto()); }, []);

  const visiveis = React.useMemo(
    () => filtrarRegistros(itens, busca, (c) => [c.nome, c.codigo, c.codigoContabil, c.descricao, c.id], status),
    [itens, busca, status],
  );

  const linhas = React.useMemo(() => [
    ["ID", "Nome", "Código", "Código Domínio", "Descrição", "Status"],
    ...visiveis.map((c) => [c.id, c.nome, c.codigo, c.codigoContabil, c.descricao, c.ativo ? "Ativo" : "Inativo"]),
  ], [visiveis]);

  return (
    <div className="flex flex-col gap-5 pb-4">
      <CabecalhoRegistro
        subtitulo="Áreas que consomem recurso — o recorte que o DRE por centro de custo usa."
        acaoNova={{ label: "Novo centro de custo", onClick: () => setNovo(true) }}
        exportar={{ nomeArquivo: "centros-de-custo", aba: "Centros de custo", linhas }}
      />
      <FiltrosRegistro
        busca={busca} onBusca={setBusca} placeholder="Nome, código ou descrição…"
        campos={[{ label: "Status", value: status, onChange: (v) => setStatus(v as FiltroStatus), options: OPCOES_STATUS }]}
      />
      <TabelaRegistro
        itens={visiveis}
        vazio={
          <VazioRegistro
            texto={itens.length === 0
              ? "Nenhum centro de custo ainda. Eles permitem ratear um lançamento entre áreas e ver o DRE por centro."
              : "Nenhum centro de custo encontrado com esses filtros."}
            acao={itens.length === 0 ? <Button variant="primary" onClick={() => setNovo(true)}>Criar primeiro centro</Button> : undefined}
          />
        }
        colunas={[
          { chave: "nome", label: "Centro de custo", render: (c) => (
            <div className="flex flex-col">
              <span className="text-ink">{c.nome}</span>
              {c.descricao && <span className="text-caption text-faint">{c.descricao}</span>}
            </div>
          ) },
          { chave: "codigo", label: "Código", render: (c) => <span className="text-muted tabular-nums">{c.codigo || "—"}</span> },
          { chave: "dominio", label: "Cód. Domínio", render: (c) => <span className="text-muted tabular-nums">{c.codigoContabil || "—"}</span> },
          { chave: "status", label: "Status", render: (c) => <EtiquetaStatus ativo={c.ativo} /> },
        ]}
        acoes={(c) => <AcaoLinha label="Editar" icone="edit" onClick={() => setEditando(c)} />}
      />
      {(novo || editando) && (
        <FormCentro
          inicial={editando}
          onClose={() => { setNovo(false); setEditando(null); }}
          onSalvo={(c) => {
            setItens(editando ? updateCentroCusto(c) : (xs) => [c, ...xs]);
            setNovo(false); setEditando(null);
            show(editando ? "Centro de custo salvo." : "Centro de custo criado.");
          }}
        />
      )}
      {node}
    </div>
  );
}

function FormCentro({
  inicial, onClose, onSalvo,
}: { inicial?: CentroCusto | null; onClose: () => void; onSalvo: (c: CentroCusto) => void }) {
  const [f, setF] = React.useState({
    nome: inicial?.nome ?? "", codigo: inicial?.codigo ?? "",
    codigoContabil: inicial?.codigoContabil ?? "", descricao: inicial?.descricao ?? "",
    ativo: inicial?.ativo ?? true,
  });
  const [erros, setErros] = React.useState<Record<string, string>>({});
  const set = (k: keyof typeof f, v: string | boolean) => setF((s) => ({ ...s, [k]: v }));

  const salvar = () => {
    const e: Record<string, string> = {};
    if (!f.nome.trim()) e.nome = "Informe o nome.";
    if (!f.codigo.trim()) e.codigo = "Informe o código.";
    setErros(e);
    if (Object.keys(e).length > 0) return;
    onSalvo(inicial ? { ...inicial, ...f } : addCentroCusto(f));
  };

  return (
    <FormModal title={inicial ? "Editar centro de custo" : "Novo centro de custo"} size="medium" onClose={onClose} onSave={salvar}>
      <Campo label="Nome" obrigatorio erro={erros.nome}>
        <Input value={f.nome} onChange={(e) => set("nome", e.target.value)} placeholder="Ex.: Marketing" />
      </Campo>
      <Campo label="Código" obrigatorio erro={erros.codigo}>
        <Input value={f.codigo} onChange={(e) => set("codigo", e.target.value)} placeholder="Ex.: CC-01" />
      </Campo>
      <Campo
        label="Código contábil (Domínio)"
        ajuda="Sai nas colunas CC do TXT contábil quando o lançamento tem um único centro de custo."
      >
        <Input value={f.codigoContabil} onChange={(e) => set("codigoContabil", e.target.value)} placeholder="Ex.: 12" />
      </Campo>
      <Campo label="Descrição">
        <Textarea value={f.descricao} onChange={(e) => set("descricao", e.target.value)} rows={2} />
      </Campo>
    </FormModal>
  );
}
