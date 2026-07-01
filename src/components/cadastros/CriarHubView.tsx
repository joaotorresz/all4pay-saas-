"use client";

/**
 * Hub "Criar Novo" (modelo IULI, Fig.37) — o mapa de entidades do sistema num
 * único ponto: CADASTROS (Empresa, Conta, Categoria, Cliente, Fornecedor,
 * Produto, Projeto, Centro de Custo, Contrato, Orçamento) e MOVIMENTAÇÕES
 * (Receber, Pagar, Venda, Compra, Transferência). Cada card leva ao fluxo de
 * criação correspondente. Reconstrução fiel.
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app/AppShell";
import { Card, Icon, InfoHint } from "@/components/ui";

type Acao = { label: string; icon: string; href?: string; event?: string; info?: { titulo?: string; oQue: string; comoCalcula?: string } };

const CADASTROS: Acao[] = [
  { label: "Empresa", icon: "building", href: "/comecar" },
  { label: "Conta bancária", icon: "upload", href: "/upload?aba=conectar" },
  { label: "Categoria (Plano de Contas)", icon: "layers", href: "/plano-de-contas" },
  { label: "Cliente", icon: "users", href: "/contatos" },
  { label: "Fornecedor", icon: "users", href: "/contatos" },
  { label: "Produto", icon: "shopping-cart", href: "/produtos" },
  { label: "Serviço", icon: "receipt", href: "/servicos" },
  { label: "Projeto", icon: "target", href: "/projetos" },
  { label: "Centro de Custo", icon: "building", href: "/centros-custo" },
  { label: "Contrato", icon: "file-text", href: "/recorrencias" },
  { label: "Orçamento", icon: "target", href: "/orcamento" },
];

const MOVIMENTACOES: Acao[] = [
  { label: "Conta a Receber", icon: "arrow-left-right", href: "/recebimentos" },
  { label: "Conta a Pagar", icon: "arrow-up-right", href: "/pagamentos" },
  { label: "Venda", icon: "credit-card", href: "/nova-venda" },
  { label: "Compra", icon: "shopping-cart", href: "/pagamentos" },
  { label: "Transferência", icon: "repeat", event: "a4p:open-nova-transacao" },
];

export function CriarHubView() {
  const router = useRouter();
  const go = (a: Acao) => { if (a.event) window.dispatchEvent(new Event(a.event)); else if (a.href) router.push(a.href); };
  return (
    <AppShell title="Criar Novo">
      <div className="flex flex-col gap-8 pb-8">
        <Grupo
          titulo="Cadastros"
          hint="Entidades-base que alimentam todas as transações"
          info={{ oQue: "Atalhos para criar as entidades-base (empresa, conta, cliente, produto) que todo lançamento usa depois." }}
          itens={CADASTROS}
          onGo={go}
        />
        <Grupo
          titulo="Movimentações"
          hint="Documentos que movimentam resultado e caixa"
          info={{ oQue: "Atalhos para criar os documentos que movem dinheiro (receber, pagar, venda, compra, transferência)." }}
          itens={MOVIMENTACOES}
          onGo={go}
        />
      </div>
    </AppShell>
  );
}

function Grupo({ titulo, hint, info, itens, onGo }: { titulo: string; hint: string; info?: { titulo?: string; oQue: string; comoCalcula?: string }; itens: Acao[]; onGo: (a: Acao) => void }) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="m-0 text-label font-medium text-faint tracking-wide inline-flex items-center gap-1">
          {titulo}
          {info && <InfoHint align="left" titulo={info.titulo ?? titulo} oQue={info.oQue} comoCalcula={info.comoCalcula} />}
        </h2>
        <span className="text-caption text-faint">{hint}</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {itens.map((a) => (
          <button key={a.label} onClick={() => onGo(a)} className="group text-left">
            <Card className="flex items-center gap-3 hover:bg-surface-1">
              <span className="w-9 h-9 rounded-md bg-surface-2 inline-flex items-center justify-center shrink-0">
                <Icon name={a.icon} size={18} color="var(--color-text-secondary)" />
              </span>
              <span className="text-[15px] font-medium text-ink flex-1">{a.label}</span>
              <Icon name="plus" size={15} color="var(--color-lime)" />
            </Card>
          </button>
        ))}
      </div>
    </section>
  );
}
