# Referência Jota — paleta medida no print (15/10/2026)

O dono adotou o print `referencia.png` (tela do chat do Jota.ai) como design
system. As cores abaixo foram lidas nos PIXELS do arquivo, não estimadas.
Fonte (Roobert Trial) e ícones (Lucide, 1,75px) não mudaram; o lime segue
sendo o acento e o dark mode segue como estava.

| Papel | HEX | Token |
| --- | --- | --- |
| Fundo de página | `#F2F2F2` | `--color-surface-1`, `--a4p-app-bg`, `--a4p-chrome` |
| Card (e menu, barra de cima) | `#FBFBFB` | `--color-white`, `--erp-menu-fundo` |
| Fundo dentro do card (círculo do ícone, chip, hover) | `#F2F2F2` | `--color-surface-2` |
| Balão da pergunta de quem usa | `#EAEAEA` | `--a4p-bolha-usuario` · classe `.a4p-bolha-usuario` |
| Pílula | `#FFFFFF`, texto e ícone `#1A1A1A` | `--a4p-pilula-fundo` · classe `.a4p-pilula` |
| Texto e número ("R$ 1.171,50") | `#1A1A1A` | `--color-ink`, `--erp-num-cor`, `--erp-moeda-cor` |
| Rótulo ("Dinheiro escapando") | `#535353` | `--color-text-secondary`, `--erp-centavos-cor` |
| Meta ("últimos 90 dias") | `#9A9A9A` | `--color-text-tertiary` |

Formas medidas: card sem borda e sem sombra, raio ~28px, padding 28px, 20px
entre cards; pílula com 48px de altura e raio cheio; balão com raio cheio.

⚠️ O `#9A9A9A` dá ~2,7:1 sobre o card: é o tom do print e serve para meta
(texto auxiliar), não para nada que precise ser lido para decidir.
