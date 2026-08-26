"use client";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EXPORTAÇÃO PARA O CONTADOR — dois arquivos, e o número antes do download
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ **ESTA TELA NÃO CALCULA NADA.** Ela chama `montarDRE` — a MESMA função que
 * desenha a tabela do DRE — e passa o resultado para `montarExportacao`, que só
 * reescreve em linhas. Não há segunda consulta, segunda classificação nem
 * segundo cálculo de sinal em lugar nenhum do caminho; é a regra que o
 * `CLAUDE.md` escreve como *"duas fontes para um fato é um defeito agendado"*, e
 * uma exportação é onde ela é mais fácil de quebrar e mais cara quando quebra:
 * o arquivo SAI DA EMPRESA e quem encontra a divergência é o contador.
 *
 * ⚠️ **O NÚMERO APARECE ANTES DO BOTÃO.** Quantos lançamentos, quanto soma, e
 * qual o resultado — porque exportar o período errado é o tipo de erro que só
 * se descobre depois, do outro lado. E se o razão não fechar com o DRE, o
 * download não é oferecido: a tela diz qual linha diverge.
 *
 * ⚠️ **A geração do ARQUIVO é do servidor** (`POST /api/exportar`). O que sobe
 * são as LINHAS já montadas — o servidor vira bytes de planilha, não vira
 * fonte de número.
 */
import * as React from "react";
import { Button, Card, Checkbox, Icon, Select, Skeleton, StatusBadge } from "@/components/ui";
import { formatBRL, dataBR } from "@/lib/format";
import { useRiscoInput } from "@/components/visao-geral/hooks";
import { montarDRE, fimDoMes, deslocarMes, type Relatorio } from "@/core/relatorios";
import {
  montarExportacao, conferirFechamento,
  type CabecalhoExportacao, type Exportacao,
} from "@/core/exportacao";
import { situacaoDe, ehConfirmado, type VisaoRelatorio } from "@/core/central";
import { linhasDeCategoria } from "@/lib/registros";
import { getLinhasDeCategoria } from "@/lib/data";

import { loadCompany, getOrganizationName } from "@/lib/company";

type Preset = "mes" | "trimestre" | "ano" | "livre";

const mesAtual = () => new Date().toISOString().slice(0, 7);

/** O intervalo de cada preset. Trimestre e ano terminam no mês escolhido. */
function intervaloDe(preset: Preset, mes: string, de: string, ate: string) {
  if (preset === "livre") return { de, ate };
  if (preset === "mes") return { de: `${mes}-01`, ate: fimDoMes(mes) };
  const meses = preset === "trimestre" ? 2 : 11;
  return { de: `${deslocarMes(mes, -meses)}-01`, ate: fimDoMes(mes) };
}

const REGIME_TRIBUTARIO: Record<string, string> = {
  simples: "Simples Nacional",
  presumido: "Lucro Presumido",
  real: "Lucro Real",
  mei: "MEI",
};

export function ExportarView() {
  const { data: input, isLoading } = useRiscoInput();

  const [preset, setPreset] = React.useState<Preset>("mes");
  const [mes, setMes] = React.useState(mesAtual);
  const [de, setDe] = React.useState(`${mesAtual()}-01`);
  const [ate, setAte] = React.useState(fimDoMes(mesAtual()));
  const [regime, setRegime] = React.useState<"competencia" | "caixa">("competencia");
  const [visao, setVisao] = React.useState<VisaoRelatorio>("com-previsto");
  const [incluiCancelados, setIncluiCancelados] = React.useState(false);
  const [baixando, setBaixando] = React.useState<string | null>(null);
  const [erro, setErro] = React.useState<string | null>(null);

  /*
   * ⚠️ A linha DECLARADA de cada categoria — a MESMA leitura que o DRE faz, com
   * a mesma precedência (o local vence o banco). Ler diferente aqui faria o
   * arquivo classificar diferente da tela, que é o defeito inteiro.
   */
  const [linhaPorCategoria, setLinhaPorCategoria] = React.useState<Record<string, string>>({});
  React.useEffect(() => {
    const local = linhasDeCategoria();
    setLinhaPorCategoria(local);
    getLinhasDeCategoria()
      .then((doBanco) => setLinhaPorCategoria({ ...doBanco, ...local }))
      .catch(() => { /* sem banco, o local basta */ });
  }, []);

  const [empresa, setEmpresa] = React.useState("Minha empresa");
  React.useEffect(() => {
    const db = loadCompany()?.db as Record<string, unknown> | undefined;
    const razao = typeof db?.razaoSocial === "string" ? db.razaoSocial.trim() : "";
    if (razao) { setEmpresa(razao); return; }
    void getOrganizationName().then((n: string | null) => { if (n) setEmpresa(n); });
  }, []);

  const intervalo = React.useMemo(() => intervaloDe(preset, mes, de, ate), [preset, mes, de, ate]);
  const invertido = intervalo.de > intervalo.ate;

  const inputDaVisao = React.useMemo(() => {
    if (!input) return input;
    if (visao === "com-previsto") return input;
    return { ...input, movements: input.movements.filter((m) => ehConfirmado(situacaoDe(m as never))) };
  }, [input, visao]);

  const relatorio: Relatorio | null = React.useMemo(() => {
    if (!inputDaVisao || invertido) return null;
    return montarDRE(inputDaVisao, {
      intervalo, tipo: "vertical", linhaPorCategoria,
      ...(regime === "caixa" ? { regime: "caixa" as const } : {}),
    } as never);
  }, [inputDaVisao, intervalo, linhaPorCategoria, regime, invertido]);

  const exportacao: Exportacao | null = React.useMemo(() => {
    if (!relatorio || !inputDaVisao) return null;
    const db = loadCompany()?.db as Record<string, unknown> | undefined;
    const cnpj = typeof db?.cnpj === "string" && db.cnpj.trim() ? db.cnpj.trim() : null;
    const trib = String(db?.regimeTributario ?? db?.regime ?? "").toLowerCase();
    const cabecalho: CabecalhoExportacao = {
      empresa,
      cnpj,
      regimeTributario: REGIME_TRIBUTARIO[
        Object.keys(REGIME_TRIBUTARIO).find((k) => trib.includes(k)) ?? ""
      ] ?? null,
      regime,
      periodoDe: intervalo.de,
      periodoAte: intervalo.ate,
      // ⚠️ Carimbada no momento do clique, não na montagem: uma tela aberta de
      // manhã e exportada à tarde carimbaria a manhã.
      geradoEm: new Date().toISOString(),
      visao: visao === "com-previsto" ? "com-previsto" : "so-confirmado",
      incluiCancelados,
    };
    return montarExportacao(
      relatorio, inputDaVisao.movements, cabecalho,
      (id) => inputDaVisao.partyNames?.[id ?? ""] ?? String(id ?? ""),
    );
  }, [relatorio, inputDaVisao, empresa, regime, intervalo, visao, incluiCancelados]);

  const divergencias = React.useMemo(
    () => (exportacao ? conferirFechamento(exportacao) : []),
    [exportacao],
  );

  async function baixar(formato: "xlsx" | "csv", arquivo?: "razao" | "dre") {
    if (!exportacao) return;
    setErro(null);
    setBaixando(`${formato}:${arquivo ?? ""}`);
    try {
      const r = await fetch("/api/exportar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ exportacao, formato, arquivo }),
      });
      if (!r.ok) {
        const j = (await r.json().catch(() => null)) as { erro?: string } | null;
        throw new Error(j?.erro ?? `O servidor recusou o arquivo (${r.status}).`);
      }
      const blob = await r.blob();
      const nome = /filename="([^"]+)"/.exec(r.headers.get("content-disposition") ?? "")?.[1]
        ?? `all4pay_${arquivo ?? "contador"}.${formato}`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = nome;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setBaixando(null);
    }
  }

  if (isLoading) return <Skeleton className="h-64" />;

  const pronto = !!exportacao && divergencias.length === 0 && !invertido;

  return (
    <div className="flex flex-col gap-6">
      <Card
        info={{
          oQue: "Gera os dois arquivos que o contador pede: o razão, com um lançamento por linha, e o DRE consolidado do período.",
          comoCalcula: "Os dois saem da MESMA função que monta o DRE na tela (montarDRE). A exportação não refaz conta nenhuma — ela reescreve o relatório em linhas, e confere que o razão somado por linha reproduz o consolidado antes de liberar o download.",
        }}
      >
        <h2 className="text-h2">Período</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Select
            label="Recorte"
            value={preset}
            onChange={(v) => setPreset(v as Preset)}
            options={[
              { value: "mes", label: "Mês" },
              { value: "trimestre", label: "Trimestre (3 meses até o mês escolhido)" },
              { value: "ano", label: "Ano (12 meses até o mês escolhido)" },
              { value: "livre", label: "Intervalo livre" },
            ]}
          />

          {preset === "livre" ? (
            <>
              <label className="flex flex-col gap-1 text-caption text-muted">
                De
                <input type="date" value={de} onChange={(e) => setDe(e.target.value)}
                  className="rounded-md border border-border bg-white px-3 py-2 text-body text-ink" />
              </label>
              <label className="flex flex-col gap-1 text-caption text-muted">
                Até
                <input type="date" value={ate} onChange={(e) => setAte(e.target.value)}
                  className="rounded-md border border-border bg-white px-3 py-2 text-body text-ink" />
              </label>
            </>
          ) : (
            <label className="flex flex-col gap-1 text-caption text-muted">
              Mês de referência
              <input type="month" value={mes} onChange={(e) => setMes(e.target.value)}
                className="rounded-md border border-border bg-white px-3 py-2 text-body text-ink" />
            </label>
          )}

          <Select
            label="Regime"
            value={regime}
            onChange={(v) => setRegime(v as "competencia" | "caixa")}
            options={[
              { value: "competencia", label: "Competência — quando o fato aconteceu" },
              { value: "caixa", label: "Caixa — quando o dinheiro andou" },
            ]}
          />

          <Select
            label="Títulos"
            value={visao}
            onChange={(v) => setVisao(v as VisaoRelatorio)}
            options={[
              { value: "com-previsto", label: "Com previstos" },
              { value: "confirmado", label: "Só confirmados" },
            ]}
          />
        </div>

        <div className="mt-4">
          {/*
            * ⚠️ Sumir com o cancelado sem dizer é ESCONDER, não limpar. Ele fica
            * fora por padrão (é o que o DRE faz), entra a pedido, e mesmo assim
            * NÃO soma — a coluna "No DRE" diz "Não" e o motivo vem escrito.
            */}
          <Checkbox
            label="Listar também os lançamentos cancelados (marcados, e sem somar no resultado)"
            checked={incluiCancelados}
            onChange={(e) => setIncluiCancelados(e.target.checked)}
          />
        </div>

        {/* ⚠️ `dataBR` FATIA a string. `new Date("2026-08-01")` é meia-noite UTC,
            e em UTC−3 o dia 1º vira o último do mês anterior — a regra de fuso
            do `lib/format`. */}
        <p className="mt-3 text-caption text-muted">
          {dataBR(intervalo.de)} a {dataBR(intervalo.ate)}
        </p>
      </Card>

      {invertido && (
        <Card>
          <StatusBadge tone="warning">Intervalo invertido</StatusBadge>
          <p className="mt-2 text-body text-muted">
            A data inicial é posterior à final. Um intervalo que não existe devolveria
            um arquivo vazio, e vazio se lê como &ldquo;não houve movimento&rdquo;.
          </p>
        </Card>
      )}

      {exportacao && !invertido && (
        <Card>
          <h2 className="text-h2">O que vai no arquivo</h2>
          <div className="mt-4 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <Numero rotulo="Lançamentos" valor={String(exportacao.resumo.movimentos)} />
            <Numero rotulo="No DRE" valor={String(exportacao.resumo.movimentosNoDre)} />
            <Numero
              rotulo="Fora do DRE"
              valor={String(exportacao.resumo.movimentosForaDoDre)}
              nota="listados, com o motivo, e sem somar"
            />
            <Numero rotulo="Resultado líquido" valor={formatBRL(exportacao.resumo.resultado)} />
          </div>
          {exportacao.resumo.movimentos === 0 && (
            <p className="mt-4 text-body text-muted">
              Nenhum lançamento neste período. Um arquivo vazio não é erro — mas
              confira o recorte antes de enviá-lo ao contador.
            </p>
          )}
        </Card>
      )}

      {divergencias.length > 0 && (
        <Card>
          <StatusBadge tone="warning">O razão não fecha com o DRE</StatusBadge>
          <p className="mt-2 text-body text-muted">
            O download está bloqueado. Somar o razão por linha tem de reproduzir o
            consolidado — é a primeira conta que o contador faz, e ele não pode ser
            o primeiro a ver a diferença.
          </p>
          <ul className="mt-3 flex flex-col gap-1">
            {divergencias.map((d) => (
              <li key={d.linhaId} className="text-caption text-ink">
                <strong>{d.label}</strong> — DRE {formatBRL(d.noDre)} × razão{" "}
                {formatBRL(d.noRazao)} · diferença {formatBRL(d.diferenca)}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <h2 className="text-h2">Baixar</h2>
        <p className="mt-1 text-caption text-muted">
          O XLSX traz as duas abas (Razão e DRE). O CSV sai um arquivo por vez.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button onClick={() => baixar("xlsx")} disabled={!pronto || !!baixando}>
            <Icon name="download" className="mr-2" />
            {baixando === "xlsx:" ? "Gerando…" : "XLSX (razão + DRE)"}
          </Button>
          <Button variant="secondary" onClick={() => baixar("csv", "razao")} disabled={!pronto || !!baixando}>
            {baixando === "csv:razao" ? "Gerando…" : "CSV do razão"}
          </Button>
          <Button variant="secondary" onClick={() => baixar("csv", "dre")} disabled={!pronto || !!baixando}>
            {baixando === "csv:dre" ? "Gerando…" : "CSV do DRE"}
          </Button>
        </div>
        {erro && <p className="mt-3 text-caption text-negative">{erro}</p>}
        <p className="mt-4 text-caption text-faint">
          Os dois arquivos abrem com o cabeçalho da empresa, o período, o regime e a
          data de geração — o contador precisa saber sob que premissa os números
          foram montados.
        </p>
      </Card>
    </div>
  );
}

function Numero({ rotulo, valor, nota }: { rotulo: string; valor: string; nota?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="a4p-label text-muted">{rotulo}</span>
      <span className="text-h2 text-ink tabular-nums">{valor}</span>
      {nota && <span className="text-caption text-faint">{nota}</span>}
    </div>
  );
}
