# Como se altera o banco do all4pay

Este arquivo tem **um assunto só**: quem pode escrever no banco, e por onde.
Tudo o mais — design system, motores, convenções de número — está no
`CLAUDE.md`.

---

## A regra

> **Produção recebe apenas migration versionada, no repositório, revisada em PR.**
> Nenhuma sessão — humana ou de agente — aplica DDL direto no projeto de
> produção.

O caminho esperado é: escrever o arquivo em `supabase/migrations/`, abrir PR,
CI verde, merge. O banco muda quando o `main` muda, não antes.

---

## Por que esta regra existe (o caso que a motivou)

Em **13/08/2026, às 14:18**, uma sessão de agente que testava as APIs da OWN
(nossa adquirente de POS) aplicou `own_integracao_adquirencia` **direto no
projeto de produção**: 9 tabelas, 1 view, 9 políticas de acesso por linha, 16 KB
de DDL. Não foi incidente de segurança e o SQL era bom — mas o repositório não
sabia que ele existia.

⚠️ **O custo não é o risco de quebrar produção; é a DERIVA.** Um ambiente montado
do zero (`supabase db reset`) nasce sem aquelas tabelas. A partir daí, "o
schema" passa a ser duas coisas diferentes conforme quem pergunta, e a diferença
só aparece quando alguém tenta reproduzir um defeito e não consegue.

⚠️ **E foi por sorte que se descobriu.** A guarda `npm run esquema` compara o
repositório com um MANIFESTO (`supabase/esquema.json`), e o manifesto é
atualizado à mão — se ninguém o tivesse sincronizado naquele dia, a divergência
ficaria invisível pelo tempo que fosse. Ela foi encontrada porque outra tarefa,
sem relação, precisou sincronizar o manifesto.

A recuperação é possível — o SQL literal fica em
`supabase_migrations.schema_migrations.statements`, e a fidelidade se prova pelo
md5 (foi assim com as 26 de 05/08/2026 e com esta) — mas depende de alguém
perceber. Recuperar é conserto; a regra existe para não precisar dele.

---

## O caminho para uma sessão de agente

Uma sessão de agente **não tem** um ambiente de banco próprio por padrão, e é
justamente essa ausência que empurra para o atalho. As duas saídas, em ordem de
preferência:

### 1. Branch do Supabase (preferido)

O Supabase cria um banco efêmero a partir das migrations do repositório:

```bash
supabase branches create <nome>      # nasce do estado das migrations, não da produção
supabase db push --branch <nome>     # aplica o que está em supabase/migrations/
```

⚠️ O ponto que o torna a opção certa: o branch nasce **das migrations**, então
uma migration que só existe no banco simplesmente não aparece lá — o desvio
falha na hora, em vez de silenciosamente funcionar.

Ao terminar: `supabase branches delete <nome>`.

### 2. Projeto separado de desenvolvimento

Um segundo projeto Supabase, com as mesmas migrations aplicadas. Mais barato de
entender, mais fácil de esquecer de atualizar — por isso é a segunda opção.

### O que NÃO fazer

- ❌ `apply_migration` / `execute_sql` com DDL apontando para o projeto de
  produção (`dzszmbowhzopocqydnxu`).
- ❌ "Aplico agora e depois gero o arquivo." O depois não chega: a sessão
  termina, o contexto some, e o arquivo fica faltando sem ninguém saber.
- ❌ Criar a tabela pelo painel do Supabase. É o mesmo desvio com outra
  interface, e este nem deixa o SQL em `schema_migrations` para recuperar.

---

## O que é permitido em produção, sem migration

**Leitura**, sempre. E **escrita de DADOS** quando o trabalho é sobre os dados —
com duas condições: rodar dentro de uma transação desfeita (`begin … rollback`)
quando for só para provar algo, e mostrar o impacto medido antes de gravar
qualquer coisa em definitivo.

O corte é entre **forma** e **conteúdo**: mudar a forma (tabela, coluna,
política, função, gatilho) é migration; corrigir conteúdo (marcar uma linha,
apagar duplicata) é operação, e a trilha de auditoria a registra.

### ⚠️ SONDAGEM VAI NO BANCO EFÊMERO, NUNCA EM PRODUÇÃO

Sondar é criar um objeto descartável só para MEDIR o comportamento do banco —
uma tabela para provar que a política de linha filtra, uma função para ver se o
gatilho de DDL dispara. É trabalho legítimo, e o lugar dele é o banco que
`supabase start` levanta do zero: lá o objeto morre com o contêiner e não deixa
rastro em lugar nenhum.

Em produção ele deixa. E deixa no pior formato possível: **o objeto some do
estado quando você o remove, mas o EVENTO fica no `ddl_log` para sempre.** Foi
exatamente isso que a auditoria de 17–18/08 produziu — 13 sondagens já
apagadas, invisíveis para o `npm run objetos` (que compara ESTADO) e acusadas
pelo `npm run ddl` (que lê EVENTO). Cada uma teve de ser declarada NOMINALMENTE
depois do fato, em `supabase/ddl-declarado.json`.

⚠️ **Se uma sondagem precisar mesmo rodar em produção, ela é declarada ANTES,
não depois.** Declarar depois é pedir perdão, e transforma a guarda num registro
do que já aconteceu em vez de um portão. Vale para agente, para humano e para
qualquer sessão futura.

⚠️ **E NUNCA silencie por `--dias`.** A guarda aceita a janela, e usá-la para
esconder uma sondagem registrada a deixa cega para a PRÓXIMA — que é o que ela
existe para pegar. Janela silencia por IDADE; declaração silencia por NOME.

**Dívida é outro bloco, com DONO e PRAZO** (`dividas_declaradas`): objeto real,
em uso, cujo `CREATE` mora fora do repositório — hoje o subsistema `own_token_*`
das Edge Functions (A4P-076). *O CREATE mora nas Edge Functions, fora do
repositório: dívida aberta, não exceção permanente.* Prazo vencido **reprova** —
dívida sem prazo que vence vira paisagem, que é como as 29 divergências de
esquema chegaram até aqui.

### ⚠️ RECLASSIFICAR DADO É EXPAND/CONTRACT — o código que INTERPRETA vai antes

A regra do expand/contract vale para **dado**, não só para schema:

> **Reclassificação de dado só entra em produção DEPOIS do código que a
> interpreta.** Primeiro publica-se quem sabe ler a nova forma; só então o dado
> muda de forma.

**O caso que a motivou (14/08).** Uma categoria genérica "Impostos" foi separada
em quatro — Simples Nacional, INSS patronal, FGTS e IRPJ/CSLL — com a natureza
declarada em `categories.dre_linha`. O dado foi reclassificado em produção
**antes** de o código que lê `dre_linha` estar publicado. Resultado: produção
ficou num estado PARCIAL, com o palpite por palavra-chave ainda mandando —
deduções caíram de R$ 248.707,93 para R$ 204.068,69, exatamente o FGTS, **o
único dos quatro que o regex soltou**. INSS, IRPJ e Simples seguiram presos na
dedução, e o DRE mostrou 39,0% de dedução sobre a receita: ainda impossível em
qualquer regime brasileiro.

⚠️ **E a invariante segurou por SORTE, não por desenho.** O resultado líquido
não se mexeu porque as três categorias presas continuaram caindo em linhas que
se anulam na cascata — coincidência da ordem em que os regex casam, não
propriedade da operação. Numa separação em que o regex soltasse duas das quatro,
o fundo teria mudado, e a janela entre a reclassificação e o deploy teria
publicado um resultado errado para o cliente.

**Na prática:** o PR que ensina o código a ler a nova classificação vai primeiro
e **merge antes**; o `UPDATE` que reclassifica vem depois. Se a ordem se
inverter por acidente, a janela é visível — e o conserto é mergear, não
reverter o dado.

---

### ⚠️ TODA GUARDA SÓ CONTA COMO GUARDA DEPOIS DE REPROVAR

**Plante o defeito que ela deveria pegar, veja reprovar, e guarde esse teste
negativo junto com o positivo.** Guarda que nunca reprovou é decoração — e
decoração custa mais que ausência, porque fabrica confiança.

O caso que fixou a regra (A4P-073): a asserção `reconciliação: fecha depois de
explicada` cobrava `rec.fecha`, e `fecha` saía de

```
aberturaHistorica = extrato − liquidadoTotal
residuo           = extrato − (liquidadoTotal + aberturaHistorica)   ≡ 0
```

Isto é `x − x`. Medido com saldo 600, 0, −999.999, 123.456,78 e um bilhão:
resíduo **0,00** e `fecha: true` nos cinco. Plantar **+R$ 12.345,67** no saldo,
sem lançamento nenhum correspondente, **passava sem uma reprovação**. A guarda
existia, rodava em todo push, e não podia falhar.

⚠️ **E ela ficava verde por dois motivos diferentes, o que a tornava pior:**
contra defeito de MOTOR ela reprovava de verdade (plantar um erro em `saldoEm`
derrubou 6 asserções), então havia evidência de que "funcionava". Só contra
defeito de DADO — o caso que o nome dela promete — é que era cega.

⚠️ **CONSERTO QUE RENOMEIA PARCELA SEM MUDAR COMO ELA É CALCULADA NÃO É
CONSERTO. É a segunda vez neste repositório.** A ONDA 4 declarou ter resolvido o
resíduo absorvido (os R$ 437.983,17 rotulados "conciliado") e o que fez foi dar
NOME às parcelas — a de fechamento continuou sendo calculada por diferença, ou
seja, continuou existindo para fazer a conta fechar. O texto melhorou, a
propriedade não mudou, e a auditoria seguinte reencontrou o mesmo defeito com
outro rótulo.

O teste de que houve conserto de verdade: **a asserção passa a poder falhar.**
Se depois da correção nenhuma entrada plausível reprova, nada foi consertado.

---

## Depois de aplicar qualquer coisa

```bash
SUPABASE_DB_URL=postgres://... npm run esquema:sync   # refaz o retrato do banco
npm run esquema                                       # a guarda tem de passar
```

⚠️ **`esquema:sync` é o momento em que a alteração manual aparece** e obriga a
decisão: vira arquivo, ou vira divergência declarada com motivo e data-limite.
Não há terceira opção — dívida sem prazo é dívida que virou permanente em
silêncio.

---

## ⚠️ "A CI não rodou" quase nunca é a CI — o buraco do branch reaproveitado

**Antes de suspeitar de minutos, cota ou workflow desabilitado, olhe o
`mergeable_state` do PR.** Um PR em conflito com a base **não gera run nenhum**,
e "nenhum run" é visualmente idêntico a "o Actions está bloqueado".

O mecanismo: o gatilho `pull_request` roda contra `refs/pull/N/merge`, a
prévia do merge. Com conflito, o GitHub não consegue construir essa referência
e simplesmente não cria o run. E o `push` deste repositório é restrito a `main`
e `claude/epic-fermi-i423xk` (decisão declarada em `ci.yml` — evita dois runs
idênticos competindo pelos mesmos minutos), então **branch de trabalho depende
exclusivamente do `pull_request`**. Conflito ⇒ silêncio total.

**A causa a montante é reaproveitar o branch depois de um squash-merge.** O
squash reescreve o trabalho num commit novo: a cabeça antiga do branch **não
vira ancestral** do `main`. Continuar committando ali faz o PR seguinte nascer
divergente, e ele conflita em qualquer arquivo que os dois lados tenham tocado
— na prática, sempre `CLAUDE.md` e `scripts/consistencia.mts`, que toda mudança
edita.

Medido em 13/08/2026: o PR #95 foi squash-mergeado às 19:24 de 12/08 a partir
deste mesmo branch; o PR #96 nasceu dele às 14:32 do dia seguinte, **já
conflitado**, e passou ~20 horas sem um único run. No instante em que o merge
de `main` resolveu o conflito, o run apareceu em **4 segundos** e o estado do PR
foi de `dirty` para `unstable`. Nada de cobrança mudou nesse instante — o que
mudou foi o conflito. Ao longo dessas 20 horas também não houve push em `main`
nem em `epic-fermi`, o que explica por que nem lá havia runs e por que a
ausência pareceu geral.

**O que fazer, na ordem:**

1. **Depois de todo squash-merge, reinicie o branch a partir do `main`**
   (`git fetch origin main && git checkout -B <branch> origin/main`). É o passo
   que impede o conflito de existir. O branch só carrega história já mergeada,
   então não se perde nada.
2. Se um PR já estiver sem run, **cheque `mergeable_state` primeiro**. `dirty`
   é a resposta; qualquer outra investigação depois disso.
3. Resolvendo, **use MERGE de `main` no branch, nunca rebase** — este branch tem
   mais de um escritor e rebase reescreveria história compartilhada.

⚠️ **O custo de errar o diagnóstico cresce com o que está no PR.** Aqui ele foi
tempo perdido e um aviso errado ao dono do repositório ("destrave os minutos do
Actions"). No PR seguinte pode haver motor de cálculo dentro — e aí "achei que a
CI estava quebrada" vira código de dinheiro mergeado sem uma guarda ter rodado.

---

## O que ainda NÃO está automatizado, e é honesto dizer

A regra acima é **processo, não trava**: quem tem a chave de serviço continua
podendo aplicar DDL em produção, e nada além da revisão impede. As travas que
faltam, na ordem em que valem a pena:

1. **A guarda de esquema no CI já existe** (`npm run esquema`) e reprova
   divergência não declarada — mas roda contra o manifesto versionado, então só
   pega o desvio **depois** que alguém sincroniza. Ligá-la contra o banco no CI
   (com credencial de leitura) a tornaria imediata.
2. **Separar as credenciais**: a sessão de agente recebe a chave do branch, não
   a de produção. É a trava de verdade — as outras dependem de alguém olhar.
3. **Um gatilho de evento de DDL** em produção que registre toda criação de
   tabela na trilha de auditoria. Não impede, mas tira o "ninguém soube".

Enquanto (2) não existir, esta regra vale pelo que qualquer regra escrita vale:
ela transforma um esquecimento em uma decisão que alguém tomou contra o que está
documentado — e isso aparece na revisão.
