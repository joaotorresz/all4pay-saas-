"use client";

/**
 * Importação em lote — contas a receber, contas a pagar e transferências.
 *
 * O fluxo é: baixar o modelo → preencher → subir → CONFERIR → confirmar. A
 * conferência não é enfeite: uma planilha com 300 linhas erradas confirmada às
 * cegas custa mais trabalho para desfazer do que o import economizou.
 *
 * A leitura do .xlsx é nossa (`lib/xlsx` `lerXLSX`), sem dependência — usa a
 * `DecompressionStream` do navegador para as entradas comprimidas.
 */
import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, Button, Icon, Select, BRL, Skeleton } from "@/components/ui";
import { useToast } from "@/components/listas/ListChrome";
import { useAccounts } from "@/components/visao-geral/hooks";
import { usePartiesList } from "@/components/lancamentos/hooks";
import { lerXLSX, baixarXLSX } from "@/lib/xlsx";
import { appendImported } from "@/lib/imported";
import { criarTransferencia, novoIdMov } from "@/lib/movimentacoes";
import { isDemo } from "@/lib/demo";

type Tipo = "receber" | "pagar" | "transferencias";

const MODELOS: Record<Tipo, { titulo: string; colunas: string[]; exemplo: (string | number)[][] }> = {
  receber: {
    titulo: "Contas a receber",
    colunas: ["Cliente", "Vencimento", "Valor", "Categoria", "Descrição", "Recebido"],
    exemplo: [["Aurora Varejo", "2026-09-10", 1500, "Vendas", "Pedido 123", "não"]],
  },
  pagar: {
    titulo: "Contas a pagar",
    colunas: ["Fornecedor", "Vencimento", "Valor", "Categoria", "Descrição", "Pago"],
    exemplo: [["Fornecedor X", "2026-09-15", 800, "Fornecedores", "NF 456", "não"]],
  },
  transferencias: {
    titulo: "Transferências",
    colunas: ["Conta de origem", "Conta de destino", "Data", "Valor", "Descrição"],
    exemplo: [["Itaú · Conta Movimento", "Nubank PJ", "2026-09-01", 5000, "Aporte"]],
  },
};

interface LinhaLida {
  n: number;
  campos: string[];
  erro: string | null;
  valor: number;
  data: string;
}

/** "1.234,56" · "1234.56" · "R$1.234,56" → 1234.56 */
function paraNumero(s: string): number {
  const limpo = (s ?? "").replace(/[R$\s]/g, "");
  if (!limpo) return NaN;
  // Se tem vírgula, ela é o decimal (pt-BR) e o ponto é milhar.
  const norm = limpo.includes(",") ? limpo.replace(/\./g, "").replace(",", ".") : limpo;
  return Number(norm);
}

/** "10/09/2026" · "2026-09-10" · serial do Excel → ISO. */
function paraData(s: string): string {
  const t = (s ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(t);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  // O Excel guarda data como número de dias desde 1899-12-30 — sem isto, uma
  // planilha com a coluna formatada como data chegaria como "46000".
  const serial = Number(t);
  if (Number.isFinite(serial) && serial > 20_000 && serial < 80_000) {
    const d = new Date(Date.UTC(1899, 11, 30) + serial * 86_400_000);
    return d.toISOString().slice(0, 10);
  }
  return "";
}

export function ImportacaoView({ tipoInicial = "receber" }: { tipoInicial?: Tipo }) {
  const qc = useQueryClient();
  const { show, node } = useToast();
  const { data: contas } = useAccounts();
  const { data: partes } = usePartiesList();

  const [tipo, setTipo] = React.useState<Tipo>(tipoInicial);
  const [linhas, setLinhas] = React.useState<LinhaLida[] | null>(null);
  const [arquivo, setArquivo] = React.useState("");
  const [lendo, setLendo] = React.useState(false);
  const [erroLeitura, setErroLeitura] = React.useState("");
  const [conta, setConta] = React.useState("");
  const [gravando, setGravando] = React.useState(false);

  const modelo = MODELOS[tipo];
  const nomeConta = (n: string) =>
    (contas?.accounts ?? []).find((c) => c.name.toLowerCase().trim() === n.toLowerCase().trim())?.id ?? null;
  const idParte = (n: string) =>
    (partes ?? []).find((p) => p.name.toLowerCase().trim() === n.toLowerCase().trim())?.id ?? null;

  const validarLinha = (campos: string[], n: number): LinhaLida => {
    const valor = paraNumero(campos[tipo === "transferencias" ? 3 : 2] ?? "");
    const data = paraData(campos[tipo === "transferencias" ? 2 : 1] ?? "");
    let erro: string | null = null;
    if (tipo === "transferencias") {
      if (!campos[0]?.trim()) erro = "Conta de origem em branco.";
      else if (!nomeConta(campos[0])) erro = `Conta de origem "${campos[0]}" não cadastrada.`;
      else if (!campos[1]?.trim()) erro = "Conta de destino em branco.";
      else if (!nomeConta(campos[1])) erro = `Conta de destino "${campos[1]}" não cadastrada.`;
      else if (nomeConta(campos[0]) === nomeConta(campos[1])) erro = "Origem e destino são a mesma conta.";
    } else if (!campos[0]?.trim()) {
      erro = `${tipo === "receber" ? "Cliente" : "Fornecedor"} em branco.`;
    }
    if (!erro && !data) erro = "Data inválida.";
    if (!erro && (!Number.isFinite(valor) || valor <= 0)) erro = "Valor inválido.";
    return { n, campos, erro, valor: Number.isFinite(valor) ? valor : 0, data };
  };

  const carregar = async (arq: File) => {
    setArquivo(arq.name);
    setErroLeitura("");
    setLendo(true);
    try {
      const matriz = await lerXLSX(arq);
      if (matriz.length < 2) {
        setErroLeitura("A planilha não tem linhas de dados abaixo do cabeçalho.");
        setLinhas([]);
        return;
      }
      // A primeira linha é o cabeçalho do modelo — ignorada de propósito.
      setLinhas(matriz.slice(1)
        .filter((l) => l.some((c) => c.trim()))
        .map((campos, i) => validarLinha(campos, i + 2)));
    } catch (e) {
      const msg = String(e);
      setErroLeitura(msg.includes("sem-decompression-stream")
        ? "O navegador não conseguiu descomprimir o arquivo. Salve a planilha de novo e tente outra vez."
        : "Não foi possível ler o arquivo. Confirme que é um .xlsx válido.");
      setLinhas([]);
    } finally {
      setLendo(false);
    }
  };

  const validas = (linhas ?? []).filter((l) => !l.erro);
  const invalidas = (linhas ?? []).filter((l) => l.erro);
  const total = validas.reduce((s, l) => s + l.valor, 0);

  const confirmar = async () => {
    if (validas.length === 0) return;
    setGravando(true);
    try {
      if (tipo === "transferencias") {
        for (const l of validas) {
          await criarTransferencia({
            id: novoIdMov("tr"),
            contaOrigem: nomeConta(l.campos[0])!,
            contaDestino: nomeConta(l.campos[1])!,
            data: l.data, dataChegada: null, valor: l.valor,
            descricao: l.campos[4] ?? "",
            conciliadaOrigem: false, conciliadaDestino: false,
            criadoEm: new Date().toISOString().slice(0, 10),
          });
        }
      } else if (isDemo) {
        const destino = conta || (contas?.accounts ?? [])[0]?.id;
        validas.forEach((l, k) => {
          const liquidado = /^(sim|s|true|1|x)$/i.test((l.campos[5] ?? "").trim());
          appendImported({
            movement: {
              id: `imp_${Date.now().toString(36)}_${k}`,
              account_id: destino,
              type: tipo === "receber" ? "entrada" : "saida",
              status: liquidado ? "pago" : "pendente",
              amount: l.valor,
              due_date: l.data,
              paid_date: liquidado ? l.data : null,
              reconciled: false,
              category: l.campos[3] || null,
              description: l.campos[4] || null,
              party_id: idParte(l.campos[0]),
            } as never,
          });
        });
      }
      qc.invalidateQueries();
      show(`${validas.length} ${validas.length === 1 ? "registro importado" : "registros importados"}.`);
      setLinhas(null);
      setArquivo("");
    } finally {
      setGravando(false);
    }
  };

  return (
    <div className="flex flex-col gap-5 pb-4">
      <p className="m-0 text-label text-muted">
        Baixe o modelo, preencha a planilha e suba o arquivo. Nada é gravado antes de você conferir.
      </p>

      <Card>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Campo label="O que importar">
            <Select
              value={tipo}
              onChange={(v) => { setTipo(v as Tipo); setLinhas(null); setArquivo(""); }}
              options={[
                { value: "receber", label: "Contas a receber" },
                { value: "pagar", label: "Contas a pagar" },
                { value: "transferencias", label: "Transferências" },
              ]}
            />
          </Campo>
          {tipo !== "transferencias" && (
            <Campo label="Conta bancária de destino" ajuda="Usada quando a planilha não traz a conta.">
              <Select
                value={conta} onChange={setConta}
                placeholder="Primeira conta cadastrada"
                options={(contas?.accounts ?? []).map((c) => ({ value: c.id, label: c.name }))}
              />
            </Campo>
          )}
        </div>

        <div className="flex items-center gap-2 mt-4 pt-4 border-t border-border-soft flex-wrap">
          <Button
            variant="ghost"
            onClick={() => baixarXLSX(`modelo-${tipo}`, [{
              nome: modelo.titulo.slice(0, 31),
              linhas: [modelo.colunas, ...modelo.exemplo],
            }])}
          >
            <Icon name="arrow-down-to-line" size={15} color="currentColor" />
            Baixar modelo (.xlsx)
          </Button>
          <label className="inline-flex items-center gap-2 rounded-pill bg-surface-2 px-4 py-[9px] text-label text-ink cursor-pointer hover:bg-surface-3 transition-colors">
            <Icon name="upload" size={15} color="currentColor" />
            {arquivo || "Selecionar arquivo .xlsx"}
            <input
              type="file" accept=".xlsx" className="hidden"
              onChange={(e) => { const a = e.target.files?.[0]; if (a) carregar(a); }}
            />
          </label>
        </div>
        <p className="m-0 mt-3 text-caption text-faint">
          Colunas esperadas: {modelo.colunas.join(" · ")}. A primeira linha é o cabeçalho.
        </p>
        {erroLeitura && <p className="m-0 mt-2 text-caption text-negative">{erroLeitura}</p>}
      </Card>

      {lendo && <Card><Skeleton className="h-[160px]" /></Card>}

      {linhas && linhas.length > 0 && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Numero label="Linhas lidas" valor={String(linhas.length)} />
            <Numero label="Prontas para importar" valor={String(validas.length)} tom={validas.length ? "positivo" : undefined} />
            <Numero label="Com erro" valor={String(invalidas.length)} tom={invalidas.length ? "negativo" : undefined} />
          </div>

          <Card padded={false} className="overflow-hidden">
            <div className="flex items-center justify-between gap-3 px-6 py-3 border-b border-border-soft flex-wrap">
              <span className="text-label text-muted">
                Total a importar: <b className="text-ink tabular-nums"><BRL value={total} /></b>
              </span>
              <Button variant="primary" disabled={validas.length === 0 || gravando} onClick={confirmar}>
                <Icon name="check" size={15} color="currentColor" />
                {gravando ? "Importando…" : `Importar ${validas.length} ${validas.length === 1 ? "registro" : "registros"}`}
              </Button>
            </div>
            <div className="overflow-x-auto max-h-[460px] overflow-y-auto">
              <table className="w-full border-collapse">
                <thead className="sticky top-0 bg-white">
                  <tr className="border-b border-border-soft">
                    <th className="px-4 py-3 text-left text-[11px] font-medium tracking-[0.08em] text-faint w-[60px]">Linha</th>
                    {modelo.colunas.map((c) => (
                      <th key={c} className="px-4 py-3 text-left text-[11px] font-medium tracking-[0.08em] text-faint">{c}</th>
                    ))}
                    <th className="px-4 py-3 text-left text-[11px] font-medium tracking-[0.08em] text-faint">Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {linhas.map((l) => (
                    <tr key={l.n} className={`border-b border-border-soft last:border-0 ${l.erro ? "bg-negative/[0.04]" : ""}`}>
                      <td className="px-4 py-2 text-caption text-faint tabular-nums">{l.n}</td>
                      {modelo.colunas.map((_, i) => (
                        <td key={i} className="px-4 py-2 text-label text-ink truncate max-w-[24ch]">{l.campos[i] ?? ""}</td>
                      ))}
                      <td className="px-4 py-2">
                        {l.erro
                          ? <span className="text-caption text-negative">{l.erro}</span>
                          : <span className="text-caption text-positive">Pronta</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {invalidas.length > 0 && (
            <Card>
              <div className="flex items-start gap-3">
                <Icon name="triangle-alert" size={16} color="var(--color-warning)" className="mt-[2px] shrink-0" />
                <p className="m-0 text-caption text-muted">
                  As {invalidas.length} linhas com erro são <b className="text-ink">ignoradas</b> na importação — as
                  demais entram normalmente. Corrija a planilha e suba de novo só o que faltou.
                </p>
              </div>
            </Card>
          )}
        </>
      )}
      {node}
    </div>
  );
}

/* --------------------------------- peças --------------------------------- */

function Campo({ label, ajuda, children }: { label: string; ajuda?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-[6px]">
      <label className="text-caption font-medium text-muted">{label}</label>
      {children}
      {ajuda && <span className="text-caption text-faint">{ajuda}</span>}
    </div>
  );
}

function Numero({ label, valor, tom }: { label: string; valor: string; tom?: "positivo" | "negativo" }) {
  const cor = tom === "positivo" ? "text-positive" : tom === "negativo" ? "text-negative" : "text-ink";
  return (
    <Card>
      <span className="text-[11px] font-medium tracking-[0.08em] text-faint">{label}</span>
      <span className={`block mt-2 text-[24px] leading-none font-semibold tabular-nums ${cor}`}>{valor}</span>
    </Card>
  );
}
