"use client";

/**
 * Cadastro Pessoa Física — o onboarding enxuto (3 passos) do app de finanças
 * pessoais. Reaproveita TODA a infraestrutura: o que a pessoa informa vira o
 * mesmo `StoredCompany` (mapeado para perfil/estrutura) que alimenta saldo,
 * gastos, contas e os motores — só que numa roupa simples de controle do dia a
 * dia. Demo-safe; em live cria a sessão e persiste a estrutura (carteiras).
 */
import * as React from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Card, Input, Button, CurrencyInput, Icon } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import { persistCompany, type StoredCompany } from "@/lib/company";
import { aplicarEstrutura } from "@/lib/onboarding";
import { setTipoConta } from "@/components/app/useTipoConta";
import type { Estrutura, PerfilEmpresa } from "@/core/onboarding";

const PASSOS = ["Você", "Contas & renda", "Gastos do dia a dia", "Tudo pronto"];

const CARTEIRAS = ["Conta corrente", "Poupança", "Carteira / Dinheiro", "Nubank", "Inter", "Cartão de crédito", "Vale-refeição", "Investimentos"];
const CATEGORIAS = ["Moradia", "Mercado", "Alimentação", "Transporte", "Contas (água/luz/internet)", "Saúde", "Educação", "Lazer", "Assinaturas", "Compras", "Pets", "Outros"];

export function OnboardingPessoal({ onTrocarTipo }: { onTrocarTipo: () => void }) {
  const router = useRouter();
  const [step, setStep] = React.useState(0);
  const configured = !!process.env.NEXT_PUBLIC_SUPABASE_URL;

  const [nome, setNome] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [senha, setSenha] = React.useState("");
  const [rendaMensal, setRendaMensal] = React.useState(0);
  const [saldoInicial, setSaldoInicial] = React.useState(0);
  const [carteiras, setCarteiras] = React.useState<string[]>(["Conta corrente"]);
  const [categorias, setCategorias] = React.useState<string[]>(["Moradia", "Mercado", "Transporte", "Lazer"]);
  const [orcamento, setOrcamento] = React.useState(0);
  const [aplicando, setAplicando] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);

  const progress = Math.round(((step + 1) / PASSOS.length) * 100);
  const next = () => step < PASSOS.length - 1 && setStep(step + 1);
  const back = () => step > 0 && setStep(step - 1);

  /** Monta o StoredCompany do PF a partir do que foi informado. */
  const montarPerfil = (): StoredCompany => {
    const perfil: PerfilEmpresa = {
      setor: "Pessoal", modelo: "B2C", receitaPrincipal: "Salário", frequencia: "Mensal",
      funcionarios: "1-10", faturamento: "", bancos: carteiras, meiosRecebimento: ["PIX"], despesas: categorias,
    };
    const estrutura: Estrutura = {
      contas: carteiras.map((c) => ({ banco: c, tipo: "Operacional" })),
      centrosCusto: [], unidades: [], dre: ["Gerencial"], fluxoCaixa: "Operacional",
    };
    const primeiro = nome.trim() || "Você";
    return {
      db: { tipoConta: "pessoal", repNome: primeiro, repEmail: email.trim(), razaoSocial: primeiro, fantasia: primeiro },
      perfil,
      estrutura,
      pessoal: { nome: primeiro, rendaMensal, saldoInicial, orcamentoMensal: orcamento, carteiras, categoriasGasto: categorias },
    };
  };

  const finalizar = async () => {
    setAplicando(true);
    setErro(null);
    try {
      setTipoConta("pessoal");
      if (configured) {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          if (email.trim() && senha.trim()) {
            const { error } = await supabase.auth.signUp({ email: email.trim(), password: senha.trim() });
            if (error) throw new Error(error.message);
          } else {
            const { error } = await supabase.auth.signInAnonymously();
            if (error) throw new Error("Para entrar, informe e-mail e senha (ou habilite acesso anônimo no Supabase).");
          }
        }
      }
      const company = montarPerfil();
      try { await persistCompany(company); } catch { /* segue */ }
      if (configured) { try { await aplicarEstrutura(company.estrutura!); } catch { /* segue */ } }
      router.push("/");
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível concluir.");
      setAplicando(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface-1 flex flex-col items-center px-4 py-8">
      <div className="w-full max-w-xl flex flex-col gap-5">
        {/* Cabeçalho + progresso */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <Image src="/all4pay-dark.png" alt="all4pay" width={110} height={22} className="h-[22px] w-auto dark:hidden" priority />
            <Image src="/all4pay-lime.png" alt="all4pay" width={110} height={22} className="h-[22px] w-auto hidden dark:block" priority />
            <button onClick={onTrocarTipo} className="text-caption text-muted hover:text-ink underline">Sou empresa</button>
          </div>
          <div>
            <div className="flex items-baseline justify-between">
              <span className="text-h3 font-medium text-ink">Criar conta pessoal</span>
              <span className="text-label font-medium tabular-nums text-ink">{progress}%</span>
            </div>
            <div className="h-2 rounded-pill bg-surface-2 overflow-hidden mt-2">
              <div className="h-full rounded-pill bg-ink transition-all duration-300" style={{ width: `${progress}%` }} />
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
              {PASSOS.map((p, i) => (
                <span key={p} className={`text-caption ${i === step ? "text-ink font-medium" : i < step ? "text-positive" : "text-faint"}`}>
                  {i < step ? "✓ " : ""}{i + 1}. {p}
                </span>
              ))}
            </div>
            <p className="m-0 text-caption text-muted mt-2">Controle seus gastos do dia a dia, sem complicação.</p>
          </div>
        </div>

        <Card className="flex flex-col gap-4">
          {step === 0 && (
            <>
              <p className="m-0 text-caption text-muted">Comece com o básico. Leva menos de 2 minutos.</p>
              <Input label="Como podemos te chamar?" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Seu nome" />
              {configured && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Input label="E-mail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@email.com" />
                  <Input label="Senha" type="password" value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="••••••••" />
                </div>
              )}
            </>
          )}

          {step === 1 && (
            <>
              <p className="m-0 text-caption text-muted">Onde seu dinheiro fica e quanto entra por mês.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <CurrencyInput label="Renda mensal" value={rendaMensal} onValueChange={setRendaMensal} />
                <CurrencyInput label="Saldo atual (opcional)" value={saldoInicial} onValueChange={setSaldoInicial} />
              </div>
              <Campo label="Onde você guarda seu dinheiro">
                <Chips options={CARTEIRAS} value={carteiras} onChange={setCarteiras} />
              </Campo>
            </>
          )}

          {step === 2 && (
            <>
              <p className="m-0 text-caption text-muted">No que você costuma gastar? Escolha as categorias do seu dia a dia.</p>
              <Campo label="Categorias de gasto">
                <Chips options={CATEGORIAS} value={categorias} onChange={setCategorias} />
              </Campo>
              <CurrencyInput label="Quanto quer gastar por mês? (orçamento opcional)" value={orcamento} onValueChange={setOrcamento} />
            </>
          )}

          {step === 3 && (
            <div className="flex flex-col gap-4">
              <p className="m-0 text-body text-ink">Tudo pronto, {nome.trim() || "tudo certo"}! Montamos seu painel pessoal de gastos.</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-5 gap-y-2">
                {["Resumo do mês", "Meus gastos", "Minhas receitas", "Contas & carteiras", "Orçamento & metas", "Para onde foi o dinheiro"].map((c) => (
                  <span key={c} className="inline-flex items-center gap-2 text-caption text-muted">
                    <Icon name="check" size={14} color="var(--color-positive)" />{c}
                  </span>
                ))}
              </div>
              <p className="m-0 text-caption text-faint">
                Você pode importar o extrato do banco depois em Contas &amp; carteiras — categorizamos seus gastos automaticamente.
              </p>
              {erro && <p className="m-0 text-caption text-negative">{erro}</p>}
            </div>
          )}
        </Card>

        <div className="flex items-center justify-between">
          <Button variant="ghost" onClick={back} disabled={step === 0 || aplicando}>Voltar</Button>
          {step < PASSOS.length - 1 ? (
            <Button variant="primary" onClick={next}>Próximo</Button>
          ) : (
            <Button variant="primary" onClick={finalizar} disabled={aplicando}>{aplicando ? "Entrando…" : "Concluir e entrar"}</Button>
          )}
        </div>
        <p className="text-center text-caption text-faint">Pode avançar com campos em branco — dá para ajustar tudo depois.</p>
      </div>
    </div>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-label font-medium text-muted">{label}</span>
      {children}
    </div>
  );
}
function Chips({ options, value, onChange }: { options: string[]; value: string[]; onChange: (v: string[]) => void }) {
  const toggle = (o: string) => onChange(value.includes(o) ? value.filter((x) => x !== o) : [...value, o]);
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = value.includes(o);
        return (
          <button key={o} onClick={() => toggle(o)} className={`text-caption font-medium rounded-pill px-3 py-1 border ${on ? "bg-ink text-white border-ink" : "bg-white text-muted border-border hover:text-ink"}`}>
            {o}
          </button>
        );
      })}
    </div>
  );
}
