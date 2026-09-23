# Checklist de merge — PR do Dev da Sala

Antes de dar merge num PR aberto pela Sala, confira:

## Escopo
- [ ] O PR mexe só no que a tarefa pediu (nada extra "de brinde")

## Verificação
- [ ] `typecheck`, `test` e `build` rodaram e passaram (ou a falha é
      pré-existente e está registrada como tal)
- [ ] Se a tarefa tocou dado, categoria, DRE ou apuração: há prova no banco
      (SQL antes/depois), não só "a tela ficou bonita"

## CONFIGURAR
- [ ] Se o resultado pedir variável, segredo ou migration a aplicar, isso
      está listado — e é o João quem aplica, nunca o agente

## Risco em produção
- [ ] O PR diz como um erro nessa mudança se manifestaria (e se seria
      visível ou sairia como número plausível e errado)
- [ ] Nenhuma migration destrutiva sem plano de volta
