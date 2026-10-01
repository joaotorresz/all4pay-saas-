"use client";

/**
 * Envio de NFs ao Contador.
 *
 * O pacote mensal com os XMLs das notas de entrada e de saída. As duas pontas
 * já existem no sistema: entrada são as **NFs Recebidas** e saída são as notas
 * das **Vendas** — esta tela não apura nada, ela empacota.
 *
 * O que ela guarda é a regra de quem recebe.
 *
 * ⚠️ EM PRODUÇÃO NÃO HÁ EXECUTOR. Nenhum cron, rota ou e-mail monta e envia o
 * pacote, e nenhum link de confirmação sai daqui. A tela dizia "envio mensal
 * automático", "próximo envio em 01/11 às 21h" e "enviamos um link de
 * confirmação" — três promessas sobre uma engrenagem que não existe, e quem lê
 * conclui que o contador já recebe. Fora da demonstração ela diz o que existe
 * hoje: o cadastro dos e-mails (em `org_state`, via `store-org`) e a relação do
 * mês, que se BAIXA À MÃO. O executor (automações + Resend) é decisão do dono.
 */
import * as React from "react";
import { createPortal } from "react-dom";
import { Card, Button, Icon, Input } from "@/components/ui";
import { useToast } from "@/components/listas/ListChrome";
import {
  statusEnvio, podeAdicionar, validarDestinatario, proximoEnvio,
  formatarProximoEnvio, resumoMesNFs, LIMITE_DESTINATARIOS,
  type DestinatarioContador, type NotaDoMes,
} from "@/core/contabilidade";
import {
  listarDestinatarios, salvarDestinatario, removerDestinatario,
  verificarDestinatario, arquivamentoDesde, ultimaExecucao, novoIdDest,
} from "@/lib/contabilidade-store";
import { listarNFs } from "@/lib/compras-store";
import { useVendas } from "@/lib/vendas";
import { isDemo } from "@/lib/demo";
import { baixarXLSX } from "@/lib/xlsx";

/**
 * O envio automático só existe SIMULADO, na demonstração. Em produção não há
 * executor — a tela não promete envio, agendamento nem link de confirmação.
 */
const ENVIO_SIMULADO = isDemo;

const hojeISO = () => new Date().toISOString().slice(0, 10);
const fmtDia = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");

export function EnvioNFsView() {
  const { show: toast, node } = useToast();
  const [destinatarios, setDestinatarios] = React.useState<DestinatarioContador[]>([]);
  const [entradas, setEntradas] = React.useState<NotaDoMes[]>([]);
  const [saidas, setSaidas] = React.useState<NotaDoMes[]>([]);
  const [linhasMes, setLinhasMes] = React.useState<{ entrada: (string | number)[][]; saida: (string | number)[][] }>({ entrada: [], saida: [] });
  const [desde, setDesde] = React.useState<string | null>(null);
  const [ultima, setUltima] = React.useState<ReturnType<typeof ultimaExecucao>>(null);
  const [modal, setModal] = React.useState(false);
  const [email, setEmail] = React.useState("");
  const [erro, setErro] = React.useState<string | null>(null);

  const hoje = hojeISO();
  const mes = hoje.slice(0, 7);

  const recarregar = React.useCallback(() => {
    setDestinatarios(listarDestinatarios());
    setDesde(arquivamentoDesde());
    setUltima(ultimaExecucao());
    // Entrada = NFs recebidas de fornecedores; a chave de acesso é o que se
    // arquiva. Saída = as notas emitidas nas vendas.
    const nfs = listarNFs();
    setEntradas(nfs.map((n) => ({
      emissao: n.emissao,
      arquivada: n.status !== "cancelada" && n.status !== "erro",
    })));
    const mesAtual = hojeISO().slice(0, 7);
    setLinhasMes((l) => ({
      ...l,
      entrada: nfs.filter((n) => n.emissao.slice(0, 7) === mesAtual)
        .map((n) => [n.numero, n.chave?.chave ?? "", n.emissao, n.fornecedor, n.cnpj, n.valor, n.status]),
    }));
  }, []);
  const { data: vendas } = useVendas();
  React.useEffect(() => {
    const emitidas = (vendas ?? []).filter((v) => v.statusNF === "emitida");
    setSaidas(emitidas.map((v) => ({ emissao: v.competencia, arquivada: true })));
    const mesAtual = hojeISO().slice(0, 7);
    setLinhasMes((l) => ({
      ...l,
      saida: emitidas.filter((v) => v.competencia.slice(0, 7) === mesAtual)
        .map((v) => [v.numeroNF, v.numero, v.competencia, v.clienteNome, v.valorTotal]),
    }));
  }, [vendas]);

  React.useEffect(() => { recarregar(); }, [recarregar]);

  const status = statusEnvio(destinatarios);
  const resumo = resumoMesNFs(entradas, saidas, mes, desde);
  const proximo = proximoEnvio(hoje);

  function adicionar() {
    const e = validarDestinatario(email, destinatarios);
    setErro(e);
    if (e) return;
    setDestinatarios(salvarDestinatario({
      id: novoIdDest(),
      email: email.trim().toLowerCase(),
      verificado: false,
      criadoEm: hoje,
      verificadoEm: null,
    }));
    setModal(false);
    setEmail("");
    // ⚠️ Em produção NENHUM e-mail sai daqui ainda — não há job nem envio do
    // link. Dizer "link enviado" faria a pessoa esperar por um e-mail que não
    // existe e concluir que o contador já está recebendo.
    toast(ENVIO_SIMULADO
      ? "Link de confirmação enviado (demonstração). O contador precisa clicar para começar a receber."
      : "E-mail cadastrado. O envio do link de confirmação e o pacote mensal ainda não estão ligados: nenhum XML sai daqui por enquanto.");
  }

  /**
   * A relação das notas do mês, à mão. É o que existe hoje para levar ao
   * contador: os XMLs vêm do emissor (saída) e da SEFAZ (entrada), e o sistema
   * não os retém — a planilha diz QUAIS notas pedir.
   */
  function baixarRelacao() {
    baixarXLSX(`notas-do-mes-${mes}`, [
      { nome: "Entrada", linhas: [["Número", "Chave de acesso", "Emissão", "Fornecedor", "CNPJ", "Valor", "Situação"], ...linhasMes.entrada] },
      { nome: "Saída", linhas: [["Nº da NF", "Venda", "Emissão", "Cliente", "Valor"], ...linhasMes.saida] },
    ]);
    toast(`Relação de ${linhasMes.entrada.length + linhasMes.saida.length} notas baixada.`);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <p className="m-0 text-label text-muted max-w-[72ch]">
          {ENVIO_SIMULADO
            ? "Envio mensal automático dos XMLs das NFs (entrada + saída) para os e-mails do contador (demonstração)."
            : "O envio automático ao contador ainda não existe: nenhum pacote nem e-mail sai daqui. Hoje a relação das notas do mês se baixa à mão, e os e-mails cadastrados ficam guardados para quando o envio for ligado."}
        </p>
        <Button
          variant="primary"
          disabled={!podeAdicionar(destinatarios)}
          onClick={() => { setErro(null); setModal(true); }}
        >
          <Icon name="plus" size={15} color="currentColor" />
          Adicionar e-mail
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-4">
        <Card>
          <div className="flex flex-col gap-4">
            <span className="inline-flex items-center gap-2 text-h3 font-semibold text-ink">
              <Icon name="mail" size={16} color="var(--color-text-secondary)" />
              Status
            </span>
            {ENVIO_SIMULADO ? (
              <>
                <span className="inline-flex items-center gap-2 text-label text-ink">
                  <span
                    className="w-[7px] h-[7px] rounded-pill"
                    style={{ background: status === "ativo" ? "var(--color-positive)" : "var(--color-placeholder)" }}
                  />
                  {status === "ativo" ? "Ativo" : "Inativo"}
                  {status === "inativo" && (
                    <span className="text-caption text-faint">(cadastre e verifique pelo menos 1 e-mail)</span>
                  )}
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Campo rotulo="Próximo envio">
                    <span className="text-label text-ink tabular-nums">{formatarProximoEnvio(proximo)}</span>
                  </Campo>
                  <Campo rotulo="Última execução">
                    <span className="text-label text-ink tabular-nums">
                      {ultima ? `${fmtDia(ultima.quando)} · ${ultima.entrada + ultima.saida} notas` : "Ainda sem envios."}
                    </span>
                  </Campo>
                </div>
                <p className="m-0 text-caption text-faint max-w-[72ch]">
                  O pacote sai no dia 1º, às 21h — depois do fechamento do mês. Uma nota emitida
                  no dia 31 à noite ainda é daquela competência, e enviar no próprio dia entregaria
                  um pacote incompleto.
                </p>
              </>
            ) : (
              <>
                <span className="inline-flex items-center gap-2 text-label text-ink" data-envio-status="nao-ligado">
                  <span className="w-[7px] h-[7px] rounded-pill" style={{ background: "var(--color-placeholder)" }} />
                  Envio automático não ligado
                </span>
                <p className="m-0 text-caption text-faint max-w-[72ch]">
                  Não há envio agendado e nenhum e-mail sai daqui — nem o pacote mensal, nem o link
                  de confirmação. Para mandar as notas ao contador hoje, baixe a relação do mês ao
                  lado e encaminhe-a junto com os XMLs do emissor de notas.
                </p>
              </>
            )}
          </div>
        </Card>

        <Card>
          <div className="flex flex-col gap-4">
            <span className="inline-flex items-center gap-2 text-h3 font-semibold text-ink">
              <Icon name="calendar" size={16} color="var(--color-text-secondary)" />
              Mês corrente
            </span>
            <span className="text-label text-muted tabular-nums">{mes.split("-").reverse().join("/")}</span>
            <div className="grid grid-cols-2 gap-4">
              <Contador rotulo="Entrada" n={resumo.entrada} arquivadas={ENVIO_SIMULADO ? resumo.entradaArquivadas : null} />
              <Contador rotulo="Saída" n={resumo.saida} arquivadas={ENVIO_SIMULADO ? resumo.saidaArquivadas : null} />
            </div>
            <Button variant="secondary" onClick={baixarRelacao} disabled={linhasMes.entrada.length + linhasMes.saida.length === 0}>
              <Icon name="arrow-down-to-line" size={15} color="currentColor" />
              Baixar relação do mês
            </Button>
            {!ENVIO_SIMULADO && (
              <p className="m-0 text-caption text-faint">
                O sistema não retém os XMLs: a relação diz quais notas o contador deve receber; o
                arquivo de cada uma vem do emissor (saída) e da SEFAZ (entrada).
              </p>
            )}
            {ENVIO_SIMULADO && !desde && (
              <p className="m-0 text-caption text-faint">
                O arquivamento começa assim que houver um e-mail verificado — até lá o sistema
                conta as notas, mas não retém XML para enviar.
              </p>
            )}
          </div>
        </Card>
      </div>

      <Card>
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-2 text-h3 font-semibold text-ink">
              <Icon name="users" size={16} color="var(--color-text-secondary)" />
              Destinatários
            </span>
            <span className="text-caption text-faint tabular-nums">
              {destinatarios.length} de {LIMITE_DESTINATARIOS} destinatários
            </span>
          </div>

          {destinatarios.length === 0 ? (
            <p className="m-0 py-8 text-center text-label text-muted">
              {ENVIO_SIMULADO
                ? "Nenhum e-mail cadastrado. Adicione o e-mail do contador para começar a receber os pacotes mensais."
                : "Nenhum e-mail cadastrado."}
            </p>
          ) : (
            <ul className="m-0 p-0 list-none flex flex-col">
              {destinatarios.map((d) => (
                <li
                  key={d.id}
                  className="flex items-center justify-between gap-3 py-3 border-b border-border-soft last:border-0"
                >
                  <span className="flex flex-col gap-[2px] min-w-0">
                    <span className="text-label text-ink truncate">{d.email}</span>
                    <span className="inline-flex items-center gap-[6px] text-caption text-muted">
                      <span
                        className="w-[6px] h-[6px] rounded-pill"
                        style={{ background: ENVIO_SIMULADO && d.verificado ? "var(--color-positive)" : "var(--color-warning)" }}
                      />
                      {/* ⚠️ Fora da demonstração não existe link de confirmação, então
                          nenhum "Verificado" é verdadeiro — mesmo o que ficou gravado de
                          antes (o "Simular confirmação" chegou a aparecer em produção). */}
                      {!ENVIO_SIMULADO
                        ? `Cadastrado em ${fmtDia(d.criadoEm)} — a confirmação por e-mail ainda não está ligada`
                        : d.verificado
                          ? `Verificado em ${fmtDia(d.verificadoEm!)}`
                          : "Aguardando confirmação — não recebe até clicar no link"}
                    </span>
                  </span>
                  <span className="flex items-center gap-1 shrink-0">
                    {/* ⚠️ "Simular confirmação" SÓ na demonstração: em produção ele
                        marcava o e-mail como verificado sem clique nenhum do
                        contador e mostrava um "próximo envio" que não acontece. */}
                    {ENVIO_SIMULADO && !d.verificado && (
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setDestinatarios(verificarDestinatario(d.id, hoje));
                          setDesde(arquivamentoDesde());
                          toast("Confirmação registrada — o envio está ativo.");
                        }}
                      >
                        Simular confirmação
                      </Button>
                    )}
                    <button
                      onClick={() => {
                        setDestinatarios(removerDestinatario(d.id));
                        setDesde(arquivamentoDesde());
                        toast("Destinatário removido.");
                      }}
                      aria-label={`Remover ${d.email}`}
                      title="Remover"
                      className="p-[6px] rounded-md text-muted hover:text-negative hover:bg-surface-2 transition-colors"
                    >
                      <Icon name="trash-2" size={15} color="currentColor" />
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}

          <p className="m-0 text-caption text-faint max-w-[76ch]">
            O limite de {LIMITE_DESTINATARIOS} não é técnico: o pacote carrega a escrituração
            fiscal inteira da empresa, e uma lista aberta transforma um envio de rotina em
            vazamento contínuo.
          </p>
        </div>
      </Card>

      {modal && (
        <Modal onFechar={() => setModal(false)}>
          <div className="flex flex-col gap-4">
            <div className="flex items-start justify-between gap-3">
              <span className="text-h3 font-semibold text-ink">Adicionar e-mail do contador</span>
              <button
                onClick={() => setModal(false)}
                aria-label="Fechar"
                className="p-[6px] rounded-md text-muted hover:text-ink hover:bg-surface-2 transition-colors"
              >
                <Icon name="x" size={16} color="currentColor" />
              </button>
            </div>
            <p className="m-0 text-label text-muted">
              {ENVIO_SIMULADO
                ? "Enviamos um link de confirmação para esse e-mail. O contador precisa clicar no link para começar a receber o pacote mensal de NFs — um endereço digitado errado entregaria os XMLs a um estranho."
                : "O e-mail fica guardado para quando o envio existir. Hoje nenhum link de confirmação é enviado e nenhum XML sai daqui — quando o envio for ligado, o contador terá de confirmar o endereço antes de receber."}
            </p>
            <div className="flex flex-col gap-[6px]">
              <label className="text-label font-medium text-muted">E-mail</label>
              <Input
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setErro(null); }}
                placeholder="contador@empresa.com.br"
                invalid={!!erro}
              />
              {erro && <span className="text-caption text-negative">{erro}</span>}
            </div>
            <div className="flex items-center justify-end gap-2">
              <Button variant="ghost" onClick={() => setModal(false)}>Cancelar</Button>
              <Button variant="primary" onClick={adicionar}>{ENVIO_SIMULADO ? "Enviar confirmação" : "Cadastrar e-mail"}</Button>
            </div>
          </div>
        </Modal>
      )}
      {node}
    </div>
  );
}

/* --------------------------------- peças --------------------------------- */

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-[6px]">
      <span className="text-[11px] font-medium tracking-[0.08em] text-faint">{rotulo}</span>
      {children}
    </div>
  );
}

function Contador({ rotulo, n, arquivadas }: { rotulo: string; n: number; arquivadas: number | null }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-caption text-muted">{rotulo}</span>
      <span className="text-[22px] leading-none font-semibold text-ink tabular-nums">{n}</span>
      {arquivadas !== null && <span className="text-caption text-faint tabular-nums">({arquivadas} arquivadas)</span>}
    </div>
  );
}

/**
 * O modal vai por portal no `<body>`.
 *
 * O `Card` do DS tem `transform` (a micro-elevação), e um ancestral
 * transformado vira o bloco de contenção de qualquer `position: fixed` — sem o
 * portal o modal nasceria do tamanho do card.
 */
function Modal({ children, onFechar }: { children: React.ReactNode; onFechar: () => void }) {
  const [montado, setMontado] = React.useState(false);
  React.useEffect(() => {
    setMontado(true);
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onFechar(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onFechar]);
  if (!montado) return null;
  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/30" onClick={onFechar}>
      <div
        className="w-full max-w-[520px] rounded-card bg-white p-6 shadow-popover"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
