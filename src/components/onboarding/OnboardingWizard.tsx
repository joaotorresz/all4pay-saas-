"use client";

import * as React from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Card, Input, Select, Switch, Button, Icon } from "@/components/ui";
import { formatBRL } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import { analisarImportacao, amostraExtrato } from "@/core/fdip";
import { aplicarOnboarding } from "@/lib/fdip";
import { aplicarEstrutura } from "@/lib/onboarding";
import { calcularMaturidade, montarDNA, type PerfilEmpresa, type Participante, type Estrutura, type Maturidade, type DnaLinha } from "@/core/onboarding";
import type { FDIPReport } from "@/core/fdip/types";

const PASSOS = ["Dados básicos", "Perfil empresarial", "Governança", "Estrutura financeira", "Onboarding inteligente", "Análise IA", "Ambiente criado"];

const opt = (xs: string[]) => xs.map((x) => ({ value: x, label: x }));
const SETORES = ["Aviação", "Serviços", "Indústria", "Construção", "Tecnologia", "E-commerce", "Saúde", "Educação", "Financeiro", "Agronegócio", "Imobiliário", "Logística", "Outro"];
const MODELOS = ["B2B", "B2C", "Marketplace", "Assinatura", "Projeto", "Recorrência", "Financeira", "Holding", "SaaS"];
const RECEITAS = ["Venda de produto", "Venda de serviço", "Mensalidade", "Aluguel", "Intermediação", "Taxa", "Comissão", "Juros", "Receita financeira"];
const FREQ = ["Diária", "Semanal", "Mensal", "Sazonal", "Projeto"];
const FUNC = ["1-10", "11-50", "51-100", "101-500", "500+"];
const FAT = ["até R$ 360 mil", "R$ 360 mil – 4,8 mi", "R$ 4,8 – 20 mi", "R$ 20 – 50 mi", "R$ 50 mi+"];
const BANCOS = ["Itaú", "Bradesco", "Santander", "Banco do Brasil", "Caixa", "Nubank", "Inter", "C6", "BTG", "Sicoob", "Sicredi", "Mercado Pago"];
const MEIOS = ["PIX", "Boleto", "Cartão", "TED", "Dinheiro", "Link de pagamento", "Marketplace", "Internacional"];
const DESPESAS = ["Folha", "Impostos", "Aluguel", "Marketing", "Combustível", "Fornecedores", "Software", "Logística"];
const PORTES = ["MEI", "ME", "EPP", "LTDA", "SA", "Holding", "SPE", "Outro"];
const REGIMES = ["Simples Nacional", "Lucro Presumido", "Lucro Real", "Outro"];
const FUNCOES = ["Administrador", "CEO", "CFO", "Financeiro", "Tesouraria", "Controller", "Contador", "Jurídico", "Operador", "Auditor", "Conselheiro", "Investidor"];
const LIMITES = ["R$ 10 mil", "R$ 50 mil", "R$ 500 mil", "Sem limite"];
const CENTROS = ["Comercial", "Operações", "Administrativo", "Financeiro", "Marketing", "Logística"];
const UNIDADES = ["Matriz", "Filial", "Projeto", "Online", "Operação"];
const DRE_OPTS = ["Gerencial", "Financeiro", "Por centro de custo", "Por produto", "Por cliente", "Consolidado (holding)"];
const FLUXO_OPTS = ["Operacional", "Projetado", "Competência", "Híbrido"];

export function OnboardingWizard() {
  const router = useRouter();
  const [step, setStep] = React.useState(0);

  const [db, setDb] = React.useState({ razaoSocial: "", fantasia: "", cnpj: "", ie: "", im: "", fundacao: "", natureza: "", porte: "", repNome: "", repCpf: "", repCargo: "", repEmail: "", repTelefone: "", cep: "", rua: "", numero: "", cidade: "", estado: "", pais: "Brasil", regime: "", contribuinteIcms: false, exportadora: false });
  const [perfil, setPerfil] = React.useState<PerfilEmpresa>({ setor: "", modelo: "", receitaPrincipal: "", frequencia: "", funcionarios: "", faturamento: "", bancos: [], meiosRecebimento: [], despesas: [] });
  const [participantes, setParticipantes] = React.useState<Participante[]>([{ nome: "", funcao: "CFO", email: "", aprovaPagamentos: true, limite: "R$ 50 mil" }]);
  const [estrutura, setEstrutura] = React.useState<Estrutura>({ contas: [], centrosCusto: [], unidades: [], dre: ["Gerencial", "Por centro de custo"], fluxoCaixa: "Híbrido" });
  const [contaTipos, setContaTipos] = React.useState<string[]>([]);

  const [texto, setTexto] = React.useState("");
  const [report, setReport] = React.useState<FDIPReport | null>(null);
  const [maturidade, setMaturidade] = React.useState<Maturidade | null>(null);
  const [dna, setDna] = React.useState<DnaLinha[]>([]);
  const [aplicando, setAplicando] = React.useState(false);
  const [consultando, setConsultando] = React.useState(false);
  const [email, setEmail] = React.useState("");
  const [senha, setSenha] = React.useState("");
  const [erro, setErro] = React.useState<string | null>(null);

  const configured = !!process.env.NEXT_PUBLIC_SUPABASE_URL;
  const progress = Math.round(((step + 1) / PASSOS.length) * 100);

  // Estrutura.contas derivada dos tipos selecionados.
  React.useEffect(() => {
    setEstrutura((e) => ({ ...e, contas: contaTipos.map((t) => ({ banco: perfil.bancos[0] ?? "—", tipo: t })) }));
  }, [contaTipos, perfil.bancos]);

  // Ao chegar na Análise IA, computa maturidade + DNA.
  React.useEffect(() => {
    if (step === 5) {
      setMaturidade(calcularMaturidade(perfil, participantes, estrutura, report));
      setDna(montarDNA(perfil, db, report));
    }
    if (step === 6 && !email && db.repEmail) setEmail(db.repEmail);
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  const analisar = (t: string) => setReport(t.trim() ? analisarImportacao(t) : null);
  const consultarCnpj = async () => {
    const num = db.cnpj.replace(/\D/g, "");
    if (num.length !== 14) return;
    setConsultando(true);
    try {
      const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${num}`);
      if (res.ok) {
        const j = await res.json();
        setDb((d) => ({ ...d, razaoSocial: j.razao_social ?? d.razaoSocial, fantasia: j.nome_fantasia ?? d.fantasia, cidade: j.municipio ?? d.cidade, estado: j.uf ?? d.estado, rua: j.logradouro ?? d.rua, numero: j.numero ?? d.numero, cep: j.cep ?? d.cep }));
      }
    } catch {
      /* offline / bloqueado — segue manual (MVP) */
    } finally {
      setConsultando(false);
    }
  };

  /** Passo final: garante sessão (live), aplica os dados e entra no sistema. */
  const finalizar = async () => {
    setAplicando(true);
    setErro(null);
    try {
      // Em live a rota "/" exige login — autentica antes de entrar.
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
      try {
        localStorage.setItem("a4p_company", JSON.stringify({ db, perfil }));
      } catch { /* ignore */ }
      // Persiste as escolhas estruturais (contas/centros/unidades) — sem
      // duplicar o seed da org. Best-effort: não bloqueia a entrada no sistema.
      if (configured) {
        try { await aplicarEstrutura(estrutura); } catch { /* segue */ }
      }
      if (report) await aplicarOnboarding(report); // cria/correlaciona (agora autenticado em live)
      router.push("/");
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível concluir.");
      setAplicando(false);
    }
  };

  const next = () => {
    if (step < PASSOS.length - 1) setStep(step + 1);
  };
  const back = () => step > 0 && setStep(step - 1);

  return (
    <div className="min-h-screen bg-surface-1 flex flex-col items-center px-4 py-8">
      <div className="w-full max-w-3xl flex flex-col gap-5">
        {/* Cabeçalho + progresso */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <Image src="/all4pay-dark.png" alt="all4pay" width={110} height={22} className="h-[22px] w-auto" priority />
            <span className="text-caption text-faint">Tempo estimado: 5–10 min</span>
          </div>
          <div>
            <div className="flex items-baseline justify-between">
              <span className="text-h3 font-medium text-ink">Criar empresa</span>
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
            <p className="m-0 text-caption text-muted mt-2">Nossa IA configurará seu ambiente financeiro a partir destas informações.</p>
          </div>
        </div>

        <Card className="flex flex-col gap-4">
          {step === 0 && <PassoDados db={db} setDb={setDb} consultarCnpj={consultarCnpj} consultando={consultando} />}
          {step === 1 && <PassoPerfil perfil={perfil} setPerfil={setPerfil} />}
          {step === 2 && <PassoGovernanca participantes={participantes} setParticipantes={setParticipantes} />}
          {step === 3 && <PassoEstrutura estrutura={estrutura} setEstrutura={setEstrutura} contaTipos={contaTipos} setContaTipos={setContaTipos} />}
          {step === 4 && <PassoImport texto={texto} setTexto={setTexto} report={report} analisar={analisar} carregarAmostra={() => { const a = amostraExtrato(); setTexto(a); analisar(a); }} />}
          {step === 5 && <PassoAnalise maturidade={maturidade} dna={dna} />}
          {step === 6 && <PassoAmbiente report={report} configured={configured} email={email} setEmail={setEmail} senha={senha} setSenha={setSenha} erro={erro} />}
        </Card>

        {/* Navegação */}
        <div className="flex items-center justify-between">
          <Button variant="ghost" onClick={back} disabled={step === 0 || aplicando}>Voltar</Button>
          {step < PASSOS.length - 1 ? (
            <Button variant="primary" onClick={next}>{step === 4 && !report ? "Pular e continuar" : "Próximo"}</Button>
          ) : (
            <Button variant="primary" onClick={finalizar} disabled={aplicando}>
              {aplicando ? "Entrando…" : "Concluir e entrar"}
            </Button>
          )}
        </div>
        <p className="text-center text-caption text-faint">MVP em teste — você pode avançar com campos em branco.</p>
      </div>
    </div>
  );
}

/* ---------- helpers ---------- */
function ChipMulti({ options, value, onChange }: { options: string[]; value: string[]; onChange: (v: string[]) => void }) {
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
function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-label font-medium text-muted">{label}</span>
      {children}
    </div>
  );
}
function Sub({ children }: { children: React.ReactNode }) {
  return <span className="text-caption font-medium text-faint uppercase tracking-wide">{children}</span>;
}

/* ---------- passos ---------- */
function PassoDados({ db, setDb, consultarCnpj, consultando }: any) {
  const set = (k: string, v: any) => setDb((d: any) => ({ ...d, [k]: v }));
  return (
    <>
      <Sub>Dados jurídicos</Sub>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2 flex gap-2 items-end">
          <Input label="CNPJ" value={db.cnpj} onChange={(e) => set("cnpj", e.target.value)} placeholder="00.000.000/0000-00" containerClassName="flex-1" />
          <Button variant="secondary" onClick={consultarCnpj} disabled={consultando}>{consultando ? "Consultando…" : "Consultar CNPJ"}</Button>
        </div>
        <Input label="Razão social" value={db.razaoSocial} onChange={(e) => set("razaoSocial", e.target.value)} />
        <Input label="Nome fantasia" value={db.fantasia} onChange={(e) => set("fantasia", e.target.value)} />
        <Input label="Inscrição estadual" value={db.ie} onChange={(e) => set("ie", e.target.value)} />
        <Input label="Inscrição municipal" value={db.im} onChange={(e) => set("im", e.target.value)} />
        <Input label="Data de fundação" type="date" value={db.fundacao} onChange={(e) => set("fundacao", e.target.value)} />
        <Select label="Porte / natureza" value={db.porte} onChange={(v) => set("porte", v)} options={opt(PORTES)} placeholder="Selecione" />
      </div>
      <Sub>Representante</Sub>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Input label="Nome" value={db.repNome} onChange={(e) => set("repNome", e.target.value)} />
        <Input label="Cargo" value={db.repCargo} onChange={(e) => set("repCargo", e.target.value)} />
        <Input label="E-mail" value={db.repEmail} onChange={(e) => set("repEmail", e.target.value)} />
        <Input label="Telefone / WhatsApp" value={db.repTelefone} onChange={(e) => set("repTelefone", e.target.value)} />
      </div>
      <Sub>Endereço & fiscal</Sub>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Input label="CEP" value={db.cep} onChange={(e) => set("cep", e.target.value)} />
        <Input label="Cidade" value={db.cidade} onChange={(e) => set("cidade", e.target.value)} containerClassName="sm:col-span-2" />
        <Input label="UF" value={db.estado} onChange={(e) => set("estado", e.target.value)} />
      </div>
      <Select label="Regime tributário" value={db.regime} onChange={(v) => set("regime", v)} options={opt(REGIMES)} placeholder="Selecione" />
      <div className="flex gap-6">
        <div className="flex items-center gap-2"><Switch checked={db.contribuinteIcms} onChange={(v) => set("contribuinteIcms", v)} /><span className="text-label text-muted">Contribuinte ICMS</span></div>
        <div className="flex items-center gap-2"><Switch checked={db.exportadora} onChange={(v) => set("exportadora", v)} /><span className="text-label text-muted">Exportadora</span></div>
      </div>
    </>
  );
}

function PassoPerfil({ perfil, setPerfil }: { perfil: PerfilEmpresa; setPerfil: (f: (p: PerfilEmpresa) => PerfilEmpresa) => void }) {
  const set = (k: keyof PerfilEmpresa, v: any) => setPerfil((p) => ({ ...p, [k]: v }));
  return (
    <>
      <p className="m-0 text-caption text-muted">Esta etapa é o que mais ajuda a IA a entender o seu negócio.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Select label="Setor" value={perfil.setor} onChange={(v) => set("setor", v)} options={opt(SETORES)} placeholder="Selecione" />
        <Select label="Modelo de negócio" value={perfil.modelo} onChange={(v) => set("modelo", v)} options={opt(MODELOS)} placeholder="Selecione" />
        <Select label="Receita principal" value={perfil.receitaPrincipal} onChange={(v) => set("receitaPrincipal", v)} options={opt(RECEITAS)} placeholder="Selecione" />
        <Select label="Frequência" value={perfil.frequencia} onChange={(v) => set("frequencia", v)} options={opt(FREQ)} placeholder="Selecione" />
        <Select label="Funcionários" value={perfil.funcionarios} onChange={(v) => set("funcionarios", v)} options={opt(FUNC)} placeholder="Selecione" />
        <Select label="Faturamento anual" value={perfil.faturamento} onChange={(v) => set("faturamento", v)} options={opt(FAT)} placeholder="Selecione" />
      </div>
      <Campo label="Bancos utilizados"><ChipMulti options={BANCOS} value={perfil.bancos} onChange={(v) => set("bancos", v)} /></Campo>
      <Campo label="Meios de recebimento"><ChipMulti options={MEIOS} value={perfil.meiosRecebimento} onChange={(v) => set("meiosRecebimento", v)} /></Campo>
      <Campo label="Principais despesas"><ChipMulti options={DESPESAS} value={perfil.despesas} onChange={(v) => set("despesas", v)} /></Campo>
    </>
  );
}

function PassoGovernanca({ participantes, setParticipantes }: { participantes: Participante[]; setParticipantes: (f: Participante[] | ((p: Participante[]) => Participante[])) => void }) {
  const upd = (i: number, k: keyof Participante, v: any) => setParticipantes((ps) => ps.map((p, j) => (j === i ? { ...p, [k]: v } : p)));
  const add = () => setParticipantes((ps) => [...ps, { nome: "", funcao: "Financeiro", email: "", aprovaPagamentos: false, limite: "R$ 10 mil" }]);
  const rem = (i: number) => setParticipantes((ps) => ps.filter((_, j) => j !== i));
  return (
    <>
      <p className="m-0 text-caption text-muted">Quem decide, quem opera, quem aprova — a IA usa isto para RBAC, aprovações e alertas.</p>
      {participantes.map((p, i) => (
        <div key={i} className="rounded-md border border-border-soft p-3 flex flex-col gap-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label="Nome" value={p.nome} onChange={(e) => upd(i, "nome", e.target.value)} />
            <Select label="Função" value={p.funcao} onChange={(v) => upd(i, "funcao", v)} options={opt(FUNCOES)} />
            <Input label="E-mail" value={p.email} onChange={(e) => upd(i, "email", e.target.value)} />
            <Select label="Limite de aprovação" value={p.limite} onChange={(v) => upd(i, "limite", v)} options={opt(LIMITES)} />
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2"><Switch checked={p.aprovaPagamentos} onChange={(v) => upd(i, "aprovaPagamentos", v)} /><span className="text-label text-muted">Pode aprovar pagamentos</span></div>
            {participantes.length > 1 && <button onClick={() => rem(i)} className="text-caption text-negative hover:underline">Remover</button>}
          </div>
        </div>
      ))}
      <Button variant="secondary" onClick={add} leftIcon={<Icon name="plus" size={15} />}>Adicionar pessoa</Button>
    </>
  );
}

function PassoEstrutura({ estrutura, setEstrutura, contaTipos, setContaTipos }: any) {
  const set = (k: keyof Estrutura, v: any) => setEstrutura((e: Estrutura) => ({ ...e, [k]: v }));
  return (
    <>
      <p className="m-0 text-caption text-muted">Substitui dezenas de configurações manuais — a IA pode sugerir o resto.</p>
      <Campo label="Tipos de conta"><ChipMulti options={["Operacional", "Folha", "Reserva", "Investimento"]} value={contaTipos} onChange={setContaTipos} /></Campo>
      <Campo label="Centros de custo (ou deixe a IA sugerir)"><ChipMulti options={CENTROS} value={estrutura.centrosCusto} onChange={(v) => set("centrosCusto", v)} /></Campo>
      <Campo label="Unidades de negócio"><ChipMulti options={UNIDADES} value={estrutura.unidades} onChange={(v) => set("unidades", v)} /></Campo>
      <Campo label="DRE desejado"><ChipMulti options={DRE_OPTS} value={estrutura.dre} onChange={(v) => set("dre", v)} /></Campo>
      <Select label="Fluxo de caixa" value={estrutura.fluxoCaixa} onChange={(v) => set("fluxoCaixa", v)} options={opt(FLUXO_OPTS)} />
    </>
  );
}

function PassoImport({ texto, setTexto, report, analisar, carregarAmostra }: any) {
  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const t = await f.text();
    setTexto(t);
    analisar(t);
  };
  return (
    <>
      <p className="m-0 text-caption text-muted">Faça upload de extratos (CSV/OFX) e a IA descobre clientes, fornecedores, recorrências e categorias. Opcional no MVP.</p>
      <textarea value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Cole um extrato (data;descrição;valor) ou carregue um arquivo / a amostra." className="w-full h-24 rounded-md border border-border bg-white p-3 text-caption text-ink font-mono outline-none focus:border-faint resize-y" />
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" onClick={() => analisar(texto)} disabled={!texto.trim()}>Analisar</Button>
        <Button variant="secondary" onClick={carregarAmostra}>Carregar amostra</Button>
        <label className="text-label font-medium text-ink border border-border rounded-md px-3 py-2 cursor-pointer hover:bg-surface-2">Carregar arquivo<input type="file" accept=".csv,.ofx,.txt,text/*" onChange={onFile} className="hidden" /></label>
        <a href="/exemplos/extrato-exemplo-all4pay.csv" download className="text-label font-medium text-muted underline ml-auto self-center">Baixar exemplo</a>
      </div>
      {report && (
        <div className="rounded-md bg-surface-1 p-3 text-caption text-muted">
          Análise: {report.confidence.lidos} lançamentos · {report.plano.clientes} clientes · {report.plano.fornecedores} fornecedores · {report.padroes.recorrencias.length} recorrências · {report.plano.categorias.length} categorias.
        </div>
      )}
    </>
  );
}

function PassoAnalise({ maturidade, dna }: { maturidade: Maturidade | null; dna: DnaLinha[] }) {
  if (!maturidade) return <p className="m-0 text-muted">Calculando…</p>;
  const cor = maturidade.score >= 70 ? "var(--color-positive)" : maturidade.score >= 45 ? "var(--color-warning)" : "var(--color-negative)";
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <span className="w-[26px] h-[26px] rounded-sm bg-lime inline-flex items-center justify-center"><Icon name="sparkles" size={14} color="var(--color-ink)" /></span>
        <span className="text-label font-medium text-muted">Análise da IA · DNA financeiro</span>
      </div>
      {/* DNA */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-5 gap-y-3">
        {dna.map((l) => (
          <div key={l.label} className="flex flex-col"><span className="text-caption text-faint">{l.label}</span><span className="text-[14px] font-medium text-ink">{l.valor}</span></div>
        ))}
      </div>
      {/* Maturity */}
      <div className="rounded-md border border-border-soft p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="text-label font-medium text-muted">Financial Maturity Score</span>
          <span className="text-value-lg leading-none font-medium tabular-nums" style={{ color: cor }}>{maturidade.score}<span className="text-h3 text-faint">/100</span></span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
          <div>
            <span className="text-caption font-medium text-positive">Pontos fortes</span>
            {maturidade.fortes.length ? maturidade.fortes.map((f, i) => <div key={i} className="text-caption text-muted">✓ {f}</div>) : <div className="text-caption text-faint">—</div>}
          </div>
          <div>
            <span className="text-caption font-medium text-warning">Pontos de atenção</span>
            {maturidade.atencao.length ? maturidade.atencao.map((a, i) => <div key={i} className="text-caption text-muted">⚠ {a}</div>) : <div className="text-caption text-faint">—</div>}
          </div>
        </div>
        {maturidade.recomendacoes.length > 0 && (
          <div>
            <span className="text-caption font-medium text-faint uppercase tracking-wide">Recomendações</span>
            <ul className="m-0 pl-4 mt-1">{maturidade.recomendacoes.map((r, i) => <li key={i} className="text-caption text-muted">{r}</li>)}</ul>
          </div>
        )}
      </div>
    </div>
  );
}

const CRIADOS = ["Empresa", "Usuários & governança", "Bancos & contas", "Plano de contas", "Centros de custo", "Clientes", "Fornecedores", "Produtos & serviços", "DRE", "Fluxo de caixa", "KPIs & dashboard", "Alertas & políticas", "Motor de risco", "Copiloto financeiro"];
function PassoAmbiente({ report, configured, email, setEmail, senha, setSenha, erro }: any) {
  return (
    <div className="flex flex-col gap-4">
      <p className="m-0 text-body text-ink">Tudo pronto. Ao concluir, a IA monta seu ambiente financeiro e você entra direto no sistema.</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-5 gap-y-2">
        {CRIADOS.map((c) => (
          <span key={c} className="inline-flex items-center gap-2 text-caption text-muted">
            <Icon name="check" size={14} color="var(--color-positive)" />{c}
          </span>
        ))}
      </div>

      {configured && (
        <div className="rounded-md border border-border-soft p-3 flex flex-col gap-3">
          <span className="text-caption font-medium text-faint uppercase tracking-wide">Criar acesso</span>
          <p className="m-0 text-caption text-muted">Defina e-mail e senha para acessar depois. (No MVP você pode deixar em branco e entrar agora.)</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label="E-mail" type="email" value={email} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)} placeholder="voce@empresa.com" />
            <Input label="Senha" type="password" value={senha} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSenha(e.target.value)} placeholder="••••••••" />
          </div>
        </div>
      )}

      {report ? (
        <p className="m-0 text-caption text-faint">Importação pronta — {report.confidence.lidos} lançamentos serão aplicados e refletidos em todo o sistema ao concluir.</p>
      ) : (
        <p className="m-0 text-caption text-faint">Sem importação — o ambiente base será criado e você poderá importar dados depois em Onboarding inteligente.</p>
      )}

      {erro && <p className="m-0 text-caption text-negative">{erro}</p>}
    </div>
  );
}
