# Tema de teste "Onest" — painel de edição

Estamos testando um novo visual **somente na Home** (`/`). Nada aqui afeta o
resto do sistema ainda — quando você aprovar, a gente promove para os tokens
globais e aplica em tudo.

## Onde editar

Arquivo: **`src/app/globals.css`** → bloco **`.ds-onest`** (no final do arquivo).

Editar direto no GitHub (branch `claude/epic-fermi-i423xk`):

- Abrir/visualizar: https://github.com/joaotorresz/all4pay-saas-/blob/claude/epic-fermi-i423xk/src/app/globals.css
- **Editar (lápis ✏️):** https://github.com/joaotorresz/all4pay-saas-/edit/claude/epic-fermi-i423xk/src/app/globals.css

Mude só os valores do painel, clique em **Commit changes** (commit direto na
branch `claude/epic-fermi-i423xk`) e me avise — eu puxo e sigo a partir do que
você fez. Se preferir, copie o bloco editado e cole aqui na conversa.

## O painel (mexa só nos valores)

```css
.ds-onest {
  /* ===== PAINEL EDITÁVEL (mexa só nos valores) ===== */
  --a4p-bg: #eceef2;          /* fundo principal da página */
  --a4p-box-bg: #ffffff;      /* cor de fundo dos boxes (cards) */
  --a4p-box-radius: 24px;     /* arredondamento das bordas do box */
  --a4p-box-padding: 31.2px;  /* espaçamento interno (conteúdo ↔ borda) */
  --a4p-title-weight: 600;    /* peso do título */
  --a4p-borders: transparent; /* cor das bordas */
  /* ================================================= */
  ...
}
```

## O que cada variável faz

| Variável | O que muda | Exemplos de valor |
| --- | --- | --- |
| `--a4p-bg` | Cor do **fundo principal** da Home (atrás dos boxes) | `#eceef2`, `#f5f6f8`, `#ffffff` |
| `--a4p-box-bg` | Cor de **fundo dos boxes** (cards) | `#ffffff`, `#fbfbfd` |
| `--a4p-box-radius` | **Arredondamento** das bordas do box | `13px`, `24px`, `32px` |
| `--a4p-box-padding` | **Espaçamento interno** do box (conteúdo até a borda) | `24px`, `31.2px`, `40px` |
| `--a4p-title-weight` | **Peso do título** (Onest) | `400` Regular · `500` Medium · `600` SemiBold |
| `--a4p-borders` | **Cor das bordas** dos boxes | `transparent` (sem borda) · `#e9e9e9` · `#dfe3ea` |

### Regras de tipografia (já fixas no tema)

- **Títulos** (`h1`/`h2`/`h3` e `text-display`/`text-h1`/`text-h2`/`text-h3`) →
  Onest no peso de `--a4p-title-weight` (padrão **SemiBold 600**).
- **Subtítulos / corpo / labels** → Onest **Regular (400)**.

## Dicas

- **Cores** aceitam hex (`#rrggbb`), `rgb(...)` ou `transparent`.
- **Tamanhos** aceitam `px` (ex.: `28px`) — use ponto para decimais (`31.2px`).
- Para **voltar a ter borda** nos boxes, troque `--a4p-borders` de `transparent`
  para um cinza claro (ex.: `#e6e8ec`).
- As **sombras** já foram removidas do sistema inteiro; não há botão aqui pra elas.

## Quer mais botões no painel?

Posso expor também: cor do texto, raio de botões/inputs, escala das fontes
(tamanho de título/corpo), largura máxima do conteúdo, etc. É só pedir.
