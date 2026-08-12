"use client";

/**
 * Contas a Receber / a Pagar — a lista operacional dos títulos.
 *
 * Um componente só com `direcao`: receber e pagar são o mesmo problema
 * espelhado (um título, um vencimento, um status), e o que muda é o
 * vocabulário — Cliente × Fornecedor, Recebido × Pago.
 *
 * Os 4 cards do topo, a busca, o filtro, as ações em lote e a paginação são a
 * ferramenta de trabalho de quem opera cobrança e pagamento o dia inteiro.
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Card, Button, Icon, Input, Select, DateField, Checkbox, BRL, Skeleton } from "@/components/ui";
import { useToast } from "@/components/listas/ListChrome";
import { useRiscoInput, useAccounts } from "@/components/visao-geral/hooks";
import { baixarXLSX } from "@/lib/xlsx";
import { pagarLote, anexarComprovante, type MetodoPagamento } from "@/lib/pagamentos";
import { formatBRL, dataBR } from "@/lib/format";
import { listProjetos } from "@/lib/iuli-cadastros";
import { projetoDoMovimento } from "@/lib/projeto-vinculo";
import { ModalBaixa } from "./ModalBaixa";
import type { RiskMovement } from "@/core/risk-engine/types";
import { receberLote } from "@/lib/recebimentos";
import {
  filtrarTitulos, resumoTitulos, statusDoTitulo,
  type Direcao, type FiltroTitulos, type StatusTitulo, type CardResumo,
} from "@/core/movimentacoes";
import {
  CarrosselSazonalidade, FaixaPeriodos, periodosPorVencimento, type Granularidade,
} from "./CarrosselSazonalidade";
import { pctDeInteiro } from "@/lib/format";

const fmtDia = (iso: string) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");
const PAGINAS = [50, 100, 250, 500, 1000, 5000];

const COR_STATUS: Record<StatusTitulo, string> = {
  liquidado: "var(--color-positive)",
  aberto: "var(--color-warning)",
  atrasado: "var(--color-negative)",
};

export function TitulosView({ direcao }: { direcao: Direcao }) {
  const router = useRouter();
  const qc = useQueryClient();
  const { data: input, isLoading } = useRiscoInput();
  const { data: contas } = useAccounts();
  const { show, node } = useToast();

  const [busca, setBusca] = React.useState("");
  const [filtro, setFiltro] = React.useState<FiltroTitulos>({ status: "todos" });
  const [abrirFiltro, setAbrirFiltro] = React.useState(false);
  const [porPagina, setPorPagina] = React.useState(50);
  const [pagina, setPagina] = React.useState(1);
  const [marcados, setMarcados] = React.useState<Set<string>>(new Set());
  // Carrossel de sazonalidade — portado do extrato.
  const [gran, setGran] = React.useState<Granularidade>("mes");
  const [selPeriodo, setSelPeriodo] = React.useState<string | null>(null);
  // ⚠️ BAIXA NA LINHA — porte do extrato (mapa, item 2). A baixa em lote exige
  // marcar caixinhas; para UM título, que é o caso comum, era o caminho mais
  // longo que existia.
  const [baixa, setBaixa] = React.useState<RiskMovement | null>(null);
  const [contaBaixa, setContaBaixa] = React.useState("");
  const [metodo, setMetodo] = React.useState<MetodoPagamento>("pix");
  const [comprovante, setComprovante] = React.useState<string | null>(null);
  const [enviandoBaixa, setEnviandoBaixa] = React.useState(false);
  const [projetos, setProjetos] = React.useState<{ id: string; nome: string }[]>([]);
  const [projeto, setProjeto] = React.useState("");
  React.useEffect(() => { setProjetos(listProjetos()); }, []);
  React.useEffect(() => { setProjeto(baixa ? (projetoDoMovimento(baixa.id) ?? "") : ""); }, [baixa]);
  const [executando, setExecutando] = React.useState(false);

  const parte = direcao === "receber" ? "Cliente" : "Fornecedor";
  const liquidado = direcao === "receber" ? "Recebido" : "Pago";

  /**
   * ⚠️ **A faixa mede o TOTAL A PAGAR (ou a receber) do período, não o
   * resultado.** Numa tela de títulos, "entradas − saídas" é a pergunta errada:
   * a lista abaixo tem um lado só, e um resultado líquido calculado sobre os
   * dois lados nunca ia bater com ela.
   *
   * E é `periodosPorVencimento`, uma agregação NOVA — a de resultado continua
   * intacta servindo ao extrato, que é a tela onde aquela pergunta é a certa.
   * Como as duas somam pelo VENCIMENTO, a barra do mês passou a ser o total
   * exato dos títulos que a tabela lista.
   */
  const periodos = React.useMemo(
    () => periodosPorVencimento(input, input?.hoje ?? new Date().toISOString().slice(0, 10), gran, direcao),
    [input, gran, direcao],
  );

  /**
   * O período escolhido no gráfico é o RECORTE DE TEMPO da tela inteira.
   *
   * ⚠️ Antes ele não filtrava nada: `selPeriodo` só pintava a cápsula. Clicar
   * em "Agosto" não mudava um número sequer — um controle que parece filtrar e
   * não filtra é pior que controle nenhum, porque quem clica conclui que os
   * valores abaixo já são de agosto.
   */
  const janela = React.useMemo(() => {
    const p = periodos.find((x) => x.key === selPeriodo);
    // As datas digitadas à mão continuam podendo sobrepor — quem abriu o painel
    // de filtro e escreveu um intervalo quis exatamente aquele intervalo.
    return {
      de: filtro.de ?? p?.de ?? null,
      ate: filtro.ate ?? p?.ate ?? null,
      rotulo: filtro.de || filtro.ate ? null : (p?.label ?? null),
    };
  }, [periodos, selPeriodo, filtro.de, filtro.ate]);

  /**
   * ⚠️ **OS CARDS NÃO OLHAM A LISTA JÁ FILTRADA PELO STATUS.**
   *
   * Era esse o defeito: `resumoTitulos` rodava sobre `titulos`, que já tinha o
   * status aplicado. Clicar em "Pagas" deixava a lista só com as pagas, os
   * cards recalculavam sobre ela, e "A vencer" e "Vencidas" zeravam — como se
   * filtrar tivesse APAGADO os outros títulos. Um painel que muda de valor por
   * causa do próprio filtro deixa de ser painel.
   *
   * Os cards leem a base com TODOS os outros recortes (busca, conta, categoria,
   * período) e SEM o status. O status recorta só a tabela.
   */
  const baseDosCards = React.useMemo(
    () => (input
      ? filtrarTitulos(input, direcao, { ...filtro, de: janela.de, ate: janela.ate, status: "todos", busca })
      : []),
    [input, direcao, filtro, janela, busca],
  );
  const cards = React.useMemo(
    () => (input ? resumoTitulos(baseDosCards, direcao, input.hoje) : []),
    [baseDosCards, direcao, input],
  );

  const titulos = React.useMemo(
    () => (input
      ? filtrarTitulos(input, direcao, { ...filtro, de: janela.de, ate: janela.ate, busca })
      : []),
    [input, direcao, filtro, janela, busca],
  );

  const totalPaginas = Math.max(1, Math.ceil(titulos.length / porPagina));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const visiveis = titulos.slice((paginaAtual - 1) * porPagina, paginaAtual * porPagina);

  const nomes = React.useMemo(() => input?.partyNames ?? {}, [input]);
  const nomeConta = (id?: string | null) =>
    (contas?.accounts ?? []).find((c) => c.id === id)?.name ?? "—";

  // Só faz sentido dar baixa no que ainda está ABERTO — marcar um liquidado e
  // "confirmar" de novo não moveria dinheiro (a operação é idempotente), mas
  // daria a impressão de que moveu.
  const marcadosAbertos = React.useMemo(
    () => titulos.filter((m) => marcados.has(m.id) && m.status !== "pago"),
    [titulos, marcados],
  );

  const alternar = (id: string) =>
    setMarcados((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });

  const executarBaixa = async () => {
    if (marcadosAbertos.length === 0) return;
    const conta = filtro.conta || (contas?.accounts ?? [])[0]?.id;
    if (!conta) { show("Cadastre uma conta bancária primeiro."); return; }
    setExecutando(true);
    try {
      // `pagarLote`/`receberLote` são IDEMPOTENTES (reusam o motor de
      // pagamento do core/platform): reenviar o mesmo título não move dinheiro
      // duas vezes.
      const base = marcadosAbertos.map((m) => ({
        id: m.id,
        amount: Math.abs(m.amount),
        contraparte: (m.party_id && nomes[m.party_id]) || m.category || "—",
        due_date: (m.due_date ?? "").slice(0, 10),
        category: m.category ?? null,
      }));
      const r = direcao === "receber"
        ? await receberLote(base.map(({ contraparte, ...b }) => ({ ...b, pagador: contraparte })), conta)
        : await pagarLote(base.map(({ contraparte, ...b }) => ({ ...b, beneficiario: contraparte })), conta, "pix");
      const n = "recebidos" in r ? r.recebidos : r.liquidados;
      show(`${n} ${direcao === "receber" ? "recebidos" : "pagos"}.`);
      setMarcados(new Set());
      qc.invalidateQueries();
    } finally {
      setExecutando(false);
    }
  };

  const executarBaixaUnica = async () => {
    if (!baixa || !contaBaixa) return;
    setEnviandoBaixa(true);
    try {
      const nome = (baixa.party_id && nomes[baixa.party_id]) || baixa.category || "Lançamento";
      const item = { id: baixa.id, amount: Math.abs(baixa.amount), due_date: baixa.due_date, category: baixa.category ?? null };
      const r = direcao === "pagar"
        ? await pagarLote([{ ...item, beneficiario: nome }], contaBaixa, metodo)
        : await receberLote([{ ...item, pagador: nome }], contaBaixa);
      if (comprovante) anexarComprovante(baixa.id, comprovante);
      await qc.invalidateQueries();
      const ok = direcao === "pagar" ? (r as { liquidados: number }).liquidados : (r as { recebidos: number }).recebidos;
      show(ok
        ? `${direcao === "pagar" ? "Pago" : "Recebido"}: ${formatBRL(Math.abs(baixa.amount))} — saldo da conta atualizado.`
        : `Este título já estava ${direcao === "pagar" ? "pago" : "recebido"}.`);
      setBaixa(null); setComprovante(null);
    } finally {
      setEnviandoBaixa(false);
    }
  };

  const linhasXLSX = React.useMemo(() => [
    ["ID", "Vencimento", "Data de " + liquidado.toLowerCase(), "Status", "Categoria", parte, "Valor", liquidado],
    ...titulos.map((m) => [
      m.id, m.due_date?.slice(0, 10) ?? "", m.paid_date?.slice(0, 10) ?? "",
      input ? statusDoTitulo(m, input.hoje) : "",
      m.category ?? "", (m.party_id && nomes[m.party_id]) || "",
      Math.abs(m.amount), m.status === "pago" ? Math.abs(m.amount) : 0,
    ]),
  ], [titulos, input, nomes, parte, liquidado]);

  const rotaNovo = direcao === "receber"
    ? "/dashboard/financial/receivables/new"
    : "/dashboard/financial/payables/new";

  return (
    <div className="flex flex-col gap-5 pb-4">
      {/* ⚠️ PORTE do extrato (mapa de consolidação, item 2). Esta tela mostra
          ESTOQUE de títulos e não tinha noção de tempo — o carrossel é a única
          superfície que responde "como este mês se compara aos onze
          anteriores" sem abrir um relatório. É a MESMA peça que o extrato usa,
          não uma cópia: duas cópias divergem no primeiro ajuste. */}
      <Card padded={false} info={{
        titulo: "Os últimos 12 períodos",
        oQue: `O total a ${direcao} de cada mês (ou semana), para enxergar sazonalidade sem abrir relatório.`,
        comoCalcula: `Cada período soma os títulos a ${direcao} com VENCIMENTO dentro dele — o mesmo recorte da tabela abaixo, então a barra do mês é o total dos títulos listados. Cancelados ficam de fora. É uma soma de obrigações: nunca é negativa, e período sem título vence R$ 0,00.`,
      }}>
        <CarrosselSazonalidade
          periodos={periodos} gran={gran} recarregarEm={isLoading}
          titulo={`Total a ${direcao} por período`}
          onGran={(g) => {
            // ⚠️ Trocar mês↔semana invalida a seleção: as chaves são de
            // granularidades diferentes, e manter a antiga deixaria a tela
            // filtrada por um período que nenhuma cápsula mostra como ativo.
            setGran(g);
            setSelPeriodo(null);
            setPagina(1);
          }}
        >
          <FaixaPeriodos
            modo="total"
            periodos={periodos} selKey={selPeriodo ?? undefined}
            onSelect={(k) => {
              // Clicar de novo no período ativo o desfaz — mesma regra do card.
              setSelPeriodo((atual) => (atual === k ? null : k));
              setPagina(1);
            }}
          />
        </CarrosselSazonalidade>
      </Card>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <p className="m-0 text-label text-muted">
          {direcao === "receber" ? "Valores a receber dos seus clientes." : "Valores a pagar aos seus fornecedores."}
        </p>
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          <Button variant="primary" onClick={() => router.push(rotaNovo)}>
            <Icon name="plus" size={15} color="currentColor" />
            Nova conta a {direcao}
          </Button>
          <Button
            variant="outline"
            disabled={titulos.length === 0}
            onClick={() => baixarXLSX(`contas-a-${direcao}`, [{ nome: `Contas a ${direcao}`, linhas: linhasXLSX }])}
          >
            <Icon name="arrow-down-to-line" size={15} color="currentColor" />
            Exportar XLSX
          </Button>
          <Button variant="outline" disabled={titulos.length === 0} onClick={() => window.print()}>
            <Icon name="file-text" size={15} color="currentColor" />
            Exportar PDF
          </Button>
          <Button variant="outline" onClick={() => router.push(`/dashboard/financial/import?tipo=${direcao}`)}>
            <Icon name="upload" size={15} color="currentColor" />
            Importar
          </Button>
        </div>
      </div>

      {/* --------------------------------- cards --------------------------------- */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[0, 1, 2, 3].map((k) => <Card key={k}><Skeleton className="h-[70px]" /></Card>)}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {cards.map((c) => {
            const alvo = c.id === "total" ? "todos" : (c.id as StatusTitulo);
            const ativo = (filtro.status ?? "todos") === alvo;
            return (
              <CardTitulo
                key={c.id} c={c} selecionado={ativo}
                onClick={() => {
                  // ⚠️ Clicar no card já selecionado DESFAZ o filtro. Sem isso,
                  // a única saída é abrir o painel e trocar o select — e quem
                  // filtrou com um clique espera desfiltrar com outro.
                  setFiltro((f) => ({ ...f, status: ativo ? "todos" : alvo }));
                  setPagina(1);
                }}
              />
            );
          })}
        </div>
      )}

      {/* ⚠️ O recorte vigente, DITO. A faixa do gráfico soma pelo CAIXA e os
          títulos são filtrados pelo VENCIMENTO — sem esta linha, o total dos
          cards não bateria com a barra do mês e as duas leituras pareceriam
          discordar, quando na verdade respondem perguntas diferentes. */}
      {(janela.de || janela.ate) && (
        <p className="m-0 -mt-2 text-caption text-muted">
          Mostrando títulos com <b className="text-ink">vencimento</b>
          {janela.rotulo
            ? <> em <b className="text-ink">{janela.rotulo}</b></>
            : <> entre {janela.de ? dataBR(janela.de) : "o início"} e {janela.ate ? dataBR(janela.ate) : "hoje"}</>}
          {" · "}
          <button
            type="button"
            onClick={() => { setSelPeriodo(null); setFiltro((f) => ({ ...f, de: null, ate: null })); setPagina(1); }}
            className="underline underline-offset-2 hover:text-ink"
          >
            ver todo o período
          </button>
        </p>
      )}

      {/* ------------------------------ barra de ações ------------------------------ */}
      <Card>
        <div className="flex items-center gap-3 flex-wrap">
          <Button variant="ghost" onClick={() => setAbrirFiltro((v) => !v)}>
            <Icon name="list-checks" size={15} color="currentColor" />
            Filtro
            {(filtro.conta || filtro.categoria || filtro.de || filtro.ate || (filtro.status && filtro.status !== "todos")) && (
              <span className="ml-1 rounded-pill bg-ink text-white text-[10px] px-[6px] py-[1px] tabular-nums">ativo</span>
            )}
          </Button>
          <Input
            value={busca}
            onChange={(e) => { setBusca(e.target.value); setPagina(1); }}
            placeholder="Buscar por ID, categoria ou contraparte…"
            containerClassName="flex-1 min-w-[220px]"
          />
          <Button variant="ghost" disabled={marcadosAbertos.length === 0 || executando} onClick={executarBaixa}>
            <Icon name="check" size={15} color="currentColor" />
            {executando
              ? "Confirmando…"
              /* ⚠️ "Dar baixa" é jargão contábil: quem opera o caixa de uma
                 PME diz "recebi" e "paguei". O verbo agora acompanha o LADO —
                 o mesmo `direcao` que já decide "Cliente"/"Fornecedor" e
                 "Recebido"/"Pago" nesta tela. */
              : `${direcao === "receber" ? "Registrar recebimento" : "Registrar pagamento"}${marcadosAbertos.length ? ` (${marcadosAbertos.length})` : ""}`}
          </Button>
        </div>

        {abrirFiltro && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-4 pt-4 border-t border-border-soft">
            <Campo label="Vencimento de">
              <DateField value={filtro.de ?? ""} onChange={(v) => setFiltro((f) => ({ ...f, de: v || null }))} />
            </Campo>
            <Campo label="Vencimento até">
              <DateField value={filtro.ate ?? ""} onChange={(v) => setFiltro((f) => ({ ...f, ate: v || null }))} />
            </Campo>
            <Campo label="Conta bancária">
              <Select
                aria-label="Filtrar por conta"
                value={filtro.conta ?? ""}
                onChange={(v) => setFiltro((f) => ({ ...f, conta: v || null }))}
                options={[{ value: "", label: "Todas as contas" }, ...(contas?.accounts ?? []).map((c) => ({ value: c.id, label: c.name }))]}
              />
            </Campo>
            <Campo label="Status">
              <Select
                aria-label="Filtrar por situação"
                value={filtro.status ?? "todos"}
                onChange={(v) => setFiltro((f) => ({ ...f, status: v as StatusTitulo | "todos" }))}
                options={[
                  { value: "todos", label: "Todos" },
                  { value: "liquidado", label: direcao === "receber" ? "Recebido" : "Pago" },
                  { value: "aberto", label: "Em aberto" },
                  { value: "atrasado", label: "Atrasado" },
                ]}
              />
            </Campo>
          </div>
        )}
      </Card>

      {/* --------------------------------- tabela --------------------------------- */}
      <Card padded={false} className="overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-6 py-3 border-b border-border-soft flex-wrap">
          <div className="flex items-center gap-2 text-caption text-muted">
            Mostrando
            <Select
              aria-label="Itens por página"
              value={String(porPagina)}
              onChange={(v) => { setPorPagina(Number(v)); setPagina(1); }}
              options={PAGINAS.map((n) => ({ value: String(n), label: String(n) }))}
              containerClassName="w-[92px]"
            />
            de <b className="text-ink tabular-nums">{titulos.length}</b>
          </div>
          <div className="flex items-center gap-1">
            <Seta label="Página anterior" icone="chevron-left" disabled={paginaAtual <= 1} onClick={() => setPagina((p) => p - 1)} />
            <span className="text-caption text-muted tabular-nums px-2">{paginaAtual} / {totalPaginas}</span>
            <Seta label="Próxima página" icone="chevron-right" disabled={paginaAtual >= totalPaginas} onClick={() => setPagina((p) => p + 1)} />
          </div>
        </div>

        {isLoading ? (
          <div className="p-6"><Skeleton className="h-[220px]" /></div>
        ) : visiveis.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-14 text-center">
            <span className="inline-flex items-center justify-center w-12 h-12 rounded-pill bg-surface-2">
              <Icon name="inbox" size={20} color="var(--color-text-tertiary)" />
            </span>
            <p className="m-0 text-label text-muted max-w-[44ch]">
              {titulos.length === 0 && !busca
                ? `Nenhuma conta a ${direcao} cadastrada.`
                : "Nenhum título encontrado com esses filtros."}
            </p>
            <Button variant="primary" onClick={() => router.push(rotaNovo)}>Nova conta a {direcao}</Button>
          </div>
        ) : (
          <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Tabela rolável">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-border-soft">
                  <Th className="w-[46px]">
                    <Checkbox
                      checked={visiveis.every((m) => marcados.has(m.id)) && visiveis.length > 0}
                      onChange={(e) => setMarcados(e.target.checked
                        ? new Set([...Array.from(marcados), ...visiveis.map((m) => m.id)])
                        : new Set())}
                    />
                  </Th>
                  <Th>ID</Th>
                  <Th>Vencimento / {liquidado.toLowerCase()}</Th>
                  <Th>Conta</Th>
                  <Th>Categoria</Th>
                  <Th>{parte}</Th>
                  <Th direita>Valor</Th>
                  <Th direita>{liquidado}</Th>
                </tr>
              </thead>
              <tbody>
                {visiveis.map((m) => {
                  const st = input ? statusDoTitulo(m, input.hoje) : "aberto";
                  return (
                    <tr key={m.id} onClick={() => setBaixa(m)} className="border-b border-border-soft last:border-0 hover:bg-surface-2/60 transition-colors cursor-pointer">
                      <td className="px-6 py-3">
                        <span onClick={(e) => e.stopPropagation()}><Checkbox checked={marcados.has(m.id)} onChange={() => alternar(m.id)} /></span>
                      </td>
                      <td className="px-6 py-3">
                        <span className="inline-flex items-center gap-2">
                          <span className="w-[7px] h-[7px] rounded-pill shrink-0" style={{ background: COR_STATUS[st] }} title={st} />
                          <span className="text-caption text-faint tabular-nums">{m.id.slice(0, 10)}</span>
                        </span>
                      </td>
                      <td className="px-6 py-3">
                        <div className="flex flex-col">
                          <span className="text-label text-ink tabular-nums">{fmtDia(m.due_date)}</span>
                          {m.paid_date && <span className="text-caption text-positive tabular-nums">{fmtDia(m.paid_date)}</span>}
                        </div>
                      </td>
                      <td className="px-6 py-3 text-label text-muted">{nomeConta(m.accountId)}</td>
                      <td className="px-6 py-3 text-label text-muted">{m.category ?? "—"}</td>
                      <td className="px-6 py-3">
                        {m.party_id ? (
                          <button
                            onClick={() => window.dispatchEvent(new CustomEvent("a4p:open-contato", { detail: { id: m.party_id } }))}
                            className="text-label text-ink hover:underline decoration-dotted underline-offset-4"
                          >
                            {nomes[m.party_id] ?? m.party_id}
                          </button>
                        ) : <span className="text-muted">—</span>}
                      </td>
                      <td className="px-6 py-3 text-right text-label text-ink tabular-nums"><BRL value={Math.abs(m.amount)} /></td>
                      <td className="px-6 py-3 text-right text-label tabular-nums">
                        {m.status === "pago"
                          ? <span className="text-positive"><BRL value={Math.abs(m.amount)} /></span>
                          : <span className="text-faint">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {baixa && (
        <ModalBaixa
          baixa={baixa}
          ehSaida={direcao === "pagar"}
          partyNames={nomes}
          contas={contas?.accounts ?? []}
          projetos={projetos}
          projeto={projeto}
          onProjeto={setProjeto}
          onProjetoMudou={() => qc.invalidateQueries({ queryKey: ["risco-input"] })}
          conta={contaBaixa} setConta={setContaBaixa}
          metodo={metodo} setMetodo={setMetodo}
          comprovante={comprovante} setComprovante={setComprovante}
          enviando={enviandoBaixa}
          onConfirmar={executarBaixaUnica}
          onFechar={() => setBaixa(null)}
          show={show}
        />
      )}
      {node}
    </div>
  );
}

/* --------------------------------- peças --------------------------------- */

/**
 * O card com o anel: o percentual é a fatia do total, não uma meta.
 *
 * ⚠️ **É um `<button>`, não um `Card` com `onClick`.** Ele filtra a tabela
 * abaixo, então precisa receber foco e responder a Enter — uma `div` clicável
 * deixa quem navega por teclado sem acesso ao filtro (a mesma correção que a
 * ONDA 12 já fez nas linhas de tabela).
 *
 * ⚠️ O card SELECIONADO ganha o cinza do sistema (`surface-2`) e um contorno,
 * não uma cor nova: os três anéis já carregam as cores semânticas, e usar cor
 * também para "selecionado" faria a mesma dimensão dizer duas coisas.
 */
function CardTitulo({
  c, selecionado, onClick,
}: { c: CardResumo; selecionado: boolean; onClick: () => void }) {
  const cor = c.id === "total" ? "var(--color-ink)" : COR_STATUS[c.id as StatusTitulo];
  const r = 22, circ = 2 * Math.PI * r;
  return (
    <Card padded={false}>
      {/* ⚠️ O cinza vai no BOTÃO, não no `Card`. A regra do DS
          (`.ds-visor [data-card="1"]`) pinta o fundo do card com
          `--color-white` e vence a classe utilitária — medido no navegador: o
          card "selecionado" continuava branco. O botão preenche o card inteiro,
          então pintá-lo dá o mesmo resultado visual sem disputar com o DS. */}
      <button
        type="button"
        aria-pressed={selecionado}
        aria-label={`${selecionado ? "Remover o filtro de" : "Filtrar por"} ${c.label}`}
        onClick={onClick}
        className={`w-full text-left p-6 rounded-card cursor-pointer transition-colors ${
          selecionado ? "bg-surface-2 ring-1 ring-border" : "hover:bg-surface-2/40"
        }`}
      >
      <div className="flex items-center gap-4">
        <svg width="56" height="56" viewBox="0 0 56 56" className="shrink-0" aria-hidden>
          <circle cx="28" cy="28" r={r} fill="none" stroke="var(--color-surface-3)" strokeWidth="5" />
          <circle
            cx="28" cy="28" r={r} fill="none" stroke={cor} strokeWidth="5" strokeLinecap="round"
            strokeDasharray={`${(circ * c.percentual) / 100} ${circ}`}
            transform="rotate(-90 28 28)"
          />
          <text x="28" y="31" textAnchor="middle" className="tabular-nums" style={{ fontSize: 11, fill: "var(--color-text-secondary)" }}>
            {pctDeInteiro(c.percentual)}
          </text>
        </svg>
        <div className="min-w-0">
          <div className="text-caption text-muted">
            {c.label} <span className="text-faint tabular-nums">({c.quantidade})</span>
          </div>
          <div className="text-[22px] leading-none font-semibold tabular-nums mt-1" style={{ color: cor }}>
            <BRL value={c.valor} />
          </div>
        </div>
      </div>
      </button>
    </Card>
  );
}

function Th({ children, direita, className }: { children?: React.ReactNode; direita?: boolean; className?: string }) {
  return (
    <th className={`px-6 py-3 text-[11px] font-medium tracking-[0.08em] text-faint ${direita ? "text-right" : "text-left"} ${className ?? ""}`}>
      {children}
    </th>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-[6px]">
      <label className="text-caption font-medium text-muted">{label}</label>
      {children}
    </div>
  );
}

function Seta({ label, icone, onClick, disabled }: { label: string; icone: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick} disabled={disabled} aria-label={label}
      className="inline-flex items-center justify-center w-8 h-8 rounded-md text-muted hover:text-ink hover:bg-surface-2 disabled:opacity-35 disabled:hover:bg-transparent transition-colors"
    >
      <Icon name={icone} size={15} color="currentColor" />
    </button>
  );
}
