"use client";

/**
 * As demais telas de Vendas e NFs: Notas Fiscais, Provisionamento de Impostos,
 * Assinaturas e Links de Pagamento.
 *
 * Todas leem as MESMAS vendas — a nota, o imposto e a assinatura são
 * perspectivas do mesmo documento-mãe, não bases paralelas.
 */
import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, Button, Icon, Input, Select, Checkbox, BRL, Skeleton, CurrencyInput } from "@/components/ui";
import { FormModal } from "@/components/lancamentos/FormModal";
import { useToast } from "@/components/listas/ListChrome";
import { usePartiesList, useCreateParty } from "@/components/lancamentos/hooks";
import { baixarXLSX } from "@/lib/xlsx";
import { gerarQR, qrParaSVG } from "@/lib/qrcode";
import { dadosPixEmpresa, type DadosPix } from "@/lib/pix";
import { useOpcoesCadastro } from "@/components/lancamentos/opcoes-cadastro";
import { regimeDoCadastro, type Regime as RegimeFiscal } from "@/core/fiscal/perfil";
import { RegimeNaoDeclarado } from "@/components/fiscal/RegimeNaoDeclarado";
import { loadCompany } from "@/lib/company";
import { listRecorrencias, hydrateRecorrencias, CICLOS, totalFatura } from "@/lib/recorrencias";
import {
  painelNotasFiscais, provisionarImpostos, contasAPagarDosImpostos, pendenciasConfig,
  pixDoLink, validarLink,
  IMPOSTOS, ROTULO_IMPOSTO, ESFERA, ROTULO_ESFERA, FORNECEDORES_PROPOSTOS, STATUS_NF,
  type Venda, type ConfigImpostos, type Imposto, type Regime, type LinkPagamento, type Esfera,
} from "@/core/vendas";
import {
  lerConfigImpostos, salvarConfigImpostos, criarContasDeImpostos,
  listarLinks, salvarLink, removerLink, novoId,
} from "@/lib/vendas-store";
import { useVendas } from "@/lib/vendas";
import { Painel, CardAnel } from "@/components/paineis/shared";

const hoje = () => new Date();
const mesAtual = () => String(hoje().getMonth() + 1).padStart(2, "0");
const anoAtual = () => hoje().getFullYear();
const fmtDia = (iso: string) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");
const MESES = ["01 — Jan", "02 — Fev", "03 — Mar", "04 — Abr", "05 — Mai", "06 — Jun",
  "07 — Jul", "08 — Ago", "09 — Set", "10 — Out", "11 — Nov", "12 — Dez"];

/* ============================== notas fiscais ============================== */

export function NotasFiscaisView() {
  const { data: vendas } = useVendas();
  const [aba, setAba] = React.useState<"lista" | "download">("lista");
  const [marcadas, setMarcadas] = React.useState<Set<string>>(new Set());
  const { show, node } = useToast();


  // Só vendas com nota — as demais não têm o que listar aqui.
  const comNF = React.useMemo(() => (vendas ?? []).filter((v) => v.statusNF !== "a_emitir" || v.numeroNF), [vendas]);
  const cards = React.useMemo(() => painelNotasFiscais(vendas ?? []), [vendas]);
  const emitidas = comNF.filter((v) => v.statusNF === "emitida");

  const linhasXLSX = React.useMemo(() => [
    ["Nº da NF", "Venda", "Emissão", "Cliente", "Valor", "Status"],
    ...comNF.map((v) => [
      v.numeroNF || "—", v.numero, v.competencia, v.clienteNome, v.valorTotal,
      STATUS_NF.find((s) => s.id === v.statusNF)?.label ?? v.statusNF,
    ]),
  ], [comNF]);

  return (
    <div className="flex flex-col gap-5 pb-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <p className="m-0 text-label text-muted max-w-[70ch]">
          Consulte e baixe as notas fiscais emitidas. Use as abas para alternar entre a lista detalhada e o
          download em lote.
        </p>
        <Button variant="outline" disabled={comNF.length === 0}
          onClick={() => baixarXLSX("notas-fiscais", [{ nome: "Notas fiscais", linhas: linhasXLSX }])}>
          <Icon name="arrow-down-to-line" size={15} color="currentColor" />
          Exportar XLSX
        </Button>
      </div>

      <div className="flex items-center gap-1 border-b border-border-soft">
        {([["lista", "Lista de notas fiscais"], ["download", "Download de notas fiscais"]] as const).map(([id, label]) => {
          const on = aba === id;
          return (
            <button key={id} onClick={() => setAba(id)}
              className={`relative px-3 py-2 text-label transition-colors ${on ? "text-ink font-medium" : "text-muted hover:text-ink"}`}>
              {label}
              {on && <span className="absolute left-0 -bottom-px w-full h-[2px] bg-ink rounded-pill" />}
            </button>
          );
        })}
      </div>

      <Painel titulo="Resumo de notas fiscais" cards={cards} />

      {vendas === null ? (
        <Card><Skeleton className="h-[200px]" /></Card>
      ) : aba === "lista" ? (
        comNF.length === 0 ? (
          <Card><Vazio texto="Nenhuma nota fiscal encontrada para os filtros selecionados." /></Card>
        ) : (
          <Card padded={false} className="overflow-hidden">
            <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Tabela rolável">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-border-soft">
                    {["Nº da NF", "Venda", "Emissão", "Cliente", "Valor", "Status"].map((h, i) => (
                      <th key={h} className={`px-6 py-3 text-[11px] font-medium tracking-[0.08em] text-faint ${i === 4 ? "text-right" : "text-left"}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {comNF.map((v) => (
                    <tr key={v.id} className="border-b border-border-soft last:border-0">
                      <td className="px-6 py-3 text-label text-ink tabular-nums">{v.numeroNF || "—"}</td>
                      <td className="px-6 py-3 text-caption text-faint tabular-nums">{v.numero}</td>
                      <td className="px-6 py-3 text-label text-muted tabular-nums">{fmtDia(v.competencia)}</td>
                      <td className="px-6 py-3 text-label text-ink truncate max-w-[28ch]">{v.clienteNome}</td>
                      <td className="px-6 py-3 text-right text-label text-ink tabular-nums"><BRL value={v.valorTotal} /></td>
                      <td className="px-6 py-3 text-caption text-muted">{STATUS_NF.find((s) => s.id === v.statusNF)?.label}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )
      ) : (
        <Card>
          <span className="text-h3 font-semibold text-ink">Download em lote</span>
          <p className="m-0 mt-1 text-caption text-muted">
            Selecione as notas emitidas para baixar de uma vez. Só nota EMITIDA tem arquivo — processando,
            cancelada e negada não geram documento.
          </p>
          {emitidas.length === 0 ? (
            <Vazio texto="Nenhuma nota emitida para baixar." />
          ) : (
            <>
              <div className="flex items-center gap-2 mt-4">
                <Checkbox
                  checked={marcadas.size === emitidas.length && emitidas.length > 0}
                  onChange={(e) => setMarcadas(e.target.checked ? new Set(emitidas.map((v) => v.id)) : new Set())}
                  label="Selecionar todas"
                />
                <span className="text-caption text-faint tabular-nums ml-auto">{marcadas.size} de {emitidas.length}</span>
              </div>
              <div className="flex flex-col mt-3 max-h-[320px] overflow-y-auto">
                {emitidas.map((v) => (
                  <label key={v.id} className="flex items-center gap-3 py-2 border-b border-border-soft last:border-0 cursor-pointer">
                    <input
                      type="checkbox" checked={marcadas.has(v.id)}
                      onChange={() => setMarcadas((s) => {
                        const n = new Set(s);
                        if (n.has(v.id)) n.delete(v.id); else n.add(v.id);
                        return n;
                      })}
                    />
                    <span className="text-label text-ink flex-1 truncate">
                      NF {v.numeroNF || "—"} · {v.clienteNome}
                    </span>
                    <span className="text-label text-muted tabular-nums shrink-0"><BRL value={v.valorTotal} /></span>
                  </label>
                ))}
              </div>
              <Button
                variant="primary" className="mt-4" disabled={marcadas.size === 0}
                onClick={() => {
                  const sel = emitidas.filter((v) => marcadas.has(v.id));
                  baixarXLSX("notas-fiscais-selecionadas", [{
                    nome: "Notas fiscais",
                    linhas: [["Nº da NF", "Venda", "Emissão", "Cliente", "Valor"],
                      ...sel.map((v) => [v.numeroNF, v.numero, v.competencia, v.clienteNome, v.valorTotal])],
                  }]);
                  show(`${sel.length} ${sel.length === 1 ? "nota exportada" : "notas exportadas"}.`);
                }}
              >
                <Icon name="arrow-down-to-line" size={15} color="currentColor" />
                Baixar selecionadas
              </Button>
              {/* Honestidade: o XML/PDF da nota vem do emissor. Enquanto a
                  integração não existe, o lote sai como planilha — e a tela diz
                  isso, em vez de oferecer um download que não existe. */}
              <p className="m-0 mt-3 text-caption text-faint">
                O XML e o PDF vêm do emissor de notas. Enquanto a integração não estiver ligada, o lote sai
                como planilha com os dados das notas.
              </p>
            </>
          )}
        </Card>
      )}
      {node}
    </div>
  );
}

/* ========================= provisionamento de impostos ========================= */

/**
 * ⚠️ O regime decide SE esta tela calcula alguma coisa. Sem regime declarado ela
 * mostrava a provisão do Lucro Presumido (o padrão do resolvedor antigo, e da
 * configuração nunca salva) com a mesma cara de apuração conferida. Agora a
 * ausência ocupa o lugar do número e nada é provisionado.
 *
 * O cadastro mora no navegador: é lido DEPOIS de montar, senão o servidor
 * renderiza "não declarado" e o cliente outra coisa (hidratação quebrada).
 */
export function ImpostosView() {
  const [regime, setRegime] = React.useState<RegimeFiscal | null>(null);
  React.useEffect(() => {
    setRegime(regimeDoCadastro((loadCompany()?.db ?? null) as Record<string, unknown> | null));
  }, []);
  if (regime === null) return <Card><Skeleton className="h-[220px]" /></Card>;
  if (regime === "nao_declarado") {
    return <RegimeNaoDeclarado contexto="O provisionamento de impostos das vendas não é calculado" />;
  }
  // ⚠️ `core/vendas` só conhece três regimes; o MEI cai em Simples, que é a
  // família dele. Não é exato — o MEI recolhe DAS FIXO, não percentual sobre
  // a venda —, mas é a aproximação que a tela já fazia, e mudá-la mudaria o
  // número de quem declarou MEI.
  return <ProvisionamentoImpostos regimeEmpresa={(regime === "mei" ? "simples" : regime) as Regime} />;
}

function ProvisionamentoImpostos({ regimeEmpresa }: { regimeEmpresa: Regime }) {
  const opcoes = useOpcoesCadastro("saida");
  const qc = useQueryClient();
  const { data: partes } = usePartiesList();
  const criarParte = useCreateParty();
  const { show, node } = useToast();

  const { data: vendas } = useVendas();
  // Só monta no cliente, depois do regime: ler a configuração salva já na
  // largada evita um primeiro quadro com alíquotas que ninguém escolheu.
  const [config, setConfig] = React.useState<ConfigImpostos>(lerConfigImpostos);
  const [ano, setAno] = React.useState(String(anoAtual()));
  const [mes, setMes] = React.useState(mesAtual());
  const [produto, setProduto] = React.useState("");
  const [idVenda, setIdVenda] = React.useState("");
  const [idExterno, setIdExterno] = React.useState("");
  const [abrirConfig, setAbrirConfig] = React.useState(false);

  React.useEffect(() => {
    setConfig(lerConfigImpostos());
  }, []);

  const mesCompetencia = `${ano}-${mes}`;
  const doPeriodo = React.useMemo(() => (vendas ?? []).filter((v) => {
    if (!v.competencia.startsWith(mesCompetencia)) return false;
    if (produto && !v.itens.some((i) => i.produtoId === produto)) return false;
    if (idVenda && !v.numero.includes(idVenda) && v.id !== idVenda) return false;
    if (idExterno && !v.idExterno.includes(idExterno)) return false;
    return true;
  }), [vendas, mesCompetencia, produto, idVenda, idExterno]);

  const provisao = React.useMemo(() => provisionarImpostos(doPeriodo, config), [doPeriodo, config]);
  const comValor = IMPOSTOS.filter((i) => provisao.porImposto[i] > 0);
  const pendencias = React.useMemo(() => pendenciasConfig(config, comValor), [config, comValor]);
  const podeCriar = pendencias.length === 0 && provisao.total > 0;
  const [criandoContas, setCriandoContas] = React.useState(false);

  const produtosUnicos = React.useMemo(() => {
    const m = new Map<string, string>();
    for (const v of vendas ?? []) for (const i of v.itens) if (i.produtoId) m.set(i.produtoId, i.nome);
    return Array.from(m, ([id, nome]) => ({ value: id, label: nome }));
  }, [vendas]);

  /**
   * Escolhe (e, se preciso, cria) o órgão de cada esfera e DEVOLVE a escolha —
   * o modal aberto aplica na cópia dele, senão "Salvar" gravaria a cópia velha
   * por cima. `createParty` devolve o id da linha criada; sem ele a esfera
   * fica vazia e a tela diz isso, em vez de anunciar uma escolha que não houve.
   */
  const proporFornecedores = async (atuais: Record<Esfera, string>): Promise<Record<Esfera, string>> => {
    const novos: Record<Esfera, string> = { ...atuais };
    let criados = 0;
    let reaproveitados = 0;
    try {
      for (const f of FORNECEDORES_PROPOSTOS) {
        if (novos[f.esfera]) continue;
        const existe = (partes ?? []).find((p) => p.name.toLowerCase() === f.nome.toLowerCase());
        if (existe) { novos[f.esfera] = existe.id; reaproveitados++; continue; }
        const criado = await criarParte.mutateAsync({
          type: "pj", name: f.nome, doc: null, email: null, phone: null,
          zip: null, street: null, number: null, complement: null, district: null,
          city: null, state: null,
          is_customer: false, is_supplier: true, is_carrier: false, antt: null,
        } as never);
        novos[f.esfera] = criado.id;
        criados++;
      }
    } catch (e) {
      show(`Não foi possível criar o fornecedor proposto: ${e instanceof Error ? e.message : String(e)}`);
    }
    setConfig((c) => salvarConfigImpostos({ ...c, fornecedores: novos }));
    const partesMsg = [criados > 0 && `${criados} criado${criados === 1 ? "" : "s"}`,
      reaproveitados > 0 && `${reaproveitados} já cadastrado${reaproveitados === 1 ? "" : "s"}`].filter(Boolean);
    if (partesMsg.length) show(`Fornecedores escolhidos: ${partesMsg.join(" · ")}.`);
    else show("Todas as esferas já tinham fornecedor — nada a propor.");
    return novos;
  };

  return (
    <div className="flex flex-col gap-5 pb-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <p className="m-0 text-label text-muted max-w-[62ch]">
          Impostos das vendas por mês de competência. Soma por mês para gerar uma conta a pagar por imposto.
        </p>
        <div className="flex items-center gap-3 shrink-0">
          <span className="rounded-pill bg-surface-2 px-3 py-[6px] text-caption text-muted">
            Regime <b className="text-ink">{regimeEmpresa === "presumido" ? "Lucro Presumido" : regimeEmpresa === "real" ? "Lucro Real" : "Simples Nacional"}</b>
          </span>
          <Button variant="ghost" onClick={() => setAbrirConfig(true)}>
            <Icon name="settings" size={15} color="currentColor" />
            Configurar
          </Button>
        </div>
      </div>

      <Card>
        <span className="text-h3 font-semibold text-ink">Filtros</span>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-3">
          <Campo label="Ano">
            <Select value={ano} onChange={setAno}
              options={[anoAtual() - 1, anoAtual(), anoAtual() + 1].map((a) => ({ value: String(a), label: String(a) }))} />
          </Campo>
          <Campo label="Mês">
            <Select value={mes} onChange={setMes}
              options={MESES.map((m, i) => ({ value: String(i + 1).padStart(2, "0"), label: m }))} />
          </Campo>
          <Campo label="Produto">
            <Select value={produto} onChange={setProduto}
              options={[{ value: "", label: "Todos" }, ...produtosUnicos]} disabled={produtosUnicos.length === 0} />
          </Campo>
          <Campo label="ID da venda">
            <Input value={idVenda} onChange={(e) => setIdVenda(e.target.value)} placeholder="Ex.: 2026-0001" />
          </Campo>
          <Campo label="ID externo">
            <Input value={idExterno} onChange={(e) => setIdExterno(e.target.value)} />
          </Campo>
        </div>
      </Card>

      {pendencias.length > 0 && provisao.total > 0 && (
        <Card>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <span className="text-h3 font-semibold text-warning">Configuração incompleta</span>
              <p className="m-0 mt-1 text-label text-muted">
                Complete a configuração para criar as contas a pagar dos impostos previstos.
              </p>
              <p className="m-0 mt-1 text-caption text-faint">· {pendencias.join(" · ")}</p>
            </div>
            <Button variant="primary" onClick={() => setAbrirConfig(true)}>Abrir configurar</Button>
          </div>
        </Card>
      )}

      <Card>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <span className="text-h3 font-semibold text-ink">Resumo do período</span>
            <p className="m-0 text-caption text-faint tabular-nums">
              {mesCompetencia.split("-").reverse().join("/")} · {provisao.linhas.length} {provisao.linhas.length === 1 ? "venda tributável" : "vendas tributáveis"}
            </p>
          </div>
          <div className="text-right">
            <div className="text-[11px] font-medium tracking-[0.08em] text-faint">Faturamento total no período</div>
            <div className="text-[24px] leading-none font-semibold text-ink tabular-nums mt-1"><BRL value={provisao.faturamento} /></div>
          </div>
          <Button
            variant="primary" disabled={!podeCriar || criandoContas}
            onClick={async () => {
              const contasImp = contasAPagarDosImpostos(provisao, config, mesCompetencia);
              if (contasImp.length === 0) { show("Nada a criar neste período."); return; }
              // ⚠️ Um clique por vez: dois cliques leriam "não existe" juntos e
              // gravariam a guia duas vezes (o banco recusa a segunda — o
              // índice `movements_imp_ref_uniq` —, mas a tela não deve tentar).
              setCriandoContas(true);
              try {
                const r = await criarContasDeImpostos(contasImp, mesCompetencia, config.contaId, opcoes.nomeCategoria);
                await qc.invalidateQueries();
                // ⚠️ Nada criado não é "0 contas criadas": o segundo clique diz
                // que as guias da competência já existiam.
                show(r.criadas === 0
                  ? `Nada a criar: ${r.jaExistiam === 1 ? "a conta desta competência já existia" : `as ${r.jaExistiam} contas desta competência já existiam`}.`
                  : r.jaExistiam > 0
                    ? `${r.criadas} contas a pagar criadas · ${r.jaExistiam} já existiam para esta competência.`
                    : `${r.criadas} contas a pagar criadas.`);
              } catch (e) {
                show(`Não foi possível criar as contas a pagar: ${e instanceof Error ? e.message : String(e)}`);
              } finally {
                setCriandoContas(false);
              }
            }}
          >
            Criar contas a pagar
          </Button>
        </div>
      </Card>

      {vendas === null ? (
        <Card><Skeleton className="h-[220px]" /></Card>
      ) : provisao.linhas.length === 0 ? (
        <Card><Vazio texto="Nenhuma venda tributável no período selecionado." /></Card>
      ) : (
        <Card padded={false} className="overflow-hidden">
          <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Tabela rolável">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-border-soft">
                  <th className="px-4 py-3 text-left text-[11px] font-medium tracking-[0.08em] text-faint">Venda</th>
                  <th className="px-3 py-3 text-right text-[11px] font-medium tracking-[0.08em] text-faint">Base</th>
                  {IMPOSTOS.map((i) => (
                    <th key={i} className="px-3 py-3 text-right text-[11px] font-medium tracking-[0.08em] text-faint">
                      {ROTULO_IMPOSTO[i]}
                    </th>
                  ))}
                  <th className="px-4 py-3 text-right text-[11px] font-medium tracking-[0.08em] text-faint">Total</th>
                </tr>
              </thead>
              <tbody>
                {provisao.linhas.map((l) => (
                  <tr key={l.vendaId} className="border-b border-border-soft">
                    <td className="px-4 py-2">
                      <div className="flex flex-col">
                        <span className="text-label text-ink">{l.cliente}</span>
                        <span className="text-caption text-faint tabular-nums">{l.numero}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right text-label text-muted tabular-nums"><BRL value={l.base} /></td>
                    {IMPOSTOS.map((i) => (
                      <td key={i} className="px-3 py-2 text-right text-caption text-muted tabular-nums">
                        {l.valores[i] > 0 ? <BRL value={l.valores[i]} /> : "—"}
                      </td>
                    ))}
                    <td className="px-4 py-2 text-right text-label font-medium text-ink tabular-nums"><BRL value={l.total} /></td>
                  </tr>
                ))}
                <tr className="bg-surface-2/60">
                  <td className="px-4 py-3 text-label font-semibold text-ink">Total do período</td>
                  <td className="px-3 py-3 text-right text-label font-semibold text-ink tabular-nums"><BRL value={provisao.faturamento} /></td>
                  {IMPOSTOS.map((i) => (
                    <td key={i} className="px-3 py-3 text-right text-label font-semibold text-ink tabular-nums">
                      {provisao.porImposto[i] > 0 ? <BRL value={provisao.porImposto[i]} /> : "—"}
                    </td>
                  ))}
                  <td className="px-4 py-3 text-right text-label font-semibold text-ink tabular-nums"><BRL value={provisao.total} /></td>
                </tr>
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {abrirConfig && (
        <ConfigImpostosModal
          config={config}
          regimeEmpresa={regimeEmpresa}
          contas={opcoes.contas}
          fornecedores={(partes ?? []).filter((p) => p.is_supplier && p.ativo !== false).map((p) => ({ value: p.id, label: p.name }))}
          // ⚠️ Folhas de DESPESA do banco (UUID): o imposto é uma conta a pagar,
          // e a categoria do plano antigo (id numérico) seria recusada.
          categorias={opcoes.categorias}
          onPropor={proporFornecedores}
          onClose={() => setAbrirConfig(false)}
          onSalvo={(c) => { setConfig(salvarConfigImpostos(c)); setAbrirConfig(false); show("Configuração salva."); }}
        />
      )}
      {node}
    </div>
  );
}

function ConfigImpostosModal({
  config, regimeEmpresa, contas, fornecedores, categorias, onPropor, onClose, onSalvo,
}: {
  config: ConfigImpostos;
  regimeEmpresa: Regime;
  contas: { value: string; label: string }[];
  fornecedores: { value: string; label: string }[];
  categorias: { value: string; label: string }[];
  onPropor: (atuais: Record<Esfera, string>) => Promise<Record<Esfera, string>>;
  onClose: () => void;
  onSalvo: (c: ConfigImpostos) => void;
}) {
  const [c, setC] = React.useState<ConfigImpostos>({ ...config, regime: config.regime || regimeEmpresa });
  const [propondo, setPropondo] = React.useState(false);
  const esferas: Esfera[] = ["municipal", "estadual", "federal"];

  return (
    <FormModal title="Configurar impostos" size="large" onClose={onClose} onSave={() => onSalvo(c)}>
      <Campo label="Conta bancária padrão de compras" ajuda="É de onde as contas a pagar dos impostos saem.">
        <Select value={c.contaId} onChange={(v) => setC((s) => ({ ...s, contaId: v }))}
          placeholder="Selecione a conta" options={contas} />
      </Campo>

      <div className="flex items-center justify-between gap-3 pt-2">
        <span className="text-caption text-muted">
          Sem fornecedor o título fica órfão — ninguém sabe a quem pagar.
        </span>
        <Button variant="ghost" disabled={propondo} onClick={async () => {
          // ⚠️ A escolha volta para a cópia do modal: sem isto, "Salvar"
          // devolvia a configuração de antes e apagava o que foi proposto.
          setPropondo(true);
          try {
            const novos = await onPropor(c.fornecedores);
            setC((s) => ({ ...s, fornecedores: novos }));
          } finally { setPropondo(false); }
        }}>
          <Icon name="sparkles" size={14} color="currentColor" />
          Propor fornecedores
        </Button>
      </div>

      {esferas.map((e) => {
        const impostos = IMPOSTOS.filter((i) => ESFERA[i] === e);
        return (
          <div key={e} className="rounded-card bg-surface-2 p-4 flex flex-col gap-3">
            <span className="text-label font-medium text-ink">{ROTULO_ESFERA[e]}</span>
            <Campo label="Fornecedor do grupo">
              <Select
                value={c.fornecedores[e]}
                onChange={(v) => setC((s) => ({ ...s, fornecedores: { ...s.fornecedores, [e]: v } }))}
                placeholder="Selecione o fornecedor" options={fornecedores}
              />
            </Campo>
            {impostos.map((i) => (
              <div key={i} className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                <Campo label={`${ROTULO_IMPOSTO[i]} · alíquota (%)`}>
                  <Input
                    type="number" step="0.01" value={String(c.aliquotas[i])}
                    onChange={(ev) => setC((s) => ({ ...s, aliquotas: { ...s.aliquotas, [i]: Number(ev.target.value) || 0 } }))}
                  />
                </Campo>
                <Campo label="Categoria padrão">
                  <Select value={c.categorias[i]}
                    onChange={(v) => setC((s) => ({ ...s, categorias: { ...s.categorias, [i]: v } }))}
                    placeholder="Selecione" options={categorias} />
                </Campo>
                <Campo label="Dia de vencimento" ajuda="0 = último dia do mês.">
                  <Input
                    type="number" min={0} max={31} value={String(c.diasVencimento[i])}
                    onChange={(ev) => setC((s) => ({ ...s, diasVencimento: { ...s.diasVencimento, [i]: Number(ev.target.value) || 0 } }))}
                  />
                </Campo>
              </div>
            ))}
          </div>
        );
      })}

      {/* As alíquotas são padrões do regime — ISS varia por município, ICMS por
          estado. Quem confirma é o contador; o sistema garante a aritmética. */}
      <p className="m-0 text-caption text-faint">
        As alíquotas vêm do regime da empresa e servem de ponto de partida: ISS varia por município, ICMS por
        estado e a base do Lucro Presumido muda conforme a atividade. Ajuste com o seu contador.
      </p>
    </FormModal>
  );
}

/* =============================== assinaturas =============================== */

export function AssinaturasVendasView() {
  const [lista, setLista] = React.useState<ReturnType<typeof listRecorrencias> | null>(null);
  const [busca, setBusca] = React.useState("");
  const [status, setStatus] = React.useState("");
  const { show, node } = useToast();

  React.useEffect(() => {
    hydrateRecorrencias().finally(() => setLista(listRecorrencias()));
  }, []);

  const visiveis = React.useMemo(() => (lista ?? []).filter((r) => {
    if (status && r.status !== status) return false;
    if (!busca.trim()) return true;
    const q = busca.toLowerCase();
    return [r.titulo, r.clienteNome, ...r.itens.map((i) => i.nome)].some((s) => String(s).toLowerCase().includes(q));
  }), [lista, busca, status]);

  const cardDe = (id: string, label: string, casa: (s: string) => boolean) => {
    const l = visiveis.filter((r) => casa(r.status));
    const valor = l.reduce((s, r) => s + totalFatura(r), 0);
    const total = visiveis.reduce((s, r) => s + totalFatura(r), 0);
    return { id, label, valor, quantidade: l.length, percentual: total > 0 ? Math.round((valor / total) * 1000) / 10 : 0 };
  };
  const cards = [
    { ...cardDe("total", "Total de assinaturas", () => true), percentual: 100 },
    cardDe("ativas", "Assinaturas ativas", (s) => s === "ativa"),
    cardDe("cancelada", "Cancelada", (s) => s === "cancelada"),
    // ⚠️ O sistema não tem "expirada": o que este card conta são as PAUSADAS.
    cardDe("pausadas", "Pausadas", (s) => s === "pausada"),
  ];

  return (
    <div className="flex flex-col gap-5 pb-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <p className="m-0 text-label text-muted">Gerencie assinaturas e cobranças recorrentes.</p>
        <Button variant="outline" disabled={visiveis.length === 0}
          onClick={() => baixarXLSX("assinaturas", [{
            nome: "Assinaturas",
            linhas: [["ID", "Status", "Cliente", "Ciclo", "Produtos", "Valor por ciclo"],
              ...visiveis.map((r) => [r.id, r.status, r.clienteNome,
                CICLOS.find((c) => c.id === r.ciclo)?.label ?? r.ciclo,
                r.itens.map((i) => i.nome).join(" · "), totalFatura(r)])],
          }])}>
          <Icon name="arrow-down-to-line" size={15} color="currentColor" />
          Exportar XLSX
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c) => <CardAnel key={c.id} c={c} />)}
      </div>

      <Card>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Campo label="Buscar">
            <Input value={busca} onChange={(e) => setBusca(e.target.value)}
              placeholder="Nome do cliente, ID externo, produto…" />
          </Campo>
          <Campo label="Status da assinatura">
            <Select value={status} onChange={setStatus} options={[
              { value: "", label: "Todas" },
              { value: "ativa", label: "Ativa" },
              { value: "pausada", label: "Pausada" },
              { value: "cancelada", label: "Cancelada" },
              { value: "rascunho", label: "Rascunho" },
            ]} />
          </Campo>
        </div>
      </Card>

      {lista === null ? (
        <Card><Skeleton className="h-[200px]" /></Card>
      ) : visiveis.length === 0 ? (
        <Card>
          <Vazio texto="Nenhuma assinatura encontrada. As recorrências que você ativar aparecem aqui — e as faturas delas entram no fluxo de caixa." />
        </Card>
      ) : (
        <Card padded={false} className="overflow-hidden">
          <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Tabela rolável">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-border-soft">
                  {["ID", "Status", "Cliente", "Ciclo", "Produto", "Valor por ciclo"].map((h, i) => (
                    <th key={h} className={`px-6 py-3 text-[11px] font-medium tracking-[0.08em] text-faint ${i === 5 ? "text-right" : "text-left"}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visiveis.map((r) => (
                  <tr key={r.id} className="border-b border-border-soft last:border-0">
                    <td className="px-6 py-3 text-caption text-faint tabular-nums">{r.id.slice(0, 10)}</td>
                    <td className="px-6 py-3 text-caption text-muted">{r.status}</td>
                    <td className="px-6 py-3 text-label text-ink truncate max-w-[24ch]">{r.clienteNome}</td>
                    <td className="px-6 py-3 text-label text-muted">{CICLOS.find((c) => c.id === r.ciclo)?.label}</td>
                    <td className="px-6 py-3 text-label text-muted truncate max-w-[26ch]">
                      {r.itens.map((i) => i.nome).join(" · ")}
                    </td>
                    <td className="px-6 py-3 text-right text-label text-ink tabular-nums"><BRL value={totalFatura(r)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      {node}
    </div>
  );
}

/* ============================ links de pagamento ============================ */

export function LinksPagamentoView() {
  const { data: partes } = usePartiesList();
  const [lista, setLista] = React.useState<LinkPagamento[] | null>(null);
  const [novo, setNovo] = React.useState<LinkPagamento | null>(null);
  const [aberto, setAberto] = React.useState<LinkPagamento | null>(null);
  const { show, node } = useToast();

  React.useEffect(() => { setLista(listarLinks()); }, []);

  // O recebedor do PIX sai do cadastro da empresa (chave = CNPJ), que mora no
  // navegador: é lido DEPOIS de montar, senão a hidratação diverge.
  const [recebedor, setRecebedor] = React.useState<DadosPix | null | undefined>(undefined);
  React.useEffect(() => { setRecebedor(dadosPixEmpresa()); }, []);

  const criar = (): LinkPagamento => ({
    id: novoId("lk"), titulo: "", valor: 0, clienteId: "", descricao: "",
    vencimento: null, ativo: true, criadoEm: new Date().toISOString().slice(0, 10), aberturas: 0,
  });

  // `?novo=1` — o endereço que o painel Criar usa abre esta tela com o
  // formulário já aberto (é o que dá link compartilhável à criação).
  React.useEffect(() => {
    if (new URLSearchParams(window.location.search).get("novo")) setNovo(criar());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col gap-5 pb-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <p className="m-0 text-label text-muted max-w-[70ch]">
          Cada link gera o PIX copia-e-cola e o QR do PIX da empresa, com o valor do link. Ainda não existe
          página pública de pagamento: o que se envia ao cliente é o código PIX.
        </p>
        <Button variant="primary" onClick={() => setNovo(criar())}>
          <Icon name="plus" size={15} color="currentColor" />
          Novo link
        </Button>
      </div>

      {recebedor === null && (
        <Card>
          <span className="text-h3 font-semibold text-warning">PIX sem recebedor</span>
          <p className="m-0 mt-1 text-label text-muted">
            O PIX usa o CNPJ cadastrado da empresa como chave, e não há CNPJ no cadastro. Sem ele o link não gera
            código para pagar — preencha em Dados da empresa.
          </p>
        </Card>
      )}

      {lista === null ? (
        <Card><Skeleton className="h-[180px]" /></Card>
      ) : lista.length === 0 ? (
        <Card>
          <Vazio texto="Nenhum link de pagamento criado. Cada link gera o PIX copia-e-cola e o QR do PIX da empresa — o cliente paga pelo aplicativo do banco." />
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {lista.map((l) => (
            <Card key={l.id} className="flex flex-col gap-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-label font-medium text-ink truncate">{l.titulo}</div>
                  <div className="text-caption text-faint">
                    {l.valor > 0 ? <BRL value={l.valor} /> : "Valor aberto"}
                    {l.vencimento && ` · vence ${fmtDia(l.vencimento)}`}
                  </div>
                </div>
                <span className={`w-[7px] h-[7px] rounded-pill mt-2 shrink-0`}
                  style={{ background: l.ativo ? "var(--color-positive)" : "var(--color-placeholder)" }} />
              </div>
              {l.descricao && <p className="m-0 text-caption text-muted line-clamp-2">{l.descricao}</p>}
              <div className="flex items-center gap-2 mt-1">
                <Button variant="ghost" onClick={() => setAberto(l)}>Ver QR do PIX</Button>
                <button
                  disabled={!recebedor || !l.ativo}
                  onClick={() => {
                    const pix = l.ativo ? pixDoLink(l, recebedor ?? null) : null;
                    if (!pix) { show("Cadastre o CNPJ da empresa para gerar o PIX."); return; }
                    navigator.clipboard?.writeText(pix).then(() => show("PIX copia-e-cola copiado."))
                      .catch(() => show("Não foi possível copiar."));
                  }}
                  className="text-caption text-muted hover:text-ink disabled:opacity-50"
                >
                  Copiar PIX
                </button>
                <button
                  onClick={() => { setLista(removerLink(l.id)); show("Link removido."); }}
                  aria-label="Excluir" className="ml-auto p-1 rounded-md text-muted hover:text-negative hover:bg-surface-2"
                >
                  <Icon name="trash-2" size={15} color="currentColor" />
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {novo && (
        <FormLink
          inicial={novo}
          clientes={(partes ?? []).filter((p) => p.is_customer).map((p) => ({ value: p.id, label: p.name }))}
          onClose={() => setNovo(null)}
          onSalvo={(l) => { setLista(salvarLink(l)); setNovo(null); setAberto(l); show("Link criado."); }}
        />
      )}

      {aberto && <QRModal link={aberto} recebedor={recebedor ?? null} onClose={() => setAberto(null)} onCopiar={() => show("PIX copia-e-cola copiado.")} />}
      {node}
    </div>
  );
}

function FormLink({
  inicial, clientes, onClose, onSalvo,
}: {
  inicial: LinkPagamento;
  clientes: { value: string; label: string }[];
  onClose: () => void;
  onSalvo: (l: LinkPagamento) => void;
}) {
  const [l, setL] = React.useState(inicial);
  const [erros, setErros] = React.useState<Record<string, string>>({});
  return (
    <FormModal title="Novo link de pagamento" size="medium" onClose={onClose} onSave={() => {
      const e = validarLink(l);
      setErros(e);
      if (Object.keys(e).length === 0) onSalvo(l);
    }}>
      <Campo label="Título" obrigatorio erro={erros.titulo}>
        <Input value={l.titulo} onChange={(e) => setL((s) => ({ ...s, titulo: e.target.value }))}
          placeholder="Ex.: Mentoria — turma de setembro" />
      </Campo>
      <Campo label="Valor" erro={erros.valor} ajuda="Deixe zero para o pagador digitar o valor no aplicativo do banco.">
        <CurrencyInput value={l.valor} onValueChange={(x) => setL((s) => ({ ...s, valor: x }))} />
      </Campo>
      <Campo label="Cliente">
        <Select value={l.clienteId} onChange={(v) => setL((s) => ({ ...s, clienteId: v }))}
          options={[{ value: "", label: "Link aberto (qualquer pessoa)" }, ...clientes]} />
      </Campo>
      <Campo label="Descrição">
        <Input value={l.descricao} onChange={(e) => setL((s) => ({ ...s, descricao: e.target.value }))} />
      </Campo>
      <Checkbox checked={l.ativo} onChange={(e) => setL((s) => ({ ...s, ativo: e.target.checked }))} label="Link ativo" />
    </FormModal>
  );
}

function QRModal({
  link, recebedor, onClose, onCopiar,
}: { link: LinkPagamento; recebedor: DadosPix | null; onClose: () => void; onCopiar: () => void }) {
  // ⚠️ O QR carrega o PIX copia-e-cola, não uma URL: não existe página pública
  // de pagamento, e um QR que leva a um 404 é pior que nenhum.
  // Link inativo não oferece o código. ⚠️ Um PIX estático NÃO expira: o que já
  // foi enviado continua pagável, e a tela diz isso em vez de prometer bloqueio.
  const pix = React.useMemo(() => (link.ativo ? pixDoLink(link, recebedor) : null), [link, recebedor]);
  const svg = React.useMemo(() => {
    if (!pix) return "";
    try { return qrParaSVG(gerarQR(pix), 240); } catch { return ""; }
  }, [pix]);

  return (
    <FormModal title={link.titulo || "Link de pagamento"} size="compact" onClose={onClose} onSave={onClose}>
      <div className="flex flex-col items-center gap-4">
        {!link.ativo
          ? <p className="m-0 text-caption text-muted text-center">Link inativo: o código não é oferecido. Um PIX já enviado continua pagável — PIX estático não expira.</p>
          : !pix
          ? <p className="m-0 text-caption text-muted">Sem CNPJ no cadastro da empresa não há chave PIX — o QR não é gerado.</p>
          : svg
            ? <div className="rounded-card bg-white p-2" dangerouslySetInnerHTML={{ __html: svg }} />
            : <p className="m-0 text-caption text-negative">Não foi possível gerar o QR deste PIX.</p>}
        <div className="text-center">
          <div className="text-[22px] leading-none font-semibold text-ink tabular-nums">
            {link.valor > 0 ? <BRL value={link.valor} /> : "Valor aberto"}
          </div>
          {link.descricao && <p className="m-0 mt-1 text-caption text-muted">{link.descricao}</p>}
        </div>
        {pix && (
          <>
            <div className="w-full rounded-md bg-surface-2 px-3 py-2 text-caption text-muted break-all">{pix}</div>
            <p className="m-0 text-caption text-faint text-center">
              A chave é o CNPJ da empresa — confira no seu banco que ele está cadastrado como chave PIX.
            </p>
            <Button
              variant="ghost"
              onClick={() => navigator.clipboard?.writeText(pix).then(onCopiar).catch(() => { /* clipboard bloqueado */ })}
            >
              <Icon name="layers" size={15} color="currentColor" />
              Copiar PIX
            </Button>
          </>
        )}
      </div>
    </FormModal>
  );
}

/* --------------------------------- peças --------------------------------- */

function Campo({
  label, obrigatorio, erro, ajuda, children,
}: { label: string; obrigatorio?: boolean; erro?: string; ajuda?: string; children: React.ReactNode }) {
  // O rótulo aponta para o campo (mesma correção do `Campo` da Nova venda).
  const gerado = React.useId();
  const filho = React.isValidElement<{ id?: string }>(children) ? children : null;
  const id = filho?.props.id ?? gerado;
  return (
    <div className="flex flex-col gap-[6px]">
      <label htmlFor={id} className="text-caption font-medium text-muted">
        {label}{obrigatorio && <span className="text-negative"> *</span>}
      </label>
      {filho ? React.cloneElement(filho, { id }) : children}
      {erro ? <span className="text-caption text-negative">{erro}</span>
        : ajuda ? <span className="text-caption text-faint">{ajuda}</span> : null}
    </div>
  );
}

function Vazio({ texto }: { texto: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-14 text-center">
      <span className="inline-flex items-center justify-center w-12 h-12 rounded-pill bg-surface-2">
        <Icon name="inbox" size={20} color="var(--color-text-tertiary)" />
      </span>
      <p className="m-0 text-label text-muted max-w-[46ch]">{texto}</p>
    </div>
  );
}
