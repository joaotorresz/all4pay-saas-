"use client";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O RELÓGIO DA ASSINATURA, NA TELA DE QUEM PAGA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ **O prazo existia só no `/admin`.** Um prazo que o cliente não vê não é
 * prazo, é um corte que chega de surpresa — a pessoa lança normalmente na
 * terça e na quarta o botão de salvar devolve erro, sem nada antes que
 * explicasse. Medido em 18/08: 14 das 16 organizações não tinham nem linha de
 * assinatura, e as 2 que tinham estavam sem data de fim.
 *
 * ⚠️ **É um POP-UP, uma vez por DIA (decisão do dono, 27/10/2026).** Era uma
 * faixa fixa no topo de toda tela, fechada só pela sessão. Agora abre por cima
 * do sistema na primeira tela do dia; fechado, só volta no dia SEGUINTE — a
 * marca é a DATA local em `localStorage`, então trocar de página (cada tela
 * monta o `AppShell` de novo) não o reabre. Fundo branco sólido do cartão,
 * sem vidro. Assinatura em dia não renderiza nada.
 *
 * ⚠️ **A voz é a do produto, não a do jurídico.** Sem "inadimplente", sem
 * "suspensão", sem "licença". A frase diz o que aconteceu, o que continua
 * funcionando (ver e exportar TUDO) e o que resolve. Quem está vencido já sabe
 * que atrasou; o que ele não sabe é se perdeu o arquivo.
 */
import * as React from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Button, Icon } from "@/components/ui";
import { getAssinatura } from "@/lib/assinatura";

const CHAVE_DIA = "a4p_aviso_assinatura_dia";

/** Hoje em `YYYY-MM-DD` LOCAL: o "dia seguinte" é o do relógio de quem usa. */
function hojeLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Fechado HOJE? Sem armazenamento, o pop-up abre (o aviso vale mais que o incômodo). */
function useFechadoHoje() {
  const [fechado, setFechado] = React.useState(true);
  React.useEffect(() => {
    try { setFechado(localStorage.getItem(CHAVE_DIA) === hojeLocal()); } catch { setFechado(false); }
  }, []);
  const fechar = React.useCallback(() => {
    setFechado(true);
    try { localStorage.setItem(CHAVE_DIA, hojeLocal()); } catch { /* fecha só nesta tela */ }
  }, []);
  return { fechado, fechar };
}

export function BannerAssinatura() {
  const { fechado, fechar } = useFechadoHoje();
  const { data } = useQuery({
    queryKey: ["assinatura", "estado"],
    queryFn: getAssinatura,
    // O relógio anda em DIAS. Reconsultar a cada foco de janela seria uma
    // chamada por troca de aba para ver o mesmo número.
    staleTime: 30 * 60_000,
  });
  const aberto = !!data?.aviso && !fechado;

  React.useEffect(() => {
    if (!aberto) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") fechar(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [aberto, fechar]);

  if (!aberto || !data || typeof document === "undefined") return null;

  /*
   * ⚠️ **O TOM ESCALA EM TRÊS, não em dois.** Um teste de 14 dias que mostra
   * alarme desde o primeiro deixa de ser lido justamente na semana em que ele
   * importa.
   *
   *   calmo   → informação: o prazo existe e está longe
   *   atenção → a última semana; agora é para agir
   *   parado  → a escrita suspendeu; diz o que AINDA funciona
   */
  const COR = {
    calmo: "var(--color-ink)",
    atencao: "var(--color-warning)",
    parado: "var(--color-negative)",
  } as const;
  const cor = COR[data.tom];
  const parado = data.tom === "parado";
  const dias = data.emTeste && !parado ? data.diasRestantes : null;
  const titulo = parado ? "Sua conta está pausada" : data.emTeste ? "Período de teste" : "Sua assinatura";

  return createPortal(
    // ⚠️ Portal no `<body>`: o `AppShell` tem ancestrais com `transform`, e um
    // ancestral transformado vira o bloco de contenção de `position: fixed`.
    <div
      className="fixed inset-0 z-[200] bg-black/30 flex items-center justify-center p-4"
      onClick={fechar}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="a4p-assinatura-titulo"
        className="relative w-full max-w-[440px] bg-white rounded-card shadow-popover p-8 flex flex-col gap-5"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={fechar}
          aria-label="Fechar até amanhã"
          title="Fechar até amanhã"
          className="absolute top-4 right-4 inline-flex items-center justify-center w-8 h-8 rounded-pill text-muted hover:text-ink hover:bg-surface-2"
        >
          <Icon name="x" size={16} color="currentColor" />
        </button>

        <span
          className="inline-flex items-center justify-center w-11 h-11 rounded-pill bg-surface-1"
          aria-hidden
        >
          <Icon name={parado ? "triangle-alert" : "calendar"} size={20} color={cor} />
        </span>

        <div className="flex flex-col gap-2">
          <h2 id="a4p-assinatura-titulo" className="m-0 font-display text-h2 text-ink">
            {titulo}
          </h2>
          {dias !== null && dias >= 0 && (
            <p className="m-0 flex items-baseline gap-2">
              <span className="font-display text-display leading-none text-ink">{dias}</span>
              <span className="text-label text-muted">{dias === 1 ? "dia restante" : "dias restantes"}</span>
            </p>
          )}
          <p className="m-0 text-body text-ink leading-[1.5]">{data.aviso}</p>
          {parado && (
            /*
             * ⚠️ **O BLOQUEIO É SUAVE, e dizer isso é metade do trabalho.** Ler,
             * filtrar, imprimir e exportar continuam inteiros — só registrar
             * coisa nova parou.
             */
            <p className="m-0 text-caption text-muted leading-[1.5]">
              Consultar, imprimir e exportar continuam liberados. Só o registro de
              lançamentos novos está pausado, e ele volta no mesmo instante em que a
              assinatura for regularizada.
            </p>
          )}
        </div>

        <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={fechar}>Agora não</Button>
          {/*
            ⚠️ Não há tela de pagamento, e o botão não finge que há: ele leva a
            uma conversa. Um "Assinar agora" que abre um formulário quebrado é
            pior que um convite honesto para falar com alguém.
          */}
          <Link
            href="/dashboard/help"
            onClick={fechar}
            className="inline-flex items-center justify-center text-center rounded-pill bg-lime text-on-lime hover:bg-lime-hover text-label font-medium px-botao-x py-botao-y"
          >
            {parado ? "Falar com a gente para reativar" : "Falar sobre planos"}
          </Link>
        </div>
      </div>
    </div>,
    document.body,
  );
}
