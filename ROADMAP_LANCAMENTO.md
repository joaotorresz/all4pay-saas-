# Roadmap de lançamento — beta aberto (cenário B)

> Documento vivo. Cada item tem **dono** (você / eu), **estado** e, quando é
> trava, o **porquê de ser trava**. A ordem não é cronológica — é de
> **dependência e risco**: nada abaixo começa antes de o que está acima estar
> resolvido, quando há seta.

**Cenário escolhido:** cadastro aberto, **beta gratuito**, **cobrança manual por
fora**. Isto é honesto amanhã; "SaaS pago com autoatendimento" não é (falta
cobrança e o caminho de pagamento nunca foi exercitado).

**A frase que vai no topo da tela de cadastro:** _"Beta gratuito. Seus dados são
reais e ficam salvos; algumas integrações ainda estão chegando."_ — porque um
beta que avisa o que não faz é levado a sério; um que esconde perde o cliente no
primeiro buraco.

---

## O CRITÉRIO DE LANÇAMENTO (o portão)

Não lança sem **todos** estes. Cada um é medível, não é opinião:

- [ ] **Backup ativo E restauração testada** — o único sem conserto se falhar
- [ ] **Produção sai de branch protegida** — não de branch de trabalho
- [ ] **Cadastro → primeiro lançamento funciona** — ponta a ponta, telefone e computador
- [ ] **Os 4 fluxos essenciais passam** (`npm run fluxos`)
- [ ] **12 guardas verdes** (`npm test`)

---

## FASE 0 — As travas de infraestrutura (VOCÊ, ~1h30)

Sem isto, o resto é construir sobre areia.

| # | Ação | Onde | Por que é trava |
| --- | --- | --- | --- |
| 0.1 | **Supabase → Pro** | Billing | Plano `free` provavelmente não tem backup restaurável. Dado financeiro de cliente real sem backup está a um `delete` de não existir. ~US$ 25/mês |
| 0.2 | Confirmar **backup diário ativo** | Database → Backups | "Existe backup" ≠ "o backup volta" — o teste é a Fase 1 |
| 0.3 | **Ligar `mailer_autoconfirm`** (por ora) | Auth → Email → desmarcar "Confirm email" | Achado hoje: confirmação está LIGADA, sem SMTP e sem tela de espera. Sem isto, **ninguém entra depois de cadastrar** (a guarda 2.1 evita o dado órfão, mas a pessoa ainda não entra) |
| 0.3b | **SMTP próprio** (Resend/SES) OU aceitar autoconfirm | Auth → SMTP Settings | Achado hoje: o e-mail padrão do Supabase tem **rate limit baixíssimo** — o cadastro devolveu `429 over_email_send_rate_limit` no 2º teste. Com autoconfirm (0.3) o cadastro não depende de e-mail; mas "esqueci a senha" depende, e vai bater no mesmo teto |
| 0.4 | Decidir a **linha do produto** | — | `main` morta desde 17/06, sem ancestral comum com a linha viva. Recomendo: a linha viva vira `main` |
| 0.5 | **Vercel → produção aponta para `main`** | Vercel → Settings → Git | Hoje qualquer push na branch de trabalho vai ao ar. Com cliente dentro, é acidente com data marcada |
| 0.6 | **Proteger `main`**: 12 checks obrigatórios, sem bypass de admin | GitHub → Branch protection | Converte "aviso" em "trava". Foi com guardas verdes e sem trava que as 29 derivas conviveram |

⚠️ **0.4 é irreversível.** Não é merge (144 arquivos conflitantes, nenhum lado é
base). É renomear: `main → main-junho-2026`, `linha-viva → main`.

**Verificado (05/08):** os **54 arquivos que só existem em `main`** foram
conferidos um a um e **nenhum é perda funcional**:

- ~24 rotas antigas (`/pagamentos`, `/dre`, `/copiloto`…) → viraram **aliases**
  com redirect na ONDA 6; cada link antigo ainda leva ao destino;
- ~24 motores/telas de vitrine técnica (`datamoat`, `orchestration`,
  `arquitetura`, `inbox`…) → **removidos por decisão** (~2.600 linhas sem uso);
- `CentralPagamentosView`/`CentralRecebimentosView`/`lib/inbox` → removidos, o
  funil foi unificado;
- `AccountsCard` → o componente sumiu, a **função sobrevive** (saldo em
  `BaseDoSaldo`/`FinanceiroView`);
- `SalesChart` → só mudou de lugar; o hook `useSalesChart` segue ativo.

Ou seja: promover a linha viva a `main` **não descarta nenhuma funcionalidade**.
O que `main` tem a mais são versões ANTIGAS do que já evoluiu.

---

## FASE 1 — Provar a rede (EU, ~2h) → depende de 0.1

| # | Ação | Estado |
| --- | --- | --- |
| 1.1 | **Teste de restauração** em branch efêmero (US$ 0,32/dia, derrubo no mesmo dia) | aguarda 0.1 + sua aprovação de custo |
| 1.2 | Registrar o tempo de recuperação medido | — |

"Dá para restaurar" sem tempo medido é palavra. O branch prova que o backup
volta, e em quanto tempo.

---

## FASE 2 — O caminho crítico do cenário B (EU, ~3h)

O autoatendimento é a única coisa que **todo cliente novo faz e que ninguém
nunca testou de ponta a ponta**. É aqui que o beta vive ou morre.

| # | Ação | Estado |
| --- | --- | --- |
| 2.1 | **Guard do wizard** (PJ e PF): `signUp` sem sessão → tela "confirme seu e-mail" + perfil salvo local, em vez de gravar órfão e empurrar para rota que rejeita | ✅ **feito e medido** |
| 2.2 | **Cadastro → 1º lançamento** dirigido toque a toque, produção real, telefone + computador | após 0.3 |
| 2.3 | **DRE multi 0/0** — preciso da sua medição logado. Se for do componente, conserto (~1h) | aguarda medição |
| 2.4 | Varredura de erro no cadastro: nenhum 4xx/5xx silencioso no caminho feliz | com 2.2 |

---

## FASE 3 — Reduzir o desconhecido (EU, ~6h30) → paralelo

Os 14 itens "❔" da auditoria não são estética — são os de **decisão errada**,
onde o gestor confia no número. Verificar ≠ corrigir; aqui só medir o estado.

| # | Item | Estado medido |
| --- | --- | --- |
**Fechamento (medido 05/08):** 2 limpos (P0-12, P1-06), 2 com defeito real de
"número em que o gestor confia" (P0-08, P1-10). **Nenhum é bloqueio de
lançamento** — ambos os defeitos são de conserto barato e vivíveis num beta com
o asterisco certo. Em P1-06 quase declarei um defeito que a leitura do contexto
desmentiu; verificar antes de afirmar segurou.

| 3.1 | Onboarding 100% sobre pré-requisito inexistente (P0-08) | ⚠️ **CONFIRMADO** — onboarding em branco pontua 42/100, e "Governança" lê 100% por causa de 1 aprovador DEFAULT que o wizard pré-semeia. 26 dos 42 pontos vêm de defaults não tocados. Severidade média: número em que o gestor confia e está errado. Conserto: pilar só pontua o que o usuário confirmou |
| 3.2 | Filtros com dados fantasma (P0-12) | ✅ **corrigido na linha viva** — filtros de painel derivam opções de lançamentos reais (código documenta a correção). Nuance baixa: filtro de categoria em Contatos lista todo o plano de contas, não só as usadas — mas são categorias reais, não fantasma. NÃO é bloqueio |
| 3.3 | Contadores de registros divergentes (P1-06) | ✅ **não se reproduz** — as 4 telas de lista renderizam a lista filtrada na tabela; o único "total" é o chip da aba Resumo (outra aba), que está certo. Quase declarei um defeito que a leitura do contexto desmentiu — verificar antes de afirmar. NÃO é bloqueio |
| 3.4 | Orçamento automático vendido como planejamento (P1-10) | ⚠️ **PARCIAL** — a ENTRADA divulga "em branco = baseline automático (média da janela anterior)", mas o cartão de RESUMO mostra "orçado X · +Y vs orçado" idêntico, seja plano ou média. Comparar realizado com a própria média disfarçado de meta. Conserto: marca de procedência (natureza=estimativa da ONDA 10), que já existe no DS. NÃO é bloqueio |

---

## FASE 4 — O ENSAIO (VOCÊ + EU, ~3h) → depende de tudo acima

**Um cliente de mentira, do zero, você assistindo:**

```
criar conta → importar extrato → conferir saldo → lançar despesa
→ fechar o mês → exportar para o contador
```

Se qualquer passo travar, **é isso que se conserta** — o resto espera. Este
ensaio vale mais que qualquer correção adicional: é o único teste que exercita o
produto como produto.

---

## O QUE VAI AO AR COM LACUNA CONHECIDA (declarar ao cliente)

Não é vergonha — é o que faz um beta ser levado a sério.

| Lacuna | O que dizer |
| --- | --- |
| Integrações (Open Finance, POS) inativas | "importe por extrato agora; conexão automática em breve" |
| Cobrança não implementada | no beta você fatura fora do sistema |
| Histórico da IA no navegador | some ao trocar de máquina |
| Exportação Domínio | validada na estrutura, **nunca importada no sistema do contador de verdade** — peça ao 1º contador para testar e avise que é a estreia |
| `maq_*` no mesmo banco | outro produto (maquininha) convive no projeto; decidir se sai antes de escalar |

---

## RISCOS QUE NÃO SÃO CÓDIGO (você precisa saber)

1. **Sem SMTP próprio**, e-mails transacionais (recuperar senha, futura
   confirmação) não são confiáveis. O autoconfirm (0.3) contorna o cadastro, mas
   "esqueci a senha" continua dependendo disto. Resolver antes de o beta crescer.
2. **`service_role` da maquininha** ignora RLS e toca PII de lead no mesmo banco.
   Não vaza hoje, mas é superfície que a auditoria do produto financeiro nunca
   cobriu.
3. **Suporte.** Beta aberto = gente entrando sozinha e travando sozinha. Tenha um
   canal (WhatsApp, e-mail) e alguém olhando — o produto não tem tour que segure
   todo mundo.

---

## ESTADO ATUAL (04/08, medido)

- **Deriva de esquema:** fechada e atribuída — 24 herdadas, 5 minhas, todas com
  prazo; guarda de diff impede a próxima.
- **Isolamento entre empresas:** 46 itens verificados, zero vazamento, cobre
  `SECURITY DEFINER`.
- **Camada de números:** única, reconciliada em 53 pares ao centavo.
- **Telefone:** medido (390×844), 7 telas e 4 fluxos sem problema.
- **12 guardas** no `npm test`, verdes.

O que falta não é robustez — é **exposição**. Ninguém nunca usou isto como
cliente. Por isso a Fase 4 é o item mais importante da lista.
