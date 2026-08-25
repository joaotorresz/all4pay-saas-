/**
 * O QUE O SISTEMA NÃO FAZ — a metade da metodologia que decide se ela vale.
 *
 * ⚠️ **Metodologia que só lista o que o modelo VÊ é propaganda.** A regra já
 * estava escrita para os indicadores (`Metodologia.limitacoes`); aqui ela sobe
 * um nível e vale para o PRODUTO, na página que qualquer pessoa abre sem login.
 *
 * ⚠️ **Cada limite carrega o que fazer no lugar.** Um limite sem alternativa
 * lê como defeito e faz o leitor procurar outro fornecedor; com a alternativa
 * ao lado, ele lê como fronteira declarada — que é o que de fato é. E carrega
 * `porque`, porque um limite sem razão é indistinguível de descuido.
 *
 * ⚠️ **NADA AQUI É ASPIRACIONAL.** Se uma linha desta lista deixar de ser
 * verdade porque o recurso foi construído, ela SAI. Uma lista de limites que
 * envelhece para o lado otimista é pior que não ter lista: ela vira uma
 * confissão de coisas que já não são defeito, e quem lê desconta tudo.
 */
export const LIMITES_VERSION = "limites/1.0.0";

export interface LimiteDeclarado {
  /** O que a pessoa provavelmente esperava. */
  titulo: string;
  /** O que o sistema faz de fato — sem rodeio. */
  oQueFaz: string;
  /** Por que a fronteira está aqui. */
  porque: string;
  /** O que fazer em vez disso. Nunca vazio. */
  emVezDisso: string;
}

export const LIMITES: LimiteDeclarado[] = [
  {
    titulo: "Não substitui o seu contador",
    oQueFaz:
      "Organiza os lançamentos, monta a DRE e o fluxo de caixa gerenciais e gera o arquivo para o escritório importar.",
    porque:
      "Apuração fiscal, obrigação acessória e escrituração são responsabilidade técnica de um profissional registrado, e a classificação de uma categoria nova é decisão contábil — não dá para adivinhá-la com segurança.",
    emVezDisso:
      "Use os relatórios e a exportação para conversar com o contador com o mês já organizado, em vez de mandar o extrato cru.",
  },
  {
    titulo: "Não classifica sozinho o que nunca viu",
    oQueFaz:
      "Classifica por regra que você escreve, pelo que você já confirmou antes, pelo CNAE do CNPJ e, só então, por palavra-chave.",
    porque:
      "Nenhum classificador acerta uma categoria que a sua empresa acabou de inventar. Quando ele não sabe, o lançamento cai em 'outras' com confiança baixa — e a tela mostra essa confiança em vez de esconder.",
    emVezDisso:
      "Corrija uma vez na revisão da importação: o sistema oferece transformar a correção em regra, e a partir daí ele pega sozinho.",
  },
  {
    titulo: "Não garante que a DRE está classificada do seu jeito",
    oQueFaz:
      "Usa a linha que você DECLAROU para cada categoria no plano de contas; sem declaração, cai num palpite por palavra-chave.",
    porque:
      "Quem termina o cadastro sem declarar o plano de contas recebe uma DRE montada por adivinhação — e ela tem a mesma aparência de uma conferida. É a limitação mais cara deste sistema e está escrita aqui por isso.",
    emVezDisso:
      "Declare a linha de cada categoria uma vez, em Cadastros → Plano de contas. Cinco minutos que valem por todos os meses seguintes.",
  },
  {
    titulo: "Não é uma trilha de auditoria à prova de adulteração",
    oQueFaz:
      "Registra cada ação com quem, quando e o que mudou de antes para depois, protegido pelas permissões do banco.",
    porque:
      "O encadeamento criptográfico entre eventos ainda não é gravado junto de cada registro, então a tela não afirma integridade que não pode conferir.",
    emVezDisso:
      "Para exigência de auditoria formal, exporte a trilha periodicamente e guarde a cópia fora do sistema.",
  },
  {
    titulo: "Não move dinheiro",
    oQueFaz:
      "Registra, concilia, cobra e avisa. Dar baixa num título marca que ele foi pago — não manda um pagamento ao banco.",
    porque:
      "Iniciação de pagamento exige autorização regulatória e um caminho de reversão que este produto não tem. Prometer isso e falhar custaria mais que não oferecer.",
    emVezDisso:
      "Pague pelo seu banco e concilie aqui — a conciliação por Open Finance traz o extrato de volta e casa com o título.",
  },
  {
    titulo: "Não prevê o futuro — projeta o ritmo atual",
    oQueFaz:
      "Projeta caixa, runway e risco de ruptura a partir do que já aconteceu e do que já está agendado.",
    porque:
      "Uma projeção supõe que o padrão observado continua. Um contrato novo, a perda de um cliente grande ou uma decisão sua não estão no histórico e não podem estar na conta.",
    emVezDisso:
      "Use o simulador de cenários para testar a mudança que você sabe que vem, em vez de esperar que a projeção a adivinhe.",
  },
  {
    titulo: "Não emite nota fiscal nem boleto",
    oQueFaz:
      "Registra a nota e o boleto que existem, lê a chave de acesso e a linha digitável, e acompanha o que falta emitir.",
    porque:
      "Emissão depende de certificado digital e de integração homologada com a prefeitura ou o banco de cada cliente — são contratos de terceiros, não código nosso.",
    emVezDisso:
      "Emita no seu emissor atual e traga o documento para cá; o sistema faz a ponte com o financeiro e com o contador.",
  },
  {
    titulo: "Não decide por você",
    oQueFaz:
      "Aponta o que mudou, o que está fora do padrão e o que costuma resolver, sempre com os números que sustentam a leitura.",
    porque:
      "Uma recomendação financeira sem contexto de negócio é palpite com aparência de cálculo. O sistema conhece os seus lançamentos, não a sua negociação com o fornecedor nem a conversa com o cliente.",
    emVezDisso:
      "Trate as sugestões como pauta de reunião: cada uma abre a tela de origem para você conferir antes de agir.",
  },
];
