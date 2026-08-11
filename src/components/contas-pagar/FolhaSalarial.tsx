"use client";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FOLHA SALARIAL — quem custa quanto, e o que vence quando.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * A tela responde três perguntas que nenhuma outra respondia:
 *
 *  1. **Quanto a equipe custa de verdade** — não a soma dos salários, mas ela
 *     mais encargos e provisões. O multiplicador fica visível, porque é ele que
 *     ninguém tem na cabeça na hora de contratar.
 *  2. **Quem custa quanto** — pessoa a pessoa, com a conta aberta.
 *  3. **O que vence quando** — a agenda do mês, que para um CLT são três datas
 *     e não uma.
 *
 * ⚠️ A tela não calcula nada. Tudo vem de `core/folha`, e o REGIME vem da fonte
 * única do perfil fiscal — o mesmo que a tela de impostos lê.
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import { Card, Button, Icon, BRL, Skeleton, AcaoDestrutiva } from "@/components/ui";
import { formatBRL, dataBR, pct } from "@/lib/format";
import { ROTULO_REGIME } from "@/core/fiscal/perfil";
import { listColaboradores, regimeDaEmpresa, removeColaborador, restaurarColaboradores } from "@/lib/folha";
import {
  montarPainelFolha, custoAnual, ROTULO_VINCULO, ROTULO_TITULO,
  type PainelFolha, type LinhaFolha, type Colaborador,
} from "@/core/folha";

const mesAtual = () => new Date().toISOString().slice(0, 7);

const NOMES_MES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const rotuloMes = (m: string) => {
  const [a, mm] = m.split("-").map(Number);
  return `${NOMES_MES[mm - 1]} de ${a}`;
};
const deslocar = (m: string, n: number) => {
  const [a, mm] = m.split("-").map(Number);
  const d = new Date(Date.UTC(a, mm - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

export function FolhaSalarial() {
  const router = useRouter();
  const [colaboradores, setColaboradores] = React.useState<Colaborador[] | null>(null);
  const [mes, setMes] = React.useState(mesAtual);
  const [aberto, setAberto] = React.useState<string | null>(null);

  // ⚠️ Lido num efeito, não no render: `store-org` toca `localStorage`, e ler
  // durante o render quebra a hidratação (a tela remonta do zero).
  React.useEffect(() => { setColaboradores(listColaboradores()); }, []);

  const fiscal = React.useMemo(() => regimeDaEmpresa(), []);
  const painel: PainelFolha | null = React.useMemo(
    () => (colaboradores ? montarPainelFolha(colaboradores, mes, fiscal.regime, fiscal.anexo) : null),
    [colaboradores, mes, fiscal],
  );
  const anual = React.useMemo(
    () => (colaboradores?.length ? custoAnual(colaboradores, Number(mes.slice(0, 4)), fiscal.regime, fiscal.anexo) : 0),
    [colaboradores, mes, fiscal],
  );

  if (!painel) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-[150px]" />
        <Skeleton className="h-[300px]" />
      </div>
    );
  }

  const vazio = painel.linhas.length === 0;

  return (
    <div className="flex flex-col gap-4">
      {/* ------------------------ o regime, dito ------------------------ */}
      {fiscal.regime === "nao_declarado" && (
        /* ⚠️ Sem regime declarado o custo NÃO é confiável: os 20% patronais
           entram ou não conforme ele, e a diferença é de 33 pontos sobre a
           mesma folha. Assumir um regime produziria um número com cara de
           certo — a mesma família de defeito da ONDA 6. */
        <Card className="border border-warning/40">
          <div className="flex items-start gap-3">
            <Icon name="triangle-alert" size={18} color="var(--color-warning)" />
            <div className="min-w-0">
              <p className="m-0 text-body text-ink">O regime tributário não está declarado.</p>
              <p className="m-0 mt-1 text-caption text-muted">
                Ele decide se a contribuição patronal de 20% entra no custo de cada funcionário —
                a diferença passa de 30% sobre a mesma folha. Sem ele, o cálculo usa o cenário mais
                caro: os números abaixo são um <b className="text-ink">teto</b>, e declarar o regime
                só pode reduzi-los.
              </p>
              <Button variant="ghost" onClick={() => router.push("/dashboard/administration/company-data")}>
                Declarar o regime
              </Button>
            </div>
          </div>
        </Card>
      )}
      {painel.tabelaDesatualizada && (
        <Card className="border border-warning/40">
          <div className="flex items-start gap-3">
            <Icon name="triangle-alert" size={18} color="var(--color-warning)" />
            <div className="min-w-0">
              <p className="m-0 text-body text-ink">A tabela legal usada não é a mais recente.</p>
              <p className="m-0 mt-1 text-caption text-muted">
                As faixas do INSS e do IRRF mudam por lei todo ano. O cálculo continua rodando com a
                última tabela conhecida — confira com o contador antes de usar estes valores para
                recolher.
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* ------------------------- o custo do mês ------------------------- */}
      <Card
        info={{
          titulo: "O custo da equipe",
          oQue: "Quanto a folha custa por mês, incluindo o que não aparece no salário.",
          comoCalcula:
            "Salário bruto + FGTS + encargos patronais (conforme o regime) + provisão de 13º e de férias com os encargos sobre elas. Descontos do funcionário (INSS, IRRF, VT, VR) saem do bruto e NÃO aumentam o custo.",
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-3 pr-8">
          <span className="text-h3 text-ink">Folha de {rotuloMes(mes)}</span>
          <div className="flex items-center gap-1">
            <Seta label="Mês anterior" icone="chevron-left" onClick={() => setMes(deslocar(mes, -1))} />
            <span className="text-label text-ink tabular-nums px-2">{mes.split("-").reverse().join("/")}</span>
            <Seta label="Próximo mês" icone="chevron-right" onClick={() => setMes(deslocar(mes, 1))} />
          </div>
        </div>

        {vazio ? (
          <div className="py-10 flex flex-col items-center gap-3">
            <p className="m-0 text-body text-muted text-center">
              Nenhum colaborador cadastrado nesta competência.
            </p>
            <Button variant="primary" onClick={() => router.push("/dashboard/financial/payables/new")}>
              <Icon name="plus" size={15} color="currentColor" />
              Cadastrar colaborador
            </Button>
          </div>
        ) : (
          <>
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Numero rotulo="Salários e notas" valor={painel.totalBruto}
                detalhe={`${painel.quantosCLT} CLT · ${painel.quantosPJ} PJ`} />
              <Numero rotulo="A equipe recebe" valor={painel.totalLiquido}
                detalhe="líquido, depois dos descontos" />
              <Numero rotulo="Encargos e provisões" valor={painel.totalEncargos}
                detalhe="FGTS, patronal, 13º e férias" />
              {/* ⚠️ O CUSTO em destaque, com o multiplicador ao lado: é o número
                  que muda a decisão de contratar, e o único que não aparece em
                  nenhum contracheque. */}
              <Numero rotulo="A empresa gasta" valor={painel.custoTotal} forte
                detalhe={`${painel.multiplicador.toFixed(2)}× o bruto`} />
            </div>
            <p className="m-0 mt-4 text-caption text-muted">
              Regime <b className="text-ink">{ROTULO_REGIME[painel.regime]}</b>
              {painel.anexo ? ` · Anexo ${painel.anexo}` : ""} — {painel.encargos.porque}
              {anual > 0 && (
                <> Ao longo de {mes.slice(0, 4)}, a folha custa{" "}
                  <b className="text-ink">{formatBRL(anual)}</b>.</>
              )}
            </p>
          </>
        )}
      </Card>

      {!vazio && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
          {/* ---------------------- quem custa quanto ---------------------- */}
          <Card
            info={{
              titulo: "Quem custa quanto",
              oQue: "O custo de cada colaborador, com a conta aberta.",
              comoCalcula: "Cada linha roda o mesmo motor: descontos do empregado saem do bruto, encargos e provisões entram por cima.",
            }}
          >
            <span className="text-h3 text-ink pr-8">A equipe</span>
            <div className="mt-3 flex flex-col">
              {painel.linhas.map((l) => (
                <LinhaColaborador
                  key={l.colaborador.id}
                  linha={l}
                  aberto={aberto === l.colaborador.id}
                  onAbrir={() => setAberto(aberto === l.colaborador.id ? null : l.colaborador.id)}
                  onRemover={() => {
                    const antes = removeColaborador(l.colaborador.id);
                    setColaboradores(listColaboradores());
                    return () => { restaurarColaboradores(antes); setColaboradores(antes); };
                  }}
                />
              ))}
            </div>
          </Card>

          {/* ----------------------- o que vence quando ----------------------- */}
          <Card
            info={{
              titulo: "A agenda do mês",
              oQue: "Em que dia cada obrigação da folha vence.",
              comoCalcula:
                "Salário no 5º dia útil do mês seguinte (art. 459 da CLT), FGTS e DARF no dia 20, antecipando quando cai em fim de semana ou feriado. O 5º dia útil considera os feriados nacionais, inclusive os móveis.",
            }}
          >
            <div className="flex items-baseline justify-between gap-3 pr-8">
              <span className="text-h3 text-ink">Vencimentos</span>
              <span className="text-caption text-faint">{painel.titulos.length} títulos</span>
            </div>
            {/* ⚠️ Agrupado por DATA, não por pessoa: a pergunta desta coluna é
                "o que sai do caixa no dia 20", e uma lista por pessoa obriga a
                somar de cabeça. */}
            <div className="mt-3 flex flex-col gap-3">
              {agruparPorData(painel.titulos).map((g) => (
                <div key={g.data} className="rounded-card bg-surface-2 p-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-label text-ink">{dataBR(g.data)}</span>
                    <span className="a4p-num text-label text-ink"><BRL value={g.total} /></span>
                  </div>
                  <div className="mt-2 flex flex-col gap-1">
                    {g.itens.map((t, k) => (
                      <div key={k} className="flex items-center justify-between gap-3 text-caption">
                        <span className="text-muted truncate">
                          {ROTULO_TITULO[t.tipo]} · {t.colaborador}
                        </span>
                        <span className="a4p-num text-ink shrink-0">
                          <BRL value={t.valor} showDecimals={false} />
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

/* ========================================================================== */

function agruparPorData(titulos: PainelFolha["titulos"]) {
  const mapa = new Map<string, { data: string; total: number; itens: PainelFolha["titulos"] }>();
  for (const t of titulos) {
    const g = mapa.get(t.vencimento) ?? { data: t.vencimento, total: 0, itens: [] };
    g.total = Math.round((g.total + t.valor) * 100) / 100;
    g.itens.push(t);
    mapa.set(t.vencimento, g);
  }
  return Array.from(mapa.values()).sort((a, b) => a.data.localeCompare(b.data));
}

function LinhaColaborador({
  linha, aberto, onAbrir, onRemover,
}: {
  linha: LinhaFolha;
  aberto: boolean;
  onAbrir: () => void;
  onRemover: () => () => void;
}) {
  const c = linha.colaborador;
  const memoria = linha.clt?.memoria ?? linha.pj?.memoria ?? [];
  return (
    <div className="border-b border-border-soft last:border-b-0 py-3">
      <div className="flex items-center gap-3">
        <span className="min-w-0 flex-1">
          <span className="block text-label text-ink truncate">{c.nome}</span>
          <span className="block text-caption text-faint truncate">
            {ROTULO_VINCULO[c.vinculo]}{c.cargo ? ` · ${c.cargo}` : ""}
          </span>
        </span>
        <span className="text-right shrink-0">
          <span className="a4p-num block text-label text-ink"><BRL value={linha.custoTotal} /></span>
          <span className="block text-caption text-faint">
            bruto <BRL value={c.valor} showDecimals={false} />
            {linha.clt && ` · ${linha.clt.multiplicador.toFixed(2)}×`}
          </span>
        </span>
        <button
          type="button"
          onClick={onAbrir}
          aria-expanded={aberto}
          aria-label={aberto ? `Ocultar a conta de ${c.nome}` : `Ver a conta de ${c.nome}`}
          className="inline-flex items-center justify-center w-8 h-8 rounded-md bg-surface-2 text-muted hover:text-ink hover:bg-surface-3 transition-colors shrink-0"
        >
          <span className={"transition-transform " + (aberto ? "rotate-180" : "")}>
            <Icon name="chevron-down" size={15} color="currentColor" />
          </span>
        </button>
      </div>

      {aberto && (
        <div className="mt-3 flex flex-col gap-2 rounded-card bg-surface-2 p-3">
          {memoria.map((l) => (
            <div key={l.passo} className="flex items-start justify-between gap-3 text-caption">
              <span className="min-w-0">
                <span className="block text-ink">{l.descricao}</span>
                <span className="block text-faint">{l.formula}</span>
              </span>
              <span className="a4p-num text-ink shrink-0"><BRL value={l.valor} /></span>
            </div>
          ))}
          <div className="pt-2 border-t border-border-soft">
            {/* ⚠️ Remover um colaborador NÃO apaga os títulos já criados: eles
                são obrigações que existem no financeiro por conta própria. A
                frase diz isso, senão a pessoa remove esperando limpar o caixa
                e o caixa continua igual. */}
            <AcaoDestrutiva
              rotulo="Remover do cadastro"
              titulo={`Remover ${c.nome} da folha?`}
              descricao="Os títulos já agendados continuam no contas a pagar — remova-os lá se também quiser cancelá-los."
              onConfirmar={onRemover}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function Numero({
  rotulo, valor, detalhe, forte,
}: { rotulo: string; valor: number; detalhe: string; forte?: boolean }) {
  return (
    <div className={"rounded-card p-4 " + (forte ? "bg-ink text-white" : "bg-surface-2")}>
      <span className={"text-caption " + (forte ? "text-white/70" : "text-muted")}>{rotulo}</span>
      <span className={"a4p-num block text-[22px] leading-none mt-2 " + (forte ? "text-white" : "text-ink")}>
        <BRL value={valor} showDecimals={false} />
      </span>
      <span className={"block text-caption mt-2 " + (forte ? "text-white/70" : "text-faint")}>{detalhe}</span>
    </div>
  );
}

function Seta({ label, icone, onClick }: { label: string; icone: string; onClick: () => void }) {
  return (
    <button
      type="button" onClick={onClick} aria-label={label}
      className="inline-flex items-center justify-center w-8 h-8 rounded-md text-muted hover:text-ink hover:bg-surface-2 transition-colors"
    >
      <Icon name={icone} size={15} color="currentColor" />
    </button>
  );
}

export { pct };
