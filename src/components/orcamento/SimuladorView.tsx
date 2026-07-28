"use client";

/**
 * Simulador de decisão — "posso comprar?"
 *
 * A tela que responde a pergunta que o dono faz antes de assumir qualquer
 * compromisso: *tenho tanto de caixa e tanto entrando por mês; se eu comprar
 * isso, o que acontece com o meu caixa daqui pra frente?*
 *
 * A situação atual (caixa · entra/mês · sai/mês) NUNCA é digitada: sai dos
 * mesmos lançamentos que alimentam o resto do sistema (`getRiscoInput`), e o
 * usuário pode ajustar se quiser testar outro cenário. O resultado é a projeção
 * mês a mês COM e SEM a compra, o veredito explicado por fatores, e as
 * alternativas com o número de cada uma.
 *
 * Serve PF e PJ com o MESMO motor (`core/aquisicao`) — muda só o vocabulário e
 * os tipos de decisão oferecidos (`PRESETS` filtrados por perfil).
 */
import * as React from "react";
import {
  ResponsiveContainer, ComposedChart, Line, XAxis, YAxis, Tooltip, ReferenceLine,
} from "recharts";
import { Card, BRL, Icon, CurrencyInput, Input, Select, Skeleton, InfoHint } from "@/components/ui";
import { useRiscoInput } from "@/components/visao-geral/hooks";
import { useTipoConta } from "@/components/app/useTipoConta";
import { chartAnim } from "@/lib/chart-anim";
import {
  simularAquisicao, situacaoDe, presetPor, PRESETS, VEREDITO_LABEL,
  type TipoDecisao, type SituacaoAtual, type Veredito, type ResultadoSimulacao,
} from "@/core/aquisicao";

const brl0 = (n: number) => (n < 0 ? "−" : "") + "R$ " + Math.abs(Math.round(n)).toLocaleString("pt-BR");

/** Cor do veredito — status é sinal semântico pequeno, nunca preenchimento. */
const TOM: Record<Veredito, { cor: string; icone: string }> = {
  confortavel: { cor: "var(--color-positive)", icone: "check" },
  aperta: { cor: "var(--color-warning)", icone: "triangle-alert" },
  arriscado: { cor: "var(--color-warning)", icone: "triangle-alert" },
  inviavel: { cor: "var(--color-negative)", icone: "triangle-alert" },
};

export function SimuladorView() {
  const { data: input, isLoading } = useRiscoInput();
  const { pessoal } = useTipoConta();

  // Situação derivada dos dados reais — editável para testar hipóteses.
  const derivada = React.useMemo<SituacaoAtual | null>(
    () => (input ? situacaoDe(input) : null),
    [input],
  );
  const [ajuste, setAjuste] = React.useState<Partial<SituacaoAtual>>({});
  const sit: SituacaoAtual = {
    caixaAtual: ajuste.caixaAtual ?? derivada?.caixaAtual ?? 0,
    receitaMensal: ajuste.receitaMensal ?? derivada?.receitaMensal ?? 0,
    despesaMensal: ajuste.despesaMensal ?? derivada?.despesaMensal ?? 0,
  };

  const presets = React.useMemo(
    () => PRESETS.filter((p) => !p.perfil || p.perfil === (pessoal ? "pessoal" : "empresa")),
    [pessoal],
  );

  const [tipo, setTipo] = React.useState<TipoDecisao>(pessoal ? "veiculo" : "equipamento");
  const preset = presetPor(tipo);
  const [valor, setValor] = React.useState(0);
  const [entrada, setEntrada] = React.useState(0);
  const [parcelas, setParcelas] = React.useState(preset.parcelasPadrao);
  const [taxaPct, setTaxaPct] = React.useState(preset.taxaMensalPadrao * 100);
  const [parcelaInformada, setParcelaInformada] = React.useState(0);
  const [custoExtra, setCustoExtra] = React.useState(0);
  const [receitaExtra, setReceitaExtra] = React.useState(0);
  /** O usuário mexeu no campo? Então pare de auto-preencher a partir do preset. */
  const tocado = React.useRef({ entrada: false, custo: false });

  // Trocar o tipo re-semeia os padrões (prazo/taxa) e o que não foi tocado.
  const trocarTipo = (t: TipoDecisao) => {
    const p = presetPor(t);
    setTipo(t);
    setParcelas(p.parcelasPadrao);
    setTaxaPct(p.taxaMensalPadrao * 100);
    if (!tocado.current.entrada) setEntrada(Math.round(valor * p.entradaPct));
    if (!tocado.current.custo) setCustoExtra(Math.round((valor * p.custoAnualPct) / 12));
  };
  // Digitar o valor re-sugere entrada e custo de posse (enquanto não tocados).
  const trocarValor = (v: number) => {
    setValor(v);
    if (!tocado.current.entrada) setEntrada(Math.round(v * preset.entradaPct));
    if (!tocado.current.custo) setCustoExtra(Math.round((v * preset.custoAnualPct) / 12));
  };

  const r: ResultadoSimulacao | null = React.useMemo(() => {
    if (!derivada) return null;
    if (valor <= 0 && custoExtra <= 0) return null;
    return simularAquisicao(sit, {
      tipo, valor, entrada, parcelas,
      taxaMensal: taxaPct / 100,
      parcelaInformada: parcelaInformada > 0 ? parcelaInformada : undefined,
      custoMensalExtra: custoExtra,
      receitaExtraMensal: receitaExtra,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [derivada, sit.caixaAtual, sit.receitaMensal, sit.despesaMensal, tipo, valor, entrada, parcelas, taxaPct, parcelaInformada, custoExtra, receitaExtra]);

  if (isLoading || !derivada) {
    return <div className="flex flex-col gap-4"><Skeleton className="h-[120px]" /><Skeleton className="h-[320px]" /></div>;
  }

  return (
    <div className="flex flex-col gap-5">
      {/* ---------- a sua situação (dos dados reais) ---------- */}
      <Card
        info={{
          titulo: "Sua situação hoje",
          oQue: "O ponto de partida da simulação: quanto você tem em caixa e quanto entra e sai por mês.",
          comoCalcula: "Caixa = saldo consolidado das contas. Entra/sai por mês = média dos últimos 6 meses dos lançamentos já realizados. Dá para ajustar para testar outro cenário.",
        }}
      >
        <div className="flex items-center gap-2 mb-4">
          <h2 className="text-h3 font-semibold text-ink m-0">Sua situação hoje</h2>
          <span className="text-caption text-faint">dos seus lançamentos</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <CampoValor label="Caixa disponível" value={sit.caixaAtual} onChange={(v) => setAjuste((a) => ({ ...a, caixaAtual: v }))} />
          <CampoValor label={pessoal ? "Entra por mês" : "Receita por mês"} value={sit.receitaMensal} onChange={(v) => setAjuste((a) => ({ ...a, receitaMensal: v }))} />
          <CampoValor label={pessoal ? "Sai por mês" : "Custo por mês"} value={sit.despesaMensal} onChange={(v) => setAjuste((a) => ({ ...a, despesaMensal: v }))} />
        </div>
        <p className="m-0 mt-3 text-caption text-faint">
          Sobra hoje: <b className="text-ink tabular-nums">{brl0(sit.receitaMensal - sit.despesaMensal)}</b> por mês
          {Object.keys(ajuste).length > 0 && (
            <button onClick={() => setAjuste({})} className="ml-3 text-caption text-muted hover:text-ink underline underline-offset-2">
              voltar aos meus números
            </button>
          )}
        </p>
      </Card>

      {/* ---------- a decisão ---------- */}
      <Card>
        <div className="flex items-center gap-2 mb-4">
          <h2 className="text-h3 font-semibold text-ink m-0">O que você quer {pessoal ? "comprar" : "investir"}</h2>
        </div>

        <div className="flex flex-wrap gap-2 mb-5">
          {presets.map((p) => {
            const on = p.id === tipo;
            return (
              <button
                key={p.id}
                onClick={() => trocarTipo(p.id)}
                className={`rounded-pill px-3 py-[7px] text-caption transition-colors ${on ? "bg-surface-3 text-ink font-semibold" : "text-muted hover:text-ink hover:bg-surface-2"}`}
              >
                {p.label}
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {tipo !== "contratacao" && (
            <>
              <CampoValor label="Valor total" value={valor} onChange={trocarValor} destaque />
              <CampoValor label="Entrada (à vista)" value={entrada} onChange={(v) => { tocado.current.entrada = true; setEntrada(v); }} />
              <div className="flex flex-col gap-[6px]">
                <label className="text-caption font-medium text-muted">Em quantas vezes</label>
                <Input type="number" min={0} value={parcelas || ""} onChange={(ev) => setParcelas(Math.max(0, Number(ev.target.value) || 0))} />
              </div>
              <div className="flex flex-col gap-[6px]">
                <label className="text-caption font-medium text-muted">Juros ao mês (%)</label>
                <Input
                  type="number" step="0.01" min={0}
                  value={parcelaInformada > 0 ? "" : (taxaPct || "")}
                  disabled={parcelaInformada > 0}
                  placeholder={parcelaInformada > 0 ? "calculado da parcela" : "0"}
                  onChange={(ev) => setTaxaPct(Math.max(0, Number(ev.target.value) || 0))}
                />
              </div>
              <CampoValor
                label="Ou a parcela que te ofereceram"
                value={parcelaInformada}
                onChange={setParcelaInformada}
                hint="se preencher, o juro real é calculado"
              />
            </>
          )}
          <CampoValor
            label={tipo === "contratacao" ? "Custo mensal (salário + encargos)" : "Custo mensal de manter"}
            value={custoExtra}
            onChange={(v) => { tocado.current.custo = true; setCustoExtra(v); }}
            hint={tipo === "veiculo" ? "IPVA, seguro, combustível…" : undefined}
          />
          <CampoValor
            label={pessoal ? "Economia que isso traz por mês" : "Receita que isso gera por mês"}
            value={receitaExtra}
            onChange={setReceitaExtra}
            hint={pessoal ? "ex.: deixa de gastar com app/aluguel" : "entra no payback"}
          />
        </div>

        {preset.dica && (
          <p className="m-0 mt-4 text-caption text-muted flex items-start gap-2">
            <Icon name="sparkles" size={14} color="var(--color-text-tertiary)" className="mt-[2px] shrink-0" />
            {preset.dica}
          </p>
        )}
      </Card>

      {/* ---------- o resultado ---------- */}
      {!r ? (
        <Card>
          <p className="m-0 text-label text-muted text-center py-8">
            Preencha o valor acima para ver o impacto no seu caixa.
          </p>
        </Card>
      ) : (
        <Resultado r={r} pessoal={pessoal} />
      )}
    </div>
  );
}

/* ------------------------------ resultado ------------------------------ */

function Resultado({ r, pessoal }: { r: ResultadoSimulacao; pessoal: boolean }) {
  const tom = TOM[r.veredito];
  return (
    <>
      {/* veredito */}
      <Card>
        <div className="flex items-start gap-3">
          <Icon name={tom.icone} size={22} color={tom.cor} className="mt-[2px] shrink-0" />
          <div className="min-w-0 flex-1">
            <h2 className="m-0 text-h2 font-semibold text-ink leading-tight" style={{ color: tom.cor }}>
              {VEREDITO_LABEL[r.veredito]}
            </h2>
            <p className="m-0 mt-1 text-body text-muted leading-relaxed">{r.resumo}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-5 pt-5 border-t border-border-soft">
          <Metrica label="Parcela" valor={r.parcela} sufixo={r.parcelas > 0 ? `× ${r.parcelas}` : undefined} />
          <Metrica label="Peso no mês" valor={r.pesoMensal} hint="parcela + custos − ganhos" />
          <Metrica label="Sobra depois" valor={r.sobraDepois} tone={r.sobraDepois < 0 ? "negative" : undefined} />
          <Metrica label="Total pago" valor={r.totalPago} hint={r.juros > 0 ? `${brl0(r.juros)} de juros` : "sem juros"} />
        </div>
      </Card>

      {/* projeção com × sem */}
      <Card
        info={{
          titulo: "Projeção do seu caixa",
          oQue: "Como o seu caixa evolui mês a mês com a compra e sem ela.",
          comoCalcula: "Parte do caixa de hoje (menos a entrada) e soma, a cada mês, o que entra menos o que sai — incluindo a parcela enquanto ela durar, o custo de manter e o ganho que a compra traz.",
        }}
      >
        <div className="flex items-center gap-2 mb-1">
          <h3 className="text-h3 font-semibold text-ink m-0">Projeção do seu caixa</h3>
        </div>
        <p className="m-0 mb-4 text-caption text-faint">
          {r.mesAperto !== null
            ? <>o caixa fica <b className="text-negative">negativo no mês {r.mesAperto}</b> · mínimo {brl0(r.caixaMinimo)}</>
            : <>o caixa não fica negativo · ponto mais baixo {brl0(r.caixaMinimo)}</>}
        </p>

        <div className="h-[260px] -ml-2" role="img" aria-label={`Projeção de caixa com e sem a compra ao longo de ${r.projecao.length - 1} meses`}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={r.projecao} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
              <XAxis dataKey="mes" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "var(--color-text-tertiary)" }}
                interval="preserveStartEnd" tickFormatter={(m: number) => (m === 0 ? "hoje" : `${m}m`)} />
              <YAxis tickLine={false} axisLine={false} width={62}
                tick={{ fontSize: 11, fill: "var(--color-text-tertiary)" }}
                tickFormatter={(v: number) => (Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}k` : String(Math.round(v)))} />
              <ReferenceLine y={0} stroke="var(--color-border)" />
              <Tooltip
                contentStyle={{ borderRadius: 12, border: "1px solid var(--color-border)", background: "var(--color-white)", fontSize: 13 }}
                labelFormatter={(m) => (m === 0 ? "Hoje" : `Mês ${m}`)}
                formatter={(v: number, n: string) => [brl0(v), n === "comCompra" ? "Com a compra" : "Sem a compra"]}
              />
              <Line type="monotone" dataKey="semCompra" name="semCompra" stroke="var(--color-text-tertiary)"
                strokeWidth={1.4} strokeDasharray="4 4" dot={false} {...chartAnim()} />
              <Line type="monotone" dataKey="comCompra" name="comCompra" stroke="var(--color-lime)"
                strokeWidth={2} dot={false} activeDot={{ r: 4 }} {...chartAnim(120)} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div className="flex items-center gap-4 mt-2 text-caption text-faint">
          <span className="inline-flex items-center gap-[6px]"><span className="w-4 h-[2px] rounded-pill" style={{ background: "var(--color-lime)" }} /> com a compra</span>
          <span className="inline-flex items-center gap-[6px]"><span className="w-4 border-t-2 border-dashed" style={{ borderColor: "var(--color-text-tertiary)" }} /> sem a compra</span>
        </div>
      </Card>

      {/* fatores + alternativas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card>
          <h3 className="text-h3 font-semibold text-ink m-0 mb-1">Por que esse veredito</h3>
          <p className="m-0 mb-4 text-caption text-faint">cada fator que pesou na conta</p>
          <div className="flex flex-col">
            {r.fatores.map((f, i) => (
              <div key={i} className="flex items-start gap-3 py-[10px] border-b border-border-soft last:border-0">
                <span className="w-[7px] h-[7px] rounded-pill mt-[7px] shrink-0"
                  style={{ background: f.sinal === "bom" ? "var(--color-positive)" : f.sinal === "ruim" ? "var(--color-negative)" : "var(--color-warning)" }} />
                <div className="min-w-0">
                  <div className="text-label font-medium text-ink">{f.label}</div>
                  <div className="text-caption text-muted">{f.valor}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <h3 className="text-h3 font-semibold text-ink m-0 mb-1">
            {r.veredito === "confortavel" ? "Dá para melhorar" : "O que faria caber"}
          </h3>
          <p className="m-0 mb-4 text-caption text-faint">alternativas com o número de cada uma</p>
          {r.alternativas.length === 0 ? (
            <p className="m-0 text-caption text-faint py-4">Sem alternativa melhor para este cenário.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {r.alternativas.map((a) => (
                <div key={a.id} className="rounded-md bg-surface-2 px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-label font-medium text-ink">{a.titulo}</span>
                    <span className="text-caption font-medium shrink-0" style={{ color: TOM[a.veredito].cor }}>
                      {VEREDITO_LABEL[a.veredito]}
                    </span>
                  </div>
                  <div className="text-caption text-muted mt-[2px]">{a.detalhe}</div>
                  {a.parcela > 0 && (
                    <div className="text-caption text-faint mt-1 tabular-nums">
                      parcela {brl0(a.parcela)}{a.parcelas > 0 ? ` × ${a.parcelas}` : ""}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {r.paybackMeses !== null && (
        <Card>
          <div className="flex items-center gap-3">
            <Icon name="trending-up" size={18} color="var(--color-positive)" />
            <p className="m-0 text-label text-ink">
              {pessoal ? "A economia" : "O retorno"} devolve o que você investiu em{" "}
              <b className="tabular-nums">{r.paybackMeses} meses</b>.
            </p>
          </div>
        </Card>
      )}
    </>
  );
}

/* ------------------------------ campos ------------------------------ */

function CampoValor({
  label, value, onChange, hint, destaque,
}: { label: string; value: number; onChange: (v: number) => void; hint?: string; destaque?: boolean }) {
  return (
    <div className="flex flex-col gap-[6px]">
      <label className="text-caption font-medium text-muted">{label}</label>
      <CurrencyInput value={value} onValueChange={onChange} containerClassName={destaque ? "font-semibold" : undefined} />
      {hint && <span className="text-caption text-faint">{hint}</span>}
    </div>
  );
}

function Metrica({ label, valor, sufixo, hint, tone }: { label: string; valor: number; sufixo?: string; hint?: string; tone?: "negative" }) {
  return (
    <div className="flex flex-col gap-[2px]">
      <span className="text-caption font-medium text-muted">{label}</span>
      <span className={`text-[24px] leading-none font-semibold tabular-nums ${tone === "negative" ? "text-negative" : "text-ink"}`}>
        <BRL value={valor} />
      </span>
      {(sufixo || hint) && <span className="text-caption text-faint">{sufixo ?? hint}</span>}
    </div>
  );
}
