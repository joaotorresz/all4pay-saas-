# ERP financeiro — o que pode entrar na apresentação institucional

Resumo para o slide 6 (Conta PJ) do PDF institucional. **Só leitura**: nada aqui
muda o sistema. Fonte: `CLAUDE.md` e o código do repositório, lidos em
30/09/2026.

> **Limite desta leitura.** Não houve acesso ao banco nem ao ambiente de
> produção. "Funciona hoje" abaixo quer dizer "existe tela e motor no código, e
> as guardas do repositório cobrem o cálculo". Não quer dizer "conferido em
> produção com dado de cliente". Antes de publicar, o João deve abrir
> `all4pay-saas.vercel.app` com uma conta real e confirmar os itens do slide.

## 1. Nome do produto

- Nome no sistema e no código: **all4pay** (minúsculo). O assistente de IA é
  **All 4 Pay AI**.
- **Decisão do João, não minha:** o agente `guarda` trata "All4Pay" como erro em
  material da Quattro (marca é **Quattro**). O nome do ERP na apresentação ainda
  precisa ser decidido: "ERP financeiro da Quattro" (sem citar all4pay) ou
  "all4pay". Sugestão neutra: descrever como "ERP financeiro da Quattro" e não
  usar o nome all4pay até haver decisão.

## 2. Funcionalidades que podem ser citadas (existem no código)

Linguagem pensada para controle gerencial de PME, sem promessa de resultado.

| Para o slide | O que existe no sistema |
| --- | --- |
| Fluxo de caixa | Tela de fluxo de caixa com entradas, saídas, saldo, projeção e simulação de cenários; período e conta filtráveis |
| DRE | DRE por competência ou por caixa, com detalhamento até os lançamentos de cada linha; DFC ao lado |
| Contas a pagar e a receber | Painéis, lista de títulos, baixa, calendário de vencimentos, atrasos por faixa de dias |
| Importação de extrato | Envio de extrato (CSV/OFX) e de comprovante/boleto/nota (leitura por imagem), com revisão antes de gravar e sem duplicar lançamentos |
| Categorização | Classificação automática com plano de contas, regras do próprio cliente e correção na revisão |
| Conciliação | Cruzamento de extrato com os títulos previstos |
| Orçamento | Planejado × realizado por categoria e mês |
| Exportação para o contador | Razão e DRE em XLSX/CSV, e arquivo TXT para o sistema Domínio |
| Assistente de IA | Perguntas em português sobre o caixa, respondidas com os números do próprio sistema |
| Multiempresa e permissões | Mais de uma empresa por usuário, papéis (leitor, lançador, aprovador, fechador, admin) e trilha de auditoria |

Frase-base sugerida (no limite do que está descrito):
"ERP financeiro para controle gerencial: fluxo de caixa, DRE, contas a pagar e
a receber, conciliação e exportação para o contador."

## 3. O que NÃO prometer

- **Conexão bancária automática (Open Finance).** O código usa a Pluggy, mas o
  contrato do `erp-gestor` registra a integração como **ainda em sandbox**. Não
  citar "conecte seu banco" como recurso disponível.
- **Lançamentos recorrentes gerados sozinhos.** O agendador diário nunca
  completou uma execução em produção (dívida registrada em `CLAUDE.md`). A
  projeção de recorrências aparece na tela; a geração automática dos títulos
  não deve ser prometida.
- **Emissão de nota fiscal.** O sistema organiza e envia as notas ao contador;
  emitir NF-e/NFS-e não consta como funcionalidade.
- **Integração com a conta PJ/maquininha da Quattro.** Nada no código liga o ERP
  às vendas ou ao saldo da conta Quattro. O ERP trabalha com extrato importado.
  Não sugerir que as transações da Quattro entram sozinhas.
- **Taxas, Pix, prazos ou qualquer número de adquirência.** O ERP não tem
  informação sobre isso; nada do ERP sustenta essa afirmação.
- **Cálculo fiscal/folha como definitivo.** Tabelas de INSS/IRRF e regime
  tributário exigem atualização e conferência do contador (o sistema avisa
  quando a tabela venceu). Se citar, dizer "estimativa gerencial".
- **Cobrança e planos.** Não há cobrança recorrente integrada; não anunciar
  preço ou planos do ERP.
- **Segurança/compliance.** Não afirmar certificação, regulação ou "nível
  bancário" (cairia também no Bloco 1 do `guarda`).
- **Cadastro sem confirmação de e-mail** (dívida declarada até o primeiro
  cliente pagante). Ponto de atenção antes de divulgar o acesso.

## 4. Perguntas em aberto para o João

1. O ERP já é **oferecido hoje** a clientes da Quattro, ou está em
   demonstração? O código não responde; `CLAUDE.md` descreve o ERP como produto
   para cliente desde 21/09/2026, mas nada aqui prova clientes ativos.
2. Nome do ERP na apresentação (seção 1).
3. Se o ERP vem incluído na conta PJ ou é oferta à parte. Sem essa definição, o
   slide 6 não deve sugerir inclusão.
