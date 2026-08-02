"use client";

/**
 * Home do dashboard — a tela de boas-vindas que dá contexto antes do número.
 *
 * Três camadas, na ordem em que a pessoa lê:
 *  1. QUEM/QUANDO — data por extenso, saudação pelo horário e a empresa ativa
 *     (razão social + CNPJ), para não restar dúvida de qual contexto está aberto;
 *  2. UM EMPURRÃO — frase rotativa (muda por dia, não a cada render: piscar a
 *     cada navegação seria ruído);
 *  3. PARA ONDE IR — dois atalhos principais + o bloco "Acesso rápido"
 *     configurável.
 *
 * Estrutura e conteúdo replicam a referência; a PINTURA segue o nosso design
 * system (sem emoji — o glifo carrega o sentido; botões no padrão da casa).
 */
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, Button, Icon, Checkbox } from "@/components/ui";
import { loadCompany } from "@/lib/company";

/** Atalhos oferecidos no "Acesso rápido" — o usuário escolhe quais aparecem. */
interface Atalho {
  id: string;
  label: string;
  href: string;
  icon: string;
}
const ATALHOS: Atalho[] = [
  { id: "financeiro", label: "Financeiro", href: "/fluxo-caixa", icon: "trending-up" },
  { id: "vendas", label: "Vendas", href: "/vendas", icon: "credit-card" },
  { id: "pagar", label: "Contas a Pagar", href: "/pagamentos", icon: "arrow-up-right" },
  { id: "receber", label: "Contas a Receber", href: "/recebimentos", icon: "arrow-left-right" },
  { id: "dre", label: "DRE", href: "/dre", icon: "receipt" },
  { id: "fluxo", label: "Fluxo de Caixa", href: "/fluxo-caixa", icon: "arrow-left-right" },
];
const PADRAO = ATALHOS.map((a) => a.id);
const CHAVE_ATALHOS = "a4p_atalhos_home";

/** Frases do rodapé da saudação. Trocam por DIA, não a cada render. */
const FRASES = [
  "Controle financeiro não é sobre cortar — é sobre escolher melhor.",
  "O caixa não mente: ele só chega antes da sua opinião.",
  "Todo número que você acompanha vira uma decisão mais barata.",
  "Quem sabe o que entra e o que sai negocia melhor.",
  "Previsão não elimina o susto — só te dá tempo de reagir.",
  "Margem se defende no detalhe, não no discurso.",
  "O melhor momento para olhar o caixa é antes de precisar.",
];

const DIAS = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

/** Saudação pelo horário local — o ícone acompanha (manhã/tarde/noite). */
function saudacaoDe(h: number): { texto: string; icone: string } {
  if (h < 12) return { texto: "Bom dia", icone: "sun" };
  if (h < 18) return { texto: "Boa tarde", icone: "sun" };
  return { texto: "Boa noite", icone: "moon" };
}

/** CNPJ cru → 34.568.449/0001-72 (só quando tem os 14 dígitos). */
const formatarCNPJ = (s: string): string => {
  const d = (s || "").replace(/\D/g, "");
  if (d.length !== 14) return s || "";
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
};

export function DashboardHome() {
  const router = useRouter();
  const [agora, setAgora] = React.useState<Date | null>(null);
  const [empresa, setEmpresa] = React.useState<{ nome: string; doc: string }>({ nome: "", doc: "" });
  const [ligados, setLigados] = React.useState<string[]>(PADRAO);
  const [configurando, setConfigurando] = React.useState(false);

  // A data só é lida no cliente — no servidor o fuso seria o do datacenter.
  React.useEffect(() => {
    setAgora(new Date());
    const c = loadCompany();
    const db = c?.db ?? {};
    setEmpresa({
      nome: String(db.nomeFantasia || db.razaoSocial || "sua empresa"),
      doc: String(db.documento || db.cnpj || ""),
    });
    try {
      const s = localStorage.getItem(CHAVE_ATALHOS);
      if (s) setLigados(JSON.parse(s) as string[]);
    } catch { /* mantém o padrão */ }
  }, []);

  const salvarAtalhos = (ids: string[]) => {
    setLigados(ids);
    try { localStorage.setItem(CHAVE_ATALHOS, JSON.stringify(ids)); } catch { /* ignore */ }
  };
  const alternar = (id: string) =>
    salvarAtalhos(ligados.includes(id) ? ligados.filter((x) => x !== id) : [...ligados, id]);

  const primeiroNome = React.useMemo(() => {
    const c = loadCompany();
    const n = String(c?.db?.representanteNome || c?.pessoal?.nome || "");
    return n.trim().split(/\s+/)[0] || "";
  }, []);

  if (!agora) {
    // Sem a data ainda: espaço reservado, para não piscar texto errado.
    return <div className="flex flex-col gap-5"><Card><div className="h-[180px]" /></Card></div>;
  }

  const dataLonga = `${DIAS[agora.getDay()]}, ${String(agora.getDate()).padStart(2, "0")} de ${MESES[agora.getMonth()]} de ${agora.getFullYear()}`;
  const { texto: saud, icone } = saudacaoDe(agora.getHours());
  // Frase estável no dia: índice pelo dia do ano.
  const diaDoAno = Math.floor((agora.getTime() - new Date(agora.getFullYear(), 0, 0).getTime()) / 86400000);
  const frase = FRASES[diaDoAno % FRASES.length];
  const visiveis = ATALHOS.filter((a) => ligados.includes(a.id));

  return (
    <div className="flex flex-col gap-5 pb-4">
      {/* ------------------------------- saudação ------------------------------- */}
      <Card>
        <div className="text-caption font-medium text-faint uppercase tracking-[0.08em]">
          {dataLonga}
        </div>

        <h2 className="m-0 mt-2 text-h2 font-semibold text-ink leading-tight inline-flex items-center gap-2">
          {saud}{primeiroNome ? `, ${primeiroNome}!` : "!"}
          <Icon name={icone} size={22} color="var(--color-text-tertiary)" />
        </h2>

        <p className="m-0 mt-2 text-body text-muted">
          Você está acompanhando <b className="text-ink font-semibold">{empresa.nome}</b>
          {empresa.doc && <> · <span className="text-caption">CNPJ {formatarCNPJ(empresa.doc)}</span></>}.
        </p>

        <blockquote className="m-0 mt-5 border-l-[3px] border-lime bg-surface-2 rounded-r-md px-4 py-3">
          <p className="m-0 text-label text-muted italic">“{frase}”</p>
        </blockquote>

        <div className="flex items-center gap-3 mt-5 flex-wrap">
          <Button variant="primary" onClick={() => router.push("/fluxo-caixa")}>
            Abrir dashboard financeiro
            <Icon name="arrow-up-right" size={15} color="currentColor" />
          </Button>
          <Button variant="ghost" onClick={() => router.push("/dre")}>Ver DRE do mês</Button>
        </div>
      </Card>

      {/* ----------------------------- acesso rápido ----------------------------- */}
      <div>
        <div className="flex items-center justify-between gap-3 mb-3">
          <h2 className="m-0 text-h3 font-semibold text-ink">Acesso rápido</h2>
          <button
            onClick={() => setConfigurando((v) => !v)}
            aria-label="Configurar atalhos"
            className="inline-flex items-center justify-center w-8 h-8 rounded-md text-muted hover:text-ink hover:bg-surface-2 transition-colors"
          >
            <Icon name="settings" size={16} color="currentColor" />
          </button>
        </div>

        {configurando && (
          <Card className="mb-3">
            <p className="m-0 mb-3 text-caption text-muted">
              Escolha os atalhos que aparecem aqui.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {ATALHOS.map((a) => (
                <Checkbox
                  key={a.id}
                  checked={ligados.includes(a.id)}
                  onChange={() => alternar(a.id)}
                  label={a.label}
                />
              ))}
            </div>
          </Card>
        )}

        {visiveis.length === 0 ? (
          <Card>
            <p className="m-0 py-6 text-center text-label text-muted">
              Nenhum atalho ligado. Use a engrenagem para escolher.
            </p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {visiveis.map((a) => (
              <Link key={a.id} href={a.href} className="group">
                <Card className="h-full transition-colors hover:bg-surface-2">
                  <span className="inline-flex items-center justify-center w-10 h-10 rounded-md bg-surface-2 group-hover:bg-white transition-colors">
                    <Icon name={a.icon} size={18} color="var(--color-ink)" />
                  </span>
                  <div className="mt-3 text-label font-medium text-ink">{a.label}</div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* --------------------------------- dica --------------------------------- */}
      <Card>
        <div className="flex items-start gap-3">
          <Icon name="sparkles" size={16} color="var(--color-text-tertiary)" className="mt-[3px] shrink-0" />
          <p className="m-0 text-caption text-muted">
            Dica: use o seletor de empresa no topo para alternar entre as empresas disponíveis.
            A troca recarrega todos os dados no contexto certo.
          </p>
        </div>
      </Card>
    </div>
  );
}
