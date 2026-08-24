/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TETO ZERO — nenhuma baixa acontece por fora da máquina de estados
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ **O defeito que esta guarda existe para impedir, provado contra produção
 * em transação desfeita.** O gatilho `central_maquina` dispara em
 * `before update of situacao` — ele vigia a COLUNA `situacao`. Escrever
 * `status = 'pago'` direto **não o aciona**: a máquina inteira (transição
 * válida, segregação R1, papel, alçada) é contornada, e o título fica baixado
 * sem nunca ter sido confirmado.
 *
 * Medido: `update movements set status='pago'` num título previsto passou sem
 * recusa e produziu 1 incoerência entre a coluna e o status derivável.
 *
 * ⚠️ **A guarda é de CÓDIGO, não de banco, e o motivo é declarado.** Fechar no
 * banco (um gatilho em `status`) mudaria QUEM PODE CHAMAR O QUÊ — passaria a
 * exigir alçada de quem hoje registra pagamento sem ela, inclusive dos crons.
 * Essa é a família que exige parar e chamar o dono. Enquanto a decisão não é
 * tomada, a regra vale no repositório: nenhum escritor NOVO abre a porta de
 * novo, e os que já existem estão nomeados aqui com o que falta em cada um.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Os escritores que HOJE dão baixa mexendo em `status`, cada um com o que
 * precisa acontecer. ⚠️ Uma lista sem o "o que falta" vira permissão
 * permanente: em seis meses ninguém sabe se aquilo era dívida ou desenho.
 */
const DECLARADOS: { arquivo: string; porque: string }[] = [
  {
    arquivo: "src/lib/pagamentos.ts",
    porque: "baixa em lote de contas a pagar — passa a mover `situacao` quando a Central "
          + "virar o caminho único; hoje exigir alçada aqui tiraria de quem registra pagamento "
          + "a capacidade de fazê-lo, e isso é decisão do dono",
  },
  {
    arquivo: "src/lib/recebimentos.ts",
    porque: "o espelho do de cima, mesma decisão pendente",
  },
  {
    arquivo: "src/lib/boletos.ts",
    porque: "baixa por boleto conciliado — o caminho mais automático, e o que menos pode "
          + "parar por falta de alçada sem antes existir uma tela que explique",
  },
  {
    arquivo: "src/lib/upload-doc.ts",
    porque: "confirmar um comprovante dá baixa no título pendente que ele quita — achado por "
          + "esta guarda, não pela leitura: era a porta que eu não conhecia. Mesma decisão "
          + "pendente das outras três, e a mais delicada, porque a pessoa acabou de fotografar "
          + "o comprovante e não entenderia uma recusa por alçada nesse ponto",
  },
  {
    arquivo: "src/lib/data.ts",
    porque: "`cancelarMovimento`/`reabrirMovimento` mexem em `status` para cancelar e "
          + "reabrir, não para BAIXAR — não é a porta que esta guarda fecha",
  },
  {
    arquivo: "src/lib/imported.ts",
    porque: "dataset local da DEMONSTRAÇÃO — não fala com o banco, então não contorna "
          + "gatilho nenhum",
  },
  {
    arquivo: "src/lib/cadastros.ts",
    porque: "cria venda já paga (o dinheiro entrou junto com o documento); é INSERT, não "
          + "transição — a máquina governa mudança de situação, não nascimento",
  },
  {
    arquivo: "src/lib/consolidado.ts",
    porque: "monta linhas sintéticas para o consolidado multiempresa; não grava",
  },
];

/**
 * ⚠️ **O PADRÃO PRECISOU SER ESTREITADO, e a primeira versão prova por quê.**
 * Ela casava qualquer `status: "pago"` e acusou SETE arquivos — dos quais cinco
 * eram legítimos e nem tocam no banco:
 *
 *   `core/compras`      — DECLARAÇÃO DE TIPO (`status: "pago" | "pendente"`)
 *   `core/decision`     — cenário hipotético em memória ("e se eu antecipar?")
 *   `core/orcamento`    — movimento SINTÉTICO, criado só para ser classificado
 *   `lib/demo/seed`     — o conjunto da demonstração
 *   `lib/movimentacoes` — dataset local, não fala com o PostgREST
 *
 * Uma guarda que reprova cinco coisas certas para pegar uma errada é desligada
 * na primeira semana — e aí a errada passa também. A porta que a máquina de
 * estados deixa aberta é ESCREVER NO BANCO: `.from("movements").update(...)`
 * com `status` de baixa. Objeto em memória não contorna gatilho nenhum.
 */
const ALVO = /from\(["']movements["']\)[\s\S]{0,400}?\.update\([\s\S]{0,200}?status:\s*["']pago["']/;

function arquivos(dir: string): string[] {
  const out: string[] = [];
  for (const nome of readdirSync(dir)) {
    const p = join(dir, nome);
    if (statSync(p).isDirectory()) out.push(...arquivos(p));
    else if (/\.(ts|tsx)$/.test(nome)) out.push(p);
  }
  return out;
}

let falhas = 0;
const declarados = new Set(DECLARADOS.map((d) => d.arquivo));
const achados: string[] = [];

for (const f of arquivos("src")) {
  const src = readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  if (!ALVO.test(src)) continue;
  if (declarados.has(f)) continue;
  achados.push(f);
}

for (const a of achados) {
  falhas++;
  console.log(`✗ FAIL escritor NÃO declarado dá baixa por \`status\`: ${a}`);
  console.log("    O gatilho da Central vigia `situacao`; escrever `status` contorna a máquina");
  console.log("    inteira. Mova por `moverTitulo` (lib/central) ou declare aqui COM o motivo.");
}

// ⚠️ Declaração órfã é declaração que sobreviveu ao arquivo — ela silenciaria
// um escritor futuro de mesmo nome sem ninguém perceber.
for (const d of DECLARADOS) {
  let existe = true;
  try { readFileSync(d.arquivo, "utf8"); } catch { existe = false; }
  if (!existe) { falhas++; console.log(`✗ FAIL declaração órfã: ${d.arquivo} não existe mais`); }
}

// ⚠️ E a guarda tem de estar OLHANDO alguma coisa: se o padrão parar de casar
// com qualquer arquivo, ela passa calada para sempre.
const totalComPadrao = arquivos("src").filter((f) => ALVO.test(readFileSync(f, "utf8"))).length;
if (totalComPadrao === 0) {
  falhas++;
  console.log("✗ FAIL a varredura não encontrou NENHUM escritor — o padrão parou de casar e a guarda ficou cega");
}

console.log(
  falhas === 0
    ? `✓ baixa: nenhum escritor novo por \`status\` · ${DECLARADOS.length} declarados com motivo · ${totalComPadrao} arquivos varridos\n`
    : `\n✗ ${falhas} problema(s) na porta da máquina de estados\n`,
);
if (falhas > 0) process.exit(1);
