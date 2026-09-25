/**
 * ═══════════════════════════════════════════════════════════════════════════
 * MODO SIMULAÇÃO do materializador de recorrências — NÃO GRAVA NADA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O cron `/api/recorrencias/run` está com 0 execuções registradas (nenhum
 * evento `materializar_recorrencias` na trilha). Religá-lo sem antes provar o
 * que ele geraria é publicar uma suposição em produção (regra da SÉTIMA no
 * CLAUDE.md: prova de carga ANTES de ligar, nunca depois).
 *
 * Esta função é PURA e não toca em rede/banco — recebe os dados já lidos
 * (recorrências, quem tem conta, quais `reference_code` já existem, saldo por
 * org) e devolve os títulos que SERIAM gerados, com data e valor, e o efeito
 * no saldo projetado por organização. A rota (`route.ts`) é quem lê o banco
 * (só leitura) e chama esta função; ela nunca insere `movements` nem
 * `audit_log` no caminho de simulação.
 *
 * ⚠️ NÃO HÁ BACKFILL DE MÊS PERDIDO. `datasFaturaCron` só empurra datas
 * dentro de `[hoje, hoje+horizonte]` — uma regra parada há 3 meses não gera 3
 * títulos atrasados de uma vez, gera só as ocorrências que caem no horizonte
 * a partir de hoje. Esta simulação existe para PROVAR isso antes de religar,
 * não para assumir que é assim.
 */
import { datasFaturaCron, refFatura } from "@/lib/recorrencias-sched";

export interface RecorrenciaParaSimular {
  id: string;
  orgId: string;
  /** valor cru do banco ("entrada" | "saida"); tudo que não for "saida" vira "entrada". */
  type: string;
  amount: number;
  /** valor cru do banco (o enum `freq` de 7 valores); `datasFaturaCron` sanea. */
  freq: string;
  startDate: string;
  endDate: string | null;
  dueDay: number | null;
}

export interface TituloSimulado {
  recorrenciaId: string;
  orgId: string;
  tipo: "entrada" | "saida";
  data: string;
  valor: number;
  referenceCode: string;
  /** true = já existe um `movement` com este `reference_code` — o cron real PULARIA (23505), não duplicaria. */
  jaExiste: boolean;
}

export interface EfeitoOrgSimulado {
  orgId: string;
  /** null quando a org não tem nenhuma conta cadastrada com saldo lido. */
  saldoAtual: number | null;
  /** só conta os títulos NOVOS (jaExiste === false) — os existentes não mudam nada ao religar. */
  titulosNovos: number;
  valorEntradasNovas: number;
  valorSaidasNovas: number;
  efeitoLiquido: number;
  saldoProjetado: number | null;
}

export interface ResultadoSimulacao {
  horizonteDias: number;
  recorrenciasProcessadas: number;
  /** org sem nenhuma conta financeira cadastrada — a recorrência é ignorada, como no cron real. */
  recorrenciasSemConta: number;
  titulos: TituloSimulado[];
  porOrg: EfeitoOrgSimulado[];
}

export interface ParametrosSimulacao {
  hojeISO: string;
  horizonteDias: number;
  recorrencias: RecorrenciaParaSimular[];
  temConta: (orgId: string) => boolean;
  referenciaExiste: (referenceCode: string) => boolean;
  saldoDaOrg: (orgId: string) => number | null;
}

export function simularMaterializacao(params: ParametrosSimulacao): ResultadoSimulacao {
  const { hojeISO, horizonteDias, recorrencias, temConta, referenciaExiste, saldoDaOrg } = params;

  const titulos: TituloSimulado[] = [];
  const porOrgMap = new Map<string, EfeitoOrgSimulado>();
  let recorrenciasSemConta = 0;

  const efeitoDe = (orgId: string): EfeitoOrgSimulado => {
    let e = porOrgMap.get(orgId);
    if (!e) {
      const saldoAtual = saldoDaOrg(orgId);
      e = { orgId, saldoAtual, titulosNovos: 0, valorEntradasNovas: 0, valorSaidasNovas: 0, efeitoLiquido: 0, saldoProjetado: saldoAtual };
      porOrgMap.set(orgId, e);
    }
    return e;
  };

  for (const r of recorrencias) {
    if (!temConta(r.orgId)) { recorrenciasSemConta++; continue; }

    const dentroDaVigencia = !r.endDate || r.endDate >= hojeISO;
    if (!dentroDaVigencia) continue;

    const tipo: "entrada" | "saida" = r.type === "saida" ? "saida" : "entrada";
    const datas = datasFaturaCron(r.startDate, r.freq, r.dueDay ?? null, hojeISO, horizonteDias);

    for (const data of datas) {
      const referenceCode = refFatura(r.id, data);
      const jaExiste = referenciaExiste(referenceCode);
      titulos.push({ recorrenciaId: r.id, orgId: r.orgId, tipo, data, valor: r.amount, referenceCode, jaExiste });

      const e = efeitoDe(r.orgId);
      if (jaExiste) continue;
      e.titulosNovos++;
      if (tipo === "entrada") e.valorEntradasNovas += r.amount;
      else e.valorSaidasNovas += r.amount;
    }
  }

  for (const e of Array.from(porOrgMap.values())) {
    e.efeitoLiquido = e.valorEntradasNovas - e.valorSaidasNovas;
    e.saldoProjetado = e.saldoAtual === null ? null : Math.round((e.saldoAtual + e.efeitoLiquido) * 100) / 100;
  }

  return {
    horizonteDias,
    recorrenciasProcessadas: recorrencias.length,
    recorrenciasSemConta,
    titulos,
    porOrg: Array.from(porOrgMap.values()),
  };
}
