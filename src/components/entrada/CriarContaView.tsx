"use client";

/**
 * CRIAR CONTA CONVERSANDO COM A QUATTRO AI — a porta de entrada do produto.
 *
 * ⚠️ **A conversa pede TUDO o que o cadastro de sete passos pedia** (decisão do
 * dono, 16/10/2026). A versão de três perguntas (nome, e-mail, senha) deixava
 * o cliente entrar sem CNPJ, sem regime, sem representante, sem perfil e sem
 * estrutura — e cada tela depois disso trabalhava com o cadastro pela metade.
 * Agora:
 *
 *   1. "Que tipo de conta você gostaria de abrir?" — Conta PF ou Conta PJ.
 *   2. O CNPJ (ou o CPF), com a máscara aplicada ENQUANTO a pessoa digita.
 *   3. O CNPJ vai à Receita (`consultarCNPJ`), e a pessoa CONFIRMA o cartão
 *      com os dados — nada da Receita é gravado sem esse clique.
 *   4. As outras perguntas, uma por vez, na ordem de `core/cadastro/conversa`
 *      (a mesma lista de opções do cadastro de sete passos).
 *   5. A conta só nasce com `faltandoParaCriar` vazio.
 *
 * ⚠️ **As regras de antes continuam.** O nome vazio é recusado na tela, a
 * senha usa o mesmo `MIN_SENHA`, o nome viaja no `signUp` por
 * `criarContaEEntrar`, o cadastro guardado no navegador é NOVO (nunca mesclado
 * com o de outra organização) e a ordem de gravação é a do wizard: conta →
 * alçada → perfil → estrutura → extrato. As guardas (`cadastro-nome`,
 * `engine-audit`) continuam lendo este arquivo.
 *
 * ⚠️ **Uma pergunta por vez também é a regra do campo**: a barra embaixo é UM
 * campo, que troca de tipo a cada passo. A senha é sempre `type="password"`, e
 * a resposta dela aparece mascarada no balão.
 */

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui";
import { criarContaEEntrar } from "@/lib/entrada";
import { persistCompany, saveCompany, type StoredCompany } from "@/lib/company";
import { aplicarEstrutura } from "@/lib/onboarding";
import { aplicarOnboarding } from "@/lib/fdip";
import { aplicarAlcadaDoOnboarding } from "@/lib/alcada";
import { reportar } from "@/lib/erros";
import { consultarCNPJ } from "@/lib/cnpj";
import { lookupCep } from "@/lib/viacep";
import { setTipoConta } from "@/components/app/useTipoConta";
import { analisarImportacao } from "@/core/fdip";
import type { FDIPReport } from "@/core/fdip/types";
import { alcadaDoOnboarding } from "@/core/seguranca/alcada";
import { calcularMaturidade, type Maturidade } from "@/core/onboarding";
import { MIN_SENHA } from "@/core/recuperacao";
import {
  CADASTRO_VAZIO, aplicarReceita, cnpjConfere, cpfConfere, faltandoParaCriar, mascararCEP, mascararCNPJ,
  mascararCPF, mascararTelefone, montarCadastro, nomeDaOrganizacao, perguntasDoCadastro, proximaPergunta,
  type Cadastro, type DadosReceita, type Pergunta,
} from "@/core/cadastro/conversa";
import { DigitandoIA, TextoRevelado, duracaoRevelar } from "@/components/ia/conversa";

type Etapa =
  | "tipo" | "documento" | "buscando" | "confirmar" | "pergunta" | "extrato" | "senha"
  | "criando" | "confirme" | "erro" | "pronto";

type Cartao =
  | { tipo: "conta" }
  | { tipo: "documento"; rotulo: string; documento: string; nome: string; detalhe?: string }
  | { tipo: "analise"; maturidade: Maturidade };

interface Acao { rotulo: string; icone?: string; href?: string; fazer?: () => void }
interface Fala {
  id: number;
  de: "ia" | "voce";
  texto: string;
  /** A pergunta da IA que abre um passo (é o ponto de volta do "Alterar"). */
  pergunta?: string;
  /** A resposta ACEITA de um passo — só ela ganha o "Alterar". */
  resposta?: string;
  alerta?: boolean;
  acoes?: Acao[];
  cartao?: Cartao;
}

/** O que existia ANTES de cada resposta — é o que o "Alterar" devolve. */
interface Marco { id: string; antes: Cadastro; report: FDIPReport | null }

type Modo = "text" | "numeric" | "email" | "tel" | "decimal";
interface Campo { rotulo: string; placeholder: string; tipo: string; modo: Modo; auto: string; mascara: ((s: string) => string) | null }

let proximoId = 0;
const novaFala = (f: Omit<Fala, "id">): Fala => ({ ...f, id: ++proximoId });
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));
const configurado = !!process.env.NEXT_PUBLIC_SUPABASE_URL;

/** O que a barra de baixo é em cada passo. */
function campoDe(etapa: Etapa, c: Cadastro, p: Pergunta | null): Campo | null {
  if (etapa === "documento") {
    return c.tipo === "pj"
      ? { rotulo: "CNPJ", placeholder: "00.000.000/0000-00", tipo: "text", modo: "numeric", auto: "off", mascara: mascararCNPJ }
      : { rotulo: "CPF", placeholder: "000.000.000-00", tipo: "text", modo: "numeric", auto: "off", mascara: mascararCPF };
  }
  if (etapa === "senha") {
    return { rotulo: "Senha", placeholder: `Senha com pelo menos ${MIN_SENHA} caracteres`, tipo: "password", modo: "text", auto: "new-password", mascara: null };
  }
  if (etapa !== "pergunta" || !p || p.tipo === "escolha" || p.tipo === "multi") return null;
  const base: Campo = { rotulo: p.rotulo, placeholder: p.placeholder ?? "", tipo: "text", modo: "text", auto: "off", mascara: null };
  if (p.tipo === "email") return { ...base, tipo: "email", modo: "email", auto: "email" };
  if (p.tipo === "telefone") return { ...base, tipo: "tel", modo: "tel", auto: "tel", mascara: mascararTelefone };
  if (p.tipo === "cep") return { ...base, modo: "numeric", auto: "postal-code", mascara: mascararCEP };
  if (p.tipo === "moeda") return { ...base, modo: "decimal" };
  if (p.id === "repNome" || p.id === "nome") return { ...base, auto: "name" };
  return base;
}

export function CriarContaView() {
  const router = useRouter();
  const [falas, setFalas] = React.useState<Fala[]>([]);
  const [etapa, setEtapa] = React.useState<Etapa>("tipo");
  const [cad, setCad] = React.useState<Cadastro>(CADASTRO_VAZIO);
  const [marcos, setMarcos] = React.useState<Marco[]>([]);
  const [atual, setAtual] = React.useState<Pergunta | null>(null);
  const [marcadas, setMarcadas] = React.useState<string[]>([]);
  const [receita, setReceita] = React.useState<DadosReceita | null>(null);
  const [report, setReport] = React.useState<FDIPReport | null>(null);
  const [digitando, setDigitando] = React.useState(false);
  /**
   * ⚠️ A IA AINDA ESTÁ FALANDO. Entre uma frase e outra o "digitando" some, e
   * sem esta trava o campo abria no meio da fala: a resposta entrava antes da
   * pergunta (medido na primeira print — o CNPJ apareceu acima do "envie o
   * seu CNPJ").
   */
  const [falando, setFalando] = React.useState(0);
  const [texto, setTexto] = React.useState("");
  const [verSenha, setVerSenha] = React.useState(false);
  /*
   * ⚠️ **O NOME VAZIO É RECUSADO NA TELA, não resolvido em silêncio.** O
   * gatilho tem um último recurso ("Minha empresa") para não derrubar o
   * signup; ele NÃO é o caminho de quem está conversando. Aqui quem responde
   * "qual é o nome" é a pessoa — a razão social (da Receita, confirmada, ou
   * digitada) ou o nome de quem abre a conta pessoal.
   */
  const [erroEmpresa, setErroEmpresa] = React.useState<string | null>(null);

  const vivoRef = React.useRef(true);
  const campoRef = React.useRef<HTMLInputElement>(null);
  const arquivoRef = React.useRef<HTMLInputElement>(null);
  const fimRef = React.useRef<HTMLDivElement>(null);
  const semMovimento = React.useRef(false);
  /** A conta já existe (o "Tentar de novo" depois dela só refaz o resto). */
  const contaCriada = React.useRef(false);

  /** A IA fala uma frase de cada vez, com o "digitando" entre elas. */
  const falar = React.useCallback(async (textos: string[], extra?: Partial<Fala>) => {
    setFalando((n) => n + 1);
    try {
    for (let i = 0; i < textos.length; i++) {
      setDigitando(true);
      await esperar(semMovimento.current ? 0 : 450 + Math.min(textos[i].length * 6, 450));
      if (!vivoRef.current) return;
      setDigitando(false);
      const ultima = i === textos.length - 1;
      setFalas((fs) => [...fs, novaFala({ de: "ia", texto: textos[i], ...(ultima ? extra : {}) })]);
      // A frase surge palavra por palavra: a próxima só começa quando ela termina.
      if (!semMovimento.current) await esperar(duracaoRevelar(textos[i]));
      if (!vivoRef.current) return;
    }
    } finally { setFalando((n) => n - 1); }
  }, []);

  React.useEffect(() => {
    vivoRef.current = true;
    semMovimento.current = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    void falar(["Bora cuidar das suas finanças e vender pelo celular, sem maquininha."], { cartao: { tipo: "conta" } });
    return () => { vivoRef.current = false; };
  }, [falar]);

  React.useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: semMovimento.current ? "auto" : "smooth", block: "end" });
  }, [falas, digitando, atual]);

  const ocupadoFala = digitando || falando > 0;
  const campo = campoDe(etapa, cad, atual);
  const temCampo = !!campo;
  React.useEffect(() => { if (temCampo && !ocupadoFala) campoRef.current?.focus(); }, [temCampo, ocupadoFala, etapa, atual]);

  const voce = (t: string, resposta?: string) => setFalas((fs) => [...fs, novaFala({ de: "voce", texto: t, resposta })]);
  /** A última fala da pessoa vira a resposta ACEITA de um passo (ganha o "Alterar"). */
  const aceitar = (id: string) => setFalas((fs) => fs.map((f, i) => (i === fs.length - 1 ? { ...f, resposta: id } : f)));
  const feitasDe = (ms: Marco[]) => new Set(ms.map((m) => m.id));

  /* ─── a próxima pergunta ─────────────────────────────────────────────── */
  const perguntar = async (c: Cadastro, ms: Marco[], prefixo: string[] = []) => {
    const feitas = feitasDe(ms);
    const p = proximaPergunta(c, feitas);
    if (p) {
      setAtual(p);
      setMarcadas(p.inicial ? p.inicial(c) : []);
      setEtapa("pergunta");
      await falar([...prefixo, ...p.falas(c)], { pergunta: p.id });
      return;
    }
    setAtual(null);
    if (c.tipo === "pj" && !feitas.has("extrato")) {
      setEtapa("extrato");
      await falar(
        [...prefixo, "Último passo antes do acesso: quer me mandar um extrato do banco agora? Com ele eu já monto as categorias, os clientes e os fornecedores."],
        { pergunta: "extrato" },
      );
      return;
    }
    setEtapa("senha");
    await falar([...prefixo, `Agora crie uma senha com pelo menos ${MIN_SENHA} caracteres para o e-mail ${c.email}.`], { pergunta: "senha" });
  };

  /* ─── 1. o tipo de conta ─────────────────────────────────────────────── */
  const escolherTipo = async (tipo: "pf" | "pj") => {
    if (etapa !== "tipo" || ocupadoFala) return;
    voce(tipo === "pj" ? "Conta PJ" : "Conta PF", "tipo");
    const novo: Cadastro = { ...CADASTRO_VAZIO, tipo };
    setMarcos([{ id: "tipo", antes: CADASTRO_VAZIO, report: null }]);
    setCad(novo);
    setTexto("");
    setEtapa("documento");
    await falar(
      ["Show! Isso vai ser rápido.", tipo === "pj" ? "Pra começar, envie o número do seu **CNPJ**." : "Pra começar, envie o número do seu **CPF**."],
      { pergunta: "documento" },
    );
  };

  /* ─── 2. o documento, e a Receita ────────────────────────────────────── */
  const responderDocumento = async (valor: string) => {
    if (cad.tipo === "pj") {
      voce(mascararCNPJ(valor));
      if (!cnpjConfere(valor)) {
        await falar(["Esse CNPJ não confere: os dois últimos números não batem com os outros. Confere pra mim?"], { alerta: true });
        return;
      }
      setTexto("");
      setEtapa("buscando");
      setDigitando(true);
      const r = await consultarCNPJ(valor).catch(() => null);
      if (!vivoRef.current) return;
      setDigitando(false);
      const base: Cadastro = { ...cad, cnpj: mascararCNPJ(valor) };
      if (!r) {
        // Sem a Receita (rede, limite da API): a conversa pede à mão o que ela daria.
        aceitar("documento");
        const ms = [...marcos, { id: "documento", antes: cad, report }];
        setMarcos(ms);
        setCad(base);
        await perguntar(base, ms);
        return;
      }
      setReceita(r);
      setCad(base);
      setEtapa("confirmar");
      const lugar = [r.municipio, r.uf].filter(Boolean).join(" / ");
      await falar(["Verifique se os dados estão corretos"], {
        cartao: {
          tipo: "documento", rotulo: "CNPJ", documento: mascararCNPJ(valor), nome: r.razaoSocial,
          detalhe: [r.nomeFantasia, lugar].filter(Boolean).join(" · ") || undefined,
        },
      });
      return;
    }
    voce(mascararCPF(valor));
    if (!cpfConfere(valor)) {
      await falar(["Esse CPF não confere: os dois últimos números não batem com os outros. Confere pra mim?"], { alerta: true });
      return;
    }
    aceitar("documento");
    const novo: Cadastro = { ...cad, cpf: mascararCPF(valor) };
    const ms = [...marcos, { id: "documento", antes: cad, report }];
    setMarcos(ms);
    setCad(novo);
    setTexto("");
    await perguntar(novo, ms);
  };

  const confirmarDocumento = async () => {
    if (etapa !== "confirmar" || ocupadoFala) return;
    voce("Confirmar", "documento");
    const novo = receita ? aplicarReceita(cad, receita) : cad;
    const ms = [...marcos, { id: "documento", antes: { ...cad, cnpj: "" }, report }];
    setMarcos(ms);
    setCad(novo);
    await perguntar(novo, ms, ["Perfeito, anotei os dados."]);
  };

  const outroDocumento = async () => {
    if (etapa !== "confirmar" || ocupadoFala) return;
    voce(cad.tipo === "pj" ? "Usar outro CNPJ" : "Usar outro CPF");
    setReceita(null);
    setCad((c) => ({ ...c, cnpj: "", cpf: "" }));
    setTexto("");
    setEtapa("documento");
    await falar([cad.tipo === "pj" ? "Sem problema. Qual é o **CNPJ** certo?" : "Sem problema. Qual é o **CPF** certo?"], { pergunta: "documento" });
  };

  /* ─── 3. as perguntas ────────────────────────────────────────────────── */
  const responderPergunta = async (valor: string) => {
    const p = atual;
    if (!p || ocupadoFala) return;
    const pulou = !valor.trim();
    if (pulou && !p.opcional) return;
    const eco = pulou ? "Pular" : p.tipo === "multi" ? valor.split("\n").join(", ") : (p.eco ? p.eco(valor) : valor.trim());
    voce(eco);
    const recusa = !pulou && p.validar ? p.validar(valor, cad) : null;
    if (recusa) {
      if (p.id === "razaoSocial") setErroEmpresa(recusa);
      await falar([recusa], { alerta: true });
      return;
    }
    setErroEmpresa(null);
    aceitar(p.id);
    let novo = pulou ? cad : p.aplicar(cad, valor);
    const ms = [...marcos, { id: p.id, antes: cad, report }];
    // O CEP digitado à mão completa rua, bairro, cidade e UF pelo ViaCEP.
    if (p.id === "cep") {
      const end = await lookupCep(valor).catch(() => null);
      if (end) novo = { ...novo, rua: novo.rua || end.street, bairro: novo.bairro || end.district, cidade: end.city, estado: end.state };
    }
    setMarcos(ms);
    setCad(novo);
    setTexto("");
    await perguntar(novo, ms);
  };

  /** A razão social em branco é recusada na tela, antes de qualquer outra coisa. */
  const enviarTexto = async () => {
    if (atual?.id === "razaoSocial" && !texto.trim()) {
      setErroEmpresa("Informe a razão social da empresa.");
      return;
    }
    await responderPergunta(texto);
  };

  /* ─── 4. o extrato (opcional) ────────────────────────────────────────── */
  /** O cartão da análise: o mesmo `calcularMaturidade` do cadastro de sete passos. */
  const analisar = async (c: Cadastro, r: FDIPReport | null, ms: Marco[]) => {
    const m = montarCadastro(c);
    const maturidade = calcularMaturidade(m.perfil, m.participantes, m.estrutura, r);
    await falar(["Com o que você me contou, montei o retrato financeiro da empresa."], { cartao: { tipo: "analise", maturidade } });
    await perguntar(c, ms);
  };

  const lerExtrato = async (arquivo: File) => {
    voce(arquivo.name, "extrato");
    const conteudo = await arquivo.text().catch(() => "");
    const r = conteudo.trim() ? analisarImportacao(conteudo) : null;
    const lidos = r?.records.length ?? 0;
    const ms = [...marcos, { id: "extrato", antes: cad, report }];
    setMarcos(ms);
    if (!r || !lidos) {
      await falar(["Não consegui ler lançamentos nesse arquivo. Sem problema: você importa depois, em Entrada de dados."]);
      await analisar(cad, null, ms);
      return;
    }
    setReport(r);
    await falar([`Li ${lidos} lançamentos de ${r.periodoMeses} ${r.periodoMeses === 1 ? "mês" : "meses"}. Eles entram junto com a conta.`]);
    await analisar(cad, r, ms);
  };

  const pularExtrato = async () => {
    if (ocupadoFala) return;
    voce("Agora não", "extrato");
    const ms = [...marcos, { id: "extrato", antes: cad, report }];
    setMarcos(ms);
    await analisar(cad, null, ms);
  };

  /* ─── 5. a senha e a criação ─────────────────────────────────────────── */
  const criar = async (c: Cadastro, senha: string) => {
    /*
     * ⚠️ **O PORTÃO.** A conta só nasce com o cadastro completo — era isto que
     * faltava na conversa de três perguntas, e é por isso que o cliente
     * entrava no sistema com itens faltando.
     */
    const falta = faltandoParaCriar(c);
    if (falta.length) {
      setEtapa("erro");
      await falar([`Ainda falta: ${falta.join(", ")}. Use o "Alterar" na resposta para completar.`], { alerta: true });
      return;
    }
    const nomeEmpresa = nomeDaOrganizacao(c);
    const email = c.email.trim();
    const montado = montarCadastro(c);
    const company: StoredCompany = {
      db: montado.db, perfil: montado.perfil, participantes: montado.participantes, estrutura: montado.estrutura,
      ...(montado.pessoal ? { pessoal: montado.pessoal } : {}),
    };
    setEtapa("criando");
    await falar([`Perfeito. Estou criando a conta ${c.tipo === "pf" ? "de" : "da"} ${nomeEmpresa}…`]);
    setTipoConta(c.tipo === "pf" ? "pessoal" : "empresa");
    setDigitando(true);
    try {
      if (!contaCriada.current) {
        // ⚠️ Uma exceção aqui (cliente do Supabase sem configuração, rede caída)
        // não pode deixar a conversa parada em "criando": vira a resposta de erro.
        const r = await criarContaEEntrar(email, senha, nomeEmpresa).catch(() => ({
          ok: false as const, confirmarEmail: false,
          motivo: "Não foi possível concluir agora.", comoResolver: "Tente de novo em alguns segundos.",
        }));
        if (!vivoRef.current) return;
        if (!r.ok && r.confirmarEmail) {
          // ⚠️ O cadastro INTEIRO fica guardado: ao voltar pelo link, ele já está
          // aqui. E é um cadastro NOVO, não uma mescla com a empresa de quem
          // estava logado antes neste navegador.
          try { saveCompany(company); } catch { /* segue */ }
          setDigitando(false);
          setEtapa("confirme");
          await falar(
            [`Conta criada! Mandei um link de confirmação para ${email}.`, "É só abrir o link para entrar. O seu cadastro já ficou guardado."],
            { acoes: [{ rotulo: "Já confirmei, quero entrar", icone: "check", href: "/login" }] },
          );
          return;
        }
        if (!r.ok) {
          setDigitando(false);
          setEtapa("erro");
          await falar([r.motivo, r.comoResolver ?? "Me diz o que você quer fazer:"], {
            alerta: true,
            acoes: [
              { rotulo: "Tentar de novo", icone: "rotate-ccw", fazer: () => void criar(c, senha) },
              { rotulo: "Trocar o e-mail", icone: "mail", fazer: () => alterar(c.tipo === "pf" ? "emailPf" : "repEmail") },
              { rotulo: "Trocar a senha", icone: "edit", fazer: () => alterar("senha") },
            ],
          });
          return;
        }
        contaCriada.current = true;
      }
      // Daqui para baixo existe sessão. A MESMA ordem do cadastro de sete passos.
      let falhaAlcada: string | null = null;
      if (c.tipo === "pj") {
        try { await aplicarAlcadaDoOnboarding(alcadaDoOnboarding(montado.participantes)); }
        catch (e) {
          reportar("organizacao.alcada", e, "os limites de aprovação respondidos no cadastro não foram gravados; vale o teto padrão até alguém ajustar");
          falhaAlcada = e instanceof Error ? e.message : String(e);
        }
      }
      // ⚠️ `limite` sai do perfil: a alçada mora em `central_alcada`, não aqui.
      const semLimite = montado.participantes.map(({ limite: _limite, ...resto }) => resto);
      await persistCompany({ ...company, participantes: semLimite });
      if (configurado) await aplicarEstrutura(montado.estrutura);
      if (report) await aplicarOnboarding(report);
      if (!vivoRef.current) return;
      setDigitando(false);
      setEtapa("pronto");
      await falar([
        ...(falhaAlcada ? [`Os limites de aprovação não foram gravados (${falhaAlcada}); até alguém ajustar em Aprovações, vale o padrão.`] : []),
        "Pronto! A sua conta está criada e completa. Já vou te levar para dentro.",
      ]);
      router.push("/");
      router.refresh();
    } catch (e) {
      // ⚠️ SEMPRE uma saída: a conta existe, e "Tentar de novo" refaz só o resto
      // (o perfil é upsert e a estrutura deduplica por nome).
      setDigitando(false);
      setEtapa("erro");
      await falar(
        [`Sua conta foi criada, mas não consegui salvar todo o cadastro: ${e instanceof Error ? e.message : String(e)}.`],
        { alerta: true, acoes: [{ rotulo: "Tentar de novo", icone: "rotate-ccw", fazer: () => void criar(c, senha) }] },
      );
    }
  };

  const responderSenha = async () => {
    const senha = texto;
    if (!senha) return;
    voce("•".repeat(Math.min(senha.length, 12)));
    if (!(senha.length >= MIN_SENHA)) {
      await falar([`Essa ficou curta: a senha precisa de pelo menos ${MIN_SENHA} caracteres. Tenta outra?`], { alerta: true });
      setTexto("");
      return;
    }
    setTexto("");
    setVerSenha(false);
    await criar(cad, senha);
  };

  /* ─── voltar a uma resposta ──────────────────────────────────────────── */
  const cortarEm = (abertura: (f: Fala) => boolean) =>
    setFalas((fs) => {
      let corte = -1;
      fs.forEach((f, i) => { if (abertura(f)) corte = i; });
      return corte >= 0 ? fs.slice(0, corte + 1) : fs;
    });

  function alterar(id: string) {
    setErroEmpresa(null);
    setVerSenha(false);
    if (id === "senha") {
      cortarEm((f) => f.pergunta === "senha");
      setTexto(""); setEtapa("senha");
      return;
    }
    const k = marcos.findIndex((m) => m.id === id);
    if (k < 0) return;
    const marco = marcos[k];
    cortarEm((f) => (id === "tipo" ? f.cartao?.tipo === "conta" : f.pergunta === id));
    setMarcos(marcos.slice(0, k));
    setCad(marco.antes);
    setReport(marco.report);
    if (id === "tipo") { setAtual(null); setEtapa("tipo"); setTexto(""); return; }
    if (id === "documento") {
      setAtual(null); setReceita(null); setEtapa("documento");
      setTexto(cad.tipo === "pj" ? cad.cnpj : cad.cpf);
      return;
    }
    if (id === "extrato") { setAtual(null); setEtapa("extrato"); return; }
    const p = perguntasDoCadastro(marco.antes).find((x) => x.id === id) ?? null;
    setAtual(p);
    setMarcadas(p?.tipo === "multi" ? lerLista(p, cad) : p?.inicial ? p.inicial(marco.antes) : []);
    setTexto(p && p.tipo !== "escolha" && p.tipo !== "multi" ? valorDe(p, cad) : "");
    setEtapa("pergunta");
  }

  const responder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (ocupadoFala) return;
    if (etapa === "documento") {
      const valor = texto.trim();
      if (!valor) return;
      await responderDocumento(valor);
      return;
    }
    if (etapa === "senha") { await responderSenha(); return; }
    if (etapa === "pergunta") await enviarTexto();
  };

  const ocupado = etapa === "criando" || etapa === "pronto" || etapa === "confirme" || etapa === "buscando";
  const ultimaIA = [...falas].reverse().find((f) => f.de === "ia");
  const opcoes = etapa === "pergunta" && atual && (atual.tipo === "escolha" || atual.tipo === "multi") ? (atual.opcoes?.(cad) ?? []) : [];
  const destaque = atual?.destaque?.(cad) ?? null;
  // tipo + documento + perguntas + (extrato, na PJ) + senha
  const total = cad.tipo ? 2 + perguntasDoCadastro(cad).length + (cad.tipo === "pj" ? 1 : 0) + 1 : 0;
  const passoAtual = Math.min(marcos.length + 1, total);
  const atrasoDe = (t: string) => ({ "--a4p-atraso": `${Math.max(0, duracaoRevelar(t) - 200)}ms` } as React.CSSProperties);

  return (
    <div className="a4p-chat-tela h-[100dvh] flex flex-col" style={{ background: "var(--color-surface-1)" }}>
      <header className="flex-none flex items-center justify-between gap-3 px-6 md:px-10 pt-8 pb-4">
        <Link href="/" aria-label="Início"><span role="img" aria-label="Quattro" className="a4p-logo-mono block w-[125px] h-[24px]" /></Link>
        <div className="flex items-center gap-3">
          {total > 0 && etapa !== "pronto" && (
            <span className="hidden sm:inline text-[13px] text-muted tabular-nums" data-progresso>
              Passo {passoAtual} de {total}
            </span>
          )}
          <Link href="/login" className="inline-flex items-center gap-2 h-12 px-5 rounded-pill text-[15px] a4p-pilula">
            <Icon name="user" size={16} />
            Já tenho conta
          </Link>
        </div>
      </header>

      <main className="flex-1 min-h-0 overflow-y-auto">
        <div className="mx-auto w-full max-w-[720px] px-5 pt-10 pb-10 flex flex-col gap-5" aria-live="polite">
          <h1 className="sr-only">Criar conta</h1>
          {falas.map((f) =>
            f.de === "voce" ? (
              <div key={f.id} className="a4p-entra self-end flex items-center gap-2 max-w-[80%]">
                {f.resposta && !ocupado && (
                  <button
                    type="button"
                    onClick={() => alterar(f.resposta!)}
                    aria-label={`Alterar a resposta ${f.texto}`}
                    className="text-[13px] text-muted hover:text-ink underline-offset-2 hover:underline"
                  >
                    Alterar
                  </button>
                )}
                <div data-conversa="voce" className="a4p-bolha-usuario px-5 py-3 rounded-[24px] text-[15px] break-words">
                  {f.texto}
                </div>
              </div>
            ) : (
              <div key={f.id} className="a4p-entra self-start flex flex-col gap-3 w-full max-w-[90%]" data-conversa="ia">
                <p role={f.alerta ? "alert" : undefined} className="m-0 text-[17px] leading-[1.5] text-ink"><TextoRevelado texto={f.texto} /></p>
                {f.cartao && (
                  <div className="a4p-entra" style={atrasoDe(f.texto)}>
                    <CartaoDaConversa
                      cartao={f.cartao}
                      ativo={
                        (f.cartao.tipo === "conta" && etapa === "tipo" && !ocupadoFala) ||
                        (f.cartao.tipo === "documento" && etapa === "confirmar" && f.id === ultimaIA?.id)
                      }
                      onTipo={(t) => void escolherTipo(t)}
                      onConfirmar={() => void confirmarDocumento()}
                      onOutro={() => void outroDocumento()}
                    />
                  </div>
                )}
                {f.acoes && (
                  <div className="a4p-entra flex flex-wrap gap-2" style={atrasoDe(f.texto)}>
                    {f.acoes.map((a) =>
                      a.href ? (
                        <Link key={a.rotulo} href={a.href} className="inline-flex items-center gap-2 h-11 px-5 rounded-pill text-[15px] a4p-pilula">
                          {a.icone && <Icon name={a.icone} size={16} />}
                          {a.rotulo}
                        </Link>
                      ) : (
                        <button key={a.rotulo} type="button" onClick={a.fazer} disabled={etapa !== "erro"}
                          className="inline-flex items-center gap-2 h-11 px-5 rounded-pill text-[15px] a4p-pilula disabled:opacity-50">
                          {a.icone && <Icon name={a.icone} size={16} />}
                          {a.rotulo}
                        </button>
                      ),
                    )}
                  </div>
                )}
              </div>
            ),
          )}

          {/* As opções da pergunta atual: escolha única ou várias. */}
          {!ocupadoFala && opcoes.length > 0 && atual && (
            <div className="a4p-entra self-start flex flex-col gap-3 max-w-full" data-opcoes={atual.id}>
              <div role="group" aria-label={atual.rotulo} className="flex flex-wrap gap-2">
                {opcoes.map((o) => {
                  const marcada = marcadas.includes(o);
                  return atual.tipo === "multi" ? (
                    <button key={o} type="button" aria-pressed={marcada}
                      onClick={() => setMarcadas((ms) => (ms.includes(o) ? ms.filter((x) => x !== o) : [...ms, o]))}
                      className={`inline-flex items-center gap-2 h-11 px-5 rounded-pill text-[15px] transition-colors ${marcada ? "" : "a4p-pilula"}`}
                      style={marcada ? { background: "var(--erp-num-cor)", color: "var(--color-surface-1)" } : undefined}>
                      {marcada && <Icon name="check" size={16} color="currentColor" />}
                      {o}
                    </button>
                  ) : (
                    <button key={o} type="button" onClick={() => void responderPergunta(o)}
                      className="inline-flex items-center gap-2 h-11 px-5 rounded-pill text-[15px] a4p-pilula">
                      {o === destaque && <span aria-hidden className="w-2 h-2 rounded-pill bg-lime" />}
                      {o}
                      {o === destaque && <span className="sr-only"> (indicado)</span>}
                    </button>
                  );
                })}
              </div>
              {atual.tipo === "multi" && (
                <button type="button" disabled={!marcadas.length} onClick={() => void responderPergunta(marcadas.join("\n"))}
                  className="self-start inline-flex items-center gap-2 h-11 px-6 rounded-pill text-[15px] disabled:opacity-50"
                  style={{ background: "var(--erp-num-cor)", color: "var(--color-surface-1)" }}>
                  Continuar
                </button>
              )}
            </div>
          )}

          {!ocupadoFala && etapa === "pergunta" && atual?.opcional && (
            <button type="button" onClick={() => void responderPergunta("")} className="a4p-entra self-start text-[14px] text-muted hover:text-ink underline-offset-2 hover:underline">
              Pular esta pergunta
            </button>
          )}

          {!ocupadoFala && etapa === "extrato" && (
            <div className="a4p-entra self-start flex flex-wrap gap-2" data-opcoes="extrato">
              <button type="button" onClick={() => arquivoRef.current?.click()} className="inline-flex items-center gap-2 h-11 px-5 rounded-pill text-[15px] a4p-pilula">
                <Icon name="upload" size={16} />
                Enviar extrato
              </button>
              <button type="button" onClick={() => void pularExtrato()} className="inline-flex items-center gap-2 h-11 px-5 rounded-pill text-[15px] a4p-pilula">
                Agora não
              </button>
              <input ref={arquivoRef} type="file" accept=".csv,.ofx,.txt" hidden aria-label="Arquivo do extrato"
                onChange={(e) => { const a = e.target.files?.[0]; e.target.value = ""; if (a) void lerExtrato(a); }} />
            </div>
          )}

          {digitando && (
            <DigitandoIA
              rotulo={etapa === "criando" ? "Criando a sua conta" : etapa === "buscando" ? "Buscando na Receita" : "Digitando"}
              className="self-start"
            />
          )}
          {erroEmpresa && (
            <p id="erro-empresa" role="alert" className="a4p-entra m-0 self-start text-[17px] text-ink">
              {erroEmpresa} É ela que aparece no seu painel e nos relatórios.
            </p>
          )}
          <div ref={fimRef} />
        </div>
      </main>

      {campo && (
        <form
          onSubmit={responder}
          className="flex-none mx-auto mb-2 w-[calc(100%-40px)] max-w-[720px] h-14 flex items-center gap-3 px-[10px] rounded-[28px]"
          style={{ background: "var(--a4p-pilula-fundo)" }}
        >
          {/* O gerenciador de senhas guarda a senha junto do e-mail certo. */}
          {etapa === "senha" && <input type="email" name="email" autoComplete="username" value={cad.email} readOnly hidden />}
          <input
            ref={campoRef}
            key={`${etapa}:${atual?.id ?? ""}`}
            name={etapa === "pergunta" ? atual?.id : etapa}
            type={etapa === "senha" && verSenha ? "text" : campo.tipo}
            inputMode={campo.modo}
            autoComplete={campo.auto}
            value={texto}
            onChange={(e) => { setTexto(campo.mascara ? campo.mascara(e.target.value) : e.target.value); if (erroEmpresa) setErroEmpresa(null); }}
            placeholder={campo.placeholder}
            aria-label={campo.rotulo}
            aria-invalid={erroEmpresa ? true : undefined}
            aria-describedby={erroEmpresa ? "erro-empresa" : undefined}
            disabled={ocupadoFala}
            className="a4p-ia-campo flex-1 min-w-0 pl-3 bg-transparent outline-none text-[15px] text-ink placeholder:text-muted tabular-nums"
          />
          {etapa === "senha" && (
            <button type="button" onClick={() => setVerSenha((v) => !v)} aria-label={verSenha ? "Esconder a senha" : "Mostrar a senha"} aria-pressed={verSenha}
              className="w-9 h-9 flex-none rounded-pill flex items-center justify-center text-muted hover:text-ink">
              <Icon name={verSenha ? "eye-off" : "eye"} size={18} />
            </button>
          )}
          <button
            type="submit"
            aria-label="Enviar resposta"
            disabled={ocupadoFala || (!texto.trim() && atual?.id !== "razaoSocial")}
            className="w-9 h-9 flex-none rounded-pill flex items-center justify-center disabled:opacity-50"
            style={{ background: "var(--erp-num-cor)", color: "var(--color-surface-1)" }}
          >
            <Icon name="arrow-up" size={18} color="currentColor" />
          </button>
        </form>
      )}
    </div>
  );
}

/** O que a pessoa tinha respondido (para o campo voltar preenchido no "Alterar"). */
function valorDe(p: Pergunta, c: Cadastro): string {
  const chave = p.id === "descricaoPf" ? "descricao" : p.id === "emailPf" ? "email" : p.id;
  const v = (c as unknown as Record<string, unknown>)[chave];
  if (typeof v === "number") return String(v).replace(".", ",");
  return typeof v === "string" ? v : "";
}
function lerLista(p: Pergunta, c: Cadastro): string[] {
  const chave = p.id === "meios" ? "meiosRecebimento" : p.id;
  const v = (c as unknown as Record<string, unknown>)[chave];
  return Array.isArray(v) && v.length ? (v as string[]) : (p.inicial ? p.inicial(c) : []);
}

/* ─── os cartões da conversa (o desenho do Jota: card branco, ícone lima) ─── */
function CartaoDaConversa({
  cartao, ativo, onTipo, onConfirmar, onOutro,
}: {
  cartao: Cartao;
  ativo: boolean;
  onTipo: (t: "pf" | "pj") => void;
  onConfirmar: () => void;
  onOutro: () => void;
}) {
  if (cartao.tipo === "conta") {
    return (
      <div data-cartao="conta" className="w-full max-w-[420px] rounded-card p-5 flex flex-col gap-4" style={{ background: "var(--color-white)" }}>
        <span aria-hidden className="w-11 h-11 rounded-[12px] flex items-center justify-center bg-lime text-on-lime">
          <Icon name="smile" size={22} color="currentColor" />
        </span>
        <p className="m-0 text-[17px] font-medium text-ink">Que tipo de conta você gostaria de abrir?</p>
        <div className="flex flex-wrap gap-2">
          {(["pf", "pj"] as const).map((t) => (
            <button key={t} type="button" disabled={!ativo} onClick={() => onTipo(t)}
              className="inline-flex items-center h-11 px-6 rounded-pill text-[15px] text-ink disabled:opacity-60"
              style={{ background: "var(--color-surface-1)" }}>
              {t === "pf" ? "Conta PF" : "Conta PJ"}
            </button>
          ))}
        </div>
      </div>
    );
  }
  if (cartao.tipo === "documento") {
    return (
      <div data-cartao="documento" className="w-full max-w-[420px] flex flex-col gap-4">
        <div className="rounded-card p-5 flex items-center gap-4" style={{ background: "var(--color-white)" }}>
          <span aria-hidden className="w-11 h-11 flex-none rounded-[12px] flex items-center justify-center bg-lime text-on-lime">
            <Icon name="user" size={22} color="currentColor" />
          </span>
          <div className="min-w-0 flex flex-col">
            <span className="text-[13px] text-muted tabular-nums">{cartao.rotulo} {cartao.documento}</span>
            <span className="text-[16px] font-medium text-ink break-words">{cartao.nome}</span>
            {cartao.detalhe && <span className="text-[13px] text-muted">{cartao.detalhe}</span>}
          </div>
        </div>
        {ativo && (
          <div className="flex flex-col items-start gap-3">
            <button type="button" onClick={onConfirmar} className="inline-flex items-center h-11 px-7 rounded-pill text-[15px]"
              style={{ background: "var(--erp-num-cor)", color: "var(--color-surface-1)" }}>
              Confirmar
            </button>
            <button type="button" onClick={onOutro} className="text-[14px] text-ink underline underline-offset-2">
              Usar outro {cartao.rotulo}
            </button>
          </div>
        )}
      </div>
    );
  }
  const m = cartao.maturidade;
  return (
    <div data-cartao="analise" className="w-full max-w-[480px] rounded-card p-5 flex flex-col gap-3" style={{ background: "var(--color-white)" }}>
      <div className="flex items-center gap-4">
        <span aria-hidden className="w-11 h-11 flex-none rounded-[12px] flex items-center justify-center bg-lime text-on-lime">
          <Icon name="sparkles" size={22} color="currentColor" />
        </span>
        <div className="flex flex-col">
          <span className="text-[13px] text-muted">Maturidade financeira</span>
          <span className="text-[22px] font-medium text-ink tabular-nums">{Math.round(m.score)} de 100</span>
        </div>
      </div>
      {m.fortes.length > 0 && <p className="m-0 text-[14px] text-ink"><span className="text-muted">Pontos fortes: </span>{m.fortes.slice(0, 2).join(" · ")}</p>}
      {m.atencao.length > 0 && <p className="m-0 text-[14px] text-ink"><span className="text-muted">Atenção: </span>{m.atencao.slice(0, 2).join(" · ")}</p>}
      {m.recomendacoes[0] && <p className="m-0 text-[14px] text-muted">{m.recomendacoes[0]}</p>}
    </div>
  );
}
