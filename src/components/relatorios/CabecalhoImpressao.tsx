"use client";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O CABEÇALHO DO DOCUMENTO — o que o contador precisa antes dos números
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ **Uma folha de números sem identificação não é um relatório, é um
 * rascunho.** Quem recebe precisa responder, sem perguntar a ninguém: de QUE
 * empresa, de QUE período, sob QUE regime, e com que RECORTE. Na tela essas
 * quatro respostas estão espalhadas pela interface — o nome da empresa no
 * menu, o período na pílula, o regime implícito no nome da aba. Nada disso
 * atravessa a impressão, e é por isso que este bloco existe SÓ no papel.
 *
 * ⚠️ **O regime é o campo que muda o número, e por isso é obrigatório aqui.**
 * O MESMO mês tem dois resultados legítimos: por competência (o que aconteceu)
 * e por caixa (o que entrou e saiu). Dois PDFs do mesmo mês com totais
 * diferentes, nenhum dizendo o regime, parecem um erro do sistema — e a
 * conversa que se segue é sobre confiança, não sobre contabilidade.
 *
 * ⚠️ **A data de geração também.** Um relatório de agosto gerado no dia 5 e
 * outro gerado no dia 30 não são o mesmo documento: entre eles entraram
 * lançamentos. Sem a data, dois arquivos com o mesmo nome são
 * indistinguíveis, e o contador não tem como saber qual é o mais novo.
 */
import * as React from "react";
import { loadCompany } from "@/lib/company";
import { getOrganizationName } from "@/lib/company";
import { dataBR } from "@/lib/format";

export interface CabecalhoImpressaoProps {
  /** "DRE" · "DFC" · "Razão" — o que este documento É. */
  titulo: string;
  /** Intervalo apurado, em ISO. */
  de: string;
  ate: string;
  /** Competência ou caixa — o campo que muda o número. */
  regime: "competencia" | "caixa";
  /** O recorte declarado na tela, repetido no papel. */
  recorte?: string;
}

/**
 * ⚠️ O nome sai de DUAS fontes, nesta ordem: a razão social que o cadastro
 * guarda e, na falta dela, o nome da organização no banco. A razão social vem
 * primeiro porque é ela que aparece na nota fiscal — um relatório que chama a
 * empresa por um apelido interno obriga quem recebe a conferir se é a mesma.
 */
function useNomeDaEmpresa(): string | null {
  const [nome, setNome] = React.useState<string | null>(null);
  React.useEffect(() => {
    const db = loadCompany()?.db;
    const razao = typeof db?.razaoSocial === "string" ? db.razaoSocial.trim() : "";
    if (razao) { setNome(razao); return; }
    let vivo = true;
    void getOrganizationName().then((n) => { if (vivo && n) setNome(n); });
    return () => { vivo = false; };
  }, []);
  return nome;
}

export function CabecalhoImpressao({ titulo, de, ate, regime, recorte }: CabecalhoImpressaoProps) {
  const empresa = useNomeDaEmpresa();
  /*
   * ⚠️ A data de geração é lida na IMPRESSÃO, não na montagem. Uma tela aberta
   * de manhã e impressa à tarde carimbaria a manhã — e o carimbo existe
   * justamente para dizer quando o retrato foi tirado.
   */
  const [gerado, setGerado] = React.useState<string>("");
  React.useEffect(() => {
    const marcar = () => {
      const d = new Date();
      const p = (n: number) => String(n).padStart(2, "0");
      setGerado(`${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`);
    };
    marcar();
    window.addEventListener("beforeprint", marcar);
    return () => window.removeEventListener("beforeprint", marcar);
  }, []);

  return (
    <div data-imprimir-cabecalho className="mb-4 pb-3 border-b border-border">
      <h1 className="m-0 text-h3 font-semibold text-ink">{titulo}</h1>
      {empresa && <p className="m-0 mt-1 text-label text-ink">{empresa}</p>}
      <p className="m-0 mt-1 text-caption text-muted">
        Período: {dataBR(de)} a {dataBR(ate)}
        {" · "}
        Regime: {regime === "competencia" ? "competência" : "caixa"}
        {recorte ? ` · ${recorte}` : ""}
      </p>
      <p className="m-0 mt-[2px] text-caption text-faint">Gerado em {gerado} · all4pay</p>
    </div>
  );
}
