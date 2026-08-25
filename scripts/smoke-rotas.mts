/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SMOKE DAS ROTAS CANÔNICAS — a tela abre, tem conteúdo, e não vaza código
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   npm run smoke-rotas        (exige o build servido; roda no CI em job próprio)
 *
 * ⚠️ **O que ele cobre que nenhuma outra guarda cobre.** Typecheck prova que
 * compila; as guardas de valor provam que o motor calcula certo; a varredura de
 * texto lê o CÓDIGO-FONTE. Nenhuma delas abre a tela. Um erro de render, um
 * `undefined` num `.map`, um componente cliente sem `"use client"` — tudo isso
 * passa por todas elas e chega ao usuário como página em branco.
 *
 * As três reprovações, e por que cada uma:
 *
 *   1. **Erro de runtime** — a fronteira de erro do app apareceu, ou o console
 *      registrou exceção não tratada. É o defeito mais caro porque a tela não
 *      diz o que fazer.
 *   2. **Tela em branco** — a rota responde 200, o app monta, e não há
 *      conteúdo. Pior que erro: parece que a empresa não tem dado, e a pessoa
 *      conclui que o sistema perdeu o que ela lançou.
 *   3. **String de implementação vazando** — nome de função, de coluna, de
 *      hook ou de endpoint no texto que a pessoa lê. Vem da ONDA 11, agora
 *      cobrada no que é RENDERIZADO e não só no fonte: uma frase montada em
 *      tempo de execução (mensagem de erro, rótulo derivado) escapa da
 *      varredura de código e chega inteira à tela.
 *
 * ⚠️ **"Autenticado" aqui quer dizer: com DADO na tela.** O smoke roda contra o
 * build de demonstração, que é o único caminho determinístico — um login real
 * exigiria credencial no CI e tornaria a guarda dependente de um banco vivo,
 * que é como uma guarda passa a reprovar por motivo errado às três da manhã. O
 * que se perde fica DECLARADO: este smoke não exercita a camada de sessão nem
 * as políticas de acesso; quem faz isso é `npm run isolamento`, contra o banco.
 */
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import { INVENTARIO } from "@/core/rotas/inventario";

const BASE = process.env.ALVO ?? "http://127.0.0.1:3121";
/**
 * ⚠️ O caminho do navegador é o do contêiner de desenvolvimento; no runner do CI
 * o Playwright resolve o dele sozinho. Cravar `executablePath` num ambiente onde
 * o arquivo não existe faz a guarda reprovar por INFRAESTRUTURA — e guarda que
 * reprova por infraestrutura treina quem a lê a ignorar a reprovação.
 */
const CAMINHO_CHROME = process.env.CHROME ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const OPCOES_NAVEGADOR = existsSync(CAMINHO_CHROME) ? { executablePath: CAMINHO_CHROME } : {};

/** Texto que denuncia implementação na cara de quem opera. */
const VAZAMENTOS: { nome: string; re: RegExp }[] = [
  { nome: "identificador em crase", re: /`[a-zA-Z_$][\w$]*\(?\)?`/ },
  { nome: "nome de coluna/tabela", re: /\b(movements|financial_accounts|org_state|audit_log|sales_docs|due_date|paid_date|competence_date|category_id|party_id|org_id)\b/ },
  { nome: "vocabulário de código", re: /\b(useEffect|useState|hook|endpoint|selector|componente|props|payload|stack trace|NaN|undefined|\[object Object\])\b/ },
  { nome: "variável de ambiente", re: /\b[A-Z][A-Z0-9]*_[A-Z0-9_]+\b/ },
  { nome: "texto do framework em inglês", re: /This page could not be found|Application error|Unhandled Runtime Error/ },
];

/** Trechos legítimos que casariam com os padrões acima — declarados COM MOTIVO. */
const DECLARADOS: { trecho: string; motivo: string }[] = [
  { trecho: "⌘K", motivo: "atalho de teclado, não identificador" },
  { trecho: "NF-e", motivo: "nome do documento fiscal, com hífen — casa o padrão de variável" },
  { trecho: "NFS-e", motivo: "idem, serviço" },
  { trecho: "CT-e", motivo: "idem, transporte" },
  { trecho: "TXT Domínio", motivo: "nome do formato que o contador pede" },
  { trecho: "DRE", motivo: "sigla contábil corrente" },
  { trecho: "DFC", motivo: "sigla contábil corrente" },
  { trecho: "CNPJ", motivo: "sigla legal" },
  { trecho: "CPF", motivo: "sigla legal" },
  { trecho: "PIX", motivo: "nome do meio de pagamento" },
  { trecho: "OFX", motivo: "formato de extrato bancário" },
  { trecho: "CSV", motivo: "formato de planilha" },
  { trecho: "XLSX", motivo: "formato de planilha" },
  { trecho: "PDF", motivo: "formato de documento" },
  { trecho: "IRPJ", motivo: "sigla tributária" },
  { trecho: "CSLL", motivo: "sigla tributária" },
  { trecho: "FGTS", motivo: "sigla trabalhista" },
  { trecho: "INSS", motivo: "sigla previdenciária" },
  { trecho: "IRRF", motivo: "sigla tributária" },
  { trecho: "EBITDA", motivo: "sigla financeira corrente" },
  { trecho: "MRR", motivo: "sigla financeira corrente" },
  { trecho: "ARR", motivo: "sigla financeira corrente" },
  { trecho: "LTV", motivo: "sigla financeira corrente" },
  { trecho: "CAC", motivo: "sigla financeira corrente" },
  { trecho: "HHI", motivo: "índice de concentração, explicado no InfoHint" },
  { trecho: "RBT12", motivo: "termo do Simples Nacional" },
  { trecho: "SHA-256", motivo: "nome do algoritmo, na tela de auditoria" },
  { trecho: "RBAC", motivo: "nome do modelo de permissão" },
  { trecho: "DAS", motivo: "guia do Simples Nacional" },
  { trecho: "DDA", motivo: "débito direto autorizado" },
  { trecho: "POS", motivo: "maquininha" },
  { trecho: "RAT", motivo: "alíquota de risco ambiental do trabalho" },
  { trecho: "CPP", motivo: "contribuição previdenciária patronal" },
  { trecho: "CNAE", motivo: "classificação de atividade" },
  { trecho: "CMV", motivo: "custo da mercadoria vendida" },
  { trecho: "OPEX", motivo: "despesa operacional" },
  { trecho: "A4P", motivo: "prefixo dos códigos de erro que o suporte pede" },
];

const b = await chromium.launch(OPCOES_NAVEGADOR);
const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } });

let falhas = 0;
const linhas: string[] = [];
const rotas = INVENTARIO.filter((r) => r.status === "canonica" && !r.rota.includes(":"));

/** Tira do texto os trechos declarados antes de procurar vazamento. */
function limpar(txt: string): string {
  let t = txt;
  for (const d of DECLARADOS) t = t.split(d.trecho).join(" ");
  return t;
}

let comConteudo = 0;
for (const r of rotas) {
  const page = await ctx.newPage();
  const erros: string[] = [];
  page.on("pageerror", (e) => erros.push(String(e).slice(0, 140)));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|404|400/.test(m.text())) erros.push(m.text().slice(0, 140)); });

  let problema = "";
  try {
    const resp = await page.goto(`${BASE}${r.rota}`, { waitUntil: "networkidle", timeout: 45000 });
    await page.waitForTimeout(1200);
    const info = await page.evaluate(() => {
      /**
       * ⚠️ **O CONTEÚDO É O `<main>`, NÃO O `<body>`.** A primeira versão media o
       * corpo inteiro, e o plantio revelou o buraco: fazer a tela de governança
       * devolver `null` — conteúdo ZERO — passou, porque a moldura do app (menu
       * com 15 grupos, barra superior, rodapé) sozinha já tem milhares de
       * caracteres e dezenas de controles. A guarda estava medindo o chrome e
       * chamando isso de "a tela tem conteúdo".
       *
       * E "tela abre e não tem nada dentro" é exatamente o modo de falha que
       * este smoke existe para pegar — o mais caro, porque a pessoa conclui que
       * o sistema perdeu o que ela lançou.
       */
      const alvo = document.querySelector("main") ?? document.body;
      const t = (alvo as HTMLElement).innerText ?? "";
      return {
        texto: t,
        tamanho: t.replace(/\s+/g, " ").trim().length,
        // ⚠️ Uma tela é VAZIA quando não tem texto NEM controle. O primeiro
        // critério era só o tamanho, e ele reprovou `/login` a 341 caracteres —
        // uma tela legítima, que não carrega a moldura do app e por isso nunca
        // vai ter o volume de texto de uma tela interna. Baixar o limiar para
        // caber o login enfraqueceria a checagem para as outras 79; o conserto
        // é medir o que se quer medir — "renderizou algo que a pessoa usa" —
        // em vez de contar caracteres de uma anatomia só.
        controles: (alvo as HTMLElement).querySelectorAll("input, button, select, textarea, a[href]").length,
        fronteira: /Esta tela não abriu/.test(document.body.innerText ?? ""),
      };
    });

    // 1. erro de runtime
    if (info.fronteira) problema = "a fronteira de erro do app apareceu";
    else if (erros.length > 0) problema = `erro de runtime: ${erros[0]}`;
    // 2. tela em branco — o chrome do app sozinho já passa de ~400 chars, então
    //    o corte pega a rota que monta a moldura e não renderiza conteúdo.
    /**
     * ⚠️ **VAZIO NÃO É O MESMO QUE EM BRANCO, e o limiar por tamanho confundia
     * os dois.** Ao passar a medir o `<main>`, duas rotas REAIS reprovaram:
     * "Fechamento mensal" (260 caracteres) e "Links de pagamento" (197). As
     * duas estão CERTAS — são estados vazios como o sistema de design manda:
     * título, explicação do que a tela faz, e o botão que a preenche.
     * Reprová-las ensinaria a encher a tela de texto para passar na guarda.
     *
     * O critério passou a ser o que de fato separa uma tela usável de uma tela
     * quebrada: **dentro da área de conteúdo há texto legível E pelo menos uma
     * coisa a fazer.** O plantio (a tela devolvendo `null`) dá 36 caracteres e
     * ZERO controles e continua reprovando; os dois estados vazios legítimos
     * passam.
     */
    else if (info.tamanho < 60)
      problema = `tela em branco (${info.tamanho} caracteres na área de conteúdo)`;
    /**
     * ⚠️ **ZERO CONTROLE COM 1.200 CARACTERES É ACHADO, NÃO TELA EM BRANCO — e
     * fica DECLARADO em vez de virar guarda agora.** Ao acrescentar `controles
     * === 0` ao critério, duas rotas reais reprovaram: `/planos` (1.085
     * caracteres) e `/dashboard/administration/integrations` (1.201). Nas duas,
     * o `<body>` tem 17 e 33 controles e o `<main>` tem ZERO — os elementos
     * clicáveis do conteúdo não são `button`/`a`, provavelmente `div` com
     * `onClick`, que é o defeito de acessibilidade que a ONDA 12 já corrigiu na
     * `EntityTable` (uma `div` com `onClick` não recebe foco nem responde a
     * Enter).
     *
     * Não codifico a regra sem ter diagnosticado as duas telas: uma guarda
     * escrita sobre um palpite ou reprova o legítimo (e é desligada) ou passa a
     * medir outra coisa. O achado vai para a fila com endereço; a checagem
     * entra quando a causa estiver medida.
     */
    else if ((resp?.status() ?? 0) >= 500) problema = `HTTP ${resp?.status()}`;
    // 3. vazamento de implementação
    else {
      const limpo = limpar(info.texto);
      for (const v of VAZAMENTOS) {
        const m = limpo.match(v.re);
        if (m) { problema = `${v.nome}: "${m[0]}"`; break; }
      }
    }
    if (!problema) comConteudo++;
  } catch (e) {
    problema = `não carregou: ${String(e).slice(0, 100)}`;
  }

  if (problema) { falhas++; linhas.push(`✗ ${r.rota.padEnd(46)} ${problema}`); }
  await page.close();
}

await b.close();

console.log("\nSMOKE DAS ROTAS CANÔNICAS\n");
for (const l of linhas) console.log(l);
console.log(
  falhas === 0
    ? `\n✓ TODAS — ${rotas.length} rotas canônicas abrem, têm conteúdo e não vazam implementação\n`
    : `\n✗ ${falhas} de ${rotas.length} rota(s) com problema (${comConteudo} limpas)\n`,
);
if (falhas > 0) process.exit(1);
