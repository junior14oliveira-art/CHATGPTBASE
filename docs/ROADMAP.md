# Roadmap

## Agora — MVP de leitura

- Dashboard com pedidos recentes, faturamento observado, SLA de fila e estado da conexão.
- Pedidos, status/fila, catálogo, depósitos e saldo consultados por API.
- Cliente backend com limite de chamadas, timeout e erros compreensíveis.

## Próximo — operação assistida

- Banco local, cursor por `getJournalList`/`date_confirmed` e reconciliação.
- Separação por scanner, PickPack carts e atribuição de responsável.
- Auditoria persistente, outbox e reprocessamento de comandos.

## Depois — escrita homologada

- Mudança de status e macros de impressão com confirmação.
- Inventário por documento, recebimento, transferência e ajuste aprovado.
- Sincronização com estoque físico 4MC por SKU/serial e tratamento de divergências.
