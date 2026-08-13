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

## ⚠️ EXPAND / CONTRACT — a condição para acoplar migration ao deploy

Acoplar a migration ao merge para `main` é a arquitetura certa: hoje código e
schema sobem por **eventos diferentes**, e foi essa dessincronia que produziu o
13/08 — cinco migrations no banco enquanto os commits que as usam estavam
parados num branch.

⚠️ **Mas acoplar SEM esta regra piora as coisas.** A migration roda enquanto o
código antigo ainda está servindo: numa janela de segundos a minutos, o schema
novo convive com o binário velho. Adicionar coluna nessa janela é inócuo;
**remover ou renomear derruba produção na hora.**

Por isso toda migration se classifica em uma das duas:

- **Expand** — acrescenta (coluna, tabela, índice, função, política nova). Sobe
  **junto ou antes** do código que a usa. Segura porque o código velho ignora o
  que não conhece.
- **Contract** — remove ou renomeia (drop, rename, alteração de tipo que
  quebra leitura, `not null` em coluna que o código ainda deixa vazia). Sobe
  **pelo menos um release DEPOIS** do código que parou de usar aquilo.

Na prática, tirar uma coluna leva dois releases: primeiro o código para de
lê-la, publica e fica; só então a migration a remove. É mais lento de
propósito — a lentidão é o que dá à janela de convivência um lado seguro.

⚠️ **A regra vale mesmo quando "ninguém mais usa".** "Ninguém usa" é uma
afirmação sobre o código do repositório; produção serve o que foi publicado, e
os dois só coincidem depois do deploy. É a mesma distinção que fez a guarda
`trilha-completa` não enxergar as tabelas que só existiam no banco.

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
