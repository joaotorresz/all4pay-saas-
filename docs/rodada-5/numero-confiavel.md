# Rodada 5 — o número confiável de ponta a ponta (01/10/2026)

## Passo 1 — competência na entrada (e o Open Finance que não entraria)

Medido em produção: **1.650 de 1.772 lançamentos sem `competence_date`**
(815 de extrato, 823 de origem nula, 2 de venda) — o DRE caía no vencimento.

- Escritores que passaram a gravar a competência certa para o seu fato:
  extrato/importação (a data do movimento no banco), NFS-e (a emissão),
  ativação de recorrência (o vencimento de cada ciclo), documento por OCR (a
  data do documento), transferência entre contas (a data de cada perna) e os
  dois ETLs do Pluggy.
- ⚠️ **Achado maior: o Open Finance não entraria no próximo sync.** Os dois
  ETLs (`pluggy-sync-item`, `pluggy-webhook`) mandavam `status: "pago"`, e
  `status` é coluna GERADA desde 25/08 — o Postgres recusa (428C9), e o erro
  caía num `console.error` de Edge Function. Provado em banco local: o insert
  antigo é recusado, o novo (`situacao: "baixado"`) passa com `origem` e
  `competence_date` certos. Último sync real: 23/06.
  **⚠️ As Edge Functions só mudam em produção quando o dono as publicar** —
  o CI não publica funções.
- Guardas (`consistencia`, bloco `rodada5:`), teto ZERO, alcançando
  `supabase/functions`: nenhum escritor de `movements` sem competência; nenhum
  insert manda `status`. Provadas plantando os dois defeitos (a segunda só
  reprovou depois de corrigida: um comentário entre a vírgula e o campo
  escondia o `status` plantado).
- Sem backfill: o acervo antigo segue no fallback do vencimento, e a tela do
  DRE continua dizendo quantos.

## Fora do repositório, para o dono

- `own-webhook` e `own-sync` continuam **publicadas e ativas** no Supabase
  (`verify_jwt: false`), embora a OWN tenha saído do produto em 30/09.
  Apagá-las é ação no painel/CLI do Supabase.

## Passo 2 — declarar o plano de contas em um clique

Medido em produção: 5 das 11 categorias em uso sem `dre_linha` — o DRE delas
é adivinhado pelo nome.

- O aviso de palpite do DRE ganhou **"Revisar e declarar"**: a lista das
  categorias adivinhadas com a linha que o palpite escolheu JÁ marcada.
  Confirmar sem mexer não muda número nenhum — só transforma adivinhação em
  declaração; trocar a linha muda o DRE, e é a pessoa que sabe onde entra.
- `palpiteDoRelatorio` passou a devolver, por categoria, a linha sugerida (a
  de MAIOR valor) e a natureza; `planoDeDeclaracao` (puro) casa pelo nome
  normalizado: categoria existente é ATUALIZADA pelo id, a que só existe como
  texto é CRIADA; "Sem categoria", linha vazia e nome repetido não gravam.
  Grava pelo MESMO escritor do Plano de contas (`salvarCategoria`).
- Sugestão que não é escolhível para a natureza (ex.: restituição de imposto,
  entrada numa linha de dedução) fica em "Deixar no palpite" — declará-la
  seria recusado pelo cadastro.
- Guardas (`engine-audit`, bloco `t7`): declarar a sugestão devolve o MESMO
  DRE linha a linha e zera o palpite; a sugestão é a linha de maior valor
  (caso com duas linhas — o plantio só reprovou depois que esse caso entrou);
  o plano atualiza/cria/pula certo. Jornada `dre-declarar`: na demonstração,
  101 → 0 lançamentos por palpite e o Resultado Líquido idêntico ao centavo.

## Passo 3 — o número da IA leva à tela de origem

Pendência declarada da ONDA 14. `core/assistant/origem-numero` mapeia o RÓTULO
do número para a tela que mostra o mesmo número (EBITDA/receita bruta/margens →
DRE; runway/burn/ruptura → fluxo de caixa; saldo → Início; a receber/a pagar →
os painéis; vencidos → inadimplência; custo fixo → recorrentes). Na bolha da
resposta, o número vira link.

⚠️ Conservador de propósito: rótulo ambíguo ("Vencido", "Total", "Receita"
sem qualificador) e número de calculadora ficam SEM link — levar à tela
errada faz a pessoa concluir que a IA inventou. Guardas (`ia-origem`): toda
rota existe no inventário e não é alias; ambíguo não ganha link — provadas
plantando um alias e um mapeamento ambíguo. Jornada `ia-origem`: EBITDA → DRE,
runway → fluxo de caixa, clicando.

## Passo 4 — saldo zero × nenhuma conta cadastrada

Pendência declarada da ONDA 4: `RiskInput` carregava só `saldoAtual`, e "R$ 0
de saldo" e "nenhuma conta cadastrada" eram o MESMO número. Agora `contas`
(quantas contas financeiras) viaja junto — preenchido pelo mapeador único de
linhas e pela demonstração.

- `saldo()` com `contas === 0` é AUSENTE (`sem_conta`, forma curta "nenhuma
  conta cadastrada", com o caminho para resolver). Conta existente com saldo
  zero continua ZERO — é resposta. Sem a informação, nada muda.
- O saldo-herói da Home e o cartão "Caixa" do DRE mostram a ausência; a IA
  responde "qual meu saldo?" com a mesma ausência, nunca R$ 0,00.
- Guardas (`sem-conta`), provadas plantando o defeito.
