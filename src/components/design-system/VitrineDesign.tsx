"use client";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A VITRINE DO DESIGN SYSTEM — `/admin/design-system` (etapa 2 do editor)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Cada valor de `src/design/tokens.json` e cada peça REAL de
 * `src/components/ui/` numa página só, em oito abas. Serve para o dono VER o
 * sistema inteiro antes de mexer nele — a etapa 3 põe os controles aqui.
 *
 * ⚠️ **As peças são as de verdade, nunca cópias.** Uma vitrine que redesenha
 * o botão para mostrá-lo diverge do botão no primeiro ajuste, e aí o dono
 * aprova um desenho que o produto não tem. Por isso tudo aqui importa do
 * barril do DS, e os gráficos são os da Biblioteca com dado fixo de exemplo.
 *
 * ⚠️ **O swatch pinta com `var(--nome)`, não com o valor do arquivo.** Assim
 * ele mostra o que o navegador RESOLVE neste contexto (dentro do app, no tema
 * aberto) — o mesmo que as telas recebem. O valor do arquivo aparece escrito
 * ao lado, por contexto, para o dono comparar os dois temas sem alternar.
 *
 * ⚠️ **Editar não grava.** Cada valor vira um campo (`./editor`): o que se
 * digita entra num rascunho, aparece AO VIVO na própria vitrine, e só chega ao
 * sistema por "Salvar no sistema", que abre um PR com o `tokens.json` novo.
 */
import * as React from "react";
import tokensJson from "@/design/tokens.json";
import { HubShell, type AbaHub } from "@/components/app/HubShell";
import { useTheme } from "@/components/app/ThemeToggle";
import {
  Button, Card, Badge, Pill, Input, Select, CurrencyInput, Switch, Checkbox, Textarea,
  Money, BRL, StatusBadge, PontoStatus, Skeleton, Icon, InfoHint,
  DicaGrafico, VariacaoPill,
  CartaoBiblioteca, BarrasEntradaSaida, LinhaEntradaSaida, BarrasDestaque, LinhasSuaves,
  AreaComparada, MapaCalorGrade, AneisConcentricos,
  type CelulaCalor,
} from "@/components/ui";
import { EditorProvider, CamposToken, CampoEscala, useEscala, BarraEditor } from "./editor";

/* ── O arquivo de valores ─────────────────────────────────────────────────── */

interface Token {
  nome: string; grupo: string; tipo: string;
  claro?: string; escuro?: string; app?: string; appClaro?: string;
  espelhoNoApp?: boolean;
}
const TOKENS = (tokensJson as { tokens: Token[] }).tokens;
const ESCALAS = (tokensJson as unknown as { escalas: Record<string, Record<string, unknown>> }).escalas;

const doGrupo = (...grupos: string[]) => TOKENS.filter((t) => grupos.includes(t.grupo));

/* ── Peças da vitrine ─────────────────────────────────────────────────────── */

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="m-0 text-ink">{titulo}</h2>
      {children}
    </section>
  );
}

/** A amostra de um token, desenhada conforme o TIPO dele. */
function Amostra({ t }: { t: Token }) {
  const v = `var(${t.nome})`;
  const caixa = "w-12 h-12 shrink-0 rounded-[10px] border border-border";
  switch (t.tipo) {
    case "cor":
      return <span className={caixa} style={{ background: v }} aria-hidden />;
    case "degrade":
      return <span className={caixa} style={{ backgroundImage: v }} aria-hidden />;
    case "sombra":
      return <span className={`${caixa} bg-white`} style={{ boxShadow: v }} aria-hidden />;
    case "fonte":
      return <span className={`${caixa} inline-flex items-center justify-center text-[20px] text-ink`} style={{ fontFamily: v }} aria-hidden>Aa</span>;
    case "medida":
      return (
        <span className={`${caixa} inline-flex items-end p-[6px]`} aria-hidden>
          <span className="block w-full bg-ink" style={{ height: 3, borderRadius: v, maxWidth: "100%" }} />
        </span>
      );
    default:
      return <span className={`${caixa} inline-flex items-center justify-center`} aria-hidden><Icon name="settings" size={16} color="var(--color-text-tertiary)" /></span>;
  }
}

function LinhaToken({ t }: { t: Token }) {
  return (
    <div className="flex items-start gap-3 py-3 border-b border-border-soft last:border-b-0">
      <Amostra t={t} />
      <div className="min-w-0 flex-1">
        <code className="text-[13px] text-ink break-all">{t.nome}</code>
        <CamposToken nome={t.nome} />
      </div>
    </div>
  );
}

function GradeTokens({ tokens }: { tokens: Token[] }) {
  if (!tokens.length) return <p className="m-0 text-caption text-muted">Nenhum valor neste grupo.</p>;
  return (
    <Card>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-x-8">
        {tokens.map((t) => <LinhaToken key={t.nome} t={t} />)}
      </div>
    </Card>
  );
}

function Rotulo({ children }: { children: React.ReactNode }) {
  return <span className="a4p-label text-muted">{children}</span>;
}

/* ── Abas ──────────────────────────────────────────────────────────────────── */

function AbaCores() {
  const cores = TOKENS.filter((t) => t.tipo === "cor" && !["graficos", "dica-do-grafico", "moldura", "tabelas"].includes(t.grupo));
  const porGrupo = new Map<string, Token[]>();
  for (const t of cores) porGrupo.set(t.grupo, [...(porGrupo.get(t.grupo) ?? []), t]);
  const NOME: Record<string, string> = { cores: "Base e status", numeros: "Números e moeda", pilulas: "Pílulas", outros: "Outros" };
  return (
    <div className="flex flex-col gap-8">
      {Array.from(porGrupo).map(([g, ts]) => (
        <Secao key={g} titulo={NOME[g] ?? g}>
          <GradeTokens tokens={ts} />
        </Secao>
      ))}
    </div>
  );
}

function AbaTipografia() {
  const escala = (ESCALAS.fontSize ?? {}) as Record<string, unknown>;
  return (
    <div className="flex flex-col gap-8">
      <Secao titulo="Famílias">
        <GradeTokens tokens={doGrupo("tipografia")} />
      </Secao>
      <Secao titulo="Papéis">
        <Card className="flex flex-col gap-5">
          <div><Rotulo>Título de tela (h1)</Rotulo><h1 className="m-0 mt-1 text-ink">Fluxo de caixa</h1></div>
          <div><Rotulo>Título de seção (h2)</Rotulo><h2 className="m-0 mt-1 text-ink">Contas a receber</h2></div>
          <div><Rotulo>Título de coluna da Home</Rotulo><div className="a4p-titulo-secao mt-1 text-ink">Precisa de ação</div></div>
          <div><Rotulo>Número principal</Rotulo><div className="a4p-heroi mt-1 text-ink"><BRL value={312450.9} /></div></div>
          <div><Rotulo>Valor em tabela</Rotulo><div className="a4p-num tabular-nums mt-1 text-ink"><BRL value={8910.45} /></div></div>
          <div><Rotulo>Rótulo</Rotulo><div className="a4p-label mt-1 text-muted">Vencimento · 30 dias</div></div>
          <div><Rotulo>Corpo</Rotulo><p className="m-0 mt-1 text-body text-ink">A receita apurada no mês soma o que foi faturado por competência.</p></div>
          <div><Rotulo>Legenda</Rotulo><p className="m-0 mt-1 text-caption text-muted">Atualizado há 3 minutos.</p></div>
        </Card>
      </Secao>
      <Secao titulo="Escala de tamanhos">
        <Card className="flex flex-col gap-1">
          {Object.keys(escala).filter((k) => !k.startsWith("$")).map((k) => <LinhaTamanho key={k} k={k} />)}
        </Card>
      </Secao>
    </div>
  );
}

/** Uma linha da escala de tipo: o desenho com o valor do rascunho + os campos. */
function LinhaTamanho({ k }: { k: string }) {
  // ⚠️ Estilo em linha, não `text-${k}`: o Tailwind só gera a classe que
  // aparece escrita no código, e uma classe montada não aparece.
  const tam = useEscala(`fontSize.${k}.0`);
  const lh = useEscala(`fontSize.${k}.1.lineHeight`);
  const ls = useEscala(`fontSize.${k}.1.letterSpacing`);
  return (
    <div className="flex items-start gap-6 flex-wrap py-3 border-b border-border-soft last:border-b-0">
      <div className="min-w-[220px] flex-1">
        <code className="text-[12px] text-muted">text-{k}</code>
        <div className="text-ink" style={{ fontSize: tam, lineHeight: lh, letterSpacing: ls }}>Quattro</div>
      </div>
      <div className="w-full max-w-[360px] flex flex-col gap-1">
        <CampoEscala caminho={`fontSize.${k}.0`} rotulo="Tamanho" />
        <CampoEscala caminho={`fontSize.${k}.1.lineHeight`} rotulo="Entrelinha" />
        <CampoEscala caminho={`fontSize.${k}.1.letterSpacing`} rotulo="Espaçamento" />
      </div>
    </div>
  );
}

function AmostraRaio({ k }: { k: string }) {
  const v = useEscala(`borderRadius.${k}`);
  return (
    <div className="flex flex-col gap-2 w-[220px]">
      <span className="w-20 h-14 bg-surface-2 border border-border" style={{ borderRadius: v }} aria-hidden />
      <code className="text-[12px] text-muted">rounded-{k}</code>
      <CampoEscala caminho={`borderRadius.${k}`} rotulo="Raio" />
    </div>
  );
}

function AbaFormas() {
  const raios = (ESCALAS.borderRadius ?? {}) as Record<string, string>;
  const outras = ["borderWidth", "minWidth", "spacingNomeado"].flatMap((e) =>
    Object.keys((ESCALAS[e] ?? {}) as Record<string, unknown>).filter((k) => !k.startsWith("$")).map((k) => `${e}.${k}`));
  const NOME: Record<string, string> = { borderWidth: "border", minWidth: "min-w", spacingNomeado: "espaço" };
  return (
    <div className="flex flex-col gap-8">
      <Secao titulo="Raios das classes rounded-*">
        <Card className="flex flex-wrap gap-6">
          {Object.keys(raios).filter((k) => !k.startsWith("$")).map((k) => <AmostraRaio key={k} k={k} />)}
        </Card>
      </Secao>
      <Secao titulo="Outras medidas do Tailwind">
        <Card className="flex flex-col gap-2 max-w-[520px]">
          {outras.map((c) => {
            const [e, k] = c.split(".");
            return <CampoEscala key={c} caminho={c} rotulo={`${NOME[e]}-${k}`} />;
          })}
        </Card>
      </Secao>
      <Secao titulo="Raios, caixas e medidas"><GradeTokens tokens={doGrupo("formas")} /></Secao>
      <Secao titulo="Sombras e vidro"><GradeTokens tokens={doGrupo("sombras-e-vidro")} /></Secao>
      <Secao titulo="Degradês"><GradeTokens tokens={doGrupo("degrades")} /></Secao>
      <Secao titulo="Movimento"><GradeTokens tokens={doGrupo("movimento", "outros")} /></Secao>
    </div>
  );
}

function AbaControles() {
  const [ligado, setLigado] = React.useState(true);
  const [marcado, setMarcado] = React.useState(false);
  const [valor, setValor] = React.useState(1250.5);
  const [conta, setConta] = React.useState("1");
  return (
    <div className="flex flex-col gap-8">
      <Secao titulo="Botões">
        <Card className="flex flex-col gap-4">
          {(["primary", "secondary", "outline", "ghost", "accent"] as const).map((v) => (
            <div key={v} className="flex items-center gap-3 flex-wrap">
              <code className="w-[90px] text-[12px] text-muted">{v}</code>
              <Button variant={v} size="sm">Agendar</Button>
              <Button variant={v}>Agendar 2 pagamentos</Button>
              <Button variant={v} size="lg" leftIcon={<Icon name="plus" size={16} />}>Nova venda</Button>
              <Button variant={v} disabled>Desabilitado</Button>
            </div>
          ))}
        </Card>
      </Secao>
      <Secao titulo="Pílulas e selos">
        <Card className="flex items-center gap-3 flex-wrap">
          <Pill variant="yield">Render mais ↗</Pill>
          <Pill variant="surface">Essa semana</Pill>
          <Pill variant="muted">Outubro 2026</Pill>
          <Pill variant="ghost">Personalizado</Pill>
          <span className="a4p-pilula inline-flex items-center rounded-pill px-3 py-1 text-[13px]">Fechar o mês</span>
          <Badge variant="new">NEW</Badge>
          <Badge variant="count">4</Badge>
          <Badge variant="neutral">Rascunho</Badge>
        </Card>
      </Secao>
      <Secao titulo="Campos">
        <Card className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input label="Descrição" placeholder="Ex.: aluguel de outubro" />
          <Input label="Campo com erro" defaultValue="12/13/2026" invalid />
          <Select label="Conta" value={conta} onChange={setConta} options={[{ value: "1", label: "Conta principal" }, { value: "2", label: "Cartão" }]} />
          <CurrencyInput label="Valor" value={valor} onValueChange={setValor} />
          <Textarea label="Observação" placeholder="Opcional" />
          <div className="flex flex-col gap-3 justify-center">
            <Switch checked={ligado} onChange={setLigado} label="Repetir lançamento" />
            <Checkbox checked={marcado} onChange={(e) => setMarcado(e.target.checked)} label="Já foi pago" />
          </div>
        </Card>
      </Secao>
    </div>
  );
}

function AbaCards() {
  return (
    <div className="flex flex-col gap-8">
      <Secao titulo="Cards">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card><Rotulo>Card simples</Rotulo><div className="mt-2 text-[22px] text-ink"><BRL value={48230} /></div></Card>
          <Card info={{ titulo: "Saldo", oQue: "Quanto a empresa tem nas contas hoje.", comoCalcula: "Soma dos saldos das contas ativas." }}>
            <Rotulo>Card com o i</Rotulo><div className="mt-2 text-[22px] text-ink"><BRL value={-3120.4} /></div>
          </Card>
          <CartaoBiblioteca titulo="Card da Biblioteca" href="#" valor={<BRL value={91540} />} subtitulo="+4,1% sobre setembro"
            info={{ oQue: "O modelo dos cards de gráfico." }}>
            <Skeleton className="h-10 w-full" />
          </CartaoBiblioteca>
        </div>
      </Secao>
      <Secao titulo="Valores">
        <Card className="flex flex-col gap-4">
          {(["display", "lg", "md", "sm"] as const).map((s) => (
            <div key={s} className="flex items-baseline gap-4"><code className="w-[90px] text-[12px] text-muted">Money {s}</code><Money integer="2.159.450" decimals="90" size={s} /></div>
          ))}
          <div className="flex items-baseline gap-4"><code className="w-[90px] text-[12px] text-muted">BRL</code><span className="text-[18px] text-ink"><BRL value={8910.45} /></span></div>
          <div className="flex items-baseline gap-4"><code className="w-[90px] text-[12px] text-muted">BRL compacto</code><span className="text-[18px] text-ink"><BRL value={312000} compacto /></span></div>
          <div className="flex items-center gap-3 flex-wrap"><code className="w-[90px] text-[12px] text-muted">Variação</code><VariacaoPill v={0.041} frase="sobre setembro" /><VariacaoPill v={-0.12} frase="sobre setembro" /><VariacaoPill v={null} /></div>
        </Card>
      </Secao>
      <Secao titulo="Números e moeda"><GradeTokens tokens={doGrupo("numeros")} /></Secao>
      <Secao titulo="Pílulas"><GradeTokens tokens={doGrupo("pilulas")} /></Secao>
    </div>
  );
}

/* Dados fixos de exemplo — só para desenhar; nenhum número aqui é da empresa. */
const MESES = ["Mai", "Jun", "Jul", "Ago", "Set", "Out"];
const ES = MESES.map((label, i) => ({ label, entrada: 42000 + i * 3100 + (i % 2) * 5200, saida: 36000 + i * 1800 + ((i + 1) % 2) * 4100 }));
const DESTAQUE = MESES.map((label, i) => ({ label, valor: 28000 + i * 4200 - (i === 3 ? 9000 : 0), futuro: i === 5 }));
const SUAVES = MESES.map((label, i) => ({ label, a: 30 + i * 6 + (i % 2) * 8, b: 25 + i * 3 }));
const AREA = MESES.map((label, i) => ({ label, valor: 120000 + i * 9000 + (i % 2) * 7000, base: 115000 + i * 6000 }));
const DIAS = ["Seg", "Ter", "Qua", "Qui", "Sex"];
const HORAS = ["8h", "10h", "12h", "14h", "16h", "18h"];
const CALOR: (CelulaCalor | null)[][] = DIAS.map((d, l) => HORAS.map((h, c) => ({ chave: `${d}-${h}`, nivel: ((l + c * 2) % 5) as CelulaCalor["nivel"], titulo: `${d} ${h}` })));
const fmt = (v: number) => <BRL value={v} />;

function AbaGraficos() {
  return (
    <div className="flex flex-col gap-8">
      <Secao titulo="A Biblioteca de gráficos">
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <CartaoBiblioteca titulo="Entradas (barras entrada × saída)" valor={fmt(ES[5].entrada)}>
            <BarrasEntradaSaida dados={ES} ariaLabel="Exemplo de barras de entrada e saída" />
          </CartaoBiblioteca>
          <CartaoBiblioteca titulo="Análises 3 (linha entrada × saída)" valor={fmt(ES[5].entrada - ES[5].saida)}>
            <LinhaEntradaSaida id="vitrine" dados={ES} ariaLabel="Exemplo de linha de entrada e saída" />
          </CartaoBiblioteca>
          <CartaoBiblioteca titulo="Receita 2 (barra em destaque)" valor={fmt(DESTAQUE[4].valor)}>
            <BarrasDestaque dados={DESTAQUE} formatar={fmt} ariaLabel="Exemplo de barras com destaque" />
          </CartaoBiblioteca>
          <CartaoBiblioteca titulo="Análises 2 (linhas suaves)">
            <LinhasSuaves dados={SUAVES} ariaLabel="Exemplo de linhas suaves" series={[
              { chave: "a", nome: "Projeção", cor: "var(--erp-graf-serie-1)" },
              { chave: "b", nome: "Período anterior", cor: "var(--erp-graf-comparacao)", tracejada: true },
            ]} />
          </CartaoBiblioteca>
          <CartaoBiblioteca titulo="Estatística de saldo 1 (área comparada)" valor={fmt(AREA[5].valor)}>
            <AreaComparada id="vitrine" dados={AREA} formatar={fmt} ariaLabel="Exemplo de área comparada" />
          </CartaoBiblioteca>
          <CartaoBiblioteca titulo="Atividade por horário (mapa de calor)">
            <MapaCalorGrade colunas={HORAS} linhas={DIAS} celulas={CALOR} ariaLabel="Exemplo de mapa de calor" />
          </CartaoBiblioteca>
          <CartaoBiblioteca titulo="Histórico de transferências 3 (anéis)">
            <AneisConcentricos rotuloTotal="Total" total={fmt(184000)} ariaLabel="Exemplo de anéis concêntricos" aneis={[
              { chave: "a", nome: "Recebido", valor: 98000, fracao: 0.53, cor: "var(--erp-graf-serie-1)" },
              { chave: "b", nome: "A vencer", valor: 52000, fracao: 0.28, cor: "var(--erp-graf-serie-2)" },
              { chave: "c", nome: "Vencido", valor: 34000, fracao: 0.19, cor: "var(--erp-graf-serie-3)" },
            ]} />
          </CartaoBiblioteca>
          <CartaoBiblioteca titulo="Dica ao passar o mouse">
            <div className="flex items-center justify-center py-6">
              <DicaGrafico rotulo="Outubro 2026" valor={fmt(48230)} variacao={{ v: 0.041, frase: "sobre setembro" }}
                linhas={[{ cor: "var(--erp-graf-entrada)", nome: "Entradas", valor: fmt(61200) }, { cor: "var(--erp-graf-saida)", nome: "Saídas", valor: fmt(12970) }]} />
            </div>
          </CartaoBiblioteca>
        </div>
      </Secao>
      <Secao titulo="Valores dos gráficos"><GradeTokens tokens={doGrupo("graficos")} /></Secao>
      <Secao titulo="Valores da dica"><GradeTokens tokens={doGrupo("dica-do-grafico")} /></Secao>
    </div>
  );
}

const LINHAS_TABELA = [
  { d: "02/10", c: "Alpha Comércio", cat: "Vendas", v: 12450, s: ["Pago", "positive"] as const },
  { d: "05/10", c: "Imobiliária Centro", cat: "Aluguel", v: -6800, s: ["A vencer", "neutral"] as const },
  { d: "09/10", c: "Beta Serviços", cat: "Serviços", v: 3200, s: ["Vencido", "warning"] as const },
  { d: "12/10", c: "Contador Silva", cat: "Serviços profissionais", v: -1450, s: ["Conciliado", "ink"] as const },
];

function AbaTabelas() {
  return (
    <div className="flex flex-col gap-8">
      <Secao titulo="Tabela">
        <Card padded={false} className="overflow-x-auto">
          <table className="w-full text-[14px]">
            <thead>
              <tr className="text-left">
                {["Data", "Contraparte", "Categoria", "Situação", "Valor"].map((h, i) => (
                  <th key={h} className={`px-5 py-3 text-[11px] font-medium text-faint ${i === 4 ? "text-right" : ""}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {LINHAS_TABELA.map((l) => (
                <tr key={l.c} className="border-t border-border-soft">
                  <td className="px-5 py-3 tabular-nums text-muted">{l.d}</td>
                  <td className="px-5 py-3 text-ink">{l.c}</td>
                  <td className="px-5 py-3 text-muted">{l.cat}</td>
                  <td className="px-5 py-3"><StatusBadge tone={l.s[1]}>{l.s[0]}</StatusBadge></td>
                  <td className="px-5 py-3 text-right tabular-nums text-ink"><BRL value={l.v} /></td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-border">
                <td className="px-5 py-3 text-ink font-medium" colSpan={4}>Total</td>
                <td className="px-5 py-3 text-right tabular-nums text-ink font-medium"><BRL value={LINHAS_TABELA.reduce((s, l) => s + l.v, 0)} /></td>
              </tr>
            </tfoot>
          </table>
        </Card>
      </Secao>
      <Secao titulo="Situações">
        <Card className="flex items-center gap-3 flex-wrap">
          {(["positive", "neutral", "warning", "ink"] as const).map((t) => <StatusBadge key={t} tone={t}>{t}</StatusBadge>)}
          <span className="inline-flex items-center gap-2 text-[13px] text-ink"><PontoStatus cor="var(--color-warning)" />Atenção</span>
          <span className="inline-flex items-center gap-2 text-[13px] text-ink"><PontoStatus cor="var(--color-negative)" />Crítico</span>
          <span className="inline-flex items-center gap-2 text-[13px] text-ink">Informação <InfoHint oQue="O botão i explica o box." /></span>
        </Card>
      </Secao>
      <Secao titulo="Valores da tabela"><GradeTokens tokens={doGrupo("tabelas")} /></Secao>
    </div>
  );
}

function AbaMoldura() {
  return (
    <div className="flex flex-col gap-8">
      <Secao titulo="Menu">
        <Card className="max-w-[280px] flex flex-col gap-1" style={{ background: "var(--erp-menu-fundo)" }}>
          {[["house", "Visão geral", true], ["credit-card", "Caixa e bancos", false], ["receipt", "Vender e receber", false], ["file-text", "Relatórios", false]].map(([ic, r, on]) => (
            <span key={r as string} className="flex items-center gap-[15px] min-h-[40px] rounded-[12px] px-3 text-[14px] text-ink"
              style={on ? { background: "var(--erp-menu-ativo)" } : undefined}>
              <Icon name={ic as string} size={18} color="var(--color-text-secondary)" />{r as string}
            </span>
          ))}
        </Card>
      </Secao>
      <Secao titulo="Moldura e menu"><GradeTokens tokens={doGrupo("moldura")} /></Secao>
    </div>
  );
}

const ABAS: AbaHub[] = [
  { id: "cores", label: "Cores", render: () => <AbaCores /> },
  { id: "tipografia", label: "Tipografia", render: () => <AbaTipografia /> },
  { id: "formas", label: "Formas", render: () => <AbaFormas /> },
  { id: "controles", label: "Botões e campos", render: () => <AbaControles /> },
  { id: "cards", label: "Cards e valores", render: () => <AbaCards /> },
  { id: "graficos", label: "Gráficos", render: () => <AbaGraficos /> },
  { id: "tabelas", label: "Tabelas e situações", render: () => <AbaTabelas /> },
  { id: "moldura", label: "Menu e moldura", render: () => <AbaMoldura /> },
];

export function VitrineDesign() {
  const { dark, apply } = useTheme();
  return (
    <EditorProvider>
      <div className="ds-previa flex flex-col gap-4">
        <div className="flex items-center justify-end gap-3 flex-wrap">
          <div className="flex items-center gap-2" role="group" aria-label="Tema da vitrine">
            <Pill variant={dark ? "ghost" : "surface"} aria-pressed={!dark} onClick={() => apply(false)}>Claro</Pill>
            <Pill variant={dark ? "surface" : "ghost"} aria-pressed={dark} onClick={() => apply(true)}>Escuro</Pill>
          </div>
        </div>
        <Card><BarraEditor /></Card>
        <HubShell abas={ABAS} />
      </div>
    </EditorProvider>
  );
}
