"use client";

/**
 * CADASTRO EM TRÊS CAMPOS — a porta de entrada do produto.
 *
 * ⚠️ **O que isto substitui, e por quê.** A entrada era um wizard de SETE
 * etapas que anunciava "5–10 min" e pedia CNPJ, razão social, inscrição
 * estadual, inscrição municipal, data de fundação, porte e representante ANTES
 * de entregar qualquer coisa — a senha só na etapa 7. Pedia tudo antes de dar
 * nada.
 *
 * E isso explicou um defeito que atravessou dois meses sem ser visto: o botão
 * final travava em "Entrando…" e ninguém tinha reportado, porque **ninguém
 * chegava na etapa 7**. Um formulário longo demais não perde o cadastro no
 * fim; ele o perde no meio, e o defeito do fim nunca é encontrado.
 *
 * Aqui são três campos e uma tela. O resto — regime, CNPJ, inscrições, porte,
 * governança — vira convite DENTRO do app, depois de a pessoa já ter visto o
 * produto funcionando com os dados dela.
 *
 * ⚠️ O wizard completo não morreu: continua em `/comecar` para quem quiser
 * cadastrar a empresa inteira de uma vez. O que mudou é que ele deixou de ser
 * a única porta.
 */

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MolduraPublica } from "@/components/app/MolduraPublica";
import { Button, Card, Input } from "@/components/ui";
import { criarContaEEntrar } from "@/lib/entrada";
import { loadCompany, saveCompany } from "@/lib/company";

export function CriarContaView() {
  const router = useRouter();
  const [email, setEmail] = React.useState("");
  const [senha, setSenha] = React.useState("");
  const [empresa, setEmpresa] = React.useState("");
  const [enviando, setEnviando] = React.useState(false);
  const [erro, setErro] = React.useState<{ motivo: string; comoResolver?: string } | null>(null);
  const [confirme, setConfirme] = React.useState(false);
  /*
   * ⚠️ **O NOME VAZIO É RECUSADO NO CAMPO, não resolvido em silêncio.** O
   * gatilho tem um último recurso ("Minha empresa") para o caso de uma porta
   * de cadastro que não mande nada; ele existe para não derrubar o signup,
   * NÃO para ser o caminho normal. Se a pessoa está olhando o campo, quem
   * responde "qual é o nome" é ela — cair no recurso aqui seria escolher um
   * nome por ela e não contar.
   */
  const [erroEmpresa, setErroEmpresa] = React.useState<string | null>(null);

  const podeEnviar = email.trim().length > 3 && senha.length >= 6 && empresa.trim().length > 0;

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (enviando) return;
    const nomeEmpresa = empresa.trim();
    if (!nomeEmpresa) {
      setErroEmpresa("Informe o nome da empresa.");
      return;
    }
    setErroEmpresa(null);
    if (!podeEnviar) return;
    setEnviando(true);
    setErro(null);
    try {
      // ⚠️ O nome da empresa é guardado ANTES de criar a conta. Se a criação
      // parar na confirmação de e-mail, o nome já está aqui e a pessoa não
      // digita de novo ao voltar — é a metade que não depende de sessão.
      saveCompany({ ...(loadCompany() ?? {}), db: { ...(loadCompany()?.db ?? {}), razaoSocial: nomeEmpresa, tipoConta: "empresa" } });
      const r = await criarContaEEntrar(email, senha, nomeEmpresa);
      if (r.ok) { router.push("/"); router.refresh(); return; }
      if (r.confirmarEmail) { setConfirme(true); return; }
      setErro({ motivo: r.motivo, comoResolver: r.comoResolver });
    } finally {
      // ⚠️ **SEMPRE.** Era exatamente isto que faltava no wizard: numa recusa
      // ou numa rede ruim, o botão ficava em "Entrando…" para sempre, e um
      // botão que gira sem fim é indistinguível de um sistema quebrado.
      setEnviando(false);
    }
  };

  if (confirme) {
    return (
      <MolduraPublica>
        <div className="min-h-full flex items-center justify-center px-4 py-10">
          <Card className="w-full max-w-[420px] flex flex-col gap-3">
            <h1 className="text-h3 m-0 text-ink">Confirme seu e-mail</h1>
            <p className="m-0 text-body text-muted">
              A conta de <span className="text-ink font-medium">{email.trim()}</span> foi criada.
              Abra o link que enviamos para entrar.
            </p>
            <p className="m-0 text-caption text-faint">
              O nome da empresa já ficou guardado — ao entrar, ele aparece preenchido.
            </p>
            <Link href="/login" className="text-caption font-medium text-ink underline">Já confirmei, quero entrar</Link>
          </Card>
        </div>
      </MolduraPublica>
    );
  }

  return (
    <MolduraPublica>
      <div className="min-h-full flex items-center justify-center px-4 py-10">
        <form onSubmit={enviar} className="w-full max-w-[420px] flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="text-h2 m-0 text-ink">Criar conta</h1>
            <p className="m-0 text-body text-muted">
              Três campos e você já está dentro. O resto do cadastro fica para depois,
              quando você já tiver visto o sistema com os seus números.
            </p>
          </div>

          <Card className="flex flex-col gap-4">
            <Input
              label="E-mail" type="email" autoComplete="email" required
              value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="voce@suaempresa.com.br"
            />
            <Input
              label="Senha" type="password" autoComplete="new-password" required
              value={senha} onChange={(e) => setSenha(e.target.value)}
              placeholder="pelo menos 6 caracteres"
            />
            <Input
              label="Nome da empresa" required
              value={empresa}
              onChange={(e) => { setEmpresa(e.target.value); if (erroEmpresa) setErroEmpresa(null); }}
              placeholder="Como você chama o seu negócio"
              aria-invalid={erroEmpresa ? true : undefined}
              aria-describedby={erroEmpresa ? "erro-empresa" : undefined}
            />
            {erroEmpresa && (
              <span id="erro-empresa" role="alert" className="-mt-2 text-caption" style={{ color: "var(--color-negative)" }}>
                {erroEmpresa}
              </span>
            )}

            {erro && (
              <div
                role="alert"
                className="rounded-md p-3 flex flex-col gap-[2px]"
                style={{ background: "var(--color-surface-2)", borderLeft: "3px solid var(--color-negative)" }}
              >
                <span className="text-label font-medium text-ink">{erro.motivo}</span>
                {erro.comoResolver && <span className="text-caption text-muted">{erro.comoResolver}</span>}
              </div>
            )}

            <Button type="submit" variant="primary" disabled={!podeEnviar || enviando}>
              {enviando ? "Criando…" : "Criar conta e entrar"}
            </Button>
          </Card>

          <div className="flex items-center justify-between">
            <Link href="/login" className="text-caption font-medium text-muted hover:text-ink">Já tenho conta</Link>
            {/* O wizard completo continua acessível para quem prefere cadastrar tudo de uma vez. */}
            <Link href="/comecar" className="text-caption font-medium text-muted hover:text-ink">Cadastrar a empresa inteira</Link>
          </div>
        </form>
      </div>
    </MolduraPublica>
  );
}
