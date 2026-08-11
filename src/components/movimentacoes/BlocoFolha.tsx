"use client";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O BLOCO DE FOLHA do formulário de nova conta a pagar.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ **Ele mostra a conta ANTES de salvar, e é essa a razão de existir.**
 *
 * O dono digita "5.000" achando que lançou uma despesa de 5.000. O bloco
 * responde, na hora: no seu regime isso custa R$ 6.450 ou R$ 8.122 por mês,
 * gera três títulos em duas datas, e mais duas parcelas de 13º em novembro e
 * dezembro. Guardar essa informação para depois do "salvar" transformaria a
 * tela num formulário que esconde o número que decide a contratação.
 *
 * A tela não calcula nada — tudo vem de `core/folha`.
 */
import * as React from "react";
import { Card, Input, Select, DateField, CurrencyInput, BRL, Icon } from "@/components/ui";
import { formatBRL, dataBR, pct } from "@/lib/format";
import { ROTULO_REGIME, type Regime, type Anexo } from "@/core/fiscal/perfil";
import {
  calcularCLT, calcularPJ, titulosDaCompetencia, titulosDoDecimo, compararVinculo,
  ROTULO_VINCULO, EXPLICACAO_VINCULO, ROTULO_TITULO,
  type Vinculo, type Colaborador,
} from "@/core/folha";

export interface DadosFolha {
  vinculo: Vinculo;
  nome: string;
  documento: string;
  cargo: string;
  dependentes: number;
  valeTransporte: number;
  valeRefeicao: number;
  planoSaude: number;
  pensao: number;
  outrosDescontos: number;
  /** Competência inicial "YYYY-MM". */
  desde: string;
  /** Quantas competências gerar de uma vez. */
  competencias: number;
}

export const FOLHA_PADRAO = (mes: string): DadosFolha => ({
  vinculo: "clt", nome: "", documento: "", cargo: "",
  dependentes: 0, valeTransporte: 0, valeRefeicao: 0, planoSaude: 0, pensao: 0,
  outrosDescontos: 0, desde: mes, competencias: 12,
});

const VINCULOS: Vinculo[] = ["clt", "pj"];

/** Monta o `Colaborador` que o motor consome, a partir do formulário. */
export function colaboradorDe(d: DadosFolha, valor: number, centroCusto?: string | null): Colaborador {
  return {
    id: `col_${Date.now().toString(36)}`,
    nome: d.nome.trim() || "Colaborador",
    vinculo: d.vinculo,
    documento: d.documento.replace(/\D/g, "") || null,
    cargo: d.cargo.trim() || null,
    valor,
    desde: d.desde,
    dependentes: d.dependentes,
    valeTransporte: d.valeTransporte,
    valeRefeicao: d.valeRefeicao,
    planoSaude: d.planoSaude,
    pensao: d.pensao,
    outrosDescontos: d.outrosDescontos,
    centroCusto: centroCusto ?? null,
  };
}

/** Desloca uma competência "YYYY-MM". */
export function deslocar(mes: string, n: number): string {
  const [a, m] = mes.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * TODOS os títulos que o cadastro vai criar — as N competências mais o 13º dos
 * anos abrangidos.
 *
 * ⚠️ O 13º entra aqui e não em cada competência: ele é UM par de títulos por
 * ANO, não um por mês. Gerá-lo doze vezes criaria vinte e quatro parcelas de
 * 13º no fluxo de caixa.
 */
export function titulosDoCadastro(
  c: Colaborador, competencias: number, regime: Regime, anexo: Anexo | null,
) {
  const meses = Array.from({ length: Math.max(1, competencias) }, (_, k) => deslocar(c.desde, k));
  const titulos = meses.flatMap((m) => titulosDaCompetencia(c, m, regime, anexo));
  const anos = Array.from(new Set(meses.map((m) => Number(m.slice(0, 4)))));
  const decimos = anos.flatMap((a) => titulosDoDecimo(c, a, regime, anexo));
  return [...titulos, ...decimos].sort((a, b) => a.vencimento.localeCompare(b.vencimento));
}

/* ========================================================================== */

export function BlocoFolha({
  dados, onDados, valor, regime, anexo,
}: {
  dados: DadosFolha;
  onDados: (d: DadosFolha) => void;
  valor: number;
  regime: Regime;
  anexo: Anexo | null;
}) {
  const set = <K extends keyof DadosFolha>(k: K, v: DadosFolha[K]) => onDados({ ...dados, [k]: v });
  const clt = dados.vinculo === "clt";

  const colab = React.useMemo(() => colaboradorDe(dados, valor), [dados, valor]);
  const calculo = React.useMemo(
    () => (clt ? calcularCLT(colab, dados.desde, regime, anexo) : null),
    [clt, colab, dados.desde, regime, anexo],
  );
  const calculoPJ = React.useMemo(
    () => (clt ? null : calcularPJ(colab, dados.desde)),
    [clt, colab, dados.desde],
  );
  const titulos = React.useMemo(
    () => (valor > 0 ? titulosDoCadastro(colab, dados.competencias, regime, anexo) : []),
    [colab, dados.competencias, regime, anexo, valor],
  );
  const comparacao = React.useMemo(
    () => (valor > 0 ? compararVinculo(valor, dados.desde, regime, anexo) : null),
    [valor, dados.desde, regime, anexo],
  );

  return (
    <>
      {/* ---------------------------- o vínculo ---------------------------- */}
      <Card className="lg:col-span-2">
        <span className="text-h3 text-ink">Tipo de contratação</span>
        <div role="radiogroup" aria-label="Tipo de contratação" className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {VINCULOS.map((v) => {
            const on = v === dados.vinculo;
            return (
              <button
                key={v}
                type="button" role="radio" aria-checked={on}
                onClick={() => set("vinculo", v)}
                className={
                  "flex flex-col items-start gap-1 text-left rounded-card p-4 transition-colors "
                  + (on ? "bg-ink text-white" : "bg-surface-2 text-ink hover:bg-surface-3")
                }
              >
                <span className="flex items-center gap-2 text-label font-medium">
                  <span aria-hidden className={"inline-flex items-center justify-center w-4 h-4 rounded-pill border " + (on ? "border-white" : "border-border")}>
                    {on && <span className="w-2 h-2 rounded-pill bg-white" />}
                  </span>
                  {ROTULO_VINCULO[v]}
                </span>
                <span className={"text-caption " + (on ? "text-white/70" : "text-muted")}>
                  {EXPLICACAO_VINCULO[v]}
                </span>
              </button>
            );
          })}
        </div>

        {/* ⚠️ O REGIME É DITO, não escondido. Ele decide se os 20% patronais
            entram no custo, e a diferença entre Simples III e Presumido é de
            33 pontos percentuais sobre a mesma folha. Um número de custo sem
            dizer sob que regime foi apurado não dá para conferir. */}
        {clt && (
          <p className="m-0 mt-3 text-caption text-muted">
            Apurado no regime <b className="text-ink">{ROTULO_REGIME[regime]}</b>
            {anexo ? ` · Anexo ${anexo}` : ""} — {calculo?.encargos.porque}
            {regime === "nao_declarado" && (
              <> <b className="text-warning">Declare o regime em Configurações para o custo sair certo.</b></>
            )}
          </p>
        )}
      </Card>

      {/* ---------------------------- os dados ----------------------------- */}
      <Card>
        <span className="text-h3 text-ink">{clt ? "Funcionário" : "Prestador"}</span>
        <div className="flex flex-col gap-4 mt-3">
          <Campo label="Nome">
            <Input value={dados.nome} onChange={(e) => set("nome", e.target.value)} placeholder="Como aparece no contrato" />
          </Campo>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Campo label={clt ? "CPF" : "CNPJ"}>
              <Input value={dados.documento} onChange={(e) => set("documento", e.target.value)} />
            </Campo>
            <Campo label="Cargo">
              <Input value={dados.cargo} onChange={(e) => set("cargo", e.target.value)} />
            </Campo>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Campo label="Primeira competência" ajuda="O mês em que ele começa a custar.">
              <Input type="month" value={dados.desde} onChange={(e) => set("desde", e.target.value)} />
            </Campo>
            <Campo label="Quantos meses gerar" ajuda="Os títulos podem ser estendidos depois.">
              <Input
                type="number" min={1} max={36}
                value={String(dados.competencias)}
                onChange={(e) => set("competencias", Number(e.target.value) || 0)}
              />
            </Campo>
          </div>
        </div>
      </Card>

      {/* ------------------------- descontos (só CLT) ------------------------ */}
      {clt ? (
        <Card>
          <span className="text-h3 text-ink">Descontos do funcionário</span>
          {/* ⚠️ Estes valores SAEM do salário — não são custo a mais da empresa.
              Somá-los ao custo é o engano que faz um vale-transporte de R$ 200
              parecer R$ 200 de despesa nova. */}
          <p className="m-0 mt-1 text-caption text-muted">
            Saem do salário bruto. Não aumentam o custo da empresa.
          </p>
          <div className="flex flex-col gap-4 mt-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Campo label="Dependentes" ajuda="Reduzem a base do IRRF.">
                <Input
                  type="number" min={0} max={20}
                  value={String(dados.dependentes)}
                  onChange={(e) => set("dependentes", Number(e.target.value) || 0)}
                />
              </Campo>
              <Campo label="Vale-transporte">
                <CurrencyInput value={dados.valeTransporte} onValueChange={(v) => set("valeTransporte", v)} />
              </Campo>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Campo label="Vale-refeição">
                <CurrencyInput value={dados.valeRefeicao} onValueChange={(v) => set("valeRefeicao", v)} />
              </Campo>
              <Campo label="Plano de saúde">
                <CurrencyInput value={dados.planoSaude} onValueChange={(v) => set("planoSaude", v)} />
              </Campo>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Campo label="Pensão alimentícia" ajuda="Também deduz da base do IRRF.">
                <CurrencyInput value={dados.pensao} onValueChange={(v) => set("pensao", v)} />
              </Campo>
              <Campo label="Outros descontos">
                <CurrencyInput value={dados.outrosDescontos} onValueChange={(v) => set("outrosDescontos", v)} />
              </Campo>
            </div>
          </div>
        </Card>
      ) : (
        <Card>
          <span className="text-h3 text-ink">Retenções</span>
          <p className="m-0 mt-1 text-caption text-muted">
            Calculadas sobre o valor da nota. Saem do que o prestador recebe, não do que a empresa gasta.
          </p>
          {calculoPJ && valor > 0 && (
            <div className="mt-3 flex flex-col gap-2">
              {calculoPJ.memoria.map((l) => (
                <div key={l.passo} className="flex items-start justify-between gap-3 text-caption">
                  <span className="min-w-0">
                    <span className="block text-ink">{l.descricao}</span>
                    <span className="block text-faint">{l.formula}</span>
                  </span>
                  <span className="a4p-num text-ink shrink-0"><BRL value={l.valor} /></span>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* --------------------- o que isso custa de verdade ------------------- */}
      {valor > 0 && calculo && (
        <Card className="lg:col-span-2">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <span className="text-h3 text-ink">O que este funcionário custa</span>
            {calculo.tabelas.desatualizada && (
              /* ⚠️ A MARCA QUE SEPARA "certo" de "com cara de certo". As faixas
                 do INSS e do IRRF mudam por lei todo ano; o cálculo continua
                 rodando com a tabela velha e o resultado sai bem formatado. */
              <span className="inline-flex items-center gap-1 text-caption text-warning">
                <Icon name="triangle-alert" size={13} color="currentColor" />
                Tabela legal de {calculo.tabelas.mesesDeAtraso} meses atrás — confira com o contador
              </span>
            )}
          </div>

          <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Numero rotulo="O funcionário recebe" valor={calculo.liquido} detalhe="líquido, depois dos descontos" />
            <Numero rotulo="Salário bruto" valor={calculo.bruto} detalhe="o que se costuma chamar de salário" />
            <Numero
              rotulo="A empresa gasta"
              valor={calculo.custoTotal}
              detalhe={`${calculo.multiplicador.toFixed(2)}× o bruto, com encargos e provisões`}
              forte
            />
          </div>

          <details className="mt-4 group">
            <summary className="cursor-pointer text-caption text-muted hover:text-ink list-none inline-flex items-center gap-1">
              <Icon name="chevron-down" size={13} color="currentColor" />
              Ver a conta passo a passo
            </summary>
            <div className="mt-3 flex flex-col gap-2 border-t border-border-soft pt-3">
              {calculo.memoria.map((l) => (
                <div key={l.passo} className="flex items-start justify-between gap-3 text-caption">
                  <span className="min-w-0">
                    <span className="block text-ink">{l.descricao}</span>
                    <span className="block text-faint">{l.formula}</span>
                  </span>
                  <span className="a4p-num text-ink shrink-0"><BRL value={l.valor} /></span>
                </div>
              ))}
            </div>
          </details>

          {comparacao && (
            <div className="mt-4 pt-4 border-t border-border-soft">
              <p className="m-0 text-caption text-muted">
                Pelo mesmo valor bruto, um CLT custa{" "}
                <b className="text-ink">{formatBRL(comparacao.clt)}</b> e um PJ custa{" "}
                <b className="text-ink">{formatBRL(comparacao.pj)}</b> — {pct(comparacao.percentual / 100)} de diferença.
              </p>
              {/* ⚠️ O número NUNCA sai sozinho. A escolha entre CLT e PJ é
                  jurídica, não financeira, e um percentual sem esta frase é um
                  convite à pejotização. */}
              <p className="m-0 mt-2 text-caption text-warning">{comparacao.alerta}</p>
            </div>
          )}
        </Card>
      )}

      {/* -------------------- os títulos que vão ser criados ----------------- */}
      {titulos.length > 0 && (
        <Card className="lg:col-span-2">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <span className="text-h3 text-ink">O que vai ser criado</span>
            <span className="text-caption text-muted">
              {titulos.length} títulos ·{" "}
              <b className="text-ink"><BRL value={titulos.reduce((s, t) => s + t.valor, 0)} /></b> no total
            </span>
          </div>
          {/* ⚠️ TRÊS títulos por mês, não um — e é ver isso antes de salvar que
              muda a leitura de "folha" de uma linha para uma agenda. */}
          <p className="m-0 mt-1 text-caption text-muted">
            {dados.vinculo === "clt"
              ? "Salário no 5º dia útil, FGTS e DARF no dia 20, mais as duas parcelas do 13º."
              : "Uma nota por mês, no 5º dia útil."}
          </p>
          <div
            tabIndex={0} role="region" aria-label="Títulos que serão criados"
            className="mt-3 flex flex-col max-h-[260px] overflow-y-auto border-t border-border-soft pt-3"
          >
            {titulos.slice(0, 40).map((t, k) => (
              <div key={`${t.tipo}-${t.competencia}-${k}`}
                className="flex items-center justify-between gap-3 py-[6px] border-b border-border-soft last:border-b-0">
                <span className="min-w-0 flex-1">
                  <span className="block text-caption text-ink truncate">{t.descricao}</span>
                  <span className="block text-caption text-faint">
                    {ROTULO_TITULO[t.tipo]} · vence {dataBR(t.vencimento)}
                  </span>
                </span>
                <span className="a4p-num text-caption text-ink shrink-0"><BRL value={t.valor} /></span>
              </div>
            ))}
            {titulos.length > 40 && (
              <span className="text-caption text-faint text-center pt-2">
                +{titulos.length - 40} títulos
              </span>
            )}
          </div>
        </Card>
      )}
    </>
  );
}

/* --------------------------------- peças --------------------------------- */

function Numero({
  rotulo, valor, detalhe, forte,
}: { rotulo: string; valor: number; detalhe: string; forte?: boolean }) {
  return (
    <div className={"rounded-card p-4 " + (forte ? "bg-ink text-white" : "bg-surface-2")}>
      <span className={"text-caption " + (forte ? "text-white/70" : "text-muted")}>{rotulo}</span>
      <span className={"a4p-num block text-[22px] leading-none mt-2 " + (forte ? "text-white" : "text-ink")}>
        <BRL value={valor} />
      </span>
      <span className={"block text-caption mt-2 " + (forte ? "text-white/70" : "text-faint")}>{detalhe}</span>
    </div>
  );
}

function Campo({ label, ajuda, children }: { label: string; ajuda?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-[6px]">
      <label className="text-caption font-medium text-muted">{label}</label>
      {children}
      {ajuda && <span className="text-caption text-faint">{ajuda}</span>}
    </div>
  );
}
