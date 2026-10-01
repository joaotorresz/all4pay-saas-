# Rodada 8 — Competência na importação (01/10/2026)

Escolha do dono: "Competência na importação". Medido em produção antes, só leitura.

## O que a medição achou

| Medida | Valor |
| --- | --- |
| Lançamentos sem `competence_date` | 2.098 (823 manuais antigos · 815 de extrato · 458 da amostra · 2 de venda) |
| O mais recente deles | 25/08/2026 — desde a Rodada 5 todo escritor grava a data |
| Planilha em lote com coluna de competência | nenhuma |
| Extrato: competência gravada | sempre a data do banco (o aluguel de setembro pago em 05/10 caía em outubro) |
| Demonstração: competência chegando ao DRE | não chegava (o ramo de demo não a levava) |

## O que mudou

1. **`core/importacao/competencia`** — a regra, pura. Célula em branco é
   AUSENTE (vale o vencimento, e a tela conta quantas linhas caíram nele);
   célula ilegível é ERRO nomeado, nunca o fallback calado; o mês basta
   ("09/2026" vira o dia 1º).
2. **Planilha em lote** (`ImportacaoView`): coluna "Competência" no FIM dos
   modelos de contas a receber e a pagar — a planilha antiga de seis colunas
   continua lida na mesma posição. A tela diz quantas linhas vão para o DRE
   pelo vencimento.
3. **Revisão do extrato** (`RevisaoImportacao`): competência por linha (mês) e
   a proposta "Levar N contas fixas para o mês anterior" — só SAÍDAS de
   contraparte que aparece em 3+ meses do próprio extrato, pagas até o dia
   escolhido. O número aparece ANTES do clique, há "Desfazer", e nada se aplica
   sozinho. A escolha é guardada pelo `fingerprint` (o id renasce a cada
   reanálise da IA).
4. **Escritor do extrato** grava a competência dita na frente da data do fato;
   a chave de idempotência NÃO muda com a competência (reimportar com outra
   escolha não duplica).
5. **Demonstração**: a competência passou a chegar ao DRE também em demo — o
   mesmo lançamento caía em meses diferentes conforme o ambiente.

## Provas

- Bloco `rodada8` no `engine-audit` (18 asserções), provado plantando 4
  defeitos: ilegível caindo no vencimento, chave pelo id, proposta movendo toda
  saída, planilha ignorando a coluna.
- Jornada `scripts/e2e/importacao-competencia.mjs`: a proposta aplica
  exatamente o número prometido, desfaz, e o lançamento gravado carrega a
  competência escolhida — e só os escolhidos.

## O que NÃO foi feito, e por quê

- **Preencher a competência dos 2.098 antigos.** Gravar o vencimento como
  "competência" afirmaria uma escolha que ninguém fez e apagaria o aviso de
  cobertura do DRE, que é o que diz quantos lançamentos apuram pelo fallback.
- **Mover a competência automaticamente** pelo padrão do extrato: é a mesma
  regra da Rodada 7 — palpite aplicado em silêncio vira dado com cara de
  conferido.
