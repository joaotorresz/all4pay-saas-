/**
 * completar-cadastro — "Vamos completar seu cadastro" pela conversa (Fase 4.2
 * do plano, 04/11/2026).
 *
 *   npm run completar-cadastro        (dentro de npm test)
 *
 * O defeito de origem: a abertura de conta ficou curta em 27/10/2026 e o que
 * ela deixou de pedir foi para `PARA_COMPLETAR_DEPOIS`, uma lista que ninguém
 * lia. ICMS, inscrição municipal, frequência da receita, meios de recebimento
 * e a estrutura nunca chegavam ao perfil. A guarda reprova se alguém desfizer:
 *
 *   VALOR
 *   1. todo item da lista tem passo no roteiro, e todo passo nasce de um item
 *      (item sem passo some do produto de novo);
 *   2. responder tudo deixa nada pendente, e cada resposta chega ao campo que
 *      Configurações lê;
 *   3. pergunta sem resposta não vira "não" nem lista vazia, e "Pular esta"
 *      não grava o campo;
 *   4. resposta que não responde é recusada ("talvez", "abc" em valor, lista
 *      vazia, opção que não existe), e R$ 0 de saldo é um valor;
 *   5. alçada e equipe não são gravadas pela conversa (têm escritor próprio);
 *   6. o pedido escrito abre a conversa ("completar meu cadastro"), e outro
 *      "completar" não abre.
 *
 *   FORMA
 *   7. o chat em tela cheia tem o modo e desvia o pedido escrito para ele;
 *   8. a conversa grava pelo escritor do perfil e pela regra única;
 *   9. Primeiros passos mostra a porta, e ela abre o modo.
 */
import { readFileSync } from "node:fs";
import {
  PASSOS_COMPLETAR, ITENS_DA_LISTA, perguntasPendentes, proximaPergunta, responder, pular,
  pedeCompletarCadastro, RespostaInvalida, NAO_TENHO, type PerfilParaCompletar, type PassoPergunta,
} from "@/core/cadastro/completar";

let falhas = 0;
const ok = (nome: string, cond: boolean, det = "") => {
  if (cond) console.log(`  ✓ ${nome}`);
  else { falhas++; console.log(`  ✗ ${nome}${det ? ` — ${det}` : ""}`); }
};
const recusa = (f: () => unknown) => {
  try { f(); return false; } catch (e) { return e instanceof RespostaInvalida; }
};

console.log("\nvalor");
for (const pub of ["pj", "pf"] as const) {
  const semPasso = ITENS_DA_LISTA[pub].filter((item) => !PASSOS_COMPLETAR.some((s) => s.publico === pub && s.item === item));
  ok(`1. todo item ${pub.toUpperCase()} da lista tem passo`, semPasso.length === 0, semPasso.join("; "));
}
const semItem = PASSOS_COMPLETAR.filter((s) => !ITENS_DA_LISTA[s.publico].includes(s.item));
ok("1. todo passo nasce de um item da lista", semItem.length === 0, semItem.map((s) => s.id).join(", "));

// Uma resposta válida para cada tipo de passo.
const valida = (s: PassoPergunta) =>
  s.tipo === "sim-nao" ? true
  : s.tipo === "escolha" ? s.opcoes![0]
  : s.tipo === "multi" ? [s.opcoes![0]]
  : s.tipo === "moeda" ? "2.500,50"
  : "123.456";
const responderTudo = (inicio: PerfilParaCompletar) => {
  let p = inicio;
  for (let i = 0; i < 40; i++) {
    const s = proximaPergunta(p);
    if (!s) break;
    p = responder(p, s.id, valida(s));
  }
  return p;
};

const pj0: PerfilParaCompletar = { db: { tipoConta: "empresa" }, estrutura: { contas: [{ banco: "Inter", tipo: "Conta corrente" }] } };
const ids0 = perguntasPendentes(pj0).map((s) => s.id);
ok("2. a empresa recém-aberta tem as perguntas do roteiro pendentes",
   ["icms", "im", "exporta", "funcao", "frequencia", "meios", "despesas", "contas", "centros", "unidades", "dre", "fluxo"].every((id) => ids0.includes(id)),
   ids0.join(","));
ok("2. a inscrição estadual só é perguntada a quem é contribuinte", !ids0.includes("ie"));
const pj = responderTudo(pj0);
ok("2. responder tudo deixa nada pendente (PJ)", perguntasPendentes(pj).length === 0, perguntasPendentes(pj).map((s) => s.id).join(","));
ok("2. o ICMS chega ao perfil", pj.db?.contribuinteIcms === true);
ok("2. sendo contribuinte, a inscrição estadual é perguntada e gravada", pj.db?.ie === "123.456");
ok("2. a frequência e os meios chegam ao perfil", !!pj.perfil?.frequencia && (pj.perfil?.meiosRecebimento ?? []).length === 1);
ok("2. a conta que já existia continua, e o tipo novo entra",
   (pj.estrutura?.contas ?? [])[0]?.banco === "Inter" && (pj.estrutura?.contas ?? []).length >= 1);
const pf = responderTudo({ db: { tipoConta: "pessoal" } });
ok("2. responder tudo deixa nada pendente (PF)", perguntasPendentes(pf).length === 0);
ok("2. o saldo e o orçamento chegam ao perfil em reais", pf.pessoal?.saldoInicial === 2500.5 && pf.pessoal?.orcamentoMensal === 2500.5,
   `${pf.pessoal?.saldoInicial} / ${pf.pessoal?.orcamentoMensal}`);

const pulado = pular(pj0, "icms");
ok("3. sem resposta, ICMS não é 'não'", pj0.db?.contribuinteIcms === undefined && pulado.db?.contribuinteIcms === undefined);
ok("3. pulada, a pergunta sai da conversa", proximaPergunta(pulado)?.id !== "icms");
const meiosPulados = pular(pj0, "meios");
ok("3. pulada, a lista não vira vazia", meiosPulados.perfil?.meiosRecebimento === undefined);
const semIm = responder(pj0, "im", NAO_TENHO);
ok("3. 'Não tenho' responde, mas não vira inscrição municipal", semIm.db?.im === undefined && !perguntasPendentes(semIm).some((s) => s.id === "im"));

ok("4. 'talvez' não é sim nem não", recusa(() => responder(pj0, "icms", "talvez")));
ok("4. 'abc' não é valor (não vira R$ 0,00)", recusa(() => responder({ db: { tipoConta: "pessoal" } }, "saldo", "abc")));
ok("4. lista vazia é recusada", recusa(() => responder(pj0, "meios", [])));
ok("4. opção que não existe é recusada", recusa(() => responder(pj0, "frequencia", "De vez em quando")));
ok("4. texto vazio é recusado", recusa(() => responder(pj0, "im", "  ")));
ok("4. orçamento zero é recusado", recusa(() => responder({ db: { tipoConta: "pessoal" } }, "orcamento", "0")));
ok("4. saldo R$ 0 é um valor", responder({ db: { tipoConta: "pessoal" } }, "saldo", "0").pessoal?.saldoInicial === 0);

let telaRecusada = true;
for (const id of ["alcada", "equipe"]) {
  try { responder(pj0, id, "Sim"); telaRecusada = false; } catch { /* recusado, como deve */ }
}
ok("5. alçada e equipe não são gravadas pela conversa", telaRecusada && !perguntasPendentes(pj0).some((s) => s.id === "alcada" || s.id === "equipe"));

ok("6. 'Vamos completar meu cadastro' abre a conversa", pedeCompletarCadastro("Vamos completar meu cadastro"));
ok("6. 'quero terminar o cadastro' abre a conversa", pedeCompletarCadastro("quero terminar o cadastro"));
ok("6. 'completar a venda' não abre", !pedeCompletarCadastro("completar a venda de ontem"));
ok("6. 'cadastro de clientes' não abre", !pedeCompletarCadastro("quantos clientes tenho no cadastro"));

console.log("\nforma");
const semComentario = (t: string) =>
  t.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/^\s*\/\*[\s\S]*?\*\//gm, "").replace(/^\s*\/\/.*$/gm, "");
const tela = semComentario(readFileSync("src/components/ia/ChatTelaCheia.tsx", "utf8"));
ok("7. o chat em tela cheia tem o modo do cadastro", /modoCompletar \? \(\s*<ConversaCompletar /.test(tela));
ok("7. o pedido escrito vai para o modo", /pedeCompletarCadastro\(q\)\) \{[^}]*setModoCompletar\(true\)/.test(tela));
const conversa = semComentario(readFileSync("src/components/ia/ConversaCompletar.tsx", "utf8"));
ok("8. a conversa grava pelo escritor do perfil", /await persistCompany\(/.test(conversa));
ok("8. a conversa usa a regra única (responder e pular)", /responder\(perfil, atual\.id, r\)/.test(conversa) && /pular\(perfil, atual\.id\)/.test(conversa));
ok("8. a falha de gravação vai para a tela", /Não consegui salvar/.test(conversa));
const jornada = semComentario(readFileSync("src/components/comece/Jornada.tsx", "utf8"));
ok("9. Primeiros passos mostra a porta", /<CompletarCadastroCard \/>/.test(jornada));
const card = semComentario(readFileSync("src/components/comece/CompletarCadastroCard.tsx", "utf8"));
ok("9. a porta abre o modo do cadastro", /abrirChat\(\{ completar: true \}\)/.test(card));
const global = semComentario(readFileSync("src/components/ia/ChatGlobal.tsx", "utf8"));
ok("9. o anfitrião passa o modo adiante", /completar=\{aberto\.completar\}/.test(global));

if (falhas > 0) {
  console.log(`\n✗ completar-cadastro: ${falhas} falha(s)\n`);
  process.exit(1);
}
console.log("\n✓ completar-cadastro: a lista do que ficou para depois tem quem pergunte, e nada vira resposta sem resposta\n");
