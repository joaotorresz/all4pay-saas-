"use client";

/**
 * A PÁGINA DA MAQUININHA PARA QUEM AINDA NÃO TEM UMA (pedido do dono,
 * 26/10/2026). A finalidade é uma só: levar a empresa a PEDIR a maquininha
 * Quattro — ou a pedir o vínculo da que ela já tem. Por isso a página
 * convida (a faixa da Home), mostra o número que decide (taxa de referência,
 * quanto cai e quando, quanto custaria contra a maquininha de hoje) e termina
 * no formulário.
 *
 * ⚠️ As contas são de `core/maquininha/oferta`; as taxas, da tabela de
 * referência do simulador do POS (`lib/maquininha-oferta`). São de
 * REFERÊNCIA do segmento — a tela diz isso ao lado de todo número, e a
 * comparação diz quando a taxa de hoje é menor.
 *
 * ⚠️ O pedido de vínculo é um RECADO à plataforma, nunca o vínculo: só a
 * plataforma liga um estabelecimento a uma empresa.
 */
import * as React from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BRL, Button, CurrencyInput, DuasBarras, Icon, InfoHint, Input, Select, Switch, Textarea,
} from "@/components/ui";
import { usePermissoes } from "@/components/app/usePermissoes";
import {
  ETAPAS_PEDIDO, NOME_FORMA, NOME_SITUACAO, PEDIDO_VAZIO, TETO_MAQUININHAS, compararTaxas, simularVenda, validarPedido,
  type FormaOferta, type PedidoMaquininha, type TipoPedido,
} from "@/core/maquininha/oferta";
import { SEGMENTOS, SEGMENTO_PADRAO, enviarPedido, listarPedidos, taxaDeReferencia } from "@/lib/maquininha-oferta";
import { isDemo } from "@/lib/demo";
import { dataBR, formatBRL, pct } from "@/lib/format";

const LINK_INTEGRACAO = "/dashboard/administration/integrations?cartao=maquininha-pinbank";
const cartao = { background: "var(--color-white)", borderRadius: "var(--a4p-box-radius)" } as const;
const FORMAS: FormaOferta[] = ["pix", "debito", "credito", "parcelado"];

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
  const taxaDe = React.useMemo(() => taxaDeReferencia(segmento), [segmento]);
  const [tipo, setTipo] = React.useState<TipoPedido>("pedir");

  const abrirPedido = (t: TipoPedido) => { setTipo(t); rolarPara("oferta-pedido"); };

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
        <div className="w-full max-w-[720px] flex flex-col items-center gap-2 text-center px-6 py-6 rounded-[28px]" style={{ background: "var(--a4p-pilula-fundo)" }}>
          <span className="w-11 h-11 rounded-pill flex items-center justify-center" style={{ background: "var(--color-surface-1)" }}>
            <Icon name="smartphone" size={20} strokeWidth={1.75} />
          </span>
          <h2 className="text-[24px] text-ink m-0" style={{ fontWeight: 500 }}>Venda com a maquininha Quattro</h2>
          <p className="text-[14px] text-muted m-0 max-w-[520px]">
            Cada venda entra sozinha no seu financeiro: o recebível, a taxa e o dia em que o dinheiro cai, já no fluxo de caixa e no DRE.
          </p>
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
          <span className="text-[12px] text-muted">A proposta final sai na análise do pedido, com o seu faturamento.</span>
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
        <CompararMaquininha taxaDe={taxaDe} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <OQueVemJunto />
        <div className="lg:col-span-2">
          <FormularioPedido tipo={tipo} setTipo={setTipo} segmento={segmento} />
        </div>
      </div>

      <SeusPedidos />

      <p className="text-[12px] text-muted m-0">
        Taxas de referência do segmento {SEGMENTOS.find((s) => s.id === segmento)?.nome.toLowerCase()}, média entre as bandeiras
        Mastercard, Visa e Elo. A antecipação é de {pct(0.019)} ao mês, proporcional aos dias que faltam.
        {isDemo && " Em demonstração, os pedidos ficam só nesta tela e não são enviados."}
      </p>
    </div>
  );
}

/* ------------------------------ o simulador ------------------------------ */

function SimuladorVenda({ taxaDe, hoje }: { taxaDe: ReturnType<typeof taxaDeReferencia>; hoje: string }) {
  const [valor, setValor] = React.useState(500);
  const [forma, setForma] = React.useState<FormaOferta>("parcelado");
  const [parcelas, setParcelas] = React.useState(3);
  const [antecipar, setAntecipar] = React.useState(false);
  const s = React.useMemo(() => simularVenda({ valor, forma, parcelas, antecipar }, taxaDe, hoje), [valor, forma, parcelas, antecipar, taxaDe, hoje]);
  const cartaoCredito = forma === "credito" || forma === "parcelado";
  const visiveis = s.recebimentos.slice(0, 6);

  return (
    <section id="oferta-simulador" className="flex flex-col gap-4 px-8 pt-[30px] pb-6 min-w-0 scroll-mt-6" style={cartao}>
      <Titulo info={{ oQue: "Quanto sobra de uma venda e em que dia o dinheiro cai na conta.", comoCalcula: "Valor × taxa de referência da forma (mais a antecipação, quando ligada). Sem antecipar, o crédito cai em 30 dias por parcela; antecipado, tudo no dia seguinte." }}>
        Simule uma venda
      </Titulo>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
        <CurrencyInput label="Valor da venda" value={valor} onValueChange={setValor} />
        {forma === "parcelado" ? (
          <label className="flex flex-col gap-2">
            <span className="text-[13px] text-muted">Parcelas: <span className="text-ink tabular-nums">{parcelas}x</span></span>
            <input type="range" min={2} max={21} value={parcelas} onChange={(e) => setParcelas(Number(e.target.value))} className="w-full accent-ink" aria-label="Número de parcelas" />
          </label>
        ) : <span />}
      </div>
      <Pilulas rotulo="Forma de pagamento" valor={forma} onChange={setForma} opcoes={FORMAS.map((f) => ({ id: f, nome: NOME_FORMA[f] }))} />
      {cartaoCredito && <Switch checked={antecipar} onChange={setAntecipar} label="Receber tudo no dia seguinte (antecipar)" />}

      <div className="flex flex-col gap-1 pt-2">
        <span className="text-[13px] text-muted">Você recebe</span>
        <span className="a4p-heroi" style={{ fontSize: 36, lineHeight: 1 }}><BRL value={s.liquido} /></span>
        <span className="text-[13px] text-muted tabular-nums">
          {s.taxa == null ? "sem taxa de referência para esta forma" : <>taxa de {pct(s.taxa, 2)} · custo de {formatBRL(s.custo)} · {s.prazo}</>}
        </span>
      </div>
      <ul className="flex flex-col m-0 p-0 list-none">
        {visiveis.map((r, i) => (
          <li key={i} className="flex items-center justify-between gap-3 py-[8px] border-t" style={{ borderColor: "var(--erp-menu-borda)" }}>
            <span className="text-[13px] text-ink tabular-nums">{dataBR(r.data)} <span className="text-muted">· {r.rotulo}</span></span>
            <span className="text-[14px] text-ink tabular-nums"><BRL value={r.valor} /></span>
          </li>
        ))}
      </ul>
      {s.recebimentos.length > visiveis.length && (
        <span className="text-[12px] text-muted">e mais {s.recebimentos.length - visiveis.length} parcelas, uma a cada 30 dias.</span>
      )}
    </section>
  );
}

/* ------------------------------ a comparação ------------------------------ */

function lerPercentual(t: string): number {
  const n = Number(t.replace(/\s|%/g, "").replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n / 100 : 0;
}

function CompararMaquininha({ taxaDe }: { taxaDe: ReturnType<typeof taxaDeReferencia> }) {
  const [volume, setVolume] = React.useState(30000);
  const [taxaTexto, setTaxaTexto] = React.useState("3,5");
  const [pix, setPix] = React.useState(25);
  const [debito, setDebito] = React.useState(30);
  const [parcelado, setParcelado] = React.useState(15);
  const credito = Math.max(0, 100 - pix - debito - parcelado);
  const c = React.useMemo(() => compararTaxas({
    volumeMensal: volume, mix: { pix: pix / 100, debito: debito / 100, credito: credito / 100, parcelado: parcelado / 100 },
    parcelasMedias: 4, taxaAtual: lerPercentual(taxaTexto),
  }, taxaDe), [volume, pix, debito, credito, parcelado, taxaTexto, taxaDe]);

  // Mexer num pedaço do mix nunca passa de 100%: o crédito à vista fica com a sobra.
  const ajustar = (set: (n: number) => void, outros: number) => (n: number) => set(Math.min(n, 100 - outros));
  const diferenca = c.diferencaAnual;

  return (
    <section className="flex flex-col gap-4 px-8 pt-[30px] pb-6 min-w-0" style={cartao}>
      <Titulo info={{ oQue: "Quanto a Quattro custaria por mês contra a maquininha que você usa hoje, no mesmo volume e no mesmo jeito de vender.", comoCalcula: "Volume × (fração de cada forma × taxa de referência da forma), sem antecipação, contra volume × a sua taxa média de hoje. Parcelado considerado em 4x." }}>
        Compare com a sua maquininha atual
      </Titulo>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <CurrencyInput label="Quanto passa na maquininha por mês" value={volume} onValueChange={setVolume} />
        <Input label="Sua taxa média hoje" value={taxaTexto} onChange={(e) => setTaxaTexto(e.target.value)} suffix="%" inputMode="decimal" />
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-[13px] text-muted">Como seus clientes pagam</span>
        {([
          ["Pix", pix, ajustar(setPix, debito + parcelado)],
          ["Débito", debito, ajustar(setDebito, pix + parcelado)],
          ["Parcelado", parcelado, ajustar(setParcelado, pix + debito)],
        ] as const).map(([nome, v, set]) => (
          <label key={nome} className="grid grid-cols-[110px_1fr_48px] items-center gap-3">
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
      </div>
    </section>
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

function FormularioPedido({ tipo, setTipo, segmento }: { tipo: TipoPedido; setTipo: (t: TipoPedido) => void; segmento: string }) {
  const qc = useQueryClient();
  const permissoes = usePermissoes();
  const podePedir = isDemo || permissoes.pode("administrar");
  const [p, setP] = React.useState<PedidoMaquininha>(PEDIDO_VAZIO);
  const [erros, setErros] = React.useState<Record<string, string>>({});
  const [enviando, setEnviando] = React.useState(false);
  const [falha, setFalha] = React.useState<string | null>(null);
  const [enviado, setEnviado] = React.useState<TipoPedido | null>(null);
  const campo = <K extends keyof PedidoMaquininha>(k: K) => (v: PedidoMaquininha[K]) => setP((x) => ({ ...x, [k]: v }));

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
                <ol className="grid grid-cols-5 gap-2 m-0 p-0 list-none" aria-label="Etapas do pedido">
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
