"use client";

import type { ReactNode } from "react";
import { BRL } from "./BRL";
import { pct } from "@/lib/format";

/**
 * As peças comuns dos gráficos, tiradas da prancheta "Biblioteca de gráficos"
 * do canvas "Quattro ERP · Gráficos e tabelas" (14/10/2026): a DICA que abre
 * ao passar o mouse, a PÍLULA de variação e o DEGRADÊ da área. Os números
 * moram em `globals.css` (`--erp-dica-*`, `--erp-pilula-*`, `--erp-graf-*`);
 * aqui fica só a estrutura. Toda dica de gráfico do sistema passa por aqui —
 * trinta desenhos diferentes eram trinta lugares para a mesma regra divergir.
 */

export type LinhaDica = { cor: string; nome: string; valor: number | ReactNode };

/** A variação a exibir: `v` é fração (0,041 = +4,1%); `null` = sem base. */
export type VariacaoDica = { v: number | null; frase?: string };

export interface DicaGraficoProps {
  /** Mês, dia ou nome da fatia — a primeira linha, em cinza. */
  rotulo?: ReactNode;
  /** O número principal (dinheiro, a menos que venha pronto como nó). */
  valor?: number | ReactNode;
  variacao?: VariacaoDica;
  /** Séries (entradas × saídas, composição): bolinha · nome · valor. */
  linhas?: LinhaDica[];
  /** Linha final separada por fio (resultado, diferença). */
  rodape?: ReactNode;
}

function Valor({ v }: { v: number | ReactNode }) {
  return typeof v === "number" ? <BRL value={v} /> : <>{v}</>;
}

export function DicaGrafico({ rotulo, valor, variacao, linhas, rodape }: DicaGraficoProps) {
  return (
    <div className="a4p-dica">
      {rotulo != null && <span className="a4p-dica-rotulo">{rotulo}</span>}
      {valor != null && (
        <span className="a4p-dica-valor tabular-nums"><Valor v={valor} /></span>
      )}
      {variacao && (
        <span className="a4p-dica-variacao">
          <VariacaoPill v={variacao.v} frase={variacao.frase} />
        </span>
      )}
      {linhas && linhas.length > 0 && (
        <span className="a4p-dica-linhas">
          {linhas.map((l) => (
            <span key={l.nome} className="a4p-dica-linha">
              <span className="a4p-dica-marca" style={{ background: l.cor }} aria-hidden />
              <span className="a4p-dica-nome">{l.nome}</span>
              <span className="a4p-dica-num tabular-nums"><Valor v={l.valor} /></span>
            </span>
          ))}
        </span>
      )}
      {rodape != null && <span className="a4p-dica-rodape tabular-nums">{rodape}</span>}
    </div>
  );
}

/**
 * A pílula de variação ("+4,1% sobre setembro"). ⚠️ É a SEGUNDA exceção
 * declarada à regra "número não tem cor por sinal" (a primeira é a `Pilula`
 * da Home): o dono a desenhou verde ao subir e vermelha ao cair no canvas
 * "Gráficos e tabelas" (Biblioteca, 14/10/2026). O número ao lado continua
 * na tinta; a guarda `cor:` aceita a cor por sinal SÓ dentro desta função.
 * Sem base, ela diz que não há base — nunca "0,0%".
 */
export function VariacaoPill({ v, frase }: VariacaoDica) {
  if (v == null) {
    return <span className="a4p-pilula-var" data-sem-base="">sem base de comparação</span>;
  }
  const cor = v < 0 ? "var(--color-negative)" : "var(--color-positive)";
  const sinal = v > 0 ? "+" : "";
  return (
    <span
      className="a4p-pilula-var tabular-nums"
      style={{ color: cor, background: `color-mix(in srgb, ${cor} var(--erp-pilula-intensidade), transparent)` }}
    >
      <span>{sinal}{pct(v)}</span>
      {frase && <span className="a4p-pilula-frase">{frase}</span>}
    </span>
  );
}

interface PontoRecharts {
  name?: string | number;
  value?: number | string;
  color?: string;
  dataKey?: string | number;
}

/**
 * A dica pronta para o `<Tooltip content={…} />` do Recharts: uma série vira
 * o número principal; várias viram linhas. `formatar` troca o dinheiro por
 * outra grandeza (percentual, contagem) quando o gráfico não mede reais.
 */
export function DicaRecharts({
  active,
  payload,
  label,
  formatar,
  rotulo,
}: {
  active?: boolean;
  payload?: PontoRecharts[];
  label?: ReactNode;
  formatar?: (v: number) => ReactNode;
  rotulo?: (label: ReactNode) => ReactNode;
}) {
  if (!active || !payload?.length) return null;
  const val = (v: unknown): number | ReactNode => {
    const n = Number(v);
    if (!Number.isFinite(n)) return String(v ?? "—");
    return formatar ? formatar(n) : n;
  };
  const r = rotulo ? rotulo(label) : label;
  if (payload.length === 1) return <DicaGrafico rotulo={r} valor={val(payload[0].value)} />;
  return (
    <DicaGrafico
      rotulo={r}
      linhas={payload.map((p, i) => ({
        cor: p.color ?? "var(--erp-graf-serie-1)",
        nome: String(p.name ?? p.dataKey ?? i),
        valor: val(p.value),
      }))}
    />
  );
}

/**
 * O degradê da ÁREA sob a linha: a cor do canvas forte no alto e quase nada
 * na base. Vai dentro do `<defs>` do gráfico; a área usa `fill="url(#id)"`.
 */
export function DegradeArea({ id, cor = "var(--erp-graf-area)" }: { id: string; cor?: string }) {
  return (
    <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" style={{ stopColor: cor, stopOpacity: "var(--erp-graf-area-topo)" }} />
      <stop offset="100%" style={{ stopColor: cor, stopOpacity: "var(--erp-graf-area-base)" }} />
    </linearGradient>
  );
}
