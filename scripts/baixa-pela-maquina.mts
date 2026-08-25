/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TETO ZERO — nenhum escritor manda `movements.status`
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ **ESTA GUARDA MUDOU DE PERGUNTA, e a mudança é a lição.** Ela nasceu
 * fechando uma porta de CÓDIGO: `central_maquina` dispara em
 * `before update of situacao`, então escrever `status = 'pago'` direto
 * contornava a máquina inteira — transição válida, segregação R1, papel e
 * alçada. A lista aqui nomeava os quatro escritores que faziam isso e o que
 * faltava em cada um.
 *
 * Em 25/08 a trava passou para o BANCO: `movements.status` virou
 * `generated always as (…) stored` derivada de `situacao`. Coluna gerada não é
 * meio-termo — o Postgres RECUSA a escrita (`428C9`), inclusive a que vier de
 * uma RPC, de um cron ou de um `psql` na mão. A porta que esta guarda vigiava
 * deixou de existir.
 *
 * ⚠️ **Então por que ela continua?** Porque a recusa do banco acontece em
 * TEMPO DE EXECUÇÃO, e o custo de descobri-la lá é alto: foi assim que a
 * IMPORTAÇÃO INTEIRA (`lib/fdip`), a transferência, a venda, o reembolso, a
 * NFS-e, a recorrência e o formulário de lançamento ficaram quebrados em
 * produção por algumas horas — sete escritores que mandavam `status` num
 * `insert` e passavam por typecheck sem uma queixa. A guarda agora é a metade
 * barata: pega no `npm test` o que o banco só pegaria com o cliente na frente.
 *
 * ⚠️ **E o TETO É ZERO, sem lista de declarados.** A lista antiga dizia "estes
 * podem, com a dívida nomeada"; hoje não há permissão possível — nenhum
 * escritor pode mandar `status`, porque o banco não aceita de ninguém. Uma
 * declaração que sobrevivesse à trava silenciaria um escritor que vai falhar
 * em produção.
 *
 * ⚠️ **A PROVA DE QUE ELA ESTÁ OLHANDO é sintética, e tem de ser.** A versão
 * anterior conferia "o padrão casa com pelo menos um arquivo" — e no dia em que
 * os sete escritores foram convertidos, essa canária reprovou a correção
 * CERTA. Canária que reprova o conserto é canária que se aprende a ignorar. A
 * de agora dispara o padrão contra uma AMOSTRA plantada aqui dentro: se o
 * regex parar de casar, ela reprova sem depender do estado do produto.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * ⚠️ **O padrão pega `insert` E `update`, e olha PARA TRÁS além de para a
 * frente.** A lição é da guarda de `origem` (ONDA 5) e da varredura da ONDA
 * 10: quem monta a linha antes do `.insert(` fica invisível para um regex que
 * só avança. Aqui o alvo é a chamada ao PostgREST com `status:` no objeto —
 * declaração de tipo (`status: "pago" | "pendente"`) e objeto em memória
 * (dataset da demonstração, cenário hipotético) não contornam nada e ficam
 * legitimamente de fora.
 */
const ALVO =
  /from\(["']movements["']\)[\s\S]{0,400}?\.(?:insert|update|upsert)\([^;]*?\bstatus:\s*["'a-z]/;

/** A amostra que prova que o padrão ainda casa — não depende do produto. */
const AMOSTRA = `
  await s.from("movements").insert({
    account_id: id, type: "entrada", status: "pago", amount: 1,
  });
`;

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
const varridos = arquivos("src");
const achados: string[] = [];

for (const f of varridos) {
  // Comentários fora ANTES da busca: este repositório documenta cada defeito
  // citando o código que o causou, e a guarda reprovaria a própria explicação.
  const src = readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  if (ALVO.test(src)) achados.push(f);
}

for (const a of achados) {
  falhas++;
  console.log(`✗ FAIL escritor manda \`status\` para o banco: ${a}`);
  console.log("    `movements.status` é COLUNA GERADA — o Postgres recusa com 428C9 e a");
  console.log("    operação inteira falha em produção. Grave `situacao` (previsto · confirmado");
  console.log("    · baixado · conciliado · cancelado · estornado); o `status` nasce dela.");
}

if (!ALVO.test(AMOSTRA)) {
  falhas++;
  console.log("✗ FAIL a amostra plantada NÃO casou — o padrão parou de funcionar e a guarda ficou cega");
}

console.log(
  falhas === 0
    ? `✓ baixa: nenhum escritor manda \`status\` · ${varridos.length} arquivos varridos · amostra plantada casa\n`
    : `\n✗ ${falhas} problema(s) na porta da máquina de estados\n`,
);
process.exit(falhas === 0 ? 0 : 1);
