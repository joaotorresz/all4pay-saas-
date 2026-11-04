/**
 * revisar-sugestao — a fila "Revisar" com a sugestão da Quattro AI em cada
 * linha (Fase 4.3 do plano, 04/11/2026).
 *
 *   npm run revisar-sugestao        (dentro de npm test)
 *
 * A fila existia e só perguntava: cada linha devolvia a dúvida sem nenhuma
 * proposta, e quem abria tinha de descobrir a categoria sozinho. A guarda
 * reprova se alguém desfizer:
 *
 *   VALOR
 *   1. toda linha da fila sai com sugestão e motivo;
 *   2. o histórico da empresa vence a palavra-chave: a categoria que a mesma
 *      contraparte recebe nos outros lançamentos (com maioria; empate não é
 *      hábito, um lançamento só também não);
 *   3. a chave que contradiz a descrição ("Salário" com chave de software)
 *      recebe a categoria da descrição, não a da chave;
 *   4. sem base, a sugestão diz o que conferir e NÃO chuta categoria
 *      ("Outras despesas" não é sugestão);
 *   5. entrada com nome de salário não ganha categoria (reembolso, estorno e
 *      aporte mandam fazer coisas diferentes);
 *   6. ilegível, vencido e em aberto: sugere cancelar; valor zero também;
 *   7. a sugestão não preenche a classificação (o texto de categoria continua
 *      vazio até o clique).
 *
 *   FORMA
 *   8. a tela mostra a sugestão em cada linha, e "Aplicar" grava pelo mesmo
 *      escritor do "Confirmar" (um clique por linha, nada em lote);
 *   9. o acessor passa a data de hoje (o que venceu depende dela).
 *
 * ⚠️ As categorias esperadas são literais (regra 11).
 */
import { readFileSync } from "node:fs";
import { montarFilaRevisao, type ItemRevisao } from "@/core/revisao";

let falhas = 0;
const ok = (nome: string, cond: boolean, det = "") => {
  if (cond) console.log(`  ✓ ${nome}`);
  else { falhas++; console.log(`  ✗ ${nome}${det ? ` — ${det}` : ""}`); }
};

const it = (o: Partial<ItemRevisao>): ItemRevisao =>
  ({ id: "x", origem: "lancamento", descricao: null, valor: 100, data: "2026-10-10",
     tipo: "saida", categoriaTexto: "Aluguel", categoriaChave: null, contraparte: null, ...o });

const FILA = montarFilaRevisao([
  it({ id: "salario", descricao: "Salário outubro", valor: 35_000, categoriaTexto: null, categoriaChave: "Assinaturas / software" }),
  it({ id: "concorda", descricao: "123", valor: 9_000, categoriaTexto: null, categoriaChave: "Aluguel" }),
  it({ id: "reembolso", descricao: "Salário devolvido", valor: 8_500, tipo: "entrada", categoriaTexto: "Salário" }),
  it({ id: "lixo", descricao: "! [=]E?s rica NE Bro,", valor: 32, data: "2023-05-05", status: "pendente" }),
  it({ id: "lixo-pago", descricao: "! [=]E?s rica NE Bro,", valor: 31, data: "2023-05-05", status: "pago" }),
  it({ id: "zero", descricao: "Estorno", valor: 0, tipo: "entrada" }),
  // Imobiliária Sol: duas vezes Aluguel nos outros lançamentos ⇒ hábito.
  it({ id: "h1", descricao: "boleto", contraparte: "Imobiliária Sol", categoriaTexto: "Aluguel" }),
  it({ id: "h2", descricao: "boleto", contraparte: "Imobiliária Sol", categoriaTexto: "Aluguel" }),
  it({ id: "hist", descricao: "pix marketing", valor: 2_000, contraparte: "IMOBILIARIA SOL", categoriaTexto: null }),
  // Empate: uma vez Marketing, uma vez Utilidades ⇒ não é hábito.
  it({ id: "e1", descricao: "a", contraparte: "Fulano", categoriaTexto: "Marketing" }),
  it({ id: "e2", descricao: "b", contraparte: "Fulano", categoriaTexto: "Utilidades" }),
  it({ id: "empate", descricao: "transferência avulsa", valor: 700, contraparte: "Fulano", categoriaTexto: null }),
  // Um lançamento só não é hábito: vale a descrição.
  it({ id: "u1", descricao: "x", contraparte: "Beltrano", categoriaTexto: "Marketing" }),
  it({ id: "um-so", descricao: "conta de luz", valor: 400, contraparte: "Beltrano", categoriaTexto: null }),
  it({ id: "nada", descricao: "pagamento diverso", valor: 150, categoriaTexto: null }),
  it({ id: "regra", origem: "recorrencia", descricao: "Salário", valor: 35_000,
       categoriaTexto: null, categoriaChave: "Assinaturas / software", contraparte: "GOOGLE ADS CAMPANHA" }),
], "2026-11-04");
const s = (id: string) => FILA.achados.find((a) => a.id === id)?.sugestao;
const desc = (id: string) => JSON.stringify(s(id));

console.log("\nvalor");
ok("1. toda linha da fila sai com sugestão e motivo",
   FILA.achados.length >= 10 && FILA.achados.every((a) => a.sugestao && a.sugestao.motivo.length > 15),
   String(FILA.achados.length));
ok("2. o histórico da contraparte vence a palavra-chave",
   s("hist")?.acao === "classificar" && s("hist")?.categoria === "Aluguel" && s("hist")?.fonte === "historico", desc("hist"));
ok("2. empate não é hábito: sem base, não chuta", s("empate")?.categoria === undefined && s("empate")?.acao === "conferir", desc("empate"));
ok("2. um lançamento só não é hábito: vale a descrição",
   s("um-so")?.categoria === "Utilidades" && s("um-so")?.fonte === "taxonomia", desc("um-so"));
ok("3. 'Salário' com chave de software recebe Folha de pagamento",
   s("salario")?.acao === "classificar" && s("salario")?.categoria === "Folha de pagamento", desc("salario"));
ok("3. sem contradição, a sugestão é confirmar a chave", s("concorda")?.acao === "confirmar" && s("concorda")?.categoria === "Aluguel", desc("concorda"));
ok("4. sem base, diz o que conferir e não chuta", s("nada")?.acao === "conferir" && s("nada")?.categoria === undefined, desc("nada"));
ok("5. entrada com nome de salário não ganha categoria", s("reembolso")?.acao === "conferir" && s("reembolso")?.categoria === undefined, desc("reembolso"));
ok("6. ilegível, vencido e em aberto: cancelar", s("lixo")?.acao === "cancelar", desc("lixo"));
ok("6. ilegível e pago: conferir, não cancelar", s("lixo-pago")?.acao === "conferir", desc("lixo-pago"));
ok("6. valor zero: cancelar", s("zero")?.acao === "cancelar", desc("zero"));
ok("6. a regra recorrente aponta a categoria da descrição", s("regra")?.categoria === "Folha de pagamento", desc("regra"));
ok("7. a sugestão não preenche a classificação",
   FILA.achados.filter((a) => a.motivo === "sem_categoria" || a.motivo === "categoria_nao_propagada").every((a) => !a.categoriaTexto));

console.log("\nforma");
const semComentario = (t: string) =>
  t.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/^\s*\/\*[\s\S]*?\*\//gm, "").replace(/^\s*\/\/.*$/gm, "");
const tela = semComentario(readFileSync("src/components/revisao/FilaRevisaoView.tsx", "utf8"));
ok("8. a tela mostra a sugestão em cada linha", /data-sugestao-revisao=\{a\.sugestao\.acao\}/.test(tela) && /a\.sugestao\.motivo/.test(tela));
ok("8. 'Aplicar' grava pelo escritor do Confirmar", /confirmarClassificacao\(a\.id, a\.sugestao\.categoria!\)/.test(tela));
ok("8. nada em lote", !/achados\.(forEach|map)\([^)]*confirmarClassificacao/.test(tela) && !/Aplicar todas|Aplicar tudo/.test(tela));
const lib = semComentario(readFileSync("src/lib/revisao.ts", "utf8"));
ok("9. o acessor passa a data de hoje", /montarFilaRevisao\(itens, hojeLocal\(\)\)/.test(lib));

if (falhas > 0) {
  console.log(`\n✗ revisar-sugestao: ${falhas} falha(s)\n`);
  process.exit(1);
}
console.log("\n✓ revisar-sugestao: cada linha da fila sai com a sugestão da Quattro AI, e nada é gravado sem o clique\n");
