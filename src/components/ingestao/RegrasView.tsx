"use client";

/**
 * Regras de categorização — a conciliação automática do dono.
 *
 * "Toda saída que contém 'posto' é Combustível." Escrita uma vez, vale para
 * todo extrato futuro. É o degrau acima do aprendizado automático, que só casa
 * a contraparte EXATA: a regra pega as variações ("POSTO SHELL 042",
 * "POSTO SHELL 118") que a memória exata perderia.
 *
 * A ORDEM é a prioridade: a primeira regra que casa vence, como num firewall.
 * Por isso há setas para mover — é assim que o dono resolve empate, sem pesos.
 */
import * as React from "react";
import { Card, Button, Icon, Input, Select, CurrencyInput, InfoHint } from "@/components/ui";
import {
  listarRegras, adicionarRegra, removerRegra, alternarRegra, moverRegra, usoDasRegras,
} from "@/lib/regras";
import type { OperadorTexto, RegraCategorizacao } from "@/core/regras";

/** Vocabulário do FDIP + as categorias que o CNAE produz. */
const CATEGORIAS = [
  "Fornecedores / insumos", "Folha de pagamento", "Aluguel", "Utilidades", "Impostos",
  "Tarifas bancárias", "Marketing", "Assinaturas / software", "Combustível",
  "Alimentação", "Frete e logística", "Serviços profissionais", "Manutenção",
  "Seguros", "Saúde", "Educação", "Viagens", "Obras e instalações", "Lazer",
  "Vendas", "Outras despesas",
];

const OPS: { id: OperadorTexto; label: string }[] = [
  { id: "contem", label: "contém" },
  { id: "comeca", label: "começa com" },
  { id: "igual", label: "é igual a" },
];

export function RegrasView() {
  const [regras, setRegras] = React.useState<RegraCategorizacao[]>([]);
  const [uso, setUso] = React.useState<Record<string, number>>({});
  const [aberto, setAberto] = React.useState(false);

  React.useEffect(() => {
    setRegras(listarRegras());
    setUso(usoDasRegras());
  }, []);

  // formulário
  const [texto, setTexto] = React.useState("");
  const [op, setOp] = React.useState<OperadorTexto>("contem");
  const [tipo, setTipo] = React.useState<"" | "entrada" | "saida">("saida");
  const [categoria, setCategoria] = React.useState(CATEGORIAS[0]);
  const [vMin, setVMin] = React.useState(0);
  const [vMax, setVMax] = React.useState(0);

  const criar = () => {
    if (!texto.trim()) return;
    const nome = `${texto.trim()} → ${categoria}`;
    const nova: RegraCategorizacao = {
      id: `r_${Date.now().toString(36)}`,
      nome,
      ativa: true,
      quando: {
        contraparte: { op, valor: texto.trim() },
        ...(tipo ? { tipo } : {}),
        ...(vMin > 0 ? { valorMin: vMin } : {}),
        ...(vMax > 0 ? { valorMax: vMax } : {}),
      },
      entao: { categoria },
      criadaEm: "",
      origem: "manual",
    };
    setRegras(adicionarRegra(nova));
    setTexto(""); setVMin(0); setVMax(0); setAberto(false);
  };

  return (
    <div className="flex flex-col gap-5">
      <Card
        info={{
          titulo: "Regras de categorização",
          oQue: "Regras que categorizam sozinhas todo extrato que você importar daqui pra frente.",
          comoCalcula: "Na importação, as regras rodam ANTES de tudo: o que uma regra pega não passa por palpite de palavra-chave nem pela IA. A primeira regra que casa vence — use as setas para mudar a prioridade.",
        }}
      >
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <h2 className="m-0 text-h3 font-semibold text-ink">Regras de categorização</h2>
            <p className="m-0 mt-1 text-caption text-muted max-w-[60ch]">
              Escreva uma vez, vale para sempre. Elas rodam antes da IA — o que a regra
              resolve, ninguém precisa adivinhar depois.
            </p>
          </div>
          <Button variant="primary" onClick={() => setAberto((v) => !v)}>
            {aberto ? "Cancelar" : "Nova regra"}
          </Button>
        </div>

        {aberto && (
          <div className="mt-5 pt-5 border-t border-border-soft flex flex-col gap-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="flex flex-col gap-[6px]">
                <label className="text-caption font-medium text-muted">Quando a contraparte…</label>
                <Select value={op} onChange={(v) => setOp(v as OperadorTexto)}
                  options={OPS.map((o) => ({ value: o.id, label: o.label }))} />
              </div>
              <div className="flex flex-col gap-[6px] lg:col-span-2">
                <label className="text-caption font-medium text-muted">…este texto</label>
                <Input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="ex.: posto" />
              </div>
              <div className="flex flex-col gap-[6px]">
                <label className="text-caption font-medium text-muted">Só em</label>
                <Select value={tipo} onChange={(v) => setTipo(v as typeof tipo)}
                  options={[{ value: "saida", label: "Saídas" }, { value: "entrada", label: "Entradas" }, { value: "", label: "Ambos" }]} />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="flex flex-col gap-[6px]">
                <label className="text-caption font-medium text-muted">Então a categoria é</label>
                <Select value={categoria} onChange={setCategoria}
                  options={CATEGORIAS.map((c) => ({ value: c, label: c }))} />
              </div>
              <div className="flex flex-col gap-[6px]">
                <label className="text-caption font-medium text-muted">Valor mínimo (opcional)</label>
                <CurrencyInput value={vMin} onValueChange={setVMin} />
              </div>
              <div className="flex flex-col gap-[6px]">
                <label className="text-caption font-medium text-muted">Valor máximo (opcional)</label>
                <CurrencyInput value={vMax} onValueChange={setVMax} />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="primary" onClick={criar} disabled={!texto.trim()}>Criar regra</Button>
              {texto.trim() && (
                <span className="text-caption text-faint">
                  Toda {tipo === "entrada" ? "entrada" : tipo === "saida" ? "saída" : "movimentação"} cuja
                  contraparte {OPS.find((o) => o.id === op)?.label} <b className="text-ink">{texto.trim()}</b> vira <b className="text-ink">{categoria}</b>.
                </span>
              )}
            </div>
          </div>
        )}
      </Card>

      <Card>
        <div className="flex items-center gap-2 mb-1">
          <h3 className="m-0 text-h3 font-semibold text-ink">Suas regras</h3>
          <span className="text-caption text-faint">{regras.length === 0 ? "nenhuma ainda" : `${regras.length} · em ordem de prioridade`}</span>
        </div>

        {regras.length === 0 ? (
          <p className="m-0 py-8 text-center text-label text-muted">
            Sem regras ainda. Crie a primeira e o próximo extrato já chega categorizado.
          </p>
        ) : (
          <div className="flex flex-col mt-3">
            {regras.map((r, i) => {
              const q = r.quando;
              const cond = [
                q.contraparte?.valor ? `contraparte ${OPS.find((o) => o.id === q.contraparte!.op)?.label} "${q.contraparte.valor}"` : null,
                q.tipo ? (q.tipo === "entrada" ? "entradas" : "saídas") : null,
                q.valorMin ? `≥ R$ ${q.valorMin.toLocaleString("pt-BR")}` : null,
                q.valorMax ? `≤ R$ ${q.valorMax.toLocaleString("pt-BR")}` : null,
                q.cnaePrefixo ? `CNAE ${q.cnaePrefixo}…` : null,
              ].filter(Boolean).join(" · ");
              const n = uso[r.id] ?? 0;
              return (
                <div key={r.id} className="flex items-center gap-3 py-3 border-b border-border-soft last:border-0">
                  <span className="text-caption text-faint tabular-nums w-5 shrink-0">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className={`text-label font-medium truncate ${r.ativa ? "text-ink" : "text-faint line-through"}`}>
                      {r.entao.categoria}
                    </div>
                    <div className="text-caption text-muted truncate">{cond}</div>
                  </div>
                  <span className="text-caption text-faint tabular-nums shrink-0 hidden sm:block">
                    {n === 0 ? "nunca usada" : `${n}×`}
                  </span>
                  {r.origem === "aprendida" && (
                    <span className="text-caption text-faint shrink-0 hidden md:block">aprendida</span>
                  )}
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => setRegras(moverRegra(r.id, -1))} disabled={i === 0}
                      aria-label="Subir prioridade" className="p-1 rounded-md text-muted hover:text-ink hover:bg-surface-2 disabled:opacity-30">
                      <Icon name="chevron-up" size={15} color="currentColor" />
                    </button>
                    <button onClick={() => setRegras(moverRegra(r.id, 1))} disabled={i === regras.length - 1}
                      aria-label="Descer prioridade" className="p-1 rounded-md text-muted hover:text-ink hover:bg-surface-2 disabled:opacity-30">
                      <Icon name="chevron-down" size={15} color="currentColor" />
                    </button>
                    <button onClick={() => setRegras(alternarRegra(r.id))}
                      aria-label={r.ativa ? "Desativar" : "Ativar"} className="p-1 rounded-md text-muted hover:text-ink hover:bg-surface-2">
                      <Icon name={r.ativa ? "check" : "x"} size={15} color="currentColor" />
                    </button>
                    <button onClick={() => setRegras(removerRegra(r.id))}
                      aria-label="Excluir" className="p-1 rounded-md text-muted hover:text-negative hover:bg-surface-2">
                      <Icon name="trash-2" size={15} color="currentColor" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
