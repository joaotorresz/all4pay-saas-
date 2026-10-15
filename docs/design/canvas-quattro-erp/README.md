# Canvas "Quattro ERP · Protótipo" — a regra visual do sistema

**Decisão do dono, 13/10/2026.** O canvas de design "Quattro ERP · Protótipo"
(https://claude.ai/artifact/LGeYrJZoQqXG8gQCdpn1rD) é a referência visual de
TODO o sistema: o quadro **Tema**, os componentes (Moldura, Valor R$, Ícones) e
as telas do protótipo (desktop 1280px e celular 390px). Toda tela, card,
componente e item novo ou alterado segue o que está aqui.

Esta pasta é a cópia versionada do canvas, tirada no dia da decisão. Ela existe
para que a regra não dependa de o canvas estar aberto: quem trabalha no código
lê daqui.

## O que cada arquivo é

| Arquivo | Papel |
| --- | --- |
| `tokens.json` | os valores do quadro Tema (os `--erp-*`), um por linha |
| `Main.dc.html` | o quadro **Tema**: cores, menu, logo, botões, formas, tipografia, números |
| `Shell.dc.html` | a **moldura**: menu lateral com linhas entre os itens, barra de cima, título da tela e ações; a versão de celular com a barra de abas embaixo |
| `Valor.dc.html` | o **valor em R$**: número principal × número comum, moeda colada, centavos a 50% |
| `Icones.dc.html` | os 61 ícones duotônicos — **registro apenas**: desde 13/10/2026 o sistema voltou ao Hugeicons (`Icon` + `solar-icons.ts`) |
| `HomeReal.dc.html` | a **Página inicial** como está no ar, elemento por elemento, para edição à mão |
| `HomeSnapshot.dc.html` | a **Home "snapshot"** (14/10/2026) — a regra da Página inicial no ar desde então (`HomeSnapshot.tsx`) |
| `Login`, `Dashboard`, `Financeiro`, `Estoque`, `Vendas`, `Compras`, `Fiscal`, `Cadastros`, `Relatorios`, `Configuracoes` (`.dc.html`) | as telas do protótipo em desktop |
| `*Mobile.dc.html` | as mesmas telas a 390px |
| `canvas.json` | a disposição das pranchetas no canvas |

## Os tokens que valem

| Grupo | Valor |
| --- | --- |
| Fundo de página e área de trabalho | `#FFFFFF` |
| Cartão e menu | `#F6F6F6` · borda `#E2E2E2`, espessura **0** no card · linha do menu `#F4F4F4` |
| Texto · texto 2 | `#3B4332` · `#6B7060` |
| Primária / item ativo do menu / gráfico | lime `#ECFD52`, texto por cima `#3B4332` |
| Destaque (card escuro) | `#3B4332` |
| Sucesso · alerta · perigo | `#35C759` · `#F2A519` · `#E5484D` |
| Raio | card **20px** · etiqueta 16px · botão 32px (pílula) |
| Sombra | nenhuma |
| Botão | 42px de altura · padding 36px · largura mínima 104px |
| Menu | 248px de largura · 15px entre ícone e texto · a ilustração da marca no Início |
| Logo | uma cor (`#3B4332`), 92px |
| Título de tela | Centra No2 **500**, CAIXA ALTA, 30px, espaçamento 0 · título de seção 17px · corpo 15px |
| Número | Roobert 500, 30px nos cards, espaçamento 0, cor `#000000` |
| Número principal da tela | Centra No2 500 |
| R$ | mesmo corpo e cor do número, colado · centavos a 50% em `#6B7060` |

## Como a regra se aplica

1. **Antes de desenhar ou codar uma tela**, procure a prancheta equivalente
   aqui e copie a estrutura dela (moldura, ordem dos cards, cabeçalho de
   tabela, etiquetas de situação, valor em R$).
2. **Tela sem prancheta equivalente** é montada com as MESMAS peças: os tokens
   do Tema, a Moldura, o Valor R$ e os ícones do sistema (Hugeicons, via `Icon`). Nada de cor, raio, sombra ou
   fonte fora de `tokens.json`.
3. **Mudança visual nasce no canvas**, não no código: o dono ajusta lá, e a
   mudança é levada ao código E a esta pasta no mesmo PR. Uma pasta que
   discorda do canvas é o "duas fontes para um fato" — vale o canvas, e a
   pasta é atualizada.
4. No código, os tokens moram em `src/app/globals.css` (`:root`, `.ds-visor` e
   o bloco "TEMA ERP"), `tailwind.config.ts` e `src/components/ui/`; a guarda
   `npm run paleta` reprova cor fora da paleta.
