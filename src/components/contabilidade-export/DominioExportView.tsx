"use client";

/**
 * Gerar TXT Contábil — Domínio.
 *
 * Esta é a tela que **consome** o campo "Código contábil (Domínio)" que os
 * cadastros de Contas bancárias e Centros de Custo pedem desde a PARTE 03, e o
 * `codigo` do Plano de Contas. Sem eles o arquivo sai mudo — por isso ela não
 * gera nada em silêncio: mostra os lançamentos, mostra o que falta, e só então
 * libera o download.
 */
import * as React from "react";
import { Card, Button, Icon, Select, BRL } from "@/components/ui";
import { useToast } from "@/components/listas/ListChrome";
import { useRiscoInput } from "@/components/visao-geral/hooks";
import { listContasBancarias, listPlanoContas } from "@/lib/registros";
import { listCentrosCusto } from "@/lib/iuli-cadastros";
import { useQuery } from "@tanstack/react-query";
import { getAccountsList } from "@/lib/data";
import {
  montarLancamentosDominio, gerarLanctosTxt, gerarLanctosBytes, conferirDominio,
  dataDominio, valorDominio, campoDominio, LAYOUT_DOMINIO,
  type MovimentoContabil, type MapasContabeis,
} from "@/core/contabilidade";

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function mesCorrente(): string {
  const h = new Date();
  return `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, "0")}`;
}
function deslocar(mes: string, n: number): string {
  const [a, m] = mes.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
const rotuloMes = (mes: string) => {
  const [a, m] = mes.split("-").map(Number);
  return `${MESES[m - 1]} ${a}`;
};
const fmtDia = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");

export function DominioExportView() {
  const { show: toast, node } = useToast();
  const risco = useRiscoInput();
  const contasReais = useQuery({ queryKey: ["accounts-list"], queryFn: getAccountsList });

  const [contaId, setContaId] = React.useState("");
  const [mes, setMes] = React.useState(mesCorrente());
  const [carregado, setCarregado] = React.useState<{ contaId: string; mes: string } | null>(null);

  const [extras, setExtras] = React.useState<ReturnType<typeof listContasBancarias>>([]);
  const [plano, setPlano] = React.useState<ReturnType<typeof listPlanoContas>>([]);
  const [centros, setCentros] = React.useState<ReturnType<typeof listCentrosCusto>>([]);
  React.useEffect(() => {
    setExtras(listContasBancarias());
    setPlano(listPlanoContas());
    setCentros(listCentrosCusto());
  }, []);

  const opcoesConta = (contasReais.data ?? []).map((c) => ({ value: c.id, label: c.name }));
  const contaEscolhida = (contasReais.data ?? []).find((c) => c.id === contaId);
  // O código contábil da conta mora no cadastro estendido (`lib/registros`),
  // casado por nome — `financial_accounts` não tem a coluna.
  const extraDaConta = extras.find(
    (e) => e.id === contaId || e.nome.toLowerCase() === (contaEscolhida?.name ?? "").toLowerCase(),
  );

  const mapas: MapasContabeis = React.useMemo(() => ({
    categorias: Object.fromEntries(
      plano.filter((c) => c.codigo).map((c) => [c.nome, c.codigo]),
    ),
    centros: Object.fromEntries(
      centros.filter((c) => c.codigoContabil).map((c) => [c.nome, c.codigoContabil]),
    ),
  }), [plano, centros]);

  const movimentos: MovimentoContabil[] = React.useMemo(() => {
    if (!carregado || !risco.data) return [];
    const nomes = risco.data.partyNames ?? {};
    return risco.data.movements
      .filter((m) => {
        if (m.status !== "pago") return false; // o extrato é o que o Domínio concilia
        if (m.accountId && m.accountId !== carregado.contaId) return false;
        const caixa = m.paid_date ?? m.due_date;
        return caixa?.slice(0, 7) === carregado.mes;
      })
      .map((m) => ({
        id: m.id,
        data: (m.paid_date ?? m.due_date).slice(0, 10),
        valor: Math.abs(m.amount),
        tipo: m.type === "entrada" ? "entrada" : "saida",
        // O histórico do Domínio quer a CONTRAPARTE, não a categoria: é o que o
        // contador procura ao conferir a linha contra o extrato do banco.
        descricao: (m.party_id && nomes[m.party_id]) || m.category || "",
        categoria: m.category ?? "",
        centroCusto: m.costCenter ?? null,
      }));
  }, [carregado, risco.data]);

  const { linhas, pendencias } = React.useMemo(
    () => montarLancamentosDominio(movimentos, mapas),
    [movimentos, mapas],
  );
  const conferencia = React.useMemo(() => conferirDominio(linhas), [linhas]);

  const semCodigoDaConta = !extraDaConta?.codigoContabil;

  function baixar() {
    const bytes = gerarLanctosBytes(linhas);
    // ⚠️ Blob a partir dos BYTES, não da string: passar a string faria o
    // navegador gravar UTF-8 e desfazer o trabalho todo do CP-1252.
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const blob = new Blob([buffer], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "lanctos.txt";
    a.click();
    URL.revokeObjectURL(url);
    toast(`lanctos.txt gerado com ${linhas.length} lançamentos.`);
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="m-0 text-label text-muted max-w-[80ch]">
        Exporta o extrato bancário no formato Partidas Simples (lanctos.txt) para importação
        direta no Domínio.
      </p>

      <Card>
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_auto_auto] gap-4 items-end">
          <Select
            label="Conta bancária"
            value={contaId}
            onChange={(v) => { setContaId(v); setCarregado(null); }}
            placeholder="Selecione a conta"
            options={opcoesConta}
          />
          <div className="flex flex-col gap-[6px]">
            <label className="text-label font-medium text-muted">Mês</label>
            <div className="flex items-center gap-1">
              <Seta label="Mês anterior" icone="chevron-left" onClick={() => { setMes(deslocar(mes, -1)); setCarregado(null); }} />
              <span className="min-w-[110px] text-center text-label text-ink tabular-nums">{rotuloMes(mes)}</span>
              <Seta label="Próximo mês" icone="chevron-right" onClick={() => { setMes(deslocar(mes, 1)); setCarregado(null); }} />
            </div>
          </div>
          <Button
            variant="primary"
            disabled={!contaId || risco.isLoading}
            onClick={() => setCarregado({ contaId, mes })}
          >
            Carregar lançamentos
          </Button>
        </div>
      </Card>

      {!carregado ? (
        <Card>
          <div className="flex flex-col items-center justify-center gap-3 py-14 text-center">
            <span className="inline-flex items-center justify-center w-12 h-12 rounded-pill bg-surface-2">
              <Icon name="file-text" size={20} color="var(--color-text-tertiary)" />
            </span>
            <p className="m-0 text-label text-muted max-w-[52ch]">
              Selecione uma conta bancária e um mês para carregar os lançamentos.
            </p>
          </div>
        </Card>
      ) : (
        <>
          {semCodigoDaConta && (
            <Aviso
              tom="negativo"
              titulo="A conta bancária não tem código contábil do Domínio"
              texto={`Em partidas simples a conta bancária é a contrapartida FIXA de todos os lançamentos — sem o código dela o Domínio não sabe de onde o dinheiro saiu. Preencha "Código contábil (Domínio)" no cadastro da conta${contaEscolhida ? ` "${contaEscolhida.name}"` : ""}.`}
            />
          )}

          {pendencias.length > 0 && (
            <Aviso
              tom="alerta"
              titulo={`${pendencias.length} lançamento${pendencias.length > 1 ? "s ficaram" : " ficou"} de fora`}
              texto="Um lançamento sem código contábil não sai com o campo em branco: ele fica FORA do arquivo. O Domínio aceitaria a linha vazia e jogaria o valor numa conta transitória — o mês fecharia, o total bateria, e o erro só apareceria no balancete."
            >
              <ul className="m-0 mt-2 pl-4 flex flex-col gap-1">
                {pendencias.slice(0, 8).map((p) => (
                  <li key={p.movimentoId} className="text-caption text-muted">
                    <span className="text-ink">{p.descricao}</span> — {p.motivo}
                  </li>
                ))}
                {pendencias.length > 8 && (
                  <li className="text-caption text-faint">e mais {pendencias.length - 8}…</li>
                )}
              </ul>
            </Aviso>
          )}

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Kpi rotulo="Lançamentos" valor={String(conferencia.lancamentos)} />
            <Kpi rotulo="Débitos (saídas)" node={<BRL value={conferencia.debitos} />} />
            <Kpi rotulo="Créditos (entradas)" node={<BRL value={conferencia.creditos} />} />
            <Kpi rotulo="Líquido do período" node={<BRL value={conferencia.liquido} />} />
          </div>

          <Card>
            <div className="flex flex-col gap-4">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex flex-col gap-1">
                  <span className="text-h3 font-semibold text-ink">Lançamentos para conferência</span>
                  <span className="text-caption text-faint">
                    Layout do arquivo: <span className="tabular-nums">{LAYOUT_DOMINIO}</span>
                  </span>
                </div>
                <Button variant="primary" disabled={linhas.length === 0} onClick={baixar}>
                  <Icon name="arrow-down-to-line" size={15} color="currentColor" />
                  Gerar lanctos.txt
                </Button>
              </div>

              {linhas.length === 0 ? (
                <p className="m-0 py-10 text-center text-label text-muted">
                  Nenhum lançamento liquidado nesta conta em {rotuloMes(mes)}.
                </p>
              ) : (
                <>
                  <div className="overflow-x-auto -mx-6">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="border-b border-border-soft">
                          <Th>Data</Th>
                          <Th>Conta contábil</Th>
                          <Th>D/C</Th>
                          <Th>Histórico</Th>
                          <Th>Centro de custo</Th>
                          <Th direita>Valor</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {linhas.slice(0, 200).map((l) => (
                          <tr key={l.id} className="border-b border-border-soft last:border-0">
                            <td className="px-6 py-2 text-label text-muted tabular-nums">{fmtDia(l.data)}</td>
                            <td className="px-6 py-2 text-label text-ink tabular-nums">{l.conta}</td>
                            <td className="px-6 py-2 text-label text-muted">{l.natureza}</td>
                            <td className="px-6 py-2 text-label text-ink">{campoDominio(l.historico)}</td>
                            <td className="px-6 py-2 text-label text-muted tabular-nums">{l.centroCusto || "—"}</td>
                            <td className="px-6 py-2 text-right text-label text-ink tabular-nums"><BRL value={l.valor} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {linhas.length > 200 && (
                    <p className="m-0 text-caption text-faint">
                      Mostrando 200 de {linhas.length} — o arquivo sai completo.
                    </p>
                  )}

                  <div className="flex flex-col gap-2">
                    <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-faint">
                      Prévia do arquivo
                    </span>
                    <pre className="m-0 p-4 rounded-md bg-surface-2 text-caption text-ink tabular-nums overflow-x-auto">
{gerarLanctosTxt(linhas.slice(0, 4)).trimEnd() || "—"}
                    </pre>
                    <p className="m-0 text-caption text-faint max-w-[82ch]">
                      O arquivo sai em <strong>ANSI (Windows-1252)</strong> com quebras CRLF — o Domínio
                      lê ANSI, e um arquivo UTF-8 faz cada acento chegar como dois caracteres de lixo
                      no histórico de todos os lançamentos. A <strong>ordem dos campos varia entre
                      versões do Domínio</strong>: confira esta prévia contra a tela de importação do
                      escritório antes do primeiro envio.
                    </p>
                  </div>
                </>
              )}
            </div>
          </Card>
        </>
      )}
      {node}
    </div>
  );
}

/* --------------------------------- peças --------------------------------- */

function Seta({ label, icone, onClick }: { label: string; icone: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick} aria-label={label}
      className="inline-flex items-center justify-center w-8 h-8 rounded-md text-muted hover:text-ink hover:bg-surface-2 transition-colors"
    >
      <Icon name={icone} size={15} color="currentColor" />
    </button>
  );
}

function Kpi({ rotulo, valor, node }: { rotulo: string; valor?: string; node?: React.ReactNode }) {
  return (
    <Card>
      <div className="flex flex-col gap-2">
        <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-faint">{rotulo}</span>
        <span className="text-[20px] leading-none font-semibold text-ink tabular-nums">{node ?? valor}</span>
      </div>
    </Card>
  );
}

function Aviso({
  tom, titulo, texto, children,
}: { tom: "alerta" | "negativo"; titulo: string; texto: string; children?: React.ReactNode }) {
  const cor = tom === "negativo" ? "var(--color-negative)" : "var(--color-warning)";
  return (
    <Card>
      <div className="flex items-start gap-3">
        <Icon name="triangle-alert" size={17} color={cor} />
        <div className="flex flex-col gap-1 min-w-0">
          <span className="text-label font-medium text-ink">{titulo}</span>
          <span className="text-caption text-muted max-w-[86ch]">{texto}</span>
          {children}
        </div>
      </div>
    </Card>
  );
}

function Th({ children, direita }: { children: React.ReactNode; direita?: boolean }) {
  return (
    <th className={`px-6 py-2 text-[11px] font-medium uppercase tracking-[0.08em] text-faint ${direita ? "text-right" : "text-left"}`}>
      {children}
    </th>
  );
}
