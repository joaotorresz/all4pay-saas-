# Como funciona o Dev da Sala

Guia rápido para quem não mexe no código: o caminho de uma tarefa aprovada
na Sala da Quattro até virar mudança no repositório.

1. **Aprovação na Sala.** O João aprova uma tarefa de ERP na Sala. Ela é
   espelhada como um card no ClickUp, nome começando com `▶ SALA · ERP ·`.
2. **O workflow pega o card.** `dev-da-sala.yml` roda de hora em hora (dias
   úteis, 9h–18h de Brasília) ou sob demanda, busca o card `to do` mais
   urgente/antigo com esse prefixo, marca "em andamento claude" e cria a
   branch `sala-<id do card>`.
3. **O Claude implementa.** Na branch, o Claude Code segue os contratos de
   `erp-gestor`/`erp-dev`/`guarda` e o escopo do card. Se faltar credencial,
   migration aplicada ou acesso ao banco, ele **bloqueia** em vez de
   improvisar — nada disso vira código.
4. **Vira PR.** Com sucesso, o próprio workflow envia a branch e abre o PR
   para `main` com o resultado do Claude como corpo. O Claude nunca dá push
   nem abre PR sozinho.
5. **Fila contínua.** Havendo mais de uma tarefa aprovada, o workflow chama
   a si mesmo de novo ao final, sem esperar o próximo agendamento.
6. **Fecha sozinha no merge.** Quando o João mergeia o PR, o job `merge`
   comenta "MERGEADO" no card e o marca `complete` no ClickUp. Sem merge do
   João, nada fecha.
