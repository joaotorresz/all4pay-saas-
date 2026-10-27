import * as React from "react";
import { cn } from "@/lib/utils";
import { corDaMarca, glifoDoBanco, glifoNoCirculo, iniciaisDoBanco, marcaDoBanco } from "@/core/bancos/logo";
import { BANCO_GLIFOS } from "./bancos-icones";

/**
 * Quattro DS — BancoLogo
 *
 * O logo do banco de uma conta, num tile discreto. Monocromático: o glifo
 * herda `currentColor` (tinta do texto), como todo ícone do sistema — as
 * cores das marcas não entram na paleta.
 *
 * Aceita a CHAVE da conta (`itau`, `bb`) ou o NOME ("Banco do Brasil"). Banco
 * sem logo na biblioteca mostra as iniciais no mesmo tile, nunca o logo de
 * outro banco (ver `core/bancos/logo`).
 *
 * Logos: "Pacote de Ícones de Bancos Brasileiros", de Matheus Cuba —
 * créditos em `docs/creditos/icones-bancos.md`.
 */
export interface BancoLogoProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Chave (`itau`) ou nome ("Itaú Unibanco") do banco. */
  banco: string | null | undefined;
  /** Nome mostrado nas iniciais e no rótulo acessível, quando `banco` é chave. */
  nome?: string;
  size?: number;
  /**
   * Ao lado do nome escrito o logo é decoração (padrão): o leitor de tela já
   * leu o nome. Sozinho, passe `decorativo={false}` para ele ser anunciado.
   */
  decorativo?: boolean;
  /**
   * A MARCA colorida do banco (`public/bancos/`), quando ela existe. Só na
   * abertura de conta, onde a pessoa procura o banco dela numa lista (pedido
   * do dono, 27/10/2026); sem arquivo, cai no glifo e depois nas iniciais.
   */
  marca?: boolean;
  /**
   * CÍRCULO cheio na cor da marca com o logo BRANCO no centro (o card "Saldo
   * total em contas", pedido do dono, 27/10/2026). Banco sem cor declarada em
   * `core/bancos/logo` cai no tile neutro redondo.
   */
  circulo?: boolean;
}

export function BancoLogo({
  banco, nome, size = 28, decorativo = true, marca = false, circulo = false, className, style, ...rest
}: BancoLogoProps) {
  const cor = circulo ? (corDaMarca(banco) ?? corDaMarca(nome)) : null;
  const arquivo = marca && !cor ? (marcaDoBanco(nome) ?? marcaDoBanco(banco)) : null;
  const base = glifoDoBanco(banco) ?? glifoDoBanco(nome);
  const glifo = base && cor ? glifoNoCirculo(base) : base;
  const lado = Math.round(size * (cor ? 0.56 : 0.72));
  const rotulo = nome || banco || "Banco";
  const a11y = decorativo
    ? { "aria-hidden": true as const }
    : { role: "img" as const, "aria-label": rotulo };
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center shrink-0 select-none overflow-hidden",
        circulo ? "rounded-full" : "rounded-sm",
        cor ? "text-white" : "bg-surface-2 text-ink",
        "font-medium leading-none",
        className,
      )}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36), ...(cor ? { background: cor } : null), ...style }}
      {...a11y}
      {...rest}
    >
      {arquivo ? (
        // eslint-disable-next-line @next/next/no-img-element -- SVG estático, sem otimização a fazer
        <img src={arquivo} alt="" width={Math.round(size * 0.72)} height={Math.round(size * 0.72)} className="object-contain" />
      ) : glifo ? (
        <svg viewBox="0 0 1024 1024" width={lado} height={lado} fill="currentColor" focusable="false">
          <path transform="matrix(1 0 0 -1 0 960)" d={BANCO_GLIFOS[glifo]} />
        </svg>
      ) : (
        iniciaisDoBanco(nome || banco)
      )}
    </span>
  );
}
