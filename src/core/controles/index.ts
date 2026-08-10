/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O INVENTÁRIO DE CONTROLES — todo elemento clicável, com destino declarado.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ O critério da ONDA 7 é "zero controles sem destino ou sem efeito", e isso
 * só é verificável se alguém escrever qual É o destino esperado. Um botão que
 * não faz nada é indistinguível de um botão que faz algo invisível — a diferença
 * mora na intenção de quem o escreveu, e intenção não fica no código.
 *
 * Cada entrada declara o que o controle DEVE fazer. A guarda da matriz confronta
 * isso com o que o sistema realmente oferece: destino de navegação tem de ser
 * rota do inventário; ação destrutiva tem de declarar confirmação E desfazer;
 * controle de estado tem de declarar papel ARIA.
 *
 * Puro, sem imports de React. Versão controles/1.0.0.
 */

export const CONTROLES_VERSION = "controles/1.0.0";

export type TipoControle =
  /** Leva a outro endereço. Tem de ser `<a>`/`<Link>` com `href` real. */
  | "navegacao"
  /** Executa algo e fica na tela (abrir modal, aplicar filtro, alternar). */
  | "acao"
  /** Muda um estado binário. Precisa de `role` e de estado ARIA. */
  | "interruptor"
  /** APAGA algo. Precisa de confirmação E de desfazer. */
  | "destrutiva";

export interface Controle {
  id: string;
  /** Onde ele vive — a tela, pelo nome do inventário de rotas. */
  tela: string;
  /** O rótulo visível (ou o `aria-label`, quando é só ícone). */
  rotulo: string;
  tipo: TipoControle;
  /** Para `navegacao`: a rota de destino. Tem de existir no inventário. */
  destino?: string;
  /** Para `acao`: o efeito esperado, em uma frase verificável. */
  efeito?: string;
  /** Para `interruptor`: o papel ARIA que ele expõe. */
  papel?: "switch" | "tab" | "checkbox";
  /** Para `destrutiva`: confirma antes? */
  confirma?: boolean;
  /** Para `destrutiva`: dá para desfazer depois? */
  desfaz?: boolean;
  /** Fecha por Esc? Obrigatório em tudo que abre sobreposto. */
  fechaPorEsc?: boolean;
}

/**
 * ⚠️ Esta lista cobre os controles ESTRUTURAIS — os que a auditoria apontou e os
 * que governam navegação, estado e destruição. Não é (e não deveria ser) uma
 * cópia de cada `<button>` do produto: uma lista que tenta ser exaustiva
 * envelhece na primeira tela nova e vira ficção.
 *
 * O que ela garante é que os controles que PODEM causar dano ou confusão
 * estejam declarados e conferidos.
 */
export const CONTROLES: Controle[] = [
  /* ------------------------------- chrome -------------------------------- */
  { id: "topbar.marca", tela: "Início", rotulo: "all4pay", tipo: "navegacao", destino: "/" },
  { id: "topbar.config", tela: "Início", rotulo: "Configurações", tipo: "navegacao", destino: "/dashboard/administration" },
  { id: "topbar.anuncios", tela: "Início", rotulo: "Anúncios", tipo: "navegacao", destino: "/dashboard/help" },
  { id: "topbar.mais", tela: "Início", rotulo: "Mais", tipo: "acao", efeito: "abre o menu de conta, busca, tema e sair", fechaPorEsc: true },
  {
    // ⚠️ Mudou de MORADA, não de existência: o botão saiu da lateral (que
    // passou a ser só a lista de telas do grupo) e a porta virou a paleta.
    // O id ficou como registro de que o controle é o mesmo — o que a guarda
    // cobra é que ele TENHA efeito e feche por Esc, não onde ele mora.
    id: "palette.criar", tela: "Início", rotulo: "Criar novo registro", tipo: "acao",
    efeito: "abre o painel Criar novo, com todas as ações em <Link>", fechaPorEsc: true,
  },
  {
    // ⚠️ O controle que a auditoria pegou: vinha sem `role`, sem `aria-checked`
    // e sem `type`. Um leitor de tela anunciava "Modo Pro, botão" e NENHUM
    // estado — apertar não produzia retorno, e a conclusão correta a tirar era
    // que não funcionava.
    id: "sidebar.modoPro", tela: "Início", rotulo: "Modo Pro",
    tipo: "interruptor", papel: "switch",
    efeito: "alterna Simples × Pro e anuncia o estado",
  },
  { id: "sidebar.recolher", tela: "Início", rotulo: "Recolher menu", tipo: "acao", efeito: "recolhe a barra para o trilho de ícones" },

  /* ------------------------------ navegação ------------------------------ */
  { id: "nav.inicio", tela: "Início", rotulo: "Início", tipo: "navegacao", destino: "/" },
  { id: "nav.ia", tela: "Início", rotulo: "All 4 Pay AI", tipo: "navegacao", destino: "/all4pay-ai" },
  { id: "nav.upload", tela: "Início", rotulo: "Upload de dados", tipo: "navegacao", destino: "/upload" },
  { id: "nav.rotas", tela: "Início", rotulo: "Inventário de rotas", tipo: "navegacao", destino: "/dashboard/administration/routes" },
  { id: "nav.armazenamento", tela: "Início", rotulo: "Armazenamento", tipo: "navegacao", destino: "/dashboard/administration/storage" },
  { id: "nav.planos", tela: "Planos", rotulo: "Ver assinatura", tipo: "navegacao", destino: "/dashboard/administration/subscription" },

  /* -------------------------------- criar -------------------------------- */
  { id: "criar.cliente", tela: "Início", rotulo: "Novo cliente", tipo: "navegacao", destino: "/dashboard/registrations/clients" },
  { id: "criar.produto", tela: "Início", rotulo: "Novo produto", tipo: "navegacao", destino: "/dashboard/registrations/products" },
  { id: "criar.venda", tela: "Início", rotulo: "Nova venda", tipo: "navegacao", destino: "/dashboard/sales-invoices/new" },
  { id: "criar.compra", tela: "Início", rotulo: "Nova compra", tipo: "navegacao", destino: "/dashboard/purchases/new" },
  { id: "criar.nf", tela: "Início", rotulo: "Nova nota fiscal", tipo: "navegacao", destino: "/vendas" },
  { id: "criar.link", tela: "Início", rotulo: "Novo link de pagamento", tipo: "navegacao", destino: "/dashboard/sales-invoices/payment-links" },
  { id: "criar.assinatura", tela: "Início", rotulo: "Nova assinatura / recorrência", tipo: "navegacao", destino: "/dashboard/sales-invoices/subscriptions" },
  { id: "criar.usuario", tela: "Início", rotulo: "Novo usuário", tipo: "navegacao", destino: "/dashboard/administration/users" },
  {
    // ⚠️ Criar TENANT saiu do painel Criar: é uma organização inteira, com
    // isolamento, membros e cobrança próprios. Vive em Administração.
    id: "admin.novaEmpresa", tela: "Início", rotulo: "Nova empresa",
    tipo: "navegacao", destino: "/empresas/nova",
  },

  /* ------------------------------ destrutivas ---------------------------- */
  {
    id: "upload.limpar", tela: "Upload de dados", rotulo: "Limpar dados importados",
    tipo: "destrutiva", confirma: true, desfaz: true,
    efeito: "apaga o dataset importado e oferece desfazer por 8 segundos",
    fechaPorEsc: true,
  },
  {
    id: "upload.removerDuplicatas", tela: "Upload de dados", rotulo: "Remover cópias",
    tipo: "destrutiva", confirma: true, desfaz: false,
    efeito: "remove as duplicatas já gravadas, mostrando o impacto em caixa ANTES",
  },
  {
    // ⚠️ Restaurar SOBRESCREVE o estado atual da organização. O desfazer aqui
    // não é cortesia: quem restaura um backup costuma estar consertando um
    // problema, e escolher o arquivo errado no meio disso troca um estrago por
    // outro. A tela exporta o estado vigente ANTES de importar — é esse
    // instantâneo que o desfazer devolve.
    id: "armazenamento.restaurar", tela: "Armazenamento", rotulo: "Restaurar backup",
    tipo: "destrutiva", confirma: true, desfaz: true,
    efeito: "sobrescreve o estado da organização e oferece desfazer por 8 segundos",
    fechaPorEsc: true,
  },

  /* ----------------------------- armazenamento --------------------------- */
  {
    id: "armazenamento.backup", tela: "Armazenamento", rotulo: "Baixar backup",
    tipo: "acao", efeito: "baixa um arquivo com o estado de negócio da organização",
  },
  {
    id: "armazenamento.expurgar", tela: "Armazenamento", rotulo: "Expurgar cache vencido",
    tipo: "acao", efeito: "apaga as entradas de cache fora da validade e libera espaço local",
  },
  {
    id: "armazenamento.enxugar", tela: "Armazenamento", rotulo: "Liberar espaço local",
    tipo: "acao",
    efeito: "remove do navegador as cópias já confirmadas pelo servidor, mantendo-as em memória",
  },

  /* -------------------------------- modais ------------------------------- */
  { id: "modal.baixa", tela: "Títulos a receber", rotulo: "Confirmar recebimento", tipo: "acao", efeito: "liquida o título e credita a conta", fechaPorEsc: true },
  { id: "modal.criar", tela: "Início", rotulo: "Criar novo", tipo: "acao", efeito: "painel de criação", fechaPorEsc: true },
];

/* ========================================================================== */

export const porTipo = (t: TipoControle): Controle[] => CONTROLES.filter((c) => c.tipo === t);

/**
 * Controles mal declarados — o que a guarda usa.
 *
 * ⚠️ A regra da destrutiva é a que mais importa: **confirmação sem desfazer não
 * basta**, porque quem clica em "Sim" por reflexo não leu. O desfazer é o que
 * protege quem estava distraído, que é exatamente quem erra. Aceitamos
 * `desfaz: false` só quando a ação mostra o impacto ANTES (é o caso da limpeza
 * de duplicatas, que lista o que vai sair e quanto isso muda no caixa).
 */
export function malDeclarados(): { controle: Controle; problema: string }[] {
  const out: { controle: Controle; problema: string }[] = [];
  for (const c of CONTROLES) {
    if (c.tipo === "navegacao" && !c.destino) out.push({ controle: c, problema: "navegação sem destino" });
    if (c.tipo === "acao" && !c.efeito) out.push({ controle: c, problema: "ação sem efeito declarado" });
    if (c.tipo === "interruptor" && !c.papel) out.push({ controle: c, problema: "interruptor sem papel ARIA" });
    if (c.tipo === "destrutiva") {
      if (!c.confirma) out.push({ controle: c, problema: "destrutiva sem confirmação" });
      if (!c.desfaz && !c.efeito?.includes("ANTES")) {
        out.push({ controle: c, problema: "destrutiva sem desfazer e sem mostrar o impacto antes" });
      }
    }
  }
  return out;
}
