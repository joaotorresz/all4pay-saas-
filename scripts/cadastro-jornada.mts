/**
 * GUARDA DA JORNADA DO CADASTRO (`core/cadastro/jornada`, rota e tela).
 *
 * A fechadura do banco é provada por `scripts/cadastro-jornada.sql` (CI); esta
 * prova a DECISÃO: o que a rota aceita, o que vira "parou", quando já dá para
 * recuperar — e que nenhum dado sensível do cadastro sai no evento.
 */
import { readFileSync } from "node:fs";
import {
  normalizarEvento, estadoDaJornada, podeRecuperar, PARADA_MIN, RECUPERAR_APOS_H,
} from "../src/core/cadastro/jornada.ts";

let falhas = 0;
const ok = (nome: string, cond: boolean) => {
  if (!cond) falhas++;
  console.log(`${cond ? "✓" : "✗"} ${nome}`);
};

const ID = "11111111-2222-4333-8444-555555555555";

// ── o evento ────────────────────────────────────────────────────────────────
const ev = normalizarEvento({
  id: ID.toUpperCase(), etapa: "repTelefone", tipo: "pj", nome: " Ana Souza ",
  whatsapp: "(11) 98765-4321", email: "Ana@Empresa.com.br",
  cpf: "123.456.789-09", senhaAcesso: "segredo123", biometria: "data:image/png;base64,AAAA",
});
ok("evento válido passa, com o id em minúsculas", ev?.id === ID);
ok("WhatsApp vira só dígitos", ev?.whatsapp === "11987654321");
ok("e-mail vai em minúsculas", ev?.email === "ana@empresa.com.br");
ok("o nome é aparado", ev?.nome === "Ana Souza");
ok("CPF, senha e foto NÃO saem no evento (lista de permitidos)",
  !!ev && Object.keys(ev).every((k) => ["id", "etapa", "tipo", "nome", "whatsapp", "email"].includes(k)));
ok("id que não é uuid é recusado", normalizarEvento({ id: "abc", etapa: "tipo" }) === null);
ok("passo com pontuação é recusado", normalizarEvento({ id: ID, etapa: "tipo;drop" }) === null);
ok("passo vazio é recusado", normalizarEvento({ id: ID, etapa: "" }) === null);
ok("corpo que não é objeto é recusado", normalizarEvento("tipo") === null && normalizarEvento(null) === null);
const ruim = normalizarEvento({ id: ID, etapa: "senha", whatsapp: "123", email: "sem-arroba", tipo: "x" });
ok("contato inválido é DESCARTADO sem perder o passo",
  ruim?.etapa === "senha" && ruim.whatsapp === undefined && ruim.email === undefined && ruim.tipo === undefined);

// ── o estado ────────────────────────────────────────────────────────────────
const agora = new Date("2026-10-27T15:00:00Z");
const ha = (min: number) => new Date(agora.getTime() - min * 60_000).toISOString();
ok("concluída vence o relógio", estadoDaJornada({ etapa: "pronto", atualizadaEm: ha(10_000), concluidaEm: ha(10_000) }, agora) === "concluida");
ok(`até ${PARADA_MIN} min sem passo é "em andamento"`, estadoDaJornada({ etapa: "senha", atualizadaEm: ha(PARADA_MIN), concluidaEm: null }, agora) === "em_andamento");
ok(`passados ${PARADA_MIN} min é "parou"`, estadoDaJornada({ etapa: "senha", atualizadaEm: ha(PARADA_MIN + 1), concluidaEm: null }, agora) === "parou");
ok("data ilegível é parou, não em andamento para sempre", estadoDaJornada({ etapa: "senha", atualizadaEm: "x", concluidaEm: null }, agora) === "parou");

const parada = { etapa: "senha", atualizadaEm: ha(RECUPERAR_APOS_H * 60 + 1), concluidaEm: null };
ok(`recupera depois de ${RECUPERAR_APOS_H} h, com contato`, podeRecuperar({ ...parada, whatsapp: "11987654321" }, agora));
ok("sem contato não há quem recuperar", !podeRecuperar(parada, agora));
ok("parada há pouco ainda não entra na recuperação", !podeRecuperar({ ...parada, atualizadaEm: ha(60), email: "a@b.co" }, agora));
ok("concluída nunca entra na recuperação", !podeRecuperar({ ...parada, concluidaEm: ha(1), email: "a@b.co" }, agora));

// ── a rota e a tela ─────────────────────────────────────────────────────────
const rota = readFileSync("src/app/api/cadastro/jornada/route.ts", "utf8");
ok("a rota responde sem corpo (não é oráculo do que está gravado)", /status: 204/.test(rota) && !/NextResponse\.json/.test(rota));
ok("a rota guarda o HASH do IP, nunca o IP", /createHash\("sha256"\)/.test(rota) && /p_ip_hash: hashDaOrigem/.test(rota));
ok("a rota passa o corpo por normalizarEvento", /normalizarEvento\(corpo\)/.test(rota));
const tela = readFileSync("src/components/entrada/CriarContaView.tsx", "utf8");
ok("a tela registra cada passo", /registrarPasso\(\{/.test(tela));
ok("na pergunta, o passo é o campo perguntado", /etapa === "pergunta" \? atual\?\.id/.test(tela));
ok("a conclusão sai DEPOIS de a conta existir", /contaCriada\.current = true;\s*\}\s*\/\/[^\n]*\n\s*void concluirJornada\(\);/.test(tela));
const evTela = tela.slice(tela.indexOf("registrarPasso({"), tela.indexOf("registrarPasso({") + 400);
ok("a tela não manda CPF, CNPJ, senha nem documento", !/cpf|cnpj|senha|biometria|docEmpresa|docIdentidade/i.test(evTela));
const lib = readFileSync("src/lib/cadastro-jornada.ts", "utf8");
ok("em demonstração nada sai", (lib.match(/if \(isDemo\) return;/g) ?? []).length === 2);
ok("o envio não espera nem derruba a tela (keepalive, falha engolida)", /keepalive: true/.test(lib) && /\.catch\(\(\) => undefined\)/.test(lib));
const trilha = readFileSync("scripts/trilha-completa.sql", "utf8");
ok("a tabela está declarada fora da trilha, com motivo", /'cadastro_jornadas'/.test(trilha));


console.log(falhas ? `\n✗ ${falhas} falha(s) na jornada do cadastro` : "\n✓ jornada do cadastro: evento, estado, rota e tela conferidos");
process.exit(falhas ? 1 : 0);
