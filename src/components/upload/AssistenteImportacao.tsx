"use client";

/**
 * O assistente da importação — a janela em quatro passos que abre depois que o
 * arquivo é lido e ANTES de qualquer coisa entrar no sistema (pedido do dono,
 * 27/10/2026): Resumo · Receitas · Despesas · Confirmar.
 *
 * As contas moram em `core/fdip/assistente` (puro); esta tela só desenha e
 * guarda as decisões. Quem grava é o `onConfirmar` da tela de importação, pelo
 * escritor único (`aplicarOnboarding`).
 *
 * ⚠️ Portal no `<body>`: o `Card` do DS tem `transform`, e um ancestral
 * transformado vira o bloco de contenção de qualquer `position: fixed`.
 */
import * as React from "react";
import { createPortal } from "react-dom";
import { BRL, Button, Icon, Select, Switch } from "@/components/ui";
import type { FDIPReport } from "@/core/fdip/types";
import {
  CATEGORIAS_DESPESA, CATEGORIAS_RECEITA, aplicarDecisoes, decisaoPadrao, montarAssistente,
  type DecisaoGrupo, type GrupoImportacao, type RecorrenciaAPlanejar,
} from "@/core/fdip/assistente";

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const rotuloMes = (k: string) => `${MESES[Number(k.slice(5, 7)) - 1] ?? k.slice(5, 7)}/${k.slice(2, 4)}`;
const dataCurta = (iso: string) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "—");

const PASSOS = ["Resumo", "Receitas", "Despesas", "Confirmar"] as const;

export interface AssistenteImportacaoProps {
  report: FDIPReport;
  aberto: boolean;
  aplicando: boolean;
  onFechar: () => void;
  /** grava o relatório decidido e cria as recorrências marcadas */
  onConfirmar: (r: { report: FDIPReport; recorrencias: RecorrenciaAPlanejar[]; aprendidas: { recordIds: string[]; categoria: string }[] }) => void;
}

export function AssistenteImportacao({ report, aberto, aplicando, onFechar, onConfirmar }: AssistenteImportacaoProps) {
  const a = React.useMemo(() => montarAssistente(report), [report]);
  const grupos = React.useMemo(() => [...a.receitas, ...a.despesas], [a]);
  const [passo, setPasso] = React.useState(0);
  const [dec, setDec] = React.useState<Record<string, DecisaoGrupo>>({});
  const corpo = React.useRef<HTMLDivElement>(null);

  /*
   * ⚠️ O relatório MUDA com a janela aberta: as regras, o CNAE e a IA
   * recategorizam depois da leitura. Zerar tudo a cada mudança apagaria o que a
   * pessoa já escolheu e a jogaria de volta ao passo 1. Então: grupo que a
   * pessoa TOCOU fica como ela deixou; o resto acompanha a leitura nova. E só
   * outro ARQUIVO (outro conjunto de lançamentos) volta ao primeiro passo.
   */
  const tocados = React.useRef(new Set<string>());
  const arquivo = report.records.map((r) => r.fingerprint).join("|");
  React.useEffect(() => { tocados.current = new Set(); setPasso(0); }, [arquivo]);
  React.useEffect(() => {
    setDec((atual) => Object.fromEntries(grupos.map((g) => [
      g.chave,
      tocados.current.has(g.chave) && atual[g.chave] ? atual[g.chave] : decisaoPadrao(g),
    ])));
  }, [grupos]);

  React.useEffect(() => { corpo.current?.scrollTo({ top: 0 }); }, [passo]);

  React.useEffect(() => {
    if (!aberto) return;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape" && !aplicando) onFechar(); };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [aberto, aplicando, onFechar]);

  if (!aberto || typeof document === "undefined") return null;

  const mudar = (chave: string, p: Partial<DecisaoGrupo>) => {
    tocados.current.add(chave);
    setDec((d) => ({ ...d, [chave]: { ...d[chave], ...p } }));
  };

  // custo fixo segue as escolhas: o que a pessoa marca como recorrente e estável
  const custoFixo = a.despesas.filter((g) => g.fixo && dec[g.chave]?.recorrente).reduce((s, g) => s + g.mediaMensal, 0);
  const custoMarcado = a.despesas.filter((g) => dec[g.chave]?.recorrente).reduce((s, g) => s + g.mediaMensal, 0);
  const receitaMarcada = a.receitas.filter((g) => dec[g.chave]?.recorrente).reduce((s, g) => s + g.mediaMensal, 0);

  const confirmar = () => {
    const { report: final, recorrencias } = aplicarDecisoes(report, grupos, dec);
    const aprendidas = grupos
      .filter((g) => dec[g.chave] && dec[g.chave].categoria !== g.categoria)
      .map((g) => ({ recordIds: g.recordIds, categoria: dec[g.chave].categoria }));
    onConfirmar({ report: final, recorrencias, aprendidas });
  };

  const ultimo = passo === PASSOS.length - 1;

  return createPortal(
    <div
      className="fixed inset-0 z-[90] bg-black/40 flex items-center justify-center p-4"
      role="dialog" aria-modal="true" aria-label="Revisar a importação"
      onClick={() => !aplicando && onFechar()}
    >
      <div
        className="a4p-entra w-full max-w-[820px] max-h-[90vh] bg-white rounded-card flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* a raiz do DS mora DENTRO do cartão: `.ds-visor` zera o fundo, e no
            cartão ele apagaria o branco da janela */}
        <div className="ds-visor flex flex-col flex-1 min-h-0">
        {/* cabeçalho + passos */}
        <div className="px-6 pt-5 pb-4 flex flex-col gap-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-1">
              <span className="text-caption text-muted inline-flex items-center gap-2">
                <span className="w-[6px] h-[6px] rounded-pill bg-lime" aria-hidden />
                Importação · passo {passo + 1} de {PASSOS.length}
              </span>
              <h2 className="m-0 text-h2 text-ink">Revisar a importação</h2>
              <span className="text-caption text-muted">
                {a.resumo.lancamentos} lançamentos de {dataCurta(a.resumo.de)} a {dataCurta(a.resumo.ate)}. Nada entra no sistema antes de você confirmar.
              </span>
            </div>
            <button
              type="button" onClick={onFechar} disabled={aplicando}
              className="shrink-0 w-9 h-9 rounded-pill bg-surface-1 hover:bg-surface-2 inline-flex items-center justify-center"
              aria-label="Fechar"
            >
              <Icon name="x" size={16} color="currentColor" />
            </button>
          </div>
          <ol className="m-0 p-0 list-none grid grid-cols-4 gap-2" aria-label="Passos">
            {PASSOS.map((p, i) => (
              <li key={p}>
                <button
                  type="button" onClick={() => setPasso(i)} aria-current={i === passo ? "step" : undefined}
                  className="w-full flex flex-col gap-2 text-left"
                >
                  <span className={`h-1 rounded-pill transition-colors ${i <= passo ? "bg-ink" : "bg-surface-2"}`} />
                  <span className={`text-caption ${i === passo ? "text-ink font-medium" : "text-muted"}`}>{i + 1}. {p}</span>
                </button>
              </li>
            ))}
          </ol>
        </div>

        <div ref={corpo} className="flex-1 overflow-y-auto px-6 pb-6" tabIndex={0} role="region" aria-label={PASSOS[passo]}>
          {passo === 0 && <PassoResumo a={a} />}
          {passo === 1 && (
            <PassoGrupos
              lado="entrada" grupos={a.receitas} dec={dec} mudar={mudar}
              cabecalho={
                <Destaque
                  rotulo="Receita recorrente marcada"
                  valor={receitaMarcada}
                  texto="Pagadores que aparecem todo mês viram contrato em Assinaturas, como rascunho: você ativa quando quiser projetar as faturas no fluxo de caixa."
                />
              }
            />
          )}
          {passo === 2 && (
            <PassoGrupos
              lado="saida" grupos={a.despesas} dec={dec} mudar={mudar}
              cabecalho={
                <Destaque
                  rotulo="Seu custo fixo estimado"
                  valor={custoFixo}
                  texto={
                    a.resumo.mesesNoPeriodo < 2
                      ? "Com um mês só no arquivo não dá para ver o que se repete. Importe dois ou três meses para o custo fixo aparecer."
                      : `Lido nos ${a.resumo.mesesNoPeriodo} meses do arquivo: o que se repete todo mês com o mesmo valor (variação de até 15%).`
                        + (Math.abs(custoMarcado - custoFixo) >= 0.01
                          ? ` Com as contas que variam, as recorrentes marcadas somam R$ ${custoMarcado.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} por mês.`
                          : "")
                  }
                />
              }
            />
          )}
          {passo === 3 && <PassoConfirmar a={a} grupos={grupos} dec={dec} />}
        </div>

        {/* rodapé */}
        <div className="px-6 py-4 flex items-center justify-between gap-3 bg-surface-1">
          <Button variant="ghost" onClick={() => (passo === 0 ? onFechar() : setPasso(passo - 1))} disabled={aplicando}>
            {passo === 0 ? "Cancelar" : "Voltar"}
          </Button>
          {ultimo ? (
            <Button variant="primary" onClick={confirmar} disabled={aplicando}>
              {aplicando ? "Importando…" : "Confirmar e importar"}
            </Button>
          ) : (
            <Button variant="primary" onClick={() => setPasso(passo + 1)}>
              Avançar
            </Button>
          )}
        </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* ───────────────────────── passo 1 ───────────────────────── */
function PassoResumo({ a }: { a: ReturnType<typeof montarAssistente> }) {
  const r = a.resumo;
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Numero rotulo="Receitas" valor={r.entradas} />
        <Numero rotulo="Despesas" valor={r.saidas} />
        <Numero rotulo="Resultado" valor={r.resultado} sinal />
      </div>

      <div className="rounded-md bg-surface-1 overflow-hidden">
        <table className="w-full text-caption">
          <thead>
            <tr className="text-muted">
              <th className="text-left font-medium px-4 py-2">Mês</th>
              <th className="text-right font-medium px-4 py-2">Receitas</th>
              <th className="text-right font-medium px-4 py-2">Despesas</th>
              <th className="text-right font-medium px-4 py-2">Resultado</th>
            </tr>
          </thead>
          <tbody>
            {r.porMes.map((m) => (
              <tr key={m.mes} className="border-t border-border-soft">
                <td className="px-4 py-2 text-ink">{rotuloMes(m.mes)}</td>
                <td className="px-4 py-2 text-right text-ink"><BRL value={m.entradas} /></td>
                <td className="px-4 py-2 text-right text-ink"><BRL value={m.saidas} /></td>
                <td className="px-4 py-2 text-right text-ink"><BRL value={m.entradas - m.saidas} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Leitura icone="repeat" titulo="Receita recorrente" valor={r.receitaRecorrenteMensal} sufixo="/mês" texto={`${a.receitas.filter((g) => g.recorrente).length} pagador(es) que voltam todo mês`} />
        <Leitura icone="receipt" titulo="Custo fixo" valor={r.custoFixoMensal} sufixo="/mês" texto={`${a.despesas.filter((g) => g.fixo).length} conta(s) com o mesmo valor todo mês`} />
        <Leitura icone="trending-down" titulo="Recorrente que varia" valor={r.custoVariavelRecorrente} sufixo="/mês" texto="Repete todo mês, mas o valor muda (luz, combustível…)" />
      </div>

      {r.transferencias > 0 && (
        <p className="m-0 text-caption text-muted inline-flex items-start gap-2">
          <Icon name="arrow-left-right" size={14} color="currentColor" className="mt-[2px] shrink-0" />
          {r.transferencias} transferência(s) entre contas (R$ {r.valorTransferencias.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}) ficam fora de receitas e despesas: é dinheiro que só mudou de conta.
        </p>
      )}
    </div>
  );
}

/* ───────────────────────── passos 2 e 3 ───────────────────────── */
function PassoGrupos({
  lado, grupos, dec, mudar, cabecalho,
}: {
  lado: "entrada" | "saida";
  grupos: GrupoImportacao[];
  dec: Record<string, DecisaoGrupo>;
  mudar: (chave: string, p: Partial<DecisaoGrupo>) => void;
  cabecalho: React.ReactNode;
}) {
  const [verAvulsos, setVerAvulsos] = React.useState(false);
  const recorrentes = grupos.filter((g) => g.recorrente);
  const avulsos = grupos.filter((g) => !g.recorrente);
  const opcoes = (lado === "entrada" ? CATEGORIAS_RECEITA : CATEGORIAS_DESPESA) as readonly string[];

  if (!grupos.length) {
    return <p className="m-0 text-label text-muted py-8 text-center">Nenhuma {lado === "entrada" ? "receita" : "despesa"} neste arquivo.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {cabecalho}
      <h3 className="m-0 text-h3 text-ink">
        {lado === "entrada" ? "Categorize suas receitas" : "Categorize suas despesas"}
      </h3>
      {recorrentes.length > 0 && (
        <Secao titulo={`Todo mês · ${recorrentes.length}`}>
          {recorrentes.map((g) => <LinhaGrupo key={g.chave} g={g} d={dec[g.chave]} opcoes={opcoes} mudar={mudar} />)}
        </Secao>
      )}
      {avulsos.length > 0 && (
        <Secao titulo={`Avulsos · ${avulsos.length}`}>
          {(verAvulsos || recorrentes.length === 0 ? avulsos : avulsos.slice(0, 5)).map((g) => (
            <LinhaGrupo key={g.chave} g={g} d={dec[g.chave]} opcoes={opcoes} mudar={mudar} />
          ))}
          {!verAvulsos && recorrentes.length > 0 && avulsos.length > 5 && (
            <button type="button" onClick={() => setVerAvulsos(true)} className="text-caption text-muted hover:text-ink underline self-start">
              Mostrar os outros {avulsos.length - 5}
            </button>
          )}
        </Secao>
      )}
    </div>
  );
}

function LinhaGrupo({
  g, d, opcoes, mudar,
}: {
  g: GrupoImportacao;
  d: DecisaoGrupo | undefined;
  opcoes: readonly string[];
  mudar: (chave: string, p: Partial<DecisaoGrupo>) => void;
}) {
  const id = React.useId();
  if (!d) return null;
  const lista = opcoes.includes(d.categoria) ? opcoes : [d.categoria, ...opcoes];
  const quem = g.lado === "entrada" ? "cliente" : "fornecedor";
  // na despesa o selo separa o custo fixo do que repete e varia; na receita a seção já diz "Todo mês"
  const selo = g.lado === "entrada" ? null : g.fixo ? "Fixo" : g.recorrente ? "Varia" : null;
  return (
    <div className="rounded-md bg-surface-1 p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex flex-col gap-1 min-w-0">
          <span className="text-label font-medium text-ink inline-flex items-center gap-2">
            {g.nome}
            {selo && <span className="text-caption text-muted bg-white rounded-pill px-2 py-[1px]">{selo}</span>}
          </span>
          <span className="text-caption text-muted">
            {g.ocorrencias} {g.ocorrencias === 1 ? "lançamento" : "lançamentos"} em {g.meses} {g.meses === 1 ? "mês" : "meses"}
            {g.recorrente ? ` · costuma cair dia ${g.diaTipico}` : ` · último em ${dataCurta(g.ultima)}`}
          </span>
        </div>
        <div className="flex flex-col items-end">
          <span className="text-label text-ink"><BRL value={g.recorrente ? g.mediaMensal : g.total} /></span>
          <span className="text-caption text-muted">{g.recorrente ? "por mês" : "no período"}</span>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto] gap-3 items-center">
        <Select
          aria-label={`Categoria de ${g.nome}`}
          value={d.categoria}
          onChange={(v) => mudar(g.chave, { categoria: v })}
          options={lista.map((c) => ({ value: c, label: c }))}
        />
        <div className="flex flex-col gap-2">
          <Switch
            id={`${id}-cad`} className="text-caption"
            checked={d.cadastrar} onChange={(v) => mudar(g.chave, { cadastrar: v })}
            label={`Cadastrar como ${quem}`}
          />
          <div className="flex items-center gap-2">
            <Switch
              id={`${id}-rec`} className="text-caption"
              checked={d.recorrente} onChange={(v) => mudar(g.chave, { recorrente: v })}
              label={g.lado === "entrada" ? "Receita recorrente, dia" : "Conta recorrente, dia"}
            />
            <input
              type="number" min={1} max={31} value={d.dia}
              onChange={(e) => mudar(g.chave, { dia: Math.min(31, Math.max(1, Number(e.target.value) || 1)) })}
              disabled={!d.recorrente}
              aria-label={`Dia do mês da recorrência de ${g.nome}`}
              className="w-14 h-8 rounded-md bg-white px-2 text-caption text-ink tabular-nums outline-none disabled:opacity-45"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────── passo 4 ───────────────────────── */
function PassoConfirmar({ a, grupos, dec }: { a: ReturnType<typeof montarAssistente>; grupos: GrupoImportacao[]; dec: Record<string, DecisaoGrupo> }) {
  const marcados = grupos.filter((g) => dec[g.chave]);
  const clientes = marcados.filter((g) => g.lado === "entrada" && dec[g.chave].cadastrar).length;
  const fornecedores = marcados.filter((g) => g.lado === "saida" && dec[g.chave].cadastrar).length;
  const mudadas = marcados.filter((g) => dec[g.chave].categoria !== g.categoria).length;
  const recs = marcados.filter((g) => dec[g.chave].recorrente);
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Contagem rotulo="Lançamentos" n={a.resumo.lancamentos} />
        <Contagem rotulo="Clientes" n={clientes} />
        <Contagem rotulo="Fornecedores" n={fornecedores} />
        <Contagem rotulo="Recorrências" n={recs.length} />
      </div>
      {mudadas > 0 && (
        <p className="m-0 text-caption text-muted">
          Você mudou a categoria de {mudadas} {mudadas === 1 ? "grupo" : "grupos"}. O sistema guarda a escolha e usa nas próximas importações.
        </p>
      )}
      {recs.length > 0 && (
        <Secao titulo="Recorrências que serão criadas">
          {recs.map((g) => (
            <div key={g.chave} className="flex items-center justify-between gap-3 py-2 border-b border-border-soft last:border-0">
              <div className="flex flex-col min-w-0">
                <span className="text-label text-ink truncate">{g.nome}</span>
                <span className="text-caption text-muted">
                  {g.lado === "entrada" ? "Contrato a receber (rascunho)" : "Conta a pagar"} · {dec[g.chave].categoria} · todo dia {dec[g.chave].dia}
                </span>
              </div>
              <span className="text-label text-ink shrink-0"><BRL value={g.mediaMensal} /></span>
            </div>
          ))}
        </Secao>
      )}
      <p className="m-0 text-caption text-muted">
        Ao confirmar, os lançamentos entram com as categorias escolhidas e passam a aparecer no fluxo de caixa, no DRE e nos relatórios.
      </p>
    </div>
  );
}

/* ───────────────────────── peças ───────────────────────── */
function Numero({ rotulo, valor }: { rotulo: string; valor: number; sinal?: boolean }) {
  return (
    <div className="rounded-md bg-surface-1 p-4 flex flex-col gap-1">
      <span className="text-caption text-muted">{rotulo}</span>
      <span className="a4p-heroi text-h2 text-ink leading-none"><BRL value={valor} /></span>
    </div>
  );
}

function Leitura({ icone, titulo, valor, sufixo, texto }: { icone: "repeat" | "receipt" | "trending-down"; titulo: string; valor: number; sufixo: string; texto: string }) {
  return (
    <div className="rounded-md bg-surface-1 p-4 flex flex-col gap-1">
      <span className="text-caption text-muted inline-flex items-center gap-2">
        <Icon name={icone} size={14} color="currentColor" /> {titulo}
      </span>
      <span className="text-label text-ink"><BRL value={valor} /><span className="text-caption text-muted">{sufixo}</span></span>
      <span className="text-caption text-muted">{texto}</span>
    </div>
  );
}

function Destaque({ rotulo, valor, texto }: { rotulo: string; valor: number; texto: string }) {
  return (
    <div className="rounded-md bg-surface-1 p-4 flex items-center justify-between gap-4 flex-wrap">
      <div className="flex flex-col gap-1 max-w-[460px]">
        <span className="text-label font-medium text-ink">{rotulo}</span>
        <span className="text-caption text-muted">{texto}</span>
      </div>
      <span className="a4p-heroi text-h2 text-ink leading-none"><BRL value={valor} /><span className="text-caption text-muted">/mês</span></span>
    </div>
  );
}

function Contagem({ rotulo, n }: { rotulo: string; n: number }) {
  return (
    <div className="rounded-md bg-surface-1 p-4 flex flex-col gap-1">
      <span className="text-caption text-muted">{rotulo}</span>
      <span className="text-h2 text-ink tabular-nums">{n}</span>
    </div>
  );
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <span className="text-caption font-medium text-muted">{titulo}</span>
      {children}
    </section>
  );
}
