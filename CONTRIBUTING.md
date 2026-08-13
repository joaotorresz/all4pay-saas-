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
