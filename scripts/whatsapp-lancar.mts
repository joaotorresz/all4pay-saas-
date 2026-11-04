/**
 * whatsapp-lancar — lançar pelo WhatsApp, com o "Confirmar" no app (etapa 5
 * da Quattro AI no WhatsApp, Fase 4.4 do plano, 04/11/2026).
 *
 *   npm run whatsapp-lancar        (dentro de npm test)
 *
 * "Paguei 100 de gasolina" no WhatsApp volta com o que a Quattro AI entendeu e
 * um link. O link abre o app na empresa da conversa, com o cartão de
 * confirmação do chat; só o "Confirmar" grava. A guarda reprova se alguém
 * desfizer:
 *
 *   VALOR
 *   1. a frase vira a mesma proposta do chat, e a resposta diz o valor, a
 *      categoria, que NADA foi lançado e o link;
 *   2. o link leva a frase e a empresa, e o app as lê de volta;
 *   3. link torto é ignorado (empresa que não é id, frase longa, sem frase);
 *   4. abrir o link limpa o endereço (recarregar não reabre a proposta);
 *   5. pergunta continua pergunta ("quanto gastei de gasolina?").
 *
 *   FORMA
 *   6. o WhatsApp NÃO grava: a proposta sai depois da reserva (número, papel,
 *      teto e trilha) e antes do contexto, e o arquivo não tem escritor;
 *   7. o app só abre a proposta na empresa da conversa (troca antes; sem
 *      vínculo, nada abre);
 *   8. o webhook passa o endereço público do app.
 */
import { readFileSync } from "node:fs";
import { interpretarLancamento } from "@/core/assistant/lancamento-falado";
import { linkDoLancamento, lerLinkDeLancamento, respostaDoLancamento, semLinkDeLancamento } from "@/core/whatsapp/lancar";

let falhas = 0;
const ok = (nome: string, cond: boolean, det = "") => {
  if (cond) console.log(`  ✓ ${nome}`);
  else { falhas++; console.log(`  ✗ ${nome}${det ? ` — ${det}` : ""}`); }
};

const ORG = "0f8b2c1e-3a4d-4e5f-8a9b-1c2d3e4f5a6b";
const FRASE = "Paguei 100 reais de gasolina";
console.log("\nvalor");
const p = interpretarLancamento(FRASE, "2026-11-04");
ok("1. a frase vira proposta (saída paga de R$ 100)", !!p && p.tipo === "saida" && p.pago && p.valor === 100, JSON.stringify(p));
const link = linkDoLancamento("https://app.quattro.finance", FRASE, ORG);
const resp = p ? respostaDoLancamento(p, link) : "";
ok("1. a resposta diz o valor e a categoria", /R\$ 100,00/.test(resp) && resp.includes(p?.categoria ?? "§"), resp);
ok("1. a resposta diz que nada foi lançado", /Nada foi lançado ainda/.test(resp));
ok("1. a resposta traz o link", resp.includes(link) && link.startsWith("https://app.quattro.finance/?"), link);
const lido = lerLinkDeLancamento(new URL(link).search);
ok("2. o app lê a frase e a empresa de volta", lido?.frase === FRASE && lido?.empresa === ORG, JSON.stringify(lido));
ok("3. empresa que não é id é ignorada", lerLinkDeLancamento("?lancar=paguei%20100&empresa=outra") === null);
ok("3. frase longa é ignorada", lerLinkDeLancamento(`?lancar=${"a".repeat(281)}&empresa=${ORG}`) === null);
ok("3. sem frase é ignorado", lerLinkDeLancamento(`?empresa=${ORG}`) === null);
ok("4. abrir limpa o endereço e mantém o resto",
   semLinkDeLancamento(`https://app.quattro.finance/fluxo?x=1&lancar=a&empresa=${ORG}#t`) === "/fluxo?x=1#t");
ok("5. pergunta continua pergunta", interpretarLancamento("quanto gastei de gasolina?", "2026-11-04") === null);

console.log("\nforma");
const semComentario = (t: string) =>
  t.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/^\s*\/\*[\s\S]*?\*\//gm, "").replace(/^\s*\/\/.*$/gm, "");
const ia = semComentario(readFileSync("src/lib/whatsapp-ia.ts", "utf8"));
const pos = (s: string) => ia.indexOf(s);
ok("6. a proposta sai depois da reserva e antes do contexto",
   pos('"whatsapp_ia_reservar"') > 0 && pos('"whatsapp_ia_reservar"') < pos("interpretarLancamento(pergunta")
   && pos("interpretarLancamento(pergunta") < pos('"automacao_contexto"'));
ok("6. o WhatsApp não grava lançamento",
   !/\.from\(\s*["']movements["']/.test(ia) && !/confirmarDocumento|\.insert\(|\.update\(/.test(ia) && !/rpc\(\s*["'][a-z_]*lanc/.test(ia));
const glob = semComentario(readFileSync("src/components/ia/ChatGlobal.tsx", "utf8"));
const iAtiva = glob.indexOf("if (!alvo.ativa)");
const iAbre = glob.indexOf("abrirChat({ pergunta: link.frase });", iAtiva);
ok("7. o app só abre na empresa da conversa",
   /lerLinkDeLancamento\(window\.location\.search\)/.test(glob) && /if \(!alvo\) \{ limpar\(\); return; \}/.test(glob)
   && iAtiva > 0 && iAbre > iAtiva && /trocarOrganizacao\(alvo\.orgId\)/.test(glob));
ok("7. abrir limpa o endereço", /replaceState\(null, "", semLinkDeLancamento/.test(glob));
const entrada = semComentario(readFileSync("src/lib/whatsapp-entrada.ts", "utf8"));
ok("8. o webhook passa o endereço público do app", /responderIaWhatsapp\(admin, telefone, corpo, new URL\(urlPublica\(req\)\)\.origin\)/.test(entrada));

if (falhas > 0) {
  console.log(`\n✗ whatsapp-lancar: ${falhas} falha(s)\n`);
  process.exit(1);
}
console.log("\n✓ whatsapp-lancar: o WhatsApp propõe com link, e só o Confirmar do app grava\n");
