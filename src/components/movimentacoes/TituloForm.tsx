"use client";

/**
 * Nova conta a receber / a pagar — o formulário em página cheia.
 *
 * É o mesmo formulário nos dois lados; muda o vocabulário (Cliente ×
 * Fornecedor), o campo **Espécie** (só no pagar, porque é a nota que ampara a
 * despesa) e a **chave PIX** do fornecedor, que aparece assim que ele é
 * escolhido — quem paga precisa dela na mão, não em outra tela.
 *
 * ⚠️ **O TIPO DO LANÇAMENTO É A PRIMEIRA PERGUNTA, não a última.**
 *
 * Ele era uma caixinha "repetir lançamento" no pé da tela, depois dos anexos.
 * Ali ele chegava tarde: quem já preencheu valor e vencimento decidiu quanto
 * lançar antes de saber o que estava lançando — e o mesmo par de números
 * significa coisas diferentes conforme o modo. R$ 4.000 em 12x recorrente são
 * R$ 48.000 de compromisso; R$ 4.000 em 12x parcelado são R$ 4.000. A escolha
 * subiu para o topo e o campo de valor MUDA DE RÓTULO com ela.
 *
 * Toda a aritmética dos três modos mora em `core/contas-pagar/lancamento` —
 * a tela não calcula nada (teto ZERO da ONDA 10).
 *
 * A outra regra condicional continua: marcar "realizado" revela data, valor
 * pago e desconto/juros, porque só um título liquidado tem essas três coisas.
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  Card, Button, Icon, Input, Textarea, Select, DateField, CurrencyInput, Checkbox, BRL,
} from "@/components/ui";
import { useToast } from "@/components/listas/ListChrome";
import { useAccounts } from "@/components/visao-geral/hooks";
import { usePartiesList } from "@/components/lancamentos/hooks";
import { PartyForm } from "@/components/lancamentos/PartyForm";
import { listPlanoContas, extraParty } from "@/lib/registros";
import { listProjetos, listCentrosCusto } from "@/lib/iuli-cadastros";
import { rateioValido, somaRateio, type LinhaRateio } from "@/core/registros";
import {
  planejarLancamento, ROTULO_MODO, EXPLICACAO_MODO, FREQUENCIAS,
  type ModoLancamento, type Frequencia,
} from "@/core/contas-pagar/lancamento";
import {
  BlocoFolha, FOLHA_PADRAO, colaboradorDe, titulosDoCadastro, type DadosFolha,
} from "./BlocoFolha";
import { regimeDaEmpresa, saveColaborador } from "@/lib/folha";
import { appendImported } from "@/lib/imported";
import { vincularProjeto } from "@/lib/projeto-vinculo";
import { isDemo } from "@/lib/demo";
import { reportar } from "@/lib/erros";
import { createLancamento, criarTitulos } from "@/lib/data";
import type { Direcao } from "@/core/movimentacoes";
import type { RecurrenceFreq } from "@/lib/types";

const hoje = () => new Date().toISOString().slice(0, 10);

// ⚠️ O modo "folha" só existe no lado de PAGAR: não se contrata um
// funcionário para receber. Oferecê-lo em "nova conta a receber" seria um
// caminho que não leva a lugar nenhum.
const MODOS_PAGAR: ModoLancamento[] = ["unica", "recorrente", "parcelada", "folha"];
const MODOS_RECEBER: ModoLancamento[] = ["unica", "recorrente", "parcelada"];

const ESPECIES = [
  { value: "nfe", label: "NF-e (Danfe) — Produtos" },
  { value: "nfse", label: "NFS-e — Serviços" },
];

const EXT_OK = ["png", "jpg", "jpeg", "pdf", "xml", "xls", "xlsx"];
const LIMITE = 10 * 1024 * 1024;

export function TituloForm({ direcao }: { direcao: Direcao }) {
  const router = useRouter();
  const qc = useQueryClient();
  const { show, node } = useToast();
  const { data: contas } = useAccounts();
  const { data: partes } = usePartiesList();

  const receber = direcao === "receber";
  const rotuloParte = receber ? "Cliente" : "Fornecedor";
  const rotuloAcao = receber ? "Recebimento" : "Pagamento";

  const [modo, setModo] = React.useState<ModoLancamento>("unica");
  const mesAtual = hoje().slice(0, 7);
  const [folha, setFolha] = React.useState<DadosFolha>(() => FOLHA_PADRAO(mesAtual));
  // O regime sai da fonte única do perfil fiscal — ver `lib/folha`.
  const fiscal = React.useMemo(() => regimeDaEmpresa(), []);
  const [f, setF] = React.useState({
    parteId: "", competencia: hoje(), vencimento: hoje(), valor: 0,
    contaId: "", categoria: "", mostrarDRE: true, descricao: "", documentoFiscal: "",
    especie: "", dadosPagamento: "",
    realizado: false, conciliada: false, dataRealizado: hoje(), valorRealizado: 0, descontoJuros: 0,
    frequencia: "mensal" as Frequencia, ocorrencias: 12, valorFixo: true, parcelas: 12,
  });
  const [projetos, setProjetos] = React.useState<LinhaRateio[]>([]);
  const [centros, setCentros] = React.useState<LinhaRateio[]>([]);
  const [anexos, setAnexos] = React.useState<{ nome: string; tamanho: number }[]>([]);
  const [erroAnexo, setErroAnexo] = React.useState("");
  const [erros, setErros] = React.useState<Record<string, string>>({});
  const [novaParte, setNovaParte] = React.useState(false);
  const [salvando, setSalvando] = React.useState(false);

  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }));

  const cadProjetos = React.useMemo(() => listProjetos(), []);
  const cadCentros = React.useMemo(() => listCentrosCusto(), []);
  const categorias = React.useMemo(
    () => listPlanoContas().filter((c) => c.natureza === (receber ? "receita" : "despesa") && c.paiId),
    [receber],
  );
  const elegiveis = React.useMemo(
    () => (partes ?? []).filter((p) => (receber ? p.is_customer : p.is_supplier)),
    [partes, receber],
  );
  /**
   * O PLANO — quantos títulos, em que datas, de quanto cada um.
   *
   * ⚠️ Ele é calculado a cada tecla e MOSTRADO antes de salvar. Um formulário
   * que só revela o que criou depois de criar transfere para a pessoa o
   * trabalho de conferir doze linhas numa lista, e é aí que ninguém confere.
   */
  const plano = React.useMemo(
    () => planejarLancamento({
      modo, vencimento: f.vencimento, competencia: f.competencia, valor: f.valor,
      frequencia: f.frequencia, ocorrencias: f.ocorrencias,
      valorFixo: f.valorFixo, parcelas: f.parcelas,
    }),
    [modo, f.vencimento, f.competencia, f.valor, f.frequencia, f.ocorrencias, f.valorFixo, f.parcelas],
  );

  const parteEscolhida = elegiveis.find((p) => p.id === f.parteId);
  const pix = parteEscolhida ? extraParty(parteEscolhida.id).chavePix : "";

  /** Escolher o cliente pré-preenche a categoria padrão que ele já tem. */
  React.useEffect(() => {
    if (!f.parteId) return;
    const padrao = extraParty(f.parteId).categoriaPadrao;
    if (padrao) setF((s) => (s.categoria ? s : { ...s, categoria: padrao }));
  }, [f.parteId]);

  /** Marcar realizado pré-preenche o valor com o valor do título. */
  React.useEffect(() => {
    if (f.realizado && f.valorRealizado === 0 && f.valor > 0) {
      setF((s) => ({ ...s, valorRealizado: s.valor }));
    }
  }, [f.realizado, f.valor, f.valorRealizado]);

  const validar = (): Record<string, string> => {
    const e: Record<string, string> = {};
    if (!f.parteId) e.parteId = `Selecione o ${rotuloParte.toLowerCase()}.`;
    if (!f.competencia) e.competencia = "Informe a data de competência.";
    if (!f.vencimento) e.vencimento = "Informe a data de vencimento.";
    if (!f.valor || f.valor <= 0) e.valor = "Informe o valor.";
    if (!f.contaId) e.contaId = "Selecione a conta bancária.";
    if (!f.categoria) e.categoria = "Selecione a categoria.";
    if (f.realizado) {
      if (!f.dataRealizado) e.dataRealizado = `Informe a data de ${rotuloAcao.toLowerCase()}.`;
      if (!f.valorRealizado || f.valorRealizado <= 0) e.valorRealizado = "Informe o valor realizado.";
    }
    if (modo === "folha") {
      // ⚠️ No modo folha a categoria e a contraparte são DERIVADAS (o motor
      // sabe se o título é salário, FGTS ou DARF), então as duas obrigações do
      // formulário comum não se aplicam — cobrá-las travaria o cadastro num
      // campo que a folha preenche sozinha.
      delete e.categoria;
      delete e.parteId;
      if (!folha.nome.trim()) e.modo = "Informe o nome do colaborador.";
      else if (folha.competencias < 1) e.modo = "Gere ao menos uma competência.";
    } else if (plano.problemas.length > 0) {
      // ⚠️ As recusas do MODO vêm do motor, não de uma segunda lista aqui: duas
      // validações da mesma regra divergem no primeiro ajuste, e a que diverge
      // em silêncio é sempre a da tela.
      e.modo = plano.problemas[0];
    }
    if (!rateioValido(projetos)) e.projetos = "O rateio por projeto precisa somar 100%.";
    if (!rateioValido(centros)) e.centros = "O rateio por centro de custo precisa somar 100%.";
    return e;
  };

  const salvar = async () => {
    const e = validar();
    setErros(e);
    if (Object.keys(e).length > 0) {
      show("Revise os campos obrigatórios.");
      return;
    }
    setSalvando(true);
    try {
      if (modo === "folha") {
        /**
         * ⚠️ A FOLHA TEM O SEU PRÓPRIO CAMINHO, e não passa pelo `plano`.
         *
         * Os títulos vêm de `core/folha`, que sabe que um CLT gera três por mês
         * em duas datas mais duas parcelas de 13º por ano. Empurrá-los pelo
         * caminho comum — que assume um valor e uma cadência — erraria a data
         * de dois deles e o valor do terceiro.
         *
         * O colaborador é GRAVADO junto: sem ele a tela de folha não teria de
         * onde recalcular, e o mês seguinte exigiria digitar tudo de novo.
         *
         * ⚠️ **OS TÍTULOS VÃO POR `criarTitulos`, não por `appendImported`.**
         * A versão anterior chamava o segundo direto, sem olhar para `isDemo`:
         * em produção a linha caía no dataset da demonstração, que nenhum
         * acessor lê fora de `if (isDemo)`. O colaborador aparecia na folha
         * (o cadastro vai por `store-org`, que sobe ao servidor) e os títulos
         * não apareciam em lugar nenhum — e a tela anunciava o agendamento.
         */
        const colab = colaboradorDe(folha, f.valor, centros.find((c) => c.id)?.id ?? null);
        const titulos = titulosDoCadastro(colab, folha.competencias, fiscal.regime, fiscal.anexo);
        await criarTitulos(titulos.map((t) => ({
          account_id: f.contaId,
          type: "saida" as const,
          amount: t.valor,
          due_date: t.vencimento,
          competence_date: t.vencimento,
          category: t.categoria,
          description: t.descricao,
          origem: "manual" as const,
        })));
        // ⚠️ O cadastro só é gravado DEPOIS de os títulos entrarem. Gravá-lo
        // antes deixaria, numa recusa do banco, um colaborador na folha sem
        // nenhuma obrigação no caixa — e a próxima tentativa o duplicaria.
        saveColaborador(colab);
        qc.invalidateQueries();
        show(`${colab.nome} cadastrado · ${titulos.length} títulos agendados.`);
        router.push("/contas-a-pagar/folha");
        return;
      }
      if (isDemo) {
        // Em demo o lançamento entra no dataset importado — é o mesmo caminho
        // do upload, então saldo, DRE e fluxo reagem na hora.
        // ⚠️ Os títulos vêm do PLANO: é ele que sabe que na parcelada o valor
        // é o total dividido, e na recorrente é o valor de cada uma.
        plano.titulos.forEach((t, k) => {
          const id = `mv_${Date.now().toString(36)}_${k}`;
          const liquidado = f.realizado && k === 0;
          appendImported({
            movement: {
              id,
              account_id: f.contaId,
              type: receber ? "entrada" : "saida",
              status: liquidado ? "pago" : "pendente",
              amount: t.valor,
              due_date: t.vencimento,
              paid_date: liquidado ? f.dataRealizado : null,
              reconciled: f.conciliada,
              category: categorias.find((c) => c.id === f.categoria)?.nome ?? null,
              description: f.descricao || null,
              party_id: f.parteId,
              origem: "manual",
              installment_no: t.de ? t.numero : null,
              installment_total: t.de,
            } as never,
          });
          const proj = projetos.find((p) => p.id)?.id;
          if (proj) vincularProjeto(id, proj);
        });
      } else {
        await createLancamento({
          kind: receber ? "receita" : "despesa",
          party_id: f.parteId || null,
          project_id: projetos.find((p) => p.id)?.id ?? null,
          competence_date: f.competencia,
          description: f.descricao.trim(),
          amount: f.valor,
          category_id: f.categoria || null,
          cost_center_id: centros.find((c) => c.id)?.id ?? null,
          reference_code: f.documentoFiscal.trim() || null,
          splits: null,
          // ⚠️ Recorrente vira RECORRÊNCIA (um compromisso que continua);
          // parcelada vira PARCELAMENTO (uma compra que termina). Mandar as
          // duas pelo mesmo campo é o que fazia a compra em 12x virar um
          // passivo de doze vezes o preço no fluxo de caixa.
          repeat: modo === "recorrente"
            ? { freq: f.frequencia as RecurrenceFreq, count: f.ocorrencias, until: null }
            : null,
          installments: modo === "parcelada" ? f.parcelas : 1,
          due_date: f.vencimento,
          payment_method: null,
          account_id: f.contaId || null,
          settled: f.realizado,
          nsu: null,
          origem: "manual",
        });
      }
      qc.invalidateQueries();
      const n = plano.titulos.length;
      show(`Conta a ${direcao} criada${n > 1 ? ` · ${n} ${modo === "parcelada" ? "parcelas" : "ocorrências"}` : ""}.`);
      router.push(receber ? "/contas-a-receber/titulos" : "/contas-a-pagar/titulos");
    } catch (err) {
      /**
       * ⚠️ O MOTIVO REAL VAI PARA A TELA, e a falha é REPORTADA.
       *
       * Aqui estava `catch { show("Não foi possível salvar. Tente novamente.") }`.
       * O banco recusava com uma mensagem exata e ainda mandava um `hint`
       * dizendo o que fazer, e a tela jogava os dois fora para exibir o único
       * conselho que não podia funcionar: repetir reproduz a mesma recusa.
       * Quem operava concluía que o botão não funciona — e estava certo, sem
       * ter como saber por quê.
       */
      const e = err as { message?: string; hint?: string; code?: string };
      reportar("titulos.criar", err, "o lançamento não foi criado e o operador fica sem o título");
      show(e?.message ? `Não foi possível salvar: ${e.message}${e.hint ? ` ${e.hint}` : ""}` : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="flex flex-col gap-5 pb-4">
      <button
        onClick={() => router.back()}
        className="inline-flex items-center gap-1 self-start text-caption text-muted hover:text-ink"
      >
        <Icon name="chevron-left" size={14} color="currentColor" />
        Cancelar
      </button>

      {/* ============================ O TIPO, PRIMEIRO ============================ */}
      <SeletorDeModo modo={modo} onModo={setModo} receber={receber} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
        {modo === "folha" && (
          <BlocoFolha
            dados={folha} onDados={setFolha} valor={f.valor}
            regime={fiscal.regime} anexo={fiscal.anexo}
          />
        )}
        {modo === "folha" && (
          /* ⚠️ Conta bancária e valor continuam sendo do formulário comum: é de
             uma conta real que o dinheiro sai, e é o bruto que o motor precisa.
             Duplicá-los dentro do bloco criaria dois campos para a mesma coisa. */
          <Bloco titulo="Conta e valor">
            <Campo label="Conta bancária" obrigatorio erro={erros.contaId}>
              <Select
                value={f.contaId}
                onChange={(v) => set("contaId", v)}
                placeholder="Selecione uma opção"
                options={(contas?.accounts ?? []).map((c) => ({ value: c.id, label: c.name }))}
              />
            </Campo>
            <Campo
              label={folha.vinculo === "clt" ? "Salário bruto mensal" : "Valor da nota"}
              obrigatorio erro={erros.valor}
              ajuda={folha.vinculo === "clt" ? "O bruto, antes de qualquer desconto." : undefined}
            >
              <CurrencyInput value={f.valor} onValueChange={(v) => set("valor", v)} />
            </Campo>
            {erros.modo && <span className="text-caption text-negative">{erros.modo}</span>}
          </Bloco>
        )}
        {modo !== "folha" && <>
        {/* ---------------------------- dados gerais ----------------------------
            ⚠️ SUBIU. Conta e categoria decidem em qual conta o dinheiro sai e em
            que linha do resultado ele aparece — as duas perguntas que o resto do
            formulário pressupõe respondidas. Ficavam depois das datas e do valor,
            e "Contrato" ocupava o lugar nobre com um campo que quase nunca é
            preenchido. */}
        <Bloco titulo="Dados gerais">
          <Campo label="Conta bancária" obrigatorio erro={erros.contaId}>
            <Select
              value={f.contaId}
              onChange={(v) => set("contaId", v)}
              placeholder="Selecione uma opção"
              options={(contas?.accounts ?? []).map((c) => ({ value: c.id, label: c.name }))}
            />
          </Campo>
          <Campo label="Categoria" obrigatorio erro={erros.categoria}>
            <Select
              value={f.categoria}
              onChange={(v) => set("categoria", v)}
              placeholder="Selecione…"
              options={categorias.map((c) => ({ value: c.id, label: c.nome }))}
            />
          </Campo>
          {!receber && (
            <Campo label="Espécie" ajuda="A nota que ampara a despesa.">
              <Select
                value={f.especie}
                onChange={(v) => set("especie", v)}
                placeholder="Selecione uma opção"
                options={ESPECIES}
              />
            </Campo>
          )}
          <Checkbox
            checked={f.mostrarDRE}
            onChange={(e) => set("mostrarDRE", e.target.checked)}
            label="Mostrar no DRE"
          />
        </Bloco>

        {/* ------------------------------- a parte ------------------------------- */}
        <Bloco titulo={rotuloParte}>
          <Campo label={rotuloParte} obrigatorio erro={erros.parteId}>
            <div className="flex items-center gap-2">
              <Select
                value={f.parteId}
                onChange={(v) => set("parteId", v)}
                placeholder="Digite nome ou documento…"
                options={elegiveis.map((p) => ({ value: p.id, label: `${p.name}${p.doc ? ` · ${p.doc}` : ""}` }))}
                containerClassName="flex-1 min-w-0"
              />
              {/* Atalho de criação rápida: quem lança a conta descobre ali que o
                  cliente não está cadastrado, e mandar a pessoa para outra tela
                  perderia o formulário inteiro. */}
              <button
                onClick={() => setNovaParte(true)}
                aria-label={`Novo ${rotuloParte.toLowerCase()}`}
                title={`Novo ${rotuloParte.toLowerCase()}`}
                className="inline-flex items-center justify-center w-10 h-10 rounded-md bg-surface-2 text-ink hover:bg-surface-3 transition-colors shrink-0"
              >
                <Icon name="plus" size={16} color="currentColor" />
              </button>
            </div>
          </Campo>
          {!receber && pix && (
            <div className="rounded-md bg-surface-2 px-3 py-2 flex items-center gap-2">
              <Icon name="credit-card" size={14} color="var(--color-text-tertiary)" />
              <span className="text-caption text-muted">Chave PIX:</span>
              <span className="text-caption text-ink truncate">{pix}</span>
            </div>
          )}
        </Bloco>

        {/* ---------------------------- datas e valor ---------------------------- */}
        <Bloco titulo="Datas e valor">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Campo label="Data de competência" obrigatorio erro={erros.competencia} ajuda="Quando o fato aconteceu — é o que o DRE lê.">
              <DateField value={f.competencia} onChange={(v) => set("competencia", v)} />
            </Campo>
            <Campo
              label={modo === "unica" ? "Data de vencimento" : "Primeiro vencimento"}
              obrigatorio erro={erros.vencimento}
              ajuda="Quando cai — é o que a cobrança lê."
            >
              <DateField value={f.vencimento} onChange={(v) => set("vencimento", v)} />
            </Campo>
          </div>
          {/* ⚠️ O RÓTULO DO VALOR MUDA COM O MODO, e é a peça que impede o
              engano caro: na recorrente ele é o valor de CADA vez, na parcelada
              é o TOTAL da compra. Com um rótulo só ("Valor"), 4.000 em 12x
              significava R$ 48.000 ou R$ 4.000 e nada na tela dizia qual. */}
          <Campo
            label={modo === "parcelada" ? "Valor total da compra" : modo === "recorrente" ? "Valor de cada ocorrência" : "Valor"}
            obrigatorio erro={erros.valor}
            ajuda={modo === "parcelada"
              ? "O preço cheio. As parcelas saem dele."
              : modo === "recorrente" ? "Quanto vence a cada vez — não o total do período." : undefined}
          >
            <CurrencyInput value={f.valor} onValueChange={(v) => set("valor", v)} />
          </Campo>

          {modo === "recorrente" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Campo label="Frequência" obrigatorio>
                <Select
                  value={f.frequencia}
                  onChange={(v) => set("frequencia", v as Frequencia)}
                  options={FREQUENCIAS.map((x) => ({ value: x.valor, label: x.rotulo }))}
                />
              </Campo>
              <Campo label="Quantas ocorrências" obrigatorio ajuda="Sem fim, a recorrência gera título para sempre.">
                <Input
                  type="number" min={2} max={120}
                  value={String(f.ocorrencias)}
                  onChange={(e) => set("ocorrencias", Number(e.target.value) || 0)}
                />
              </Campo>
            </div>
          )}
          {modo === "recorrente" && (
            <Checkbox
              checked={f.valorFixo}
              onChange={(e) => set("valorFixo", e.target.checked)}
              label="O valor é sempre o mesmo (entra no custo fixo)"
            />
          )}
          {modo === "parcelada" && (
            <Campo label="Quantas parcelas" obrigatorio>
              <Input
                type="number" min={2} max={120}
                value={String(f.parcelas)}
                onChange={(e) => set("parcelas", Number(e.target.value) || 0)}
              />
            </Campo>
          )}
          {erros.modo && <span className="text-caption text-negative">{erros.modo}</span>}
        </Bloco>

        {/* ---------------------------- campos de texto ---------------------------- */}
        <Bloco titulo="Campos de texto">
          <Campo label="Descrição">
            <Input value={f.descricao} onChange={(e) => set("descricao", e.target.value)} />
          </Campo>
          <Campo label="Documento fiscal" ajuda="NF ou referência do extrato que ampara a transação.">
            <Input value={f.documentoFiscal} onChange={(e) => set("documentoFiscal", e.target.value)} />
          </Campo>
          <Campo label="Dados de pagamento" ajuda="Código de pagamento (boleto, PIX, etc.).">
            <Textarea value={f.dadosPagamento} onChange={(e) => set("dadosPagamento", e.target.value)} rows={2} />
          </Campo>
        </Bloco>
        </>}
      </div>

      {/* --------------------------- realizado (condicional) ---------------------------
          ⚠️ Fora da folha: um cadastro de colaborador cria títulos FUTUROS em
          várias datas, e "pagamento realizado" só faria sentido para um deles.
          A baixa acontece na lista, título a título. */}
      {modo !== "folha" && <Card>
        <span className="a4p-label text-faint">{rotuloAcao}</span>
        <div className="flex flex-col gap-2 mt-3">
          <Checkbox
            checked={f.realizado}
            onChange={(e) => set("realizado", e.target.checked)}
            label={`${rotuloAcao} realizado`}
          />
          <Checkbox
            checked={f.conciliada}
            onChange={(e) => set("conciliada", e.target.checked)}
            label="Conciliada com extrato"
            disabled={!f.realizado}
          />
        </div>
        {f.realizado && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4 pt-4 border-t border-border-soft">
            <Campo label={`Data de ${rotuloAcao.toLowerCase()}`} obrigatorio erro={erros.dataRealizado}>
              <DateField value={f.dataRealizado} onChange={(v) => set("dataRealizado", v)} />
            </Campo>
            <Campo label={`Valor ${receber ? "recebido" : "pago"}`} obrigatorio erro={erros.valorRealizado}>
              <CurrencyInput value={f.valorRealizado} onValueChange={(v) => set("valorRealizado", v)} />
            </Campo>
            <Campo
              label="Desconto / Juros"
              ajuda={f.valor && f.valorRealizado
                ? `Diferença: ${(f.valorRealizado - f.valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`
                : undefined}
            >
              <CurrencyInput value={f.descontoJuros} onValueChange={(v) => set("descontoJuros", v)} />
            </Campo>
          </div>
        )}
      </Card>}

      {/* -------------------- o que vai ser criado (pré-visualização) -------------------- */}
      {modo !== "unica" && modo !== "folha" && plano.titulos.length > 0 && (
        <Card>
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <span className="a4p-label text-faint">O que vai ser criado</span>
            <span className="text-caption text-muted">
              {plano.titulos.length} {modo === "parcelada" ? "parcelas" : "ocorrências"} ·{" "}
              <b className="text-ink"><BRL value={plano.total} /></b> no total
              {plano.mensal !== null && (
                <> · <b className="text-ink"><BRL value={plano.mensal} /></b>/mês</>
              )}
            </span>
          </div>
          {plano.ehCustoFixo && (
            <p className="m-0 mt-2 text-caption text-muted">
              Marcada como <b className="text-ink">custo fixo</b> — entra na conta de quanto a
              empresa compromete todo mês.
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-1">
            {plano.titulos.slice(0, 14).map((t) => (
              <span
                key={t.numero}
                className="rounded-pill bg-surface-2 px-[10px] py-[3px] text-caption text-muted tabular-nums"
                title={`Competência ${t.competencia.split("-").reverse().join("/")}`}
              >
                {t.vencimento.split("-").reverse().join("/")} · <b className="text-ink"><BRL value={t.valor} /></b>
              </span>
            ))}
            {plano.titulos.length > 14 && (
              <span className="text-caption text-faint self-center">+{plano.titulos.length - 14}</span>
            )}
          </div>
          {modo === "parcelada" && (
            // ⚠️ Dito na tela porque é contraintuitivo e muda o mês do
            // resultado: as parcelas caem no caixa mês a mês, mas a DESPESA é
            // inteira no mês da compra.
            <p className="m-0 mt-3 text-caption text-faint">
              As parcelas vencem mês a mês, mas a despesa é inteira na competência de{" "}
              {f.competencia.split("-").reverse().join("/")} — é assim que o DRE a enxerga.
            </p>
          )}
        </Card>
      )}

      {/* -------------------------- projeto e centro de custo -------------------------- */}
      {modo !== "folha" && <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Rateio
          titulo="Projetos" singular="projeto"
          opcoes={cadProjetos.map((p) => ({ value: p.id, label: p.nome }))}
          linhas={projetos} onChange={setProjetos} erro={erros.projetos}
        />
        <Rateio
          titulo="Centros de custo" singular="centro de custo"
          opcoes={cadCentros.map((c) => ({ value: c.id, label: c.nome }))}
          linhas={centros} onChange={setCentros} erro={erros.centros}
        />
      </div>}

      {/* --------------------------------- anexos --------------------------------- */}
      {modo !== "folha" && <Card>
        <span className="a4p-label text-faint">Anexos</span>
        <label className="mt-3 flex flex-col items-center justify-center gap-2 rounded-card bg-surface-2 border border-dashed border-border py-10 cursor-pointer hover:bg-surface-3 transition-colors">
          <Icon name="upload" size={20} color="var(--color-text-tertiary)" />
          <span className="text-label text-muted">Arraste arquivos para cá ou clique para selecionar</span>
          <span className="text-caption text-faint">{EXT_OK.join(", ")} · até 10 MB</span>
          <input
            type="file" multiple className="hidden"
            onChange={(e) => {
              const novos: { nome: string; tamanho: number }[] = [];
              for (const arq of Array.from(e.target.files ?? [])) {
                const ext = arq.name.split(".").pop()?.toLowerCase() ?? "";
                // Checar ANTES de guardar: recusar depois do "salvar" perderia
                // o resto do formulário.
                if (!EXT_OK.includes(ext)) { setErroAnexo(`"${arq.name}": formato não aceito.`); continue; }
                if (arq.size > LIMITE) { setErroAnexo(`"${arq.name}": passa de 10 MB.`); continue; }
                novos.push({ nome: arq.name, tamanho: arq.size });
              }
              if (novos.length) setErroAnexo("");
              setAnexos((a) => [...a, ...novos]);
            }}
          />
        </label>
        {erroAnexo && <span className="mt-2 text-caption text-negative">{erroAnexo}</span>}
        <div className="mt-3 flex flex-col gap-1">
          {anexos.length === 0
            ? <span className="text-caption text-faint">Nenhum anexo.</span>
            : anexos.map((a, k) => (
              <div key={k} className="flex items-center justify-between gap-3 py-1">
                <span className="text-caption text-ink truncate">{a.nome}</span>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-caption text-faint tabular-nums">{(a.tamanho / 1024).toFixed(0)} KB</span>
                  <button onClick={() => setAnexos((l) => l.filter((_, i) => i !== k))}
                    className="text-caption text-muted hover:text-negative">Remover</button>
                </div>
              </div>
            ))}
        </div>
      </Card>}

      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" onClick={() => router.back()}>Cancelar</Button>
        <Button variant="primary" disabled={salvando} onClick={salvar}>
          <Icon name="check" size={15} color="currentColor" />
          {salvando ? "Salvando…" : "Salvar"}
        </Button>
      </div>

      {novaParte && (
        <PartyForm
          role={receber ? "customer" : "supplier"}
          onClose={() => setNovaParte(false)}
          onToast={(m) => { show(m); setNovaParte(false); qc.invalidateQueries({ queryKey: ["parties-list"] }); }}
        />
      )}
      {node}
    </div>
  );
}

/* --------------------------------- peças --------------------------------- */

/**
 * OS TRÊS MODOS, no topo da tela.
 *
 * ⚠️ São três BOTÕES visíveis, não um select nem uma caixinha. A escolha muda o
 * significado do campo de valor, o número de títulos criados e o mês em que a
 * despesa aparece no resultado — três consequências grandes demais para
 * caberem atrás de um controle que só mostra a opção já escolhida.
 *
 * Cada um carrega a frase do que faz. Um rótulo sozinho ("Recorrente") não
 * distingue de "Parcelada" para quem nunca lançou nenhuma das duas — e é
 * exatamente essa pessoa que erra.
 */
function SeletorDeModo({
  modo, onModo, receber,
}: { modo: ModoLancamento; onModo: (m: ModoLancamento) => void; receber: boolean }) {
  const MODOS = receber ? MODOS_RECEBER : MODOS_PAGAR;
  return (
    <Card>
      <span className="a4p-label text-faint">Tipo do lançamento</span>
      <div role="radiogroup" aria-label="Tipo do lançamento" className={`mt-3 grid grid-cols-1 gap-3 ${receber ? "sm:grid-cols-3" : "sm:grid-cols-2 lg:grid-cols-4"}`}>
        {MODOS.map((m) => {
          const on = m === modo;
          return (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onModo(m)}
              className={
                "flex flex-col items-start gap-1 text-left rounded-card p-4 transition-colors " +
                (on ? "bg-ink text-white" : "bg-surface-2 text-ink hover:bg-surface-3")
              }
            >
              <span className="flex items-center gap-2 text-label font-medium">
                <span
                  aria-hidden
                  className={"inline-flex items-center justify-center w-4 h-4 rounded-pill border " + (on ? "border-white" : "border-border")}
                >
                  {on && <span className="w-2 h-2 rounded-pill bg-white" />}
                </span>
                {ROTULO_MODO[m]}
              </span>
              <span className={"text-caption " + (on ? "text-white/70" : "text-muted")}>
                {EXPLICACAO_MODO[m]}
              </span>
            </button>
          );
        })}
      </div>
    </Card>
  );
}

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <Card className="h-full">
      <span className="a4p-label text-faint">{titulo}</span>
      <div className="flex flex-col gap-4 mt-3">{children}</div>
    </Card>
  );
}

function Campo({
  label, obrigatorio, erro, ajuda, children,
}: { label: string; obrigatorio?: boolean; erro?: string; ajuda?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-[6px]">
      <label className="text-caption font-medium text-muted">
        {label}
        {obrigatorio && (
          <span className="ml-2 rounded-pill bg-surface-3 text-[10px] text-muted px-[6px] py-[1px] align-middle">
            Obrigatório
          </span>
        )}
      </label>
      {children}
      {erro ? <span className="text-caption text-negative">{erro}</span>
        : ajuda ? <span className="text-caption text-faint">{ajuda}</span> : null}
    </div>
  );
}

function Rateio({
  titulo, singular, opcoes, linhas, onChange, erro,
}: {
  titulo: string; singular: string;
  opcoes: { value: string; label: string }[];
  linhas: LinhaRateio[];
  onChange: (l: LinhaRateio[]) => void;
  erro?: string;
}) {
  const soma = somaRateio(linhas);
  const ok = rateioValido(linhas);
  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <span className="text-h3 font-semibold text-ink">{titulo}</span>
        <div className="flex items-center gap-3">
          {linhas.some((l) => l.id) && (
            <span className={`text-caption font-medium tabular-nums ${ok ? "text-positive" : "text-negative"}`}>
              {soma.toFixed(2).replace(".", ",")}%
            </span>
          )}
          <Button
            variant="ghost"
            disabled={opcoes.length === 0}
            onClick={() => onChange([...linhas, { id: "", percentual: linhas.length === 0 ? 100 : 0 }])}
          >
            <Icon name="plus" size={14} color="currentColor" />
            Adicionar
          </Button>
        </div>
      </div>
      <div className="mt-3 flex flex-col gap-2">
        {opcoes.length === 0 ? (
          <span className="text-caption text-faint">
            Nenhum {singular} cadastrado — cadastre em Cadastros para poder ratear.
          </span>
        ) : linhas.length === 0 ? (
          <span className="text-caption text-faint">Nenhuma alocação cadastrada.</span>
        ) : linhas.map((l, k) => (
          <div key={k} className="flex items-center gap-2">
            <Select
              value={l.id}
              onChange={(v) => onChange(linhas.map((x, i) => (i === k ? { ...x, id: v } : x)))}
              placeholder={`Selecione o ${singular}`}
              options={opcoes}
              containerClassName="flex-1 min-w-0"
            />
            <Input
              type="number"
              value={String(l.percentual)}
              onChange={(e) => onChange(linhas.map((x, i) => (i === k ? { ...x, percentual: Number(e.target.value) || 0 } : x)))}
              containerClassName="w-[100px]"
            />
            <button
              onClick={() => onChange(linhas.filter((_, i) => i !== k))}
              aria-label="Remover" className="p-[6px] rounded-md text-muted hover:text-negative hover:bg-surface-2"
            >
              <Icon name="minus" size={15} color="currentColor" />
            </button>
          </div>
        ))}
      </div>
      {erro && <span className="mt-2 text-caption text-negative">{erro}</span>}
    </Card>
  );
}
