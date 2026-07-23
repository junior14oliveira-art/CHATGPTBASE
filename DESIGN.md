# Design System: JRDEV1

## Visual theme

Cockpit operacional sóbrio, de alta densidade e leitura rápida. A interface prioriza confiança, visibilidade do estado e prevenção de erro: ordens, saldo e ações críticas nunca dependem apenas de cor.

## Palette

- **Canvas** `#F6F7F9` — fundo principal.
- **Surface** `#FFFFFF` — tabelas e painéis.
- **Ink** `#18212B` — texto principal e navegação.
- **Muted** `#65717E` — rótulos e contexto.
- **Line** `#DCE1E7` — separadores estruturais.
- **Signal Teal** `#0F766E` — único acento; foco, ação principal e estado saudável.
- **Warning Amber** `#B45309` e **Danger Red** `#B42318` — semântica de exceção, sempre com texto/ícone.

## Typography

- **Display/body:** Geist, ui-sans-serif, system-ui, sans-serif.
- **Numbers/IDs:** Geist Mono, ui-monospace, SFMono-Regular, monospace.
- Títulos com peso 650, escala controlada; dados tabulares com algarismos tabulares.

## Component behavior

- Botões têm texto claro, estado `disabled`, retorno de execução e confirmação para ações críticas.
- Formulários mantêm rótulo acima do campo, ajuda curta e erro no contexto.
- Carregamento usa blocos esqueleto; erros mostram causa e ação de tentar novamente.
- Tabelas priorizam alinhamento, busca, filtros e detalhes por linha em vez de cartões redundantes.

## Layout and responsiveness

- Grade fixa no desktop com navegação lateral; uma coluna abaixo de 860px.
- Alvos de toque de pelo menos 44px; nenhuma rolagem horizontal em telas pequenas.
- Conteúdo com largura máxima de 1600px e espaçamento em múltiplos de 4px.

## Banned

- Sem degradês neon, brilho externo, preto puro, emojis, métricas fictícias ou cards de três colunas iguais.
- Sem sobreposição de conteúdo, confirmação implícita ou ação destrutiva de um clique.
