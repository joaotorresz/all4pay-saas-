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
import { caminhoDoDocumento, caminhoAceitoPeloBanco } from "../src/core/cadastro/documentos.ts";
import { lembretesVencidos, textoDoLembrete, mascararContato, type JornadaParaLembrete } from "../src/core/cadastro/lembretes.ts";
import { rodarLembretesCadastro, type DepsLembretes, type EnvioLembrete } from "../src/lib/cadastro-lembretes.ts";
import { resumirFunil, faseAlcancada, nomeDoPasso, jornadaDaLinha, FASES_FUNIL, mediana, temposDoFunil, chegadaNaFase, duracaoLegivel, type JornadaAdmin } from "../src/core/cadastro/funil.ts";

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


// ── o cofre dos documentos ──────────────────────────────────────────────────
// ⚠️ O formato do caminho mora nas duas pontas (aqui e em
// `cadastro_documento_registrar`): se uma mudar sem a outra, o banco recusa
// todo documento do cadastro, calado.
const ORG = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const cam = caminhoDoDocumento(ORG, "selfie", ID, "image/jpeg", 200_000);
ok("o caminho do navegador é o que o banco aceita", !!cam && caminhoAceitoPeloBanco(ORG, "selfie", cam));
const migr = readFileSync("supabase/migrations/20261028130000_cadastro_documentos.sql", "utf8");
ok("a regra do banco é a mesma desta guarda", migr.includes(`'^' || org::text || '/' || p_tipo || '-[0-9a-f-]{36}\\.(jpg|png|webp|heic|pdf)$'`));
ok("arquivo acima de 10 MB não sobe", caminhoDoDocumento(ORG, "rg", ID, "image/jpeg", 10 * 1024 * 1024 + 1) === null);
ok("formato fora da lista não sobe", caminhoDoDocumento(ORG, "rg", ID, "image/gif", 1000) === null);
ok("arquivo vazio não sobe", caminhoDoDocumento(ORG, "rg", ID, "application/pdf", 0) === null);
ok("PDF vira .pdf", caminhoDoDocumento(ORG, "contrato", ID, "application/pdf", 1000)?.endsWith(".pdf") === true);
ok("a tela sobe os documentos DEPOIS de a conta existir", /void concluirJornada\(\);[\s\S]{0,400}enviarDocumentosDoCadastro\(docs\)/.test(tela));
ok("a selfie é o quadro da câmera, não só a marca de \"tirada\"", /toBlob\(/.test(tela) && /onConcluir\("capturada", foto\)/.test(tela));
ok("o documento da empresa leva o arquivo", /onEnviar\(t, a\)/.test(tela));
const libDoc = readFileSync("src/lib/cadastro-documentos.ts", "utf8");
ok("em demonstração nenhum documento sai", /if \(isDemo \|\| pendentes\.length === 0\) return r;/.test(libDoc));
ok("o envio nunca sobrescreve um documento", /upsert: false/.test(libDoc));

// ── o funil no admin (etapa 3) ──────────────────────────────────────────────
{
  const AGORA = new Date("2026-10-28T12:00:00Z");
  const h = (n: number) => new Date(AGORA.getTime() - n * 3_600_000).toISOString();
  const j = (id: string, etapa: string, passos: string[], ultimoH: number, extra: Partial<JornadaAdmin> = {}): JornadaAdmin => ({
    id, etapa, etapas: Object.fromEntries(passos.map((p) => [p, h(ultimoH)])), tipo: "pj",
    nome: null, whatsapp: null, email: null, orgId: null, empresa: null,
    iniciadaEm: h(ultimoH + 1), atualizadaEm: h(ultimoH), concluidaEm: null, documentos: 0, lembretes: [], ...extra,
  });
  const lista = [
    j("1", "pronto", ["tipo", "documento", "repTelefone", "senha", "pronto"], 50, { concluidaEm: h(50), orgId: "o1" }),
    j("2", "facial", ["tipo", "documento", "repTelefone", "senha", "facial"], 30, { whatsapp: "11987654321" }),
    j("3", "repTelefone", ["tipo", "documento", "repTelefone"], 5),
    j("4", "repTelefone", ["tipo", "documento", "repTelefone"], 3),
    j("5", "documento", ["tipo", "documento"], 0.1),
    // ⚠️ do Google: o contato veio respondido, sem passo de contato registrado
    j("6", "senha", ["tipo", "documento", "senha"], 2),
  ];
  const r = resumirFunil(lista, AGORA);
  ok("funil: 6 começaram, 1 concluiu, 4 pararam, 1 em andamento",
     r.total === 6 && r.concluidas === 1 && r.pararam === 4 && r.emAndamento === 1);
  ok("funil: taxa de conclusão 1/6", Math.abs((r.taxaConclusao ?? 0) - 1 / 6) < 1e-9);
  ok("funil: só a parada com contato há mais de 24 h é recuperável", r.recuperaveis === 1);
  ok("funil: as fases nunca crescem ao avançar (é funil)", r.fases.every((f, i) => i === 0 || f.alcancaram <= r.fases[i - 1].alcancaram));
  ok("funil: quem pulou o passo de contato (Google) conta no contato e na senha",
     faseAlcancada(lista[5]) === 4 && r.fases[2].alcancaram === 5 && r.fases[3].alcancaram === 3);
  ok("funil: concluída conta em todas as fases", faseAlcancada({ etapas: {}, concluidaEm: h(1) }) === FASES_FUNIL.length);
  ok("funil: onde param, o passo mais comum primeiro", r.ondeParam[0]?.passo === "repTelefone" && r.ondeParam[0]?.quantas === 2);
  ok("funil: sem jornada a taxa é ausente, não 0%", resumirFunil([], AGORA).taxaConclusao === null);
  ok("funil: o passo tem nome legível", nomeDoPasso("facial") === "Foto do rosto" && nomeDoPasso("repTelefone") === "Contato · WhatsApp");
  ok("funil: linha sem id ou etapa é descartada", jornadaDaLinha({ etapa: "tipo" }) === null
     && jornadaDaLinha({ id: "x", etapa: "tipo", iniciada_em: h(1), atualizada_em: h(1), documentos: "2" })?.documentos === 2);

  // ── quanto tempo leva (etapa 4) ──
  const m = (n: number) => new Date(AGORA.getTime() - n * 60_000).toISOString();
  const t = (id: string, marcas: Record<string, number>, extra: Partial<JornadaAdmin> = {}): JornadaAdmin => {
    const ini = Math.max(...Object.values(marcas));
    const fim = Math.min(...Object.values(marcas));
    return { id, etapa: Object.keys(marcas).at(-1)!, etapas: Object.fromEntries(Object.entries(marcas).map(([p, v]) => [p, m(v)])),
      tipo: "pj", nome: null, whatsapp: null, email: null, orgId: null, empresa: null,
      iniciadaEm: m(ini), atualizadaEm: m(fim), concluidaEm: null, documentos: 0, lembretes: [], ...extra };
  };
  const tl = [
    // concluíram em 20, 30 e 40 min; o documento leva 2 min e a senha → pronto leva 10, 12 e 14
    t("a", { tipo: 1020, documento: 1018, repTelefone: 1015, senha: 1010, pronto: 1000 }, { concluidaEm: m(1000) }),
    t("b", { tipo: 2030, documento: 2028, repTelefone: 2025, senha: 2012, pronto: 2000 }, { concluidaEm: m(2000) }),
    t("c", { tipo: 3040, documento: 3038, repTelefone: 3020, senha: 3014, pronto: 3000 }, { concluidaEm: m(3000) }),
    // parou no contato depois de 6 min; outro parou depois de 4 min
    t("d", { tipo: 506, documento: 504, repTelefone: 500 }),
    t("e", { tipo: 404, documento: 400 }),
  ];
  const tp = resumirFunil(tl, AGORA).tempos;
  ok("tempo: mediana para concluir = 30 min (20, 30, 40)", tp.ateConcluir.mediana === 30 && tp.ateConcluir.base === 3);
  ok("tempo: mediana até desistir = 5 min (4 e 6, par)", tp.ateParar.mediana === 5 && tp.ateParar.base === 2);
  ok("tempo: início → CPF/CNPJ = 2 min, sobre as 5", tp.entreFases[0].mediana === 2 && tp.entreFases[0].base === 5);
  ok("tempo: senha → concluíram = 12 min (10, 12, 14)", tp.entreFases[3].mediana === 12 && tp.entreFases[3].base === 3);
  ok("tempo: a mais lenta é a de maior mediana com base ≥ 3", tp.maisLenta === tp.entreFases[3].rotulo);
  ok("tempo: sem base a mediana é ausente, não zero", resumirFunil([], AGORA).tempos.ateConcluir.mediana === null && mediana([]) === null);
  ok("tempo: relógio para trás não entra", temposDoFunil([t("x", { tipo: 10, documento: 20 })], AGORA).entreFases[0].base === 0);
  ok("tempo: duração legível", duracaoLegivel(0.5) === "30 s" && duracaoLegivel(12.4) === "12 min" && duracaoLegivel(130) === "2 h 10 min"
     && duracaoLegivel(120) === "2 h" && duracaoLegivel(4320) === "3 dias" && duracaoLegivel(null) === "—");
  ok("tempo: a chegada na fase é o PRIMEIRO passo dela (documento antes de confirmar)",
     chegadaNaFase(t("y", { tipo: 30, documento: 20, confirmar: 10 }), 1) === new Date(m(20)).getTime());

  const sql = readFileSync("supabase/migrations/20261028140000_admin_cadastro_funil.sql", "utf8");
  const corpo = (nome: string) => sql.slice(sql.indexOf(`function public.${nome}(`), sql.indexOf("$$;", sql.indexOf(`function public.${nome}(`)));
  ok("admin: as três leituras passam pelo portão administrativo",
     ["admin_cadastro_funil", "admin_cadastro_documentos", "admin_cadastro_documento_abrir"].every((f) => corpo(f).includes(`admin_exigir_acesso('${f}'`)));
  ok("admin: ver documento exige o segundo fator NA FUNÇÃO",
     ["admin_cadastro_documentos", "admin_cadastro_documento_abrir"].every((f) => corpo(f).includes("admin_cadastro_exigir_segundo_fator()"))
     && /'aal'.*is distinct from 'aal2'/.test(corpo("admin_cadastro_exigir_segundo_fator")));
  ok("admin: a lista de documentos não leva o caminho do arquivo", !/'caminho'/.test(corpo("admin_cadastro_documentos")));
  ok("admin: abrir documento deixa o rastro em admin_audit", /insert into public\.admin_audit[\s\S]*'cadastro\.documento_aberto'/.test(corpo("admin_cadastro_documento_abrir")));
  ok("admin: anon não executa nenhuma das funções", (sql.match(/revoke all on function public\.admin_cadastro_\w+\([^)]*\) from public, anon, authenticated, service_role;/g) ?? []).length === 4);

  const rota = readFileSync("src/app/api/admin/cadastro/documento/route.ts", "utf8");
  const iBanco = rota.indexOf('doChamador.rpc("admin_cadastro_documento_abrir"'), iChave = rota.indexOf("createAdmin()", rota.indexOf("export async function GET"));
  const ordem = (t: string) => {
    const a = t.indexOf('doChamador.rpc("admin_cadastro_documento_abrir"'), b = t.indexOf("createAdmin()", t.indexOf("export async function GET"));
    return a > 0 && b > a;
  };
  ok("rota: o banco (com a sessão de quem pede) decide ANTES da chave de serviço", iBanco > 0 && iChave > iBanco && ordem(rota));
  ok("rota: (defeito plantado) a chave de serviço antes do banco é REPROVADA",
     !ordem(rota.replace('const { data: caminho, error } = await doChamador.rpc("admin_cadastro_documento_abrir", { p_documento: id });', "").replace("const admin = createAdmin();", 'const admin = createAdmin(); const { data: caminho, error } = await doChamador.rpc("admin_cadastro_documento_abrir", { p_documento: id });')));
  const validade = Number(/const VALIDADE_S = (\d+);/.exec(rota)?.[1] ?? "0");
  ok("rota: o link assinado vence em até 2 minutos", validade > 0 && validade <= 120 && /createSignedUrl\(caminho, VALIDADE_S\)/.test(rota));
  ok("rota: a resposta não fica em cache", (rota.match(/no-store/g) ?? []).length >= 2);
  const view = readFileSync("src/components/admin/CadastrosAdmin.tsx", "utf8");
  ok("tela: o documento abre pela rota (nunca por link direto ao Storage)", /href=\{rotaDoDocumento\(d\.id\)\}/.test(view) && !/storage/.test(view));
}

// ── os lembretes (etapa 5): WhatsApp em 24 h, e-mail em 3 dias, no máximo 2 ──
{
  const agora = new Date("2026-10-28T12:00:00Z");
  const hAtras = (h: number) => new Date(agora.getTime() - h * 3_600_000).toISOString();
  const j = (h: number, extra: Partial<JornadaParaLembrete> = {}): JornadaParaLembrete => ({
    id: "j", etapa: "senha", atualizadaEm: hAtras(h), concluidaEm: null,
    nome: "Marina Alves", whatsapp: "11987654321", email: "marina@x.com.br", jaLembrados: [], ...extra,
  });
  const v = (x: JornadaParaLembrete) => lembretesVencidos(x, agora).join(",");
  ok("lembrete: parada há 23 h ainda não recebe nada", v(j(23)) === "");
  ok("lembrete: parada há 25 h recebe o WhatsApp, e o e-mail ainda não", v(j(25)) === "whatsapp");
  ok("lembrete: parada há 4 dias recebe o e-mail depois do WhatsApp", v(j(96, { jaLembrados: ["whatsapp"] })) === "email");
  ok("lembrete: nunca mais de dois — com os dois canais usados, nada", v(j(96, { jaLembrados: ["whatsapp", "email"] })) === "");
  ok("lembrete: o mesmo canal não sai duas vezes", v(j(30, { jaLembrados: ["whatsapp"] })) === "");
  ok("lembrete: só e-mail espera os 3 dias", v(j(30, { whatsapp: null })) === "" && v(j(73, { whatsapp: null })) === "email");
  ok("lembrete: concluída, ou com conta pelo mesmo contato, não recebe", v(j(30, { concluidaEm: hAtras(1) })) === "" && v(j(30, { contatoJaTemConta: true })) === "");
  ok("lembrete: parada há mais de 30 dias não recebe (teto)", v(j(24 * 31)) === "");
  ok("lembrete: o e-mail sozinho em 25 h ainda não sai, e em 73 h sai", v(j(25, { whatsapp: null })) === "" && v(j(73, { whatsapp: null })) === "email");
  const t = textoDoLembrete(j(30), "https://app.quattro.finance/criar-conta", "Responda SAIR.", "whatsapp");
  ok("lembrete: o texto saúda pelo primeiro nome e leva o link e o SAIR", /^Olá, Marina\./.test(t.texto) && t.texto.includes("/criar-conta") && t.texto.includes("SAIR") && t.variaveis["1"] === "Marina");
  ok("lembrete: o texto não repete o sobrenome nem o contato", !/Alves|987654321|marina@/.test(t.texto + t.html));
  ok("lembrete: o contato sai mascarado na resposta", mascararContato("whatsapp", "11987654321") === "***4321" && mascararContato("email", "marina@x.com.br") === "ma***@x.com.br");

  // O executor, com banco e provedor de mentira.
  const montar = (opts: { ativo?: boolean; saidas?: string[] | "erro"; reservaNula?: boolean; candidatas?: unknown[] }) => {
    const chamadas: string[] = [];
    const enviados: EnvioLembrete[] = [];
    const deps: DepsLembretes = {
      admin: {
        rpc(fn: string, args: Record<string, unknown>) {
          chamadas.push(fn);
          const r = (data: unknown, error: { message: string } | null = null) => Promise.resolve({ data, error });
          if (fn === "cadastro_lembretes_candidatas") return r(opts.candidatas ?? [
            { id: "a", etapa: "senha", nome: "Ana Lima", whatsapp: "11911112222", email: "ana@x.com", atualizada_em: hAtras(80), ja_lembrados: [], contato_ja_tem_conta: false },
          ]);
          if (fn === "whatsapp_saidas_entre") return opts.saidas === "erro" ? r(null, { message: "fora" }) : r(opts.saidas ?? []);
          if (fn === "cadastro_lembrete_reservar") return r(opts.reservaNula ? null : `res-${String(args.p_canal)}`);
          if (fn === "cadastro_lembrete_concluir") return r(true);
          return r(null, { message: "rpc inesperada" });
        },
      },
      ativo: () => opts.ativo ?? true,
      async enviar(m) { enviados.push(m); return { ok: true, id: "SM1" }; },
      template: "HX1",
    };
    return { deps, chamadas, enviados };
  };
  const antes = process.env.CADASTRO_LEMBRETES;

  delete process.env.CADASTRO_LEMBRETES;
  {
    const m = montar({});
    const rel = await rodarLembretesCadastro(m.deps, { dryRun: false, link: "https://x/criar-conta", agora });
    ok("executor: DESLIGADO, nada é reservado nem enviado (só a prova de carga)", !rel.ligado && rel.dryRun && m.enviados.length === 0 && !m.chamadas.includes("cadastro_lembrete_reservar") && rel.itens.filter((i) => i.resultado === "sairia").length === 2);
  }
  process.env.CADASTRO_LEMBRETES = "ligado";
  {
    const m = montar({});
    const rel = await rodarLembretesCadastro(m.deps, { dryRun: false, link: "https://x/criar-conta", agora });
    const ordem = m.chamadas.join(">");
    ok("executor: ligado, parada há 80 h recebe WhatsApp e e-mail", rel.enviados === 2 && m.enviados.map((e) => e.canal).join(",") === "whatsapp,email");
    ok("executor: RESERVA antes de enviar e CONCLUI depois", /cadastro_lembrete_reservar>cadastro_lembrete_concluir>cadastro_lembrete_reservar>cadastro_lembrete_concluir/.test(ordem));
    ok("executor: o WhatsApp vai pelo template aprovado", m.enviados[0]?.template === "HX1" && m.enviados[1]?.template === undefined);
    ok("executor: a resposta leva o contato mascarado, nunca inteiro", !JSON.stringify(rel).includes("11911112222") && !JSON.stringify(rel).includes("ana@x.com"));
  }
  {
    const m = montar({ reservaNula: true });
    const rel = await rodarLembretesCadastro(m.deps, { dryRun: false, link: "https://x/criar-conta", agora });
    ok("executor: sem a reserva (canal já lembrado), não envia", m.enviados.length === 0 && rel.itens.every((i) => i.resultado === "ja_lembrado"));
  }
  {
    const m = montar({ ativo: false });
    const rel = await rodarLembretesCadastro(m.deps, { dryRun: false, link: "https://x/criar-conta", agora });
    ok("executor: sem provedor, nada é reservado (a vaga fica para quando a chave chegar)", rel.semProvedor === 2 && !m.chamadas.includes("cadastro_lembrete_reservar"));
  }
  {
    const m = montar({ saidas: "erro" });
    const rel = await rodarLembretesCadastro(m.deps, { dryRun: false, link: "https://x/criar-conta", agora });
    ok("executor: sem saber quem respondeu SAIR, nenhum WhatsApp (o e-mail segue)", rel.bloqueados === 1 && m.enviados.map((e) => e.canal).join(",") === "email");
  }
  {
    const m = montar({ saidas: ["11911112222"] });
    const rel = await rodarLembretesCadastro(m.deps, { dryRun: false, link: "https://x/criar-conta", agora });
    ok("executor: quem respondeu SAIR não recebe WhatsApp", rel.bloqueados === 1 && !m.enviados.some((e) => e.canal === "whatsapp"));
  }
  {
    const m = montar({});
    await rodarLembretesCadastro(m.deps, { dryRun: true, link: "https://x/criar-conta", agora });
    ok("executor: dryRun não reserva nem envia", m.enviados.length === 0 && !m.chamadas.includes("cadastro_lembrete_reservar"));
  }
  if (antes === undefined) delete process.env.CADASTRO_LEMBRETES; else process.env.CADASTRO_LEMBRETES = antes;

  const servidor = readFileSync("src/lib/cadastro-lembretes-servidor.ts", "utf8");
  ok("servidor: WhatsApp só é ativo com o template aprovado", /st\.whatsapp && !!template/.test(servidor));
  const runner = readFileSync("src/app/api/financial-os/run/route.ts", "utf8");
  ok("cron: os lembretes vão na vaga diária que já existe", /rodarLembretesReais\(admin, url\.origin, dryRun\)/.test(runner));
  const vercel = JSON.parse(readFileSync("vercel.json", "utf8")) as { crons?: unknown[] };
  ok("cron: nenhuma vaga de cron nova (o plano tem duas)", (vercel.crons ?? []).length <= 2);
}


console.log(falhas ? `\n✗ ${falhas} falha(s) na jornada do cadastro` : "\n✓ jornada do cadastro: evento, estado, rota e tela conferidos");
process.exit(falhas ? 1 : 0);
