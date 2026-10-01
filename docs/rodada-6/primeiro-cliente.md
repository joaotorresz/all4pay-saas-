# Rodada 6 — pronto para o primeiro cliente pagante (01/10/2026)

Duas etapas do plano já estavam feitas e saíram dele: o Laboratório de Design
só monta fora de produção (`NODE_ENV !== "production"`), e a tela do autônomo
já separa "decisão sua" de "requer aprovação" e diz que nada executa sem clique.

## 1. A purga da amostra leva os contatos que só ela criou

Pendência declarada desde a marca `is_sample`. Medido em produção: 459
lançamentos de amostra ainda gravados e **15 contatos** referenciados SÓ por
eles. `purgarAmostra` decide os contatos ANTES de apagar (depois, a amostra que
os referenciava não existe mais) e os manda para a LIXEIRA, nunca exclusão
física — pode ter virado cadastro de verdade, e a lixeira devolve. Contato que
a empresa também usou (lançamento, venda ou recorrência fora da amostra) fica.
O banner diz o que vai acontecer com os contatos, pela MESMA consulta da purga.
Guardas `amostra-contatos`, provadas plantando a regra frouxa.

## 2. O papel vale em toda tabela de dinheiro (migration `20261002120000`)

A ONDA 9 cobriu três tabelas; o resto aceitava gravação de qualquer membro.
Políticas restritivas (escrita + exclusão separada), com
`tem_permissao(acao, org_id)`: venda, item, rateio e recorrência exigem
`lancar`; razão exige `lancar` ou `fechar`; cadastros exigem `lancar` ou
`administrar`. Impacto medido: os 23 vínculos de produção são owner/admin/
member — ninguém perde acesso hoje. Guarda de banco `scripts/papel-dinheiro.sql`
(no CI): leitor recusado em 3 tabelas com a política nomeada, contador grava no
razão e é recusado na venda, titular grava, leitor continua lendo — provada
removendo uma política.

⚠️ **Muda quem pode gravar o quê: o merge espera a confirmação do dono.**
