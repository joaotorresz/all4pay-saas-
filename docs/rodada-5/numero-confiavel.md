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
