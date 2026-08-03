"use client";

/**
 * INVENTÁRIO DE ROTAS — a fonte da verdade, legível por quem dá suporte.
 *
 * ⚠️ Um inventário que só o teste lê é metade de um inventário. Quando um
 * cliente manda um print com um endereço, quem atende precisa responder três
 * coisas em dez segundos: **esta rota existe?**, **quem responde por ela?** e
 * **ela vai continuar existindo?**. Sem isso, a resposta padrão vira "vou
 * verificar", e a dúvida sobe para quem escreveu o código.
 *
 * A lista é a MESMA que a matriz de consistência confere (`core/rotas/
 * inventario`), então tela e teste nunca divergem: se aparecer rota nova não
 * declarada, o CI falha antes de esta tela ficar desatualizada.
 */
import * as React from "react";
import Link from "next/link";
import { Card, Icon, StatusBadge, Input } from "@/components/ui";
import {
  INVENTARIO, CANONICAS, APOSENTANDO, type RotaInventario, type StatusRota,
} from "@/core/rotas/inventario";
import { TODOS_OS_DESVIOS } from "@/core/rotas/aliases";
import { FUSOES, pendencias, prontaParaAposentar } from "@/core/rotas/consolidacao";

const TOM: Record<StatusRota, "positive" | "warning" | "neutral"> = {
  canonica: "positive",
  aposentando: "warning",
  interna: "neutral",
};
const ROTULO: Record<StatusRota, string> = {
  canonica: "Canônica",
  aposentando: "Em aposentadoria",
  interna: "Interna",
};

export function InventarioRotasView() {
  const [busca, setBusca] = React.useState("");
  const q = busca.trim().toLowerCase();

  const filtradas = React.useMemo(
    () =>
      INVENTARIO.filter(
        (i) => !q || i.rota.toLowerCase().includes(q) || i.nome.toLowerCase().includes(q) || i.dono.includes(q),
      ),
    [q],
  );

  const porDono = React.useMemo(() => {
    const m = new Map<string, RotaInventario[]>();
    for (const i of filtradas) m.set(i.dono, [...(m.get(i.dono) ?? []), i]);
    return Array.from(m).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtradas]);

  return (
    <div className="flex flex-col gap-5 pb-6">
      <Card className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-x-10 gap-y-3">
          <Numero label="Rotas declaradas" v={INVENTARIO.length} />
          <Numero label="Canônicas" v={CANONICAS.length} tom="var(--color-positive)" />
          <Numero label="Em aposentadoria" v={APOSENTANDO.length} tom="var(--color-warning)" />
          <Numero label="Endereços antigos com desvio" v={TODOS_OS_DESVIOS.length} />
        </div>
        <p className="m-0 text-caption text-faint max-w-[76ch]">
          Esta lista é a mesma que o teste automatizado confere a cada deploy: ele varre as
          páginas realmente publicadas e falha se aparecer rota que ninguém declarou. Tela e
          teste não podem divergir.
        </p>
        <Input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por endereço, nome da tela ou módulo…"
        />
      </Card>

      {APOSENTANDO.length > 0 && (
        <Card padded={false}>
          <div className="px-5 py-3 border-b border-border-soft">
            <span className="text-label font-medium text-muted">Em aposentadoria</span>
            <p className="m-0 mt-1 text-caption text-faint max-w-[76ch]">
              Vão virar desvio permanente. ⚠️ Cada uma só pode ser desligada quando tudo que ela
              fazia melhor já existir na canônica — o que falta está listado abaixo, e a guarda
              impede o desligamento antes disso.
            </p>
          </div>
          {APOSENTANDO.map((i, k) => {
            const fusao = FUSOES.find((f) => f.aposentar.some((r) => r.split("?")[0] === i.rota));
            const falta = fusao ? pendencias(fusao) : [];
            return (
              <div key={i.rota} className={`flex flex-col gap-1 px-5 py-3 ${k ? "border-t border-border-soft" : ""}`}>
                <div className="flex items-center gap-3 flex-wrap">
                  <code className="text-caption text-ink">{i.rota}</code>
                  <span className="text-caption text-faint">{i.nome}</span>
                  <span className="text-caption text-placeholder ml-auto">
                    até {i.aposentadoriaEm}
                  </span>
                  <StatusBadge tone={fusao && prontaParaAposentar(fusao) ? "positive" : "warning"}>
                    {fusao && prontaParaAposentar(fusao) ? "pronta" : `${falta.length} a portar`}
                  </StatusBadge>
                </div>
                {falta.map((f) => (
                  <span key={f.o_que} className="text-caption text-faint pl-3 border-l border-border-soft">
                    {f.o_que}
                  </span>
                ))}
              </div>
            );
          })}
        </Card>
      )}

      {porDono.map(([dono, rotas]) => (
        <Card key={dono} padded={false}>
          <div className="px-5 py-3 border-b border-border-soft flex items-center justify-between gap-3">
            <span className="text-label font-medium text-muted capitalize">{dono}</span>
            <span className="text-caption text-faint tabular-nums">{rotas.length}</span>
          </div>
          {rotas.map((i, k) => (
            <div key={i.rota} className={`flex items-center gap-3 px-5 py-2 ${k ? "border-t border-border-soft" : ""}`}>
              <Link href={i.rota} className="flex-1 min-w-0 group">
                <div className="truncate text-[15px] text-ink group-hover:underline">{i.nome}</div>
                <code className="text-caption text-faint truncate block">{i.rota}</code>
              </Link>
              <StatusBadge tone={TOM[i.status]}>{ROTULO[i.status]}</StatusBadge>
              <Icon name="arrow-up-right" size={12} color="var(--color-text-tertiary)" />
            </div>
          ))}
        </Card>
      ))}

      <Card padded={false}>
        <div className="px-5 py-3 border-b border-border-soft">
          <span className="text-label font-medium text-muted">Endereços antigos que ainda respondem</span>
          <p className="m-0 mt-1 text-caption text-faint max-w-[76ch]">
            Respondem com desvio permanente (308) e são CONTADOS a cada acesso — é a contagem que
            permite remover um deles com evidência em vez de com palpite.
          </p>
        </div>
        {TODOS_OS_DESVIOS.map((a, k) => (
          <div key={a.de} className={`flex items-baseline gap-3 px-5 py-2 ${k ? "border-t border-border-soft" : ""}`}>
            <code className="text-caption text-muted shrink-0">{a.de}</code>
            <Icon name="arrow-up-right" size={11} color="var(--color-text-tertiary)" />
            <code className="text-caption text-ink shrink-0">{a.para}</code>
            <span className="text-caption text-placeholder truncate">{a.motivo}</span>
          </div>
        ))}
      </Card>
    </div>
  );
}

function Numero({ label, v, tom }: { label: string; v: number; tom?: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-caption text-faint">{label}</span>
      <span className="text-[22px] font-semibold tabular-nums" style={{ color: tom ?? "var(--color-ink)" }}>
        {v}
      </span>
    </div>
  );
}
