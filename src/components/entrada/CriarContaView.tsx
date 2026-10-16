"use client";

/**
 * CRIAR CONTA CONVERSANDO COM A QUATTRO AI — a porta de entrada do produto.
 *
 * ⚠️ **O que isto substitui, e por quê.** A entrada era um wizard de SETE
 * etapas que pedia tudo antes de dar nada; virou um formulário de três campos
 * (16/10/2026: e-mail, senha e nome da empresa). Agora os MESMOS três campos
 * são pedidos pela Quattro AI, no cenário do chat em tela cheia, UMA pergunta
 * de cada vez (decisão do dono, 16/10/2026): a primeira coisa que o cliente vê
 * é a IA com quem ele vai trabalhar, e não um formulário.
 *
 * ⚠️ **Os campos e as regras NÃO mudaram, só a experiência.** O nome vazio é
 * recusado na tela, a senha usa o mesmo `MIN_SENHA`, o nome viaja no `signUp`
 * por `criarContaEEntrar` e o cadastro guardado no navegador é NOVO, nunca
 * mesclado com o de outra organização. As guardas (`cadastro-nome`,
 * `engine-audit`) continuam lendo este arquivo.
 *
 * ⚠️ **Uma pergunta por vez também é a regra do campo**: a barra embaixo é UM
 * campo, que troca de tipo a cada passo (texto → e-mail → senha). A senha é
 * sempre `type="password"`, e a resposta dela aparece mascarada no balão.
 *
 * ⚠️ O wizard completo não morreu: continua em `/comecar` ("Cadastrar a
 * empresa inteira", no alto da tela).
 */

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui";
import { criarContaEEntrar } from "@/lib/entrada";
import { saveCompany } from "@/lib/company";
import { MIN_SENHA } from "@/core/recuperacao";
import { MARCA_IA } from "@/core/marca";

type Passo = "empresa" | "email" | "senha";
type Etapa = Passo | "criando" | "confirme" | "erro" | "pronto";

interface Acao { rotulo: string; icone?: string; href?: string; fazer?: () => void }
interface Fala {
  id: number;
  de: "ia" | "voce";
  texto: string;
  /** A pergunta da IA que abre um passo (é o ponto de volta do "Alterar"). */
  pergunta?: Passo;
  /** A resposta ACEITA de um passo — só ela ganha o "Alterar". */
  resposta?: Passo;
  alerta?: boolean;
  acoes?: Acao[];
}

const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const CAMPO: Record<Passo, { placeholder: string; rotulo: string; tipo: string; autoComplete: string }> = {
  empresa: { placeholder: "Nome da empresa", rotulo: "Nome da empresa", tipo: "text", autoComplete: "organization" },
  email: { placeholder: "voce@suaempresa.com.br", rotulo: "E-mail", tipo: "email", autoComplete: "email" },
  senha: { placeholder: `Senha com pelo menos ${MIN_SENHA} caracteres`, rotulo: "Senha", tipo: "password", autoComplete: "new-password" },
};

let proximoId = 0;
const novaFala = (f: Omit<Fala, "id">): Fala => ({ ...f, id: ++proximoId });
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function CriarContaView() {
  const router = useRouter();
  const [falas, setFalas] = React.useState<Fala[]>([]);
  const [etapa, setEtapa] = React.useState<Etapa>("empresa");
  const [digitando, setDigitando] = React.useState(false);
  const [texto, setTexto] = React.useState("");
  const [verSenha, setVerSenha] = React.useState(false);
  const [empresa, setEmpresa] = React.useState("");
  const [email, setEmail] = React.useState("");
  /*
   * ⚠️ **O NOME VAZIO É RECUSADO NA TELA, não resolvido em silêncio.** O
   * gatilho tem um último recurso ("Minha empresa") para não derrubar o
   * signup; ele NÃO é o caminho de quem está conversando. Aqui quem responde
   * "qual é o nome" é a pessoa.
   */
  const [erroEmpresa, setErroEmpresa] = React.useState<string | null>(null);

  const vivoRef = React.useRef(true);
  const campoRef = React.useRef<HTMLInputElement>(null);
  const fimRef = React.useRef<HTMLDivElement>(null);
  const semMovimento = React.useRef(false);

  /** A IA fala uma frase de cada vez, com o "digitando" entre elas. */
  const falar = React.useCallback(async (textos: string[], extra?: Partial<Fala>) => {
    for (let i = 0; i < textos.length; i++) {
      setDigitando(true);
      await esperar(semMovimento.current ? 0 : 450 + Math.min(textos[i].length * 6, 450));
      if (!vivoRef.current) return;
      setDigitando(false);
      const ultima = i === textos.length - 1;
      setFalas((fs) => [...fs, novaFala({ de: "ia", texto: textos[i], ...(ultima ? extra : {}) })]);
    }
  }, []);

  React.useEffect(() => {
    vivoRef.current = true;
    semMovimento.current = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    void falar(
      [
        `Oi! Eu sou a ${MARCA_IA} e vou abrir a sua conta com você.`,
        "São só três perguntas, uma de cada vez. Pra começar: como se chama o seu negócio?",
      ],
      {
        pergunta: "empresa",
        // O wizard completo continua acessível para quem prefere cadastrar tudo de uma vez.
        acoes: [{ rotulo: "Cadastrar a empresa inteira", icone: "building", href: "/comecar" }],
      },
    );
    return () => { vivoRef.current = false; };
  }, [falar]);

  React.useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: semMovimento.current ? "auto" : "smooth", block: "end" });
  }, [falas, digitando]);

  const passo: Passo | null = etapa === "empresa" || etapa === "email" || etapa === "senha" ? etapa : null;
  React.useEffect(() => { if (passo && !digitando) campoRef.current?.focus(); }, [passo, digitando]);

  const voce = (t: string, resposta?: Passo) => setFalas((fs) => [...fs, novaFala({ de: "voce", texto: t, resposta })]);

  /** Volta a um passo: a conversa depois da pergunta dele sai, e o campo volta preenchido. */
  const alterar = (p: Passo) => {
    setFalas((fs) => {
      let corte = -1;
      fs.forEach((f, i) => { if (f.pergunta === p) corte = i; });
      return corte >= 0 ? fs.slice(0, corte + 1) : fs;
    });
    setErroEmpresa(null);
    setVerSenha(false);
    setTexto(p === "empresa" ? empresa : p === "email" ? email : "");
    setEtapa(p);
  };

  const criar = async (nomeEmpresa: string, email: string, senha: string) => {
    setEtapa("criando");
    await falar([`Perfeito. Estou criando a conta da ${nomeEmpresa}…`]);
    // ⚠️ O nome é guardado ANTES de criar a conta: se a criação parar na
    // confirmação de e-mail, ele já está aqui ao voltar. E é um cadastro NOVO,
    // não uma mescla com a empresa de quem estava logado antes neste navegador.
    saveCompany({ db: { razaoSocial: nomeEmpresa, tipoConta: "empresa" } });
    // ⚠️ Uma exceção aqui (cliente do Supabase sem configuração, rede caída)
    // não pode deixar a conversa parada em "criando": vira a resposta de erro.
    const r = await criarContaEEntrar(email, senha, nomeEmpresa).catch(() => ({
      ok: false as const, confirmarEmail: false,
      motivo: "Não foi possível concluir agora.", comoResolver: "Tente de novo em alguns segundos.",
    }));
    if (!vivoRef.current) return;
    if (r.ok) {
      setEtapa("pronto");
      await falar(["Pronto! A sua conta está criada. Já vou te levar para dentro."]);
      router.push("/");
      router.refresh();
      return;
    }
    if (r.confirmarEmail) {
      setEtapa("confirme");
      await falar(
        [
          `Conta criada! Mandei um link de confirmação para ${email}.`,
          "É só abrir o link para entrar. O nome da empresa já ficou guardado.",
        ],
        { acoes: [{ rotulo: "Já confirmei, quero entrar", icone: "check", href: "/login" }] },
      );
      return;
    }
    // ⚠️ SEMPRE uma saída: numa recusa ou numa rede ruim a conversa não fica
    // parada em "criando" — um chat que não responde é um sistema quebrado.
    setEtapa("erro");
    await falar(
      [r.motivo, r.comoResolver ?? "Me diz o que você quer fazer:"],
      {
        alerta: true,
        acoes: [
          { rotulo: "Tentar de novo", icone: "rotate-ccw", fazer: () => void criar(nomeEmpresa, email, senha) },
          { rotulo: "Trocar o e-mail", icone: "mail", fazer: () => alterar("email") },
          { rotulo: "Trocar a senha", icone: "edit", fazer: () => alterar("senha") },
        ],
      },
    );
  };

  const responder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passo || digitando) return;

    if (passo === "empresa") {
      const nomeEmpresa = texto.trim();
      if (!nomeEmpresa) { setErroEmpresa("Informe o nome da empresa."); return; }
      setErroEmpresa(null);
      setEmpresa(nomeEmpresa);
      voce(nomeEmpresa, "empresa");
      setTexto(email);
      setEtapa("email");
      await falar([`Prazer, ${nomeEmpresa}!`, "Qual e-mail você quer usar para entrar no Quattro?"], { pergunta: "email" });
      return;
    }

    if (passo === "email") {
      const valor = texto.trim();
      if (!valor) return;
      voce(valor);
      if (!EMAIL_VALIDO.test(valor)) {
        await falar(["Hmm, esse e-mail parece incompleto. Confere pra mim? Algo como voce@suaempresa.com.br."], { alerta: true });
        return;
      }
      setFalas((fs) => fs.map((f, i) => (i === fs.length - 1 ? { ...f, resposta: "email" } : f)));
      setEmail(valor);
      setTexto("");
      setEtapa("senha");
      await falar(["Anotado.", `Agora crie uma senha com pelo menos ${MIN_SENHA} caracteres.`], { pergunta: "senha" });
      return;
    }

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
    await criar(empresa, email, senha);
  };

  const campo = passo ? CAMPO[passo] : null;
  const ocupado = etapa === "criando" || etapa === "pronto";

  return (
    <div className="a4p-chat-tela h-[100dvh] flex flex-col" style={{ background: "var(--color-surface-1)" }}>
      <header className="flex-none flex items-center justify-between gap-3 px-6 md:px-10 pt-8 pb-4">
        <Link href="/" aria-label="Início"><span role="img" aria-label="Quattro" className="a4p-logo-mono block w-[125px] h-[24px]" /></Link>
        <div className="flex items-center gap-2">
          <Link href="/login" className="inline-flex items-center gap-2 h-12 px-5 rounded-pill text-[15px] a4p-pilula">
            <Icon name="user" size={16} />
            Já tenho conta
          </Link>
        </div>
      </header>

      <main className="flex-1 min-h-0 overflow-y-auto">
        <div className="mx-auto w-full max-w-[720px] px-5 pt-10 pb-10 flex flex-col gap-5" aria-live="polite">
          <h1 className="a4p-entra m-0 text-[28px] text-ink">Criar conta</h1>
          {falas.map((f) =>
            f.de === "voce" ? (
              <div key={f.id} className="a4p-entra self-end flex items-center gap-2 max-w-[80%]">
                {f.resposta && f.resposta !== "senha" && !ocupado && etapa !== "confirme" && (
                  <button
                    type="button"
                    onClick={() => alterar(f.resposta!)}
                    aria-label={f.resposta === "empresa" ? "Alterar o nome da empresa" : "Alterar o e-mail"}
                    className="text-[13px] text-muted hover:text-ink underline-offset-2 hover:underline"
                  >
                    Alterar
                  </button>
                )}
                <div data-conversa="voce" className="a4p-bolha-usuario px-5 py-3 rounded-[24px] text-[15px] break-all">
                  {f.texto}
                </div>
              </div>
            ) : (
              <div key={f.id} className="a4p-entra self-start flex flex-col gap-3 max-w-[90%]" data-conversa="ia">
                <p role={f.alerta ? "alert" : undefined} className="m-0 text-[17px] leading-[1.5] text-ink">{f.texto}</p>
                {f.acoes && (
                  <div className="flex flex-wrap gap-2">
                    {f.acoes.map((a) =>
                      a.href ? (
                        <Link key={a.rotulo} href={a.href} className="inline-flex items-center gap-2 h-11 px-5 rounded-pill text-[15px] a4p-pilula">
                          {a.icone && <Icon name={a.icone} size={16} />}
                          {a.rotulo}
                        </Link>
                      ) : (
                        <button
                          key={a.rotulo}
                          type="button"
                          onClick={a.fazer}
                          disabled={etapa !== "erro"}
                          className="inline-flex items-center gap-2 h-11 px-5 rounded-pill text-[15px] a4p-pilula disabled:opacity-50"
                        >
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
          {digitando && (
            <span className="a4p-entra self-start inline-flex gap-1 py-2" aria-label={`${MARCA_IA} está escrevendo`}>
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="w-2 h-2 rounded-pill animate-pulse"
                  style={{ background: "var(--color-text-tertiary)", animationDelay: `${i * 150}ms` }}
                />
              ))}
            </span>
          )}
          {erroEmpresa && (
            <p id="erro-empresa" role="alert" className="a4p-entra m-0 self-start text-[17px] text-ink">
              {erroEmpresa} É ele que aparece no seu painel e nos relatórios.
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
          {passo === "senha" && <input type="email" name="email" autoComplete="username" value={email} readOnly hidden />}
          <input
            ref={campoRef}
            key={passo}
            name={passo ?? undefined}
            type={passo === "senha" && verSenha ? "text" : campo.tipo}
            autoComplete={campo.autoComplete}
            value={texto}
            onChange={(e) => { setTexto(e.target.value); if (erroEmpresa) setErroEmpresa(null); }}
            placeholder={campo.placeholder}
            aria-label={campo.rotulo}
            aria-invalid={erroEmpresa ? true : undefined}
            aria-describedby={erroEmpresa ? "erro-empresa" : undefined}
            disabled={digitando}
            className="a4p-ia-campo flex-1 min-w-0 pl-3 bg-transparent outline-none text-[15px] text-ink placeholder:text-muted"
          />
          {passo === "senha" && (
            <button
              type="button"
              onClick={() => setVerSenha((v) => !v)}
              aria-label={verSenha ? "Esconder a senha" : "Mostrar a senha"}
              aria-pressed={verSenha}
              className="w-9 h-9 flex-none rounded-pill flex items-center justify-center text-muted hover:text-ink"
            >
              <Icon name={verSenha ? "eye-off" : "eye"} size={18} />
            </button>
          )}
          <button
            type="submit"
            aria-label="Enviar resposta"
            disabled={digitando || (!texto.trim() && passo !== "empresa")}
            className="w-9 h-9 flex-none rounded-pill flex items-center justify-center disabled:opacity-50"
            style={{ background: "var(--erp-num-cor)", color: "var(--color-surface-1)" }}
          >
            <Icon name="arrow-up" size={18} />
          </button>
        </form>
      )}
    </div>
  );
}
