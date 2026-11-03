# CLAUDE.md — Quattro

Guia para qualquer agente (ou pessoa) que trabalha neste repositório. Este
arquivo guarda as **regras vigentes**. Ele foi enxugado em 03/11/2026: de
6.716 para cerca de 320 linhas. O texto anterior inteiro, com cada decisão,
defeito e medição, está **sem cortes** em
[`docs/historico/claude-md-ate-2026-11-03.md`](docs/historico/claude-md-ate-2026-11-03.md),
e o índice no fim deste arquivo aponta a seção certa.

⚠️ **Antes de mudar um módulo, leia a seção dele no histórico.** As regras
abaixo dizem o que vale. O histórico diz por que vale e qual defeito volta se
alguém desfizer.

---

## 1. Design system — a única fonte de verdade visual

O design system vigente é o de **27/10/2026**, que está no ar em
paguequattro.com/teste2 (projeto Framer "All4Pay", componentes `Q*`).
Onde as seções de identidade do histórico discordarem dele, vale o de 27/10.

### Regras que não se quebram

1. **Nenhuma cor, fonte, raio, sombra ou espaçamento fora dos tokens.** Os
   valores moram em **`src/design/tokens.json`**. Para mudar um valor, edite o
   JSON e rode `npm run tokens`. Nunca edite à mão o bloco `<tokens-gerados>`
   do `globals.css`. A guarda `npm run tokens -- --conferir` (dentro do
   `npm test`) reprova edição à mão, JSON sem gerar e token repetido.
2. **Nunca substituir nem contornar o DS.** Nada de segunda biblioteca de UI
   (Material, Chakra, cópias de shadcn) nem de token paralelo.
3. **Telas são montadas com as peças de `src/components/ui/`.** Se falta uma
   peça, ela entra no DS, no mesmo estilo, e não como exceção numa tela só.
4. **O número manda.** Dinheiro sempre por `<Money>`/`<BRL>`, com
   `tabular-nums`. A grafia é `R$ 16.000,00`, e os centavos vão no mesmo corpo
   e na mesma cor do inteiro.
5. **Lime (`#ECFD52`) só na ação**, abaixo de ~5% da tela, nunca como fundo
   grande. Lime nunca leva texto branco.
6. **Paleta:**
   - texto `#3B4332` (`--color-ink`), texto 2 `#5F5E4E`, meta `#7A7A72`,
     placeholder `#8C8B7E`;
   - fio `#E8E7E0`;
   - página `#F5F5F5`, com cartão `#FFFFFF` sem borda e sem sombra.
   - Guarda: `npm run paleta`. Hex solto em componente reprova.
7. **Tipografia, com duas famílias:**
   - **Quattro Agrandir 700** (`--font-display`) no título de tela, de seção e
     de card, e em **todo número** (valor, tabela, gráfico, data, %, contagem;
     o número sem classe é marcado por `MarcaNumeros`);
   - **Inter Display** (`--font-sans`) em todo o resto. Número no meio de uma
     frase e campo de formulário seguem em Inter.
   - Escala: display 52 · h1 34 · h2 24 · h3 19 · corpo 14 · rótulo 15 ·
     legenda 13.
8. **Formas:** cartão 24px · item 12px · bloco 32 · pílula cheia. O botão tem
   50px de altura, Inter Display 500 15px, e sobe 1px no hover.
9. **Sombra:** popover `0 24px 50px rgba(30,35,24,.16)`, pílula
   `0 14px 34px rgba(30,35,24,.12)`, cartão nenhuma.
10. **Sem vidro.** Popover, menu, gaveta e modal são sólidos (guarda `vidro:`,
    teto zero).
11. **Sem caixa alta.** Todo texto é "Aa" (regra global no `globals.css`). Só as
    siglas ficam em maiúsculas (DRE, EBITDA).
12. **Número não tem cor por sinal.** O valor fica na tinta do texto, e o sinal
    escrito diz a direção (`−` U+2212). Há quatro exceções declaradas, que a
    guarda `cor:` conhece:
    - a pílula de variação da Home (`Pilula` em `HomeSnapshot.tsx`);
    - a pílula de variação das dicas dos gráficos (`VariacaoPill`);
    - a cor da série de entrada e saída nos modelos da Biblioteca;
    - a vela (`Velas`).

    Status nomeado (vencido, pago), erro e alerta continuam coloridos.
13. **Ícones:** Lucide com traço 1,75px, sempre pelo `Icon`. As chaves ficam em
    `ui/lucide-icons.ts`, e nenhuma tela importa `lucide-react` direto.
14. **Gráficos:** saem da Biblioteca (`components/ui/GraficosBiblioteca.tsx` e
    `GraficosModelos.tsx`), com o nome do modelo do canvas. Toda dica nasce de
    `DicaGrafico`/`DicaRecharts`. As barras usam `RAIO_CHEIO`.

O `globals.css` foi enxugado em 03/11/2026 (de 2.217 para cerca de 1.500
linhas) sem mudar um pixel: `npm run css-equivalencia` grava o estilo
computado de todo elemento de toda tela antes e depois, e a comparação deu
zero diferença. A folha anterior, com o histórico nos comentários, está em
`docs/historico/globals-css-ate-2026-11-03.css`. Antes de mexer na folha,
grave e compare do mesmo jeito: a ordem das seções é a cascata.

O editor `/admin/design-system` edita um RASCUNHO com prévia ao vivo. "Salvar
no sistema" abre um PR com o `tokens.json`, e o merge é que publica.

---

## 2. Regras de produto vigentes (decisões do dono)

- **Uma porta de criação, sempre em pop-up.** Todo "Novo" chama
  `abrirCriacao(tipo)` (`components/app/criacao`). Não existe `router.push`
  para rota de criação nem um segundo formulário do mesmo item. Todo campo de
  cadastro oferece "+ Cadastrar novo" (`cadastrar={cadastroDe(...)}`).
  Guardas: "porta única" e `cadastrar:` em `npm run consistencia`.
- **Menu: uma pergunta, uma tela** (19/10/2026). Telas irmãs viram abas. Todo
  endereço antigo responde 308 por `core/rotas/aliases`, e nenhum link de tela
  aponta para alias (guarda na matriz). As abas Pro continuam Pro por
  `ABAS_PRO`.
- **A marca é Quattro** (`core/marca`); o assistente é **Quattro AI**. O que
  ficou com o nome all4pay está declarado com motivo na guarda `marca:`.
  O domínio oficial é `app.quattro.finance`. `all4pay-saas.vercel.app`
  continua respondendo e **não pode** ganhar redirect, porque o cron e a guarda
  `no-ar` chamam por ele.
- **Área da plataforma** (`/admin`): mesmo código, servido em
  `admin.quattro.finance` quando `ADMIN_HOST` está definido. O segundo fator é
  obrigatório. As seções ficam em `SECOES_ADMIN`, e os cadeados de servidor em
  `app/admin/layout.tsx`. **Interruptores** (`/admin/interruptores`) mostra,
  só para leitura, o que está ligado na plataforma.
- **Toda integração nova nasce DESLIGADA** por uma variável `=ligado`, que é
  lida num único lugar (há guardas de leitor único). Todas estão documentadas
  em `.env.example` (guarda `npm run env-doc`).
- **A OWN saiu do produto** (30/09/2026). Não reintroduzir. A maquininha
  própria (`/pos/*`, `maq_*`) fica.
- **Pinbank** (maquininha, extrato, cobrança Pix/boleto e link de pagamento):
  a Pinbank só é chamada pela porta `src/lib/pinbank/saida.ts`, a credencial é
  só de leitura e o vínculo EC → empresa é ato da plataforma.
  Detalhes em `docs/rodada-10/`.
- **Cobrança pela conta do cliente** (Inter e Itaú diretos, agregador para os
  outros): a credencial é por empresa e cifrada; uma conta recebe por vez.
  `processando`/`incerta` nunca deixam pedir outra cobrança.
  Detalhes em `docs/rodada-11/`.
- **A IA mora num lugar só:** o chat em tela cheia (`abrirChat()`,
  `ia/ChatGlobal.tsx`). A conversa só **lança** depois do clique em
  **Confirmar**, pelo escritor único `confirmarDocumento`. Os números das
  respostas saem do motor, nunca do modelo.
- **Os motores são cartões da conversa** (03/11/2026). Risco de caixa,
  Decisão, Saúde financeira e Sugestões saíram do menu: a pergunta que pede o
  motor traz o cartão dele na resposta (`core/assistant/widgets`, um catálogo
  só). A tela completa segue no endereço dela, Pro pelo servidor, aberta pelo
  cartão. Guarda: `npm run ia-widgets`.
- **Quattro AI no WhatsApp:** atrás de `WHATSAPP_IA`, só leitura (a etapa 5,
  lançar, está pendente).
- **Sem emoji**, exceto nos modelos de WhatsApp cadastrados na Twilio.
- **Boletos simulados ficam** enquanto a emissão real está em teste.

---

## 3. Regras de engenharia (valem para toda mudança)

1. **Duas fontes para um fato é um defeito agendado.** Ou existe UM escritor,
   ou a divergência chega no primeiro dia de tráfego. As saídas, em ordem de
   força: o banco RECUSA (coluna gerada, restrição); depois uma função só em
   `core/*`; depois uma morada só, apagando a outra. Sincronizar não resolve.
2. **Uma verdade só para indicador:** `src/core/indicadores`. Nenhuma tela soma
   lançamentos por conta própria (teto zero). `amount` é magnitude, e a direção
   vem de `type`. Liquidado é `status === "pago"`. A data sai sempre de
   `dataDe(m, regime)`.
3. **Zero é um valor, não a ausência dele.** Sem base, o indicador devolve
   `indisponivel` com código e motivo, e a tela mostra o motivo no lugar do
   número. Margem sem receita não é 0%.
4. **Toda guarda só conta depois de reprovar.** Plante o defeito, veja
   reprovar e mantenha o teste negativo. O vermelho tem de NOMEAR o defeito
   auditado.
5. **A fixture prova que o caminho recebeu valor.** Asserte que o número
   mudou, não só que nada quebrou.
6. **Meça com o dado que a superfície usa**, e saiba dizer por qual campo ela
   classifica e em que ambiente ela roda. "Refutado" só vale quando a medição
   mediu o que a conclusão afirma.
7. **Quando uma guarda expõe um defeito, o defeito é o trabalho.** Contornar a
   guarda é proibido.
8. **Toda migration passa por `begin; … rollback;`** contra um Postgres real
   antes do push, e o resultado é conferido por SELECT. Extensão de plataforma
   (`cron`, `net`, `vault`) ausente faz a migration pular **com aviso**, nunca
   em silêncio. Placeholder não substituído reprova.
9. **Todo default de configuração nasce por seed E por gatilho.** O seed cobre
   o passado, o gatilho cobre o futuro.
10. **Prove que aguenta antes de ligar.** Todo caminho automático novo precisa
    de prova de carga antes do primeiro disparo: volume, idempotência
    (reexecutar o caminho real em transação desfeita dá zero linhas novas) e o
    que muda na tela.
11. **Teste de contrato não importa a função que ele audita.** Use uma
    implementação independente e âncoras literais.
12. **Instrumentação sem consumidor não conta como feita.**
13. **Decisão tomada e não executada volta como defeito.** Toda decisão sai com
    as duas metades no mesmo commit: o que muda e o que passa a reprovar se
    alguém desfizer.
14. **Estado terminal não se contorna.** Cancelado não ressuscita. Uma
    transição nova tem nome e motivo.
15. **Escritor de dinheiro nunca grava só no dataset de demonstração** (exige
    `isDemo` no escopo) e nunca grava sem `origem`. Quando o banco recusa, a
    mensagem real vai para a tela.
16. **Dado de demonstração tem marca** (`is_sample`). `semAmostra` exclui por
    omissão, e quem quer ver a amostra escreve `"incluir-amostra"`.
17. **Dado de negócio não mora só no navegador.** Toda chave passa por
    `store-org` e é classificada nas quatro listas (teto zero).
18. **Gating de plano é decisão de servidor** (`middleware.ts` +
    `meu_plano()`). A tela só apresenta.
19. **Segurança:** quem autoriza é o banco. A organização é a ABERTA
    (`auth_org_id()`), nunca o primeiro vínculo. A permissão é "o que eu sou
    AQUI" (`tem_permissao(acao, org)`). Quem pede não aprova.
20. **Texto de tela não fala de implementação**, nem em inglês. Siga o
    vocabulário de `core/glossario`.
21. **Arreio copiado é medida; arreio escrito é hipótese.** Copie o setup do
    teste de banco que já passa. Casos isolados por savepoint.

---

## 4. Como trabalhar aqui

- **PR sempre**, criado como rascunho. **Nenhuma migration é aplicada por
  agente**: o agente escreve o arquivo e quem aplica é o dono, depois do
  merge (o job `migrar` do CI aplica no merge).
- **Mudança visual só vai a merge com prints.**
- **PR verde é autorização, exceto quando muda quem pode chamar o quê**
  (autorização, interruptor, rota que passa a recusar). Nesse caso, pare e
  chame o dono.
- **Quando o CI não executa**, a verificação local substitui, com três metades:
  `npm test`, `npm run build` e a conferência de conflito. O relatório diz,
  com todas as letras, que o CI não rodou.
- **"No ar" é um estado contínuo.** O `main` publica na Vercel. Para conferir
  pelo sinal direto, use `curl -s https://all4pay-saas.vercel.app/api/versao`:
  o `commit` tem de ser o da mudança. A guarda `npm run no-ar` roda a cada
  15 minutos.
- O branch padrão do repositório é `claude/epic-fermi-i423xk`. Ele não publica,
  mas é onde o `schedule` e o "Run workflow" do GitHub enxergam os workflows.
  Merge, nunca force-push.
- **Agentes** (`.claude/agents/`): `erp-gestor`, `erp-dev` e `guarda`. A fonte
  de versão deles é o repositório `quattro-agency`.

### Comandos

```bash
npm run dev          # servidor local
npm run build        # build de produção (NEXT_PUBLIC_ALL4PAY_DEMO=true para a demonstração)
npm run typecheck    # tsc --noEmit
npm test             # a suíte completa de guardas: rode antes de todo commit
npm run consistencia # matriz de consistência cruzada (dois caminhos, mesmo número)
npm run reconciliacao # todos os caminhos de cada indicador, par a par, a 1 centavo
npm run coerencia    # combinações de números que não podem ser verdade juntas
npm run audit        # regressão dos defeitos de auditoria (engine-audit)
npm run paleta       # nenhuma cor fora do DS
npm run tokens       # gera o bloco de tokens do globals.css a partir do tokens.json
npm run css-equivalencia -- gravar antes.jsonl   # estilo computado de cada tela (exige o app servido)
npm run ia-eval      # o comportamento das respostas da IA
npm run mobile       # medição no telefone (exige `npx next start -p 3100`)
npm run fluxos       # os quatro fluxos essenciais no telefone
npm run e2e          # jornadas de usuário contra o build de demonstração
npm run isolamento   # duas empresas, nenhum cruzamento (exige SUPABASE_DB_URL)
```

Demonstração: `NEXT_PUBLIC_ALL4PAY_DEMO=true` (ou sem Supabase) serve o seed de
`src/lib/demo/seed.ts` com o selo "Demonstração". Nunca invente dado numa tela
fora da demonstração.

---

## 5. Onde mora cada coisa

| Assunto | Onde |
| --- | --- |
| Tokens (cor, tipo, raio, sombra) | `src/design/tokens.json` → `npm run tokens` |
| Peças do DS | `src/components/ui/` (barril `@/components/ui`) |
| Moldura do app | `components/app/AppShell.tsx`, `dashboard/Sidebar.tsx`, `dashboard/nav-data.ts` |
| Indicadores canônicos | `src/core/indicadores` |
| Ingestão (extrato, OCR, Open Finance) | `src/core/ingestao`, `src/core/fdip` |
| Rotas, aliases, inventário | `src/core/rotas/` |
| Planos e gating | `src/core/planos`, `src/middleware.ts` |
| Persistência por empresa | `src/lib/store-org.ts` + `org_state` |
| DRE e relatórios | `src/core/relatorios`, `src/core/dre` |
| Motores (risco, quant, decisão, autônomo) | `src/core/risk-engine`, `quant`, `decision`, `autonomous` |
| IA (chat, motor nativo, contexto de tela) | `src/components/ia/`, `src/core/assistant`, `src/core/ia` |
| Área da plataforma | `src/core/area-admin`, `src/components/admin/` |
| Interruptores | `src/core/interruptores`, `src/lib/interruptores.ts` |
| Pinbank | `src/lib/pinbank/`, `src/core/pinbank`, `docs/rodada-10/` |
| Cobrança por banco | `src/core/cobranca-banco`, `src/lib/cobranca-banco/`, `docs/rodada-11/` |
| Canvas do design | `docs/design/` |

---

## 6. Índice do histórico

Todas as seções abaixo estão em
[`docs/historico/claude-md-ate-2026-11-03.md`](docs/historico/claude-md-ate-2026-11-03.md),
com o mesmo título.

**Identidade (anteriores ao DS de 27/10, viraram histórico):** DS 16/10,
tokens em uma fonte, editor do DS, Jota, Canvas Quattro ERP, Tema ERP,
Identidade Quattro 30/09, Paleta quente, DS Ledger/Visor, Laboratório de
Design.

**Produto:**
- Home snapshot (sugestões adaptativas, rodízio, chat em tela cheia, ajuste de
  prioridades, biblioteca de cards);
- moldura da proposta;
- gráficos e tabelas, e as trocas do canvas;
- Rodada 10 (Pinbank, conferência, cobrança, link e Pix atualizado);
- cobrança por banco (Inter e Itaú);
- página da maquininha (oferta, CRM e ficha do lead);
- conversa que lança;
- WhatsApp;
- Rodadas 9, 8, 7, 4 e 30/09;
- enxugamento do MVP e Campfire;
- venda com uma morada só (`sales_docs`).

**Módulos:**
- contas a receber e contas a pagar (lançamento, recorrentes, projeção);
- folha salarial;
- exportação ao contador;
- Início;
- lançamentos;
- Benchmark IULI e hubs;
- risco, inadimplência, investor update, quant, IA executiva, decisão,
  autônomo e DRE Intelligence;
- simulador "posso comprar?";
- CNAE e regras de categorização;
- relatórios, vendas e NFs, Central de Ajuda, Administração, Contabilidade
  (Domínio) e compras;
- QR, XLSX e DOCX;
- movimentações, orçamento, cadastros, painéis e dashboards customizados;
- onboarding, PF × PJ, fluxo de caixa e extrato;
- funil pagar/receber e recorrências;
- upload e FDIP;
- SO financeiro e governança;
- multi-tenant, `/admin` e cobrança da plataforma (Etapa D).

**Ondas e defeitos auditados:**
- Ondas 2 a 14 (isolamento, ingestão, rotas, persistência, controles, trilha
  e backup, multiempresa e permissões, fato × modelo, glossário, telefone e
  acessibilidade, contábil e fiscal, IA responsável);
- os quatro defeitos de gravação;
- os achados refutados A4P-028 e A4P-036;
- A4P-032 (teto de 97%);
- A4P-085 (nome da empresa);
- estado × evento (`objetos`/`ddl`);
- a competência lida;
- a invariante do fundo;
- segregação na empresa de uma pessoa;
- `status` × `situacao`;
- a confirmação de e-mail desligada (dívida com gatilho: o primeiro cliente
  pagante).
