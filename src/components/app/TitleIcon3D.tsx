"use client";

import { usePathname } from "next/navigation";
import { Icon3D, type Icon3DName } from "@/components/ui/Icon3D";

/**
 * Ícone 3D da marca ao lado do título da página (AppShell). Mapeia a rota →
 * glifo, para caracterizar TODAS as telas com a linguagem 3D corporativa sem
 * tocar tela por tela. Prefixo mais longo vence; fallback "spark".
 */
const MAP: [string, Icon3DName][] = [
  ["/painel-vendas", "chart"],
  ["/dre", "doc"],
  ["/fluxo-caixa", "bank"],
  ["/orcamento", "target"],
  ["/recebimentos", "money"],
  ["/recebiveis", "money"],
  ["/pagamentos", "card"],
  ["/pagaveis", "card"],
  ["/conciliacao", "repeat"],
  ["/upload", "layers"],
  ["/razao", "doc"],
  ["/nova-venda", "cart"],
  ["/vendas", "cart"],
  ["/recorrencias", "repeat"],
  ["/notas-fiscais", "doc"],
  ["/impostos", "doc"],
  ["/inadimplencia", "gauge"],
  ["/boletos", "doc"],
  ["/pos", "card"],
  ["/produtos", "box"],
  ["/servicos", "tag"],
  ["/projetos", "target"],
  ["/centros-custo", "layers"],
  ["/contatos", "users"],
  ["/plano-de-contas", "layers"],
  ["/reembolsos", "money"],
  ["/contabilidade", "doc"],
  ["/relatorios", "doc"],
  ["/dimensoes", "layers"],
  ["/cronogramas", "calendar"],
  ["/consolidado", "bank"],
  ["/fechamento", "shield"],
  ["/copiloto", "spark"],
  ["/plataforma", "gear"],
  ["/aprovacoes", "shield"],
  ["/governanca", "shield"],
  ["/automacoes", "gear"],
  ["/configuracoes", "gear"],
  ["/consolidado", "bank"],
  ["/admin", "shield"],
  ["/lixeira", "box"],
];

export function TitleIcon3D() {
  const pathname = usePathname() || "/";
  // Home tem título próprio ("Bem-vindo!") — sem ícone p/ não competir.
  if (pathname === "/") return null;
  let best: Icon3DName = "spark";
  let bestLen = 0;
  for (const [prefix, glyph] of MAP) {
    if ((pathname === prefix || pathname.startsWith(prefix + "/") || pathname.startsWith(prefix)) && prefix.length > bestLen) {
      best = glyph;
      bestLen = prefix.length;
    }
  }
  return <Icon3D name={best} size={40} className="shrink-0" />;
}
