"use client";

/**
 * A PÁGINA DA MAQUININHA PARA QUEM AINDA NÃO TEM UMA (pedido do dono,
 * 26/10/2026). A finalidade é uma só: levar a empresa a PEDIR a maquininha
 * Quattro — ou a pedir o vínculo da que ela já tem. Por isso a página
 * convida (a faixa da Home), mostra o número que decide (taxa de referência,
 * quanto cai e quando, quanto custaria contra a maquininha de hoje) e termina
 * no formulário.
 *
 * ⚠️ As contas são de `core/maquininha/oferta`; as taxas, do custo da
 * tabela do simulador do POS + a margem da faixa de faturamento repartida
 * sobre o mix (`lib/maquininha-oferta`). Por isso o faturamento e o mix são
 * da PÁGINA, não da comparação: as taxas de referência, o simulador de venda
 * e a comparação usam o mesmo perfil, e mexer no mix muda as três.
 *
 * ⚠️ O pedido de vínculo é um RECADO à plataforma, nunca o vínculo: só a
 * plataforma liga um estabelecimento a uma empresa.
 */
import * as React from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BRL, Button, CurrencyInput, DuasBarras, Icon, InfoHint, Input, Select, Switch, Textarea,
} from "@/components/ui";
import { MaquininhaMockup } from "@/components/maquininha/MaquininhaMockup";
import { usePermissoes } from "@/components/app/usePermissoes";
import {
  ETAPAS_PEDIDO, NOME_FORMA, NOME_SITUACAO, PEDIDO_VAZIO, TETO_MAQUININHAS, compararTaxas, completarTaxasAtuais,
  origemDoPedido, simulacaoDoPedido, simularRepasse, simularVenda, validarPedido,
  type Comparacao, type FormaOferta, type PedidoMaquininha, type SimulacaoDoPedido, type TaxasPorForma, type TipoPedido,
} from "@/core/maquininha/oferta";
import { PERFIL_PADRAO, SEGMENTOS, SEGMENTO_PADRAO, enviarPedido, listarPedidos, margemDoPerfil, taxaDaOferta, taxasDeMercado, type PerfilDeVendas } from "@/lib/maquininha-oferta";
import { isDemo } from "@/lib/demo";
import { dataBR, formatBRL, pct } from "@/lib/format";

const LINK_INTEGRACAO = "/dashboard/administration/integrations?cartao=maquininha-pinbank";
const cartao = { background: "var(--color-white)", borderRadius: "var(--a4p-box-radius)" } as const;
const FORMAS: FormaOferta[] = ["pix", "debito", "credito", "parcelado"];

/** O que a comparação leva ao formulário: faturamento, texto e a simulação estruturada (vai ao CRM). */
interface Preenchimento { vez: number; faturamento: number; observacao: string; simulacao: SimulacaoDoPedido }

function hojeISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function Titulo({ children, info }: { children: React.ReactNode; info?: { oQue: string; comoCalcula?: string } }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="text-[15px] text-ink">{children}</span>
      {info && <InfoHint align="left" oQue={info.oQue} comoCalcula={info.comoCalcula} />}
    </span>
  );
}

/** Pílulas de escolha (forma de pagamento, pedir × vincular). */
function Pilulas<T extends string>({ valor, opcoes, onChange, rotulo }: {
  valor: T; opcoes: { id: T; nome: string }[]; onChange: (v: T) => void; rotulo: string;
}) {
  return (
    <div role="radiogroup" aria-label={rotulo} className="flex flex-wrap gap-2">
      {opcoes.map((o) => {
        const ativo = o.id === valor;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={ativo}
            onClick={() => onChange(o.id)}
            className="h-9 px-4 rounded-pill text-[13px] transition-colors"
            style={ativo
              ? { background: "var(--erp-num-cor)", color: "var(--color-surface-1)" }
              : { background: "var(--color-surface-1)", color: "var(--color-ink)" }}
          >
            {o.nome}
          </button>
        );
      })}
    </div>
  );
}

function rolarPara(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export function OfertaMaquininha({ vinculosPendentes = 0 }: { vinculosPendentes?: number }) {
  const hoje = hojeISO();
  const [segmento, setSegmento] = React.useState(SEGMENTO_PADRAO);
  // O faturamento e o mix (em %, como a pessoa digita) moram aqui: a taxa
  // depende deles (margem da faixa sobre o mix).
  const [vendas, setVendas] = React.useState<VendasTela>(() => ({
    volume: PERFIL_PADRAO.volumeMensal,
    pix: PERFIL_PADRAO.mix.pix * 100, debito: PERFIL_PADRAO.mix.debito * 100, parcelado: PERFIL_PADRAO.mix.parcelado * 100,
  }));
  const perfil = React.useMemo(() => perfilDe(vendas), [vendas]);
  const taxaDe = React.useMemo(() => taxaDaOferta(segmento, perfil), [segmento, perfil]);
  const { margem } = margemDoPerfil(perfil);
  const [tipo, setTipo] = React.useState<TipoPedido>("pedir");
  // O que a comparação leva ao formulário (faturamento e as taxas de hoje),
  // para quem chega pelo pop-up não digitar de novo. `vez` refaz o preenchimento.
  const [preenchimento, setPreenchimento] = React.useState<Preenchimento | null>(null);

  const abrirPedido = (t: TipoPedido) => { setTipo(t); rolarPara("oferta-pedido"); };
  const levarAoPedido = (faturamento: number, observacao: string, simulacao: SimulacaoDoPedido) => {
    setPreenchimento((x) => ({ vez: (x?.vez ?? 0) + 1, faturamento, observacao, simulacao }));
    abrirPedido("pedir");
  };

  const ref = React.useMemo(() => ({
    pix: taxaDe("pix", 0, false),
    debito: taxaDe("debito", 0, false),
    credito: taxaDe("credito", 1, false),
    parcelado: taxaDe("parcelado", 6, false),
  }), [taxaDe]);

  return (
    <div className="flex flex-col gap-5">
      {vinculosPendentes > 0 && (
        <div className="flex items-start gap-3 px-6 py-4" style={cartao}>
          <Icon name="link" size={18} strokeWidth={1.75} />
          <p className="text-[14px] text-ink m-0 flex-1">
            Sua maquininha já foi vinculada pela equipe Quattro e falta ativá-la. Ative em Integrações com a conta e as taxas
            do contrato, e as vendas passam a aparecer aqui.
          </p>
          <Link href={LINK_INTEGRACAO} className="text-[13px] text-ink inline-flex items-center gap-1 hover:underline flex-none">
            Ativar <Icon name="arrow-up-right" size={14} strokeWidth={1.75} />
          </Link>
        </div>
      )}

      {/* A faixa de convite, no desenho da caixa da Quattro AI da Home */}
      <section className="a4p-ondas-ia flex flex-col items-center gap-[14px] rounded-[32px] px-6 py-11">
        <div className="w-full max-w-[720px] flex flex-col md:flex-row items-center gap-4 md:gap-8 text-center md:text-left px-6 md:px-10 py-6 rounded-[28px]" style={{ background: "var(--a4p-pilula-fundo)" }}>
          <MaquininhaMockup altura={150} className="!self-center" />
          <div className="flex flex-col gap-2 min-w-0">
            <h2 className="text-[24px] text-ink m-0" style={{ fontWeight: 500 }}>Peça a maquininha Quattro</h2>
            <p className="text-[14px] text-muted m-0 max-w-[460px]">
              Cada venda entra sozinha no seu financeiro: o recebível, a taxa e o dia em que o dinheiro cai, já no fluxo de caixa e no DRE.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap justify-center gap-[10px]">
          <button type="button" onClick={() => abrirPedido("pedir")} className="inline-flex items-center gap-2 h-10 px-4 rounded-pill text-[14px] a4p-pilula">
            <Icon name="shopping-cart" size={16} strokeWidth={1.5} /> Pedir minha maquininha
          </button>
          <button type="button" onClick={() => rolarPara("oferta-simulador")} className="inline-flex items-center gap-2 h-10 px-4 rounded-pill text-[14px] a4p-pilula">
            <Icon name="coins" size={16} strokeWidth={1.5} /> Simular taxas
          </button>
          <button type="button" onClick={() => abrirPedido("vincular")} className="inline-flex items-center gap-2 h-10 px-4 rounded-pill text-[14px] a4p-pilula">
            <Icon name="link" size={16} strokeWidth={1.5} /> Já tenho, quero vincular
          </button>
        </div>
      </section>

      {/* Segmento e as taxas de referência */}
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div className="flex flex-col gap-1">
          <span className="a4p-titulo-secao text-[15px] text-muted">Taxas de referência</span>
          <span className="text-[12px] text-muted">
            Para {formatBRL(vendas.volume)} por mês no mix da comparação abaixo. A proposta final sai na análise do pedido.
          </span>
        </div>
        <div className="w-full sm:w-[300px]">
          <Select
            label="Seu segmento"
            value={segmento}
            onChange={setSegmento}
            options={SEGMENTOS.map((s) => ({ value: s.id, label: s.nome }))}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {([
          ["Pix", ref.pix, "cai no mesmo dia"],
          ["Débito", ref.debito, "cai no dia seguinte"],
          ["Crédito à vista", ref.credito, "em 30 dias, ou amanhã antecipado"],
          ["Parcelado em 6x", ref.parcelado, "a cada 30 dias, ou amanhã antecipado"],
        ] as const).map(([nome, taxa, detalhe]) => (
          <div key={nome} className="flex flex-col gap-3 px-7 py-[22px] min-w-0" style={cartao}>
            <span className="text-[15px] text-muted">{nome}</span>
            <span className="tabular-nums text-ink" style={{ fontSize: 30, lineHeight: 1, fontWeight: 600 }}>{taxa == null ? "—" : pct(taxa, 2)}</span>
            <span className="text-[12px] text-muted">{detalhe}</span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SimuladorVenda taxaDe={taxaDe} hoje={hoje} />
        <CompararMaquininha taxaDe={taxaDe} vendas={vendas} setVendas={setVendas} aoSeguir={levarAoPedido} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <OQueVemJunto />
        <div className="lg:col-span-2">
          <FormularioPedido tipo={tipo} setTipo={setTipo} segmento={segmento} preenchimento={preenchimento} />
        </div>
      </div>

      <SeusPedidos />

      <p className="text-[12px] text-muted m-0">
        Taxas de referência do segmento {SEGMENTOS.find((s) => s.id === segmento)?.nome.toLowerCase()}, média entre as bandeiras
        Mastercard, Visa e Elo, com a margem de {pct(margem, 1)} da faixa de faturamento sobre a média do mix: Pix e débito
        ficam no custo e o crédito e o parcelado carregam a margem. A antecipação é de {pct(0.019)} ao mês, proporcional aos dias que faltam. As taxas
        estimadas da sua maquininha atual partem de taxas típicas do mercado e das que você digitou; confira no seu extrato.
        {isDemo && " Em demonstração, os pedidos ficam só nesta tela e não são enviados."}
      </p>
    </div>
  );
}

/* ------------------------------ o simulador ------------------------------ */

type QuemPaga = "estabelecimento" | "cliente";

function Linha({ rotulo, children, forte }: { rotulo: string; children: React.ReactNode; forte?: boolean }) {
  return (
    <li className="flex items-center justify-between gap-3 py-[8px] border-t" style={{ borderColor: "var(--erp-menu-borda)" }}>
      <span className={`text-[13px] ${forte ? "text-ink" : "text-muted"}`}>{rotulo}</span>
      <span className="text-[14px] text-ink tabular-nums">{children}</span>
    </li>
  );
}

function SimuladorVenda({ taxaDe, hoje }: { taxaDe: ReturnType<typeof taxaDaOferta>; hoje: string }) {
  const [valor, setValor] = React.useState(500);
  const [forma, setForma] = React.useState<FormaOferta>("parcelado");
  const [parcelas, setParcelas] = React.useState(3);
  const [antecipar, setAntecipar] = React.useState(false);
  const [quem, setQuem] = React.useState<QuemPaga>("estabelecimento");
  const entrada = { valor, forma, parcelas, antecipar };
  const proprio = React.useMemo(() => simularVenda(entrada, taxaDe, hoje), [valor, forma, parcelas, antecipar, taxaDe, hoje]); // eslint-disable-line react-hooks/exhaustive-deps
  const repasse = React.useMemo(() => simularRepasse(entrada, taxaDe, hoje), [valor, forma, parcelas, antecipar, taxaDe, hoje]); // eslint-disable-line react-hooks/exhaustive-deps
  const cliente = quem === "cliente";
  const s = cliente && repasse ? repasse.venda : proprio;
  const cartaoCredito = forma === "credito" || forma === "parcelado";
  const visiveis = s.recebimentos.slice(0, 6);

  return (
    <section id="oferta-simulador" className="flex flex-col gap-4 px-8 pt-[30px] pb-6 min-w-0 scroll-mt-6" style={cartao}>
      <Titulo info={{
        oQue: "Quanto sobra de uma venda, em que dia o dinheiro cai e, se você repassar a taxa, quanto o seu cliente paga.",
        comoCalcula: "Taxas para o estabelecimento: valor × taxa de referência da forma (mais a antecipação, quando ligada) sai do que você recebe. Taxas para o cliente: cobra-se o valor ÷ (1 − taxa), arredondado para cima, e você recebe o preço inteiro; a diferença é o juro que o cliente paga. Sem antecipar, o crédito cai em 30 dias por parcela; antecipado, tudo no dia seguinte.",
      }}>
        Simule uma venda
      </Titulo>
      <Pilulas
        rotulo="Quem paga a taxa"
        valor={quem}
        onChange={setQuem}
        opcoes={[{ id: "estabelecimento", nome: "Taxas para o estabelecimento" }, { id: "cliente", nome: "Taxas para o cliente" }]}
      />
      <span className="text-[12px] text-muted -mt-2">
        {cliente
          ? "Você repassa a taxa: o cliente paga os juros e você recebe o preço inteiro."
          : "Você absorve a taxa: o cliente paga o preço e a taxa sai do que você recebe."}
      </span>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
        <CurrencyInput label={cliente ? "Preço do produto (o que você quer receber)" : "Valor da venda"} value={valor} onValueChange={setValor} />
        {forma === "parcelado" ? (
          <label className="flex flex-col gap-2">
            <span className="text-[13px] text-muted">Parcelas: <span className="text-ink tabular-nums">{parcelas}x</span></span>
            <input type="range" min={2} max={21} value={parcelas} onChange={(e) => setParcelas(Number(e.target.value))} className="w-full accent-ink" aria-label="Número de parcelas" />
          </label>
        ) : <span />}
      </div>
      <Pilulas rotulo="Forma de pagamento" valor={forma} onChange={setForma} opcoes={FORMAS.map((f) => ({ id: f, nome: NOME_FORMA[f] }))} />
      {cartaoCredito && <Switch checked={antecipar} onChange={setAntecipar} label="Receber tudo no dia seguinte (antecipar)" />}

      {cliente ? (
        repasse ? (
          <>
            <div className="flex flex-col gap-1 pt-2">
              <span className="text-[13px] text-muted">O cliente paga</span>
              <span className="a4p-heroi" style={{ fontSize: 36, lineHeight: 1 }}><BRL value={repasse.total} /></span>
              <span className="text-[13px] text-muted tabular-nums">
                {repasse.vezes > 1
                  ? <>em {repasse.vezes}x de {formatBRL(repasse.parcelas[0])}</>
                  : "à vista"} · juros de {formatBRL(repasse.juros)} ({pct(repasse.jurosFracao, 2)} sobre o preço)
              </span>
            </div>
            <ul className="flex flex-col m-0 p-0 list-none">
              <Linha rotulo="Preço do produto">{formatBRL(repasse.valorDesejado)}</Linha>
              <Linha rotulo={`Taxa da maquininha · ${s.taxa == null ? "—" : pct(s.taxa, 2)}`}>{formatBRL(s.custo)}</Linha>
              <Linha rotulo={`Você recebe · ${s.prazo}`} forte>{formatBRL(s.liquido)}</Linha>
            </ul>
          </>
        ) : (
          <span className="text-[13px] text-muted pt-2">Sem taxa de referência para esta forma.</span>
        )
      ) : (
        <div className="flex flex-col gap-1 pt-2">
          <span className="text-[13px] text-muted">Você recebe</span>
          <span className="a4p-heroi" style={{ fontSize: 36, lineHeight: 1 }}><BRL value={s.liquido} /></span>
          <span className="text-[13px] text-muted tabular-nums">
            {s.taxa == null ? "sem taxa de referência para esta forma" : <>taxa de {pct(s.taxa, 2)} · custo de {formatBRL(s.custo)} · {s.prazo}</>}
          </span>
        </div>
      )}
      {(!cliente || repasse) && (
        <ul className="flex flex-col m-0 p-0 list-none">
          {visiveis.map((r, i) => (
            <li key={i} className="flex items-center justify-between gap-3 py-[8px] border-t" style={{ borderColor: "var(--erp-menu-borda)" }}>
              <span className="text-[13px] text-ink tabular-nums">{dataBR(r.data)} <span className="text-muted">· {r.rotulo}</span></span>
              <span className="text-[14px] text-ink tabular-nums"><BRL value={r.valor} /></span>
            </li>
          ))}
        </ul>
      )}
      {s.recebimentos.length > visiveis.length && (
        <span className="text-[12px] text-muted">e mais {s.recebimentos.length - visiveis.length} parcelas, uma a cada 30 dias.</span>
      )}
    </section>
  );
}

/* ------------------------------ a comparação ------------------------------ */

/** "1,99" → 0,0199; vazio ou ilegível → null (= não sei). */
function lerPercentual(t: string): number | null {
  const limpo = t.replace(/\s|%/g, "").replace(",", ".");
  if (!limpo) return null;
  const n = Number(limpo);
  return Number.isFinite(n) && n >= 0 && n < 100 ? n / 100 : null;
}

const pctCampo = (f: number) => (f * 100).toFixed(2).replace(".", ",");

/** O faturamento e o mix como a tela os guarda (o mix em %, o crédito à vista é a sobra). */
interface VendasTela { volume: number; pix: number; debito: number; parcelado: number }

function perfilDe(v: VendasTela): PerfilDeVendas {
  const credito = Math.max(0, 100 - v.pix - v.debito - v.parcelado);
  return { volumeMensal: v.volume, mix: { pix: v.pix / 100, debito: v.debito / 100, credito: credito / 100, parcelado: v.parcelado / 100 } };
}

function CompararMaquininha({ taxaDe, vendas, setVendas, aoSeguir }: {
  taxaDe: ReturnType<typeof taxaDaOferta>;
  vendas: VendasTela;
  setVendas: React.Dispatch<React.SetStateAction<VendasTela>>;
  aoSeguir: (faturamento: number, observacao: string, simulacao: SimulacaoDoPedido) => void;
}) {
  const { volume, pix, debito, parcelado } = vendas;
  const setVolume = (n: number) => setVendas((v) => ({ ...v, volume: n }));
  const setPix = (n: number) => setVendas((v) => ({ ...v, pix: n }));
  const setDebito = (n: number) => setVendas((v) => ({ ...v, debito: n }));
  const setParcelado = (n: number) => setVendas((v) => ({ ...v, parcelado: n }));
  const [textos, setTextos] = React.useState<Record<FormaOferta, string>>({ pix: "", debito: "", credito: "", parcelado: "" });
  const [antecipado, setAntecipado] = React.useState(false);
  const [popup, setPopup] = React.useState(false);
  const credito = Math.max(0, 100 - pix - debito - parcelado);

  const informadas = React.useMemo<TaxasPorForma>(() => ({
    pix: lerPercentual(textos.pix), debito: lerPercentual(textos.debito),
    credito: lerPercentual(textos.credito), parcelado: lerPercentual(textos.parcelado),
  }), [textos]);
  const completas = React.useMemo(() => completarTaxasAtuais(informadas, taxasDeMercado(antecipado)), [informadas, antecipado]);
  const estimadas = FORMAS.filter((f) => completas[f].origem === "estimada");

  const entrada = React.useMemo(() => ({
    volumeMensal: volume, mix: { pix: pix / 100, debito: debito / 100, credito: credito / 100, parcelado: parcelado / 100 },
    parcelasMedias: 4, antecipado,
    taxasAtuais: { pix: completas.pix.taxa, debito: completas.debito.taxa, credito: completas.credito.taxa, parcelado: completas.parcelado.taxa },
  }), [volume, pix, debito, credito, parcelado, completas, antecipado]);
  const c = React.useMemo(() => compararTaxas(entrada, taxaDe), [entrada, taxaDe]);

  // Mexer num pedaço do mix nunca passa de 100%: o crédito à vista fica com a sobra.
  const ajustar = (set: (n: number) => void, outros: number) => (n: number) => set(Math.min(n, 100 - outros));
  const diferenca = c.diferencaAnual;

  const observacao = () => {
    const taxas = FORMAS.map((f) => `${NOME_FORMA[f]} ${pct(completas[f].taxa, 2)}${completas[f].origem === "estimada" ? " (estimada)" : ""}`).join(", ");
    return c.veredito === "quattro_mais_barata"
      ? `Simulei a economia: ${formatBRL(c.diferencaMensal)} por mês. Hoje pago ${taxas}${antecipado ? ", recebendo no dia seguinte" : ""}.`
      : `Quero uma proposta de taxas. Hoje pago ${taxas}${antecipado ? ", recebendo no dia seguinte" : ""}, com ${formatBRL(volume)} por mês.`;
  };

  return (
    <section className="flex flex-col gap-4 px-8 pt-[30px] pb-6 min-w-0" style={cartao}>
      <Titulo info={{ oQue: "Quanto a Quattro custaria por mês contra a maquininha que você usa hoje, no mesmo volume e no mesmo jeito de vender.", comoCalcula: "Volume × fração de cada forma × taxa da forma, nas duas maquininhas. As taxas que você não souber são estimadas pelo mercado, ajustadas pelas que você digitou. Parcelado considerado em 4x. Com \"recebo no dia seguinte\" ligado, a Quattro entra com a antecipação também." }}>
        Compare com a sua maquininha atual
      </Titulo>
      <CurrencyInput label="Quanto passa na maquininha por mês" value={volume} onValueChange={setVolume} />
      <div className="flex flex-col gap-2">
        <span className="text-[13px] text-muted">Suas taxas hoje (deixe em branco o que não souber)</span>
        <div className="grid grid-cols-2 gap-3">
          {FORMAS.map((f) => (
            <div key={f} className="flex flex-col gap-1">
              <Input
                label={f === "parcelado" ? "Parcelado (4x)" : NOME_FORMA[f]}
                value={textos[f]}
                onChange={(e) => setTextos((x) => ({ ...x, [f]: e.target.value }))}
                placeholder={pctCampo(completas[f].taxa)}
                suffix="%"
                inputMode="decimal"
              />
              {completas[f].origem === "estimada" && (
                <span className="text-[11px] text-muted tabular-nums">estimada: {pct(completas[f].taxa, 2)}</span>
              )}
            </div>
          ))}
        </div>
      </div>
      <Switch checked={antecipado} onChange={setAntecipado} label="Minha maquininha me paga tudo no dia seguinte" />
      <div className="flex flex-col gap-2">
        <span className="text-[13px] text-muted">Como seus clientes pagam</span>
        {([
          ["Pix", pix, ajustar(setPix, debito + parcelado)],
          ["Débito", debito, ajustar(setDebito, pix + parcelado)],
          ["Parcelado", parcelado, ajustar(setParcelado, pix + debito)],
        ] as const).map(([nome, v, set]) => (
          <label key={nome} className="grid grid-cols-[90px_1fr_48px] items-center gap-3">
            <span className="text-[13px] text-ink">{nome}</span>
            <input type="range" min={0} max={100} step={5} value={v} onChange={(e) => set(Number(e.target.value))} className="w-full accent-ink" aria-label={`Parte das vendas no ${nome.toLowerCase()}`} />
            <span className="text-[13px] text-ink tabular-nums text-right">{v}%</span>
          </label>
        ))}
        <span className="text-[12px] text-muted tabular-nums">Crédito à vista fica com o resto: {credito}%.</span>
      </div>
      <DuasBarras
        a={{ nome: "Hoje, por mês", valor: c.custoAtual, cor: "var(--color-ink)" }}
        b={{ nome: `Quattro, por mês · ${pct(c.taxaQuattro, 2)}`, valor: c.custoQuattro, cor: "var(--color-areia)" }}
        ariaLabel={`Custo por mês: hoje ${formatBRL(c.custoAtual)}, Quattro ${formatBRL(c.custoQuattro)}`}
      />
      <div className="flex flex-col gap-1 pt-3 border-t" style={{ borderColor: "var(--erp-menu-borda)" }}>
        <p className="text-[14px] text-ink m-0">{c.frase}</p>
        {volume > 0 && Math.abs(diferenca) >= 0.005 && (
          <span className="text-[13px] text-muted tabular-nums">
            {diferenca > 0 ? "Economia" : "Diferença"} de {formatBRL(Math.abs(diferenca))} em 12 meses.
          </span>
        )}
        {estimadas.length > 0 && (
          <span className="text-[12px] text-muted">
            {estimadas.length === FORMAS.length ? "Todas as taxas de hoje são estimadas pelo mercado." : `Estimadas: ${estimadas.map((f) => NOME_FORMA[f].toLowerCase()).join(", ")}.`}
          </span>
        )}
      </div>
      {c.veredito !== "sem_volume" && (
        <div>
          <Button onClick={() => setPopup(true)}>
            {c.veredito === "quattro_mais_barata" ? "Ver quanto eu economizo" : "Pedir uma proposta de taxas"}
          </Button>
        </div>
      )}
      {popup && (
        <PopupEconomia
          c={c}
          aoFechar={() => setPopup(false)}
          aoSeguir={() => { setPopup(false); aoSeguir(volume, observacao(), simulacaoDoPedido(entrada, completas, c)); }}
        />
      )}
    </section>
  );
}

/**
 * O pop-up do resultado (pedido do dono, 28/10/2026). Quattro mais barata →
 * a economia por mês e o caminho para pedir. Taxas de hoje menores (ou
 * iguais) → nunca "mais barata" à força: o convite é falar com um consultor,
 * que analisa o faturamento e monta a proposta. Os dois levam ao MESMO
 * formulário de pedido, já preenchido — para onde ele vai depois (CRM) é
 * decisão pendente do dono.
 */
function PopupEconomia({ c, aoFechar, aoSeguir }: { c: Comparacao; aoFechar: () => void; aoSeguir: () => void }) {
  const economia = c.veredito === "quattro_mais_barata";
  const fechar = React.useRef<HTMLButtonElement>(null);
  React.useEffect(() => {
    fechar.current?.focus();
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") aoFechar(); };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [aoFechar]);
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[90] bg-black/40 flex items-center justify-center p-4" onClick={aoFechar}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="popup-economia-titulo"
        className="w-full max-w-[440px] flex flex-col gap-4 p-7"
        style={{ ...cartao, borderRadius: 24, boxShadow: "var(--shadow-popover)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <span className="w-11 h-11 rounded-pill flex items-center justify-center" style={{ background: "var(--color-surface-1)" }}>
            <Icon name={economia ? "coins" : "user"} size={20} strokeWidth={1.75} />
          </span>
          <button ref={fechar} type="button" onClick={aoFechar} aria-label="Fechar" className="w-9 h-9 rounded-pill flex items-center justify-center" style={{ background: "var(--color-surface-1)" }}>
            <Icon name="x" size={16} strokeWidth={1.75} />
          </button>
        </div>
        {economia ? (
          <>
            <h2 id="popup-economia-titulo" className="text-[24px] text-ink m-0" style={{ fontWeight: 500 }}>
              Você pode economizar <span className="tabular-nums whitespace-nowrap">{formatBRL(c.diferencaMensal)}</span> por mês
            </h2>
            <p className="text-[14px] text-muted m-0">
              Com as taxas da Quattro, são <span className="tabular-nums">{formatBRL(c.diferencaAnual)}</span> a mais no seu caixa em 12 meses,
              no mesmo volume e no mesmo jeito de vender. Peça a sua maquininha e a equipe envia a proposta com as taxas do seu faturamento.
            </p>
          </>
        ) : (
          <>
            <h2 id="popup-economia-titulo" className="text-[24px] text-ink m-0" style={{ fontWeight: 500 }}>
              Fale com um consultor da Quattro
            </h2>
            <p className="text-[14px] text-muted m-0">
              Pelas taxas que você informou, a sua maquininha de hoje sai {c.veredito === "empate" ? "pelo mesmo custo" : "mais barata"} na tabela de referência.
              Um consultor analisa o seu faturamento e monta uma proposta de taxas para você, sem compromisso.
            </p>
          </>
        )}
        <div className="flex items-center gap-3 flex-wrap pt-1">
          <Button onClick={aoSeguir}>{economia ? "Quero economizar" : "Falar com um consultor"}</Button>
          <Button variant="secondary" onClick={aoFechar}>Agora não</Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* ------------------------------ o que vem junto ------------------------------ */

function OQueVemJunto() {
  const itens: [string, string][] = [
    ["Venda vira recebível sozinha", "Cada venda aprovada entra em contas a receber com a data do repasse."],
    ["Taxa no lugar certo do DRE", "A taxa e a tarifa entram como despesa variável, sem digitar nada."],
    ["Conferência com o extrato", "Compare o que a adquirente pagou com o que o sistema esperava."],
    ["Relatórios da maquininha", "Formas, bandeiras, horários de pico e agenda de recebíveis."],
    ["Pix, débito e crédito em até 21x", "Antecipação opcional para receber no dia seguinte."],
  ];
  return (
    <section className="flex flex-col gap-3 p-6 h-full" style={cartao}>
      <span className="a4p-titulo-secao text-[15px] text-muted">O que vem junto</span>
      <ul className="flex flex-col gap-3 m-0 p-0 list-none">
        {itens.map(([titulo, texto]) => (
          <li key={titulo} className="flex items-start gap-3">
            <span className="w-7 h-7 flex-none rounded-pill flex items-center justify-center" style={{ background: "var(--color-surface-1)" }}>
              <Icon name="check" size={14} strokeWidth={1.75} />
            </span>
            <span className="flex flex-col gap-[2px]">
              <span className="text-[14px] text-ink">{titulo}</span>
              <span className="text-[12px] text-muted">{texto}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ------------------------------ o pedido ------------------------------ */

function FormularioPedido({ tipo, setTipo, segmento, preenchimento }: {
  tipo: TipoPedido; setTipo: (t: TipoPedido) => void; segmento: string;
  preenchimento: Preenchimento | null;
}) {
  const qc = useQueryClient();
  const permissoes = usePermissoes();
  const podePedir = isDemo || permissoes.pode("administrar");
  const [p, setP] = React.useState<PedidoMaquininha>(PEDIDO_VAZIO);
  const [erros, setErros] = React.useState<Record<string, string>>({});
  const [enviando, setEnviando] = React.useState(false);
  const [falha, setFalha] = React.useState<string | null>(null);
  const [enviado, setEnviado] = React.useState<TipoPedido | null>(null);
  const campo = <K extends keyof PedidoMaquininha>(k: K) => (v: PedidoMaquininha[K]) => setP((x) => ({ ...x, [k]: v }));

  // Quem chega pelo pop-up da comparação já traz o faturamento e as taxas de hoje.
  const vez = preenchimento?.vez;
  React.useEffect(() => {
    if (!preenchimento) return;
    setEnviado(null);
    setP((x) => ({
      ...x,
      faturamentoMensal: preenchimento.faturamento > 0 ? preenchimento.faturamento : x.faturamentoMensal,
      observacao: preenchimento.observacao.slice(0, 500),
      simulacao: preenchimento.simulacao,
      origem: origemDoPedido(preenchimento.simulacao.veredito),
    }));
  }, [vez]); // eslint-disable-line react-hooks/exhaustive-deps

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    const pedido = { ...p, tipo, segmento: SEGMENTOS.find((s) => s.id === segmento)?.nome ?? "" };
    const v = validarPedido(pedido);
    setErros(v);
    setFalha(null);
    if (Object.keys(v).length) return;
    setEnviando(true);
    try {
      await enviarPedido(pedido);
      setEnviado(tipo);
      setP(PEDIDO_VAZIO);
      await qc.invalidateQueries({ queryKey: ["maquininha", "pedidos"] });
    } catch (err) {
      setFalha(err instanceof Error ? err.message : String(err));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <section id="oferta-pedido" className="flex flex-col gap-4 px-8 pt-[30px] pb-6 scroll-mt-6" style={cartao}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Titulo>{tipo === "pedir" ? "Peça a sua maquininha" : "Vincule a maquininha que você já tem"}</Titulo>
        <Pilulas rotulo="Tipo de pedido" valor={tipo} onChange={(t) => { setTipo(t); setEnviado(null); setErros({}); }} opcoes={[{ id: "pedir", nome: "Pedir nova" }, { id: "vincular", nome: "Já tenho" }]} />
      </div>

      {enviado ? (
        <div className="flex flex-col items-start gap-3 py-4">
          <span className="w-10 h-10 rounded-pill flex items-center justify-center" style={{ background: "var(--color-surface-1)" }}>
            <Icon name="check" size={18} strokeWidth={1.75} />
          </span>
          <p className="text-[15px] text-ink m-0">
            {enviado === "pedir" ? "Pedido recebido." : "Pedido de vínculo recebido."} A equipe Quattro entra em contato em até 2 dias úteis.
          </p>
          <p className="text-[13px] text-muted m-0">Acompanhe a situação em Seus pedidos, logo abaixo.</p>
          <Button variant="secondary" onClick={() => setEnviado(null)}>Fazer outro pedido</Button>
        </div>
      ) : !podePedir ? (
        <p className="text-[14px] text-muted m-0 py-4">Só quem administra a empresa pode pedir a maquininha. Peça a quem administra para fazer o pedido nesta tela.</p>
      ) : (
        <form onSubmit={enviar} className="flex flex-col gap-4" noValidate>
          <p className="text-[13px] text-muted m-0">
            {tipo === "pedir"
              ? "Diga quantas maquininhas e onde entregar. Analisamos o pedido, enviamos a proposta com as taxas e a maquininha chega pronta para vender."
              : "Informe o número do estabelecimento (ele aparece no comprovante da maquininha). A equipe confere e liga as vendas a esta empresa."}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {tipo === "pedir" ? (
              <>
                <Input label="Quantas maquininhas" type="number" min={1} max={TETO_MAQUININHAS} value={String(p.quantidade)} onChange={(e) => campo("quantidade")(Number(e.target.value))} invalid={!!erros.quantidade} />
                <CurrencyInput label="Faturamento médio por mês (opcional)" value={p.faturamentoMensal ?? 0} onValueChange={(v) => campo("faturamentoMensal")(v)} />
              </>
            ) : (
              <Input label="Número do estabelecimento" inputMode="numeric" value={p.codigoEstabelecimento} onChange={(e) => campo("codigoEstabelecimento")(e.target.value.replace(/\D/g, ""))} invalid={!!erros.codigoEstabelecimento} />
            )}
            <Input label="Nome para contato" value={p.contatoNome} onChange={(e) => campo("contatoNome")(e.target.value)} invalid={!!erros.contatoNome} autoComplete="name" />
            <Input label="Telefone com DDD" inputMode="tel" value={p.contatoTelefone} onChange={(e) => campo("contatoTelefone")(e.target.value)} invalid={!!erros.contatoTelefone} autoComplete="tel" />
            <Input label="E-mail" type="email" value={p.contatoEmail} onChange={(e) => campo("contatoEmail")(e.target.value)} invalid={!!erros.contatoEmail} autoComplete="email" />
          </div>
          {tipo === "pedir" && (
            <Input label="Endereço de entrega" value={p.endereco} onChange={(e) => campo("endereco")(e.target.value)} invalid={!!erros.endereco} autoComplete="street-address" />
          )}
          <Textarea label="Observação (opcional)" value={p.observacao} onChange={(e) => campo("observacao")(e.target.value)} rows={2} maxLength={500} />
          {Object.keys(erros).length > 0 && (
            <ul className="m-0 pl-5 text-[13px]" style={{ color: "var(--color-negative)" }}>
              {Object.values(erros).map((m) => <li key={m}>{m}</li>)}
            </ul>
          )}
          {falha && <p className="text-[13px] m-0" style={{ color: "var(--color-negative)" }}>Não foi possível enviar: {falha}</p>}
          <div className="flex items-center gap-3 flex-wrap">
            <Button type="submit" disabled={enviando}>{enviando ? "Enviando…" : tipo === "pedir" ? "Pedir maquininha" : "Pedir vínculo"}</Button>
            <span className="text-[12px] text-muted">Sem compromisso: você recebe a proposta antes de qualquer cobrança.</span>
          </div>
        </form>
      )}
    </section>
  );
}

function SeusPedidos() {
  const { data } = useQuery({ queryKey: ["maquininha", "pedidos"], queryFn: listarPedidos });
  if (!data?.length) return null;
  return (
    <section className="flex flex-col gap-3 p-6" style={cartao}>
      <span className="a4p-titulo-secao text-[15px] text-muted">Seus pedidos</span>
      <ul className="flex flex-col m-0 p-0 list-none">
        {data.map((p) => {
          const etapa = ETAPAS_PEDIDO.indexOf(p.situacao);
          return (
            <li key={p.id} className="flex flex-col gap-2 py-3 border-t" style={{ borderColor: "var(--erp-menu-borda)" }}>
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <span className="text-[14px] text-ink">
                  {p.tipo === "pedir" ? `${p.quantidade} ${p.quantidade === 1 ? "maquininha" : "maquininhas"}` : `Vínculo do estabelecimento ${p.codigoEstabelecimento ?? ""}`}
                  <span className="text-muted tabular-nums"> · pedido em {dataBR(p.criadoEm.slice(0, 10))}</span>
                </span>
                <span className="text-[12px] font-medium px-[10px] py-[3px] rounded-pill text-ink" style={{ background: "var(--color-surface-1)" }}>{NOME_SITUACAO[p.situacao]}</span>
              </div>
              {p.situacao !== "cancelado" && (
                <ol className="grid grid-cols-6 gap-2 m-0 p-0 list-none" aria-label="Etapas do pedido">
                  {ETAPAS_PEDIDO.map((s, i) => (
                    <li key={s} className="flex flex-col gap-1">
                      <span className="h-[4px] rounded-pill" style={{ background: i <= etapa ? "var(--color-ink)" : "var(--color-surface-2)" }} />
                      <span className={`text-[11px] ${i <= etapa ? "text-ink" : "text-muted"}`}>{NOME_SITUACAO[s]}</span>
                    </li>
                  ))}
                </ol>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
