"use client";

/**
 * Histórico de conversas da All 4 Pay AI.
 *
 * ⚠️ **Por USUÁRIO e por EMPRESA, no servidor** (mapa de consolidação, item 6).
 * O histórico vivia só no `localStorage`: a conversa era do DISPOSITIVO, não da
 * pessoa. Trocar de máquina perdia tudo, e ninguém mais da empresa via nada —
 * "nem a conversa é do usuário, é do dispositivo".
 *
 * Agora grava por `store-org` (tabela `org_state`, RLS por organização) num
 * mapa `usuário → conversas`. A organização vem da RLS; o usuário vem da chave
 * dentro do valor. Assim a conversa acompanha a pessoa entre máquinas e NÃO
 * vaza para os colegas — as duas coisas ao mesmo tempo.
 *
 * A API continua SÍNCRONA de propósito: a conversa precisa aparecer na lista no
 * instante em que a primeira resposta chega, sem esperar rede. `store-org` faz
 * o cache local e sincroniza em segundo plano.
 */
import type { Turno } from "@/components/ia/chat-kit";
import { ler as lerOrg, gravar as gravarOrg, CHAVES_ORG } from "@/lib/store-org";

const KEY = CHAVES_ORG.iaConversas;
const LIMITE = 60; // conversas guardadas; as mais antigas caem fora

export interface Conversa {
  id: string;
  titulo: string;
  /** ISO — usado para agrupar por recência. */
  criadaEm: string;
  atualizadaEm: string;
  turnos: Turno[];
}

const agora = () => new Date().toISOString();

/**
 * O usuário atual. ⚠️ Vem de um cache que o `AppShell` preenche ao logar; sem
 * ele o histórico cai num balde "local", que é o comportamento anterior — nunca
 * o de OUTRO usuário. Um erro aqui misturaria conversas de pessoas diferentes
 * dentro da mesma empresa, e isso é pior que perder histórico.
 */
let usuarioAtual = "local";
export function definirUsuarioDasConversas(id: string | null | undefined): void {
  usuarioAtual = id && id.trim() ? id : "local";
}

type PorUsuario = Record<string, Conversa[]>;

function ler(): Conversa[] {
  const mapa = lerOrg<PorUsuario>(KEY, {});
  const arr = mapa[usuarioAtual];
  return Array.isArray(arr) ? arr : [];
}

function gravar(cs: Conversa[]) {
  const mapa = lerOrg<PorUsuario>(KEY, {});
  gravarOrg(KEY, { ...mapa, [usuarioAtual]: cs.slice(0, LIMITE) });
}

/** Da mais recente para a mais antiga. */
export function listarConversas(): Conversa[] {
  return ler().sort((a, b) => b.atualizadaEm.localeCompare(a.atualizadaEm));
}

export function getConversa(id: string): Conversa | undefined {
  return ler().find((c) => c.id === id);
}

/** Título = a primeira pergunta, enxugada. É como o usuário reconhece a conversa. */
export function tituloDe(turnos: Turno[]): string {
  const q = turnos[0]?.q?.trim() || "Nova conversa";
  return q.length > 48 ? `${q.slice(0, 47)}…` : q;
}

/**
 * Cria ou atualiza a conversa. Devolve o id (o chamador guarda para as
 * próximas gravações). Conversa sem turno não é salva — o usuário só abriu.
 */
export function salvarConversa(id: string | null, turnos: Turno[]): string | null {
  if (!turnos.length) return id;
  const cs = ler();
  const t = agora();
  const existente = id ? cs.find((c) => c.id === id) : undefined;
  if (existente) {
    existente.turnos = turnos;
    existente.titulo = tituloDe(turnos);
    existente.atualizadaEm = t;
    gravar(cs);
    return existente.id;
  }
  // `crypto.randomUUID` não existe em contexto inseguro antigo — daí o fallback.
  const novo: Conversa = {
    id: (typeof crypto !== "undefined" && crypto.randomUUID) ? crypto.randomUUID() : `c${Date.now()}${Math.round(Math.random() * 1e6)}`,
    titulo: tituloDe(turnos), criadaEm: t, atualizadaEm: t, turnos,
  };
  gravar([novo, ...cs]);
  return novo.id;
}

export function apagarConversa(id: string) {
  gravar(ler().filter((c) => c.id !== id));
}

export function limparConversas() {
  gravar([]);
}

export type GrupoRecencia = { label: string; conversas: Conversa[] };

/**
 * Agrupa por recência no padrão que o usuário espera de um chat:
 * Hoje · Últimos 7 dias · Últimos 30 dias · Mais antigas. Grupos vazios não
 * entram. Datas comparadas em DIAS de calendário local (não em 24h corridas),
 * senão "ontem à noite" cairia em "Hoje".
 */
export function agruparPorRecencia(cs: Conversa[], hoje = new Date()): GrupoRecencia[] {
  const diaDe = (d: Date) => Math.floor(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / 86400000);
  const h = diaDe(hoje);
  const buckets: { label: string; teste: (dias: number) => boolean }[] = [
    { label: "Hoje", teste: (d) => d === 0 },
    { label: "Últimos 7 dias", teste: (d) => d >= 1 && d <= 7 },
    { label: "Últimos 30 dias", teste: (d) => d >= 8 && d <= 30 },
    { label: "Mais antigas", teste: (d) => d > 30 },
  ];
  return buckets
    .map(({ label, teste }) => ({
      label,
      conversas: cs.filter((c) => {
        const d = new Date(c.atualizadaEm);
        return !Number.isNaN(d.getTime()) && teste(h - diaDe(d));
      }),
    }))
    .filter((g) => g.conversas.length > 0);
}
