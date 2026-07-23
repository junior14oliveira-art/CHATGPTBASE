# JRDEV1

Painel operacional integrado à BaseLinker para acompanhar pedidos, filas e catálogo/estoque. Este primeiro corte foi criado em modo seguro: o frontend nunca recebe a chave da API e ações de escrita são desligadas por padrão.

## Executar

1. Copie `backend/.env.example` para `backend/.env` e preencha a chave apenas neste arquivo local.
2. Instale as dependências:

   ```bash
   npm --prefix backend install
   npm --prefix frontend install
   ```

3. Em dois terminais, execute:

   ```bash
   npm run dev
   npm run dev:web
   ```

O backend inicia em `http://localhost:3333` e o frontend em `http://localhost:5173`.

## Sincronização

Pedidos confirmados são gravados no SQLite local definido por `JRDEV1_DB_PATH`; o arquivo padrão fica em `backend/data/` e não é versionado. Para evitar consultas constantes à BaseLinker, a sincronização é uma operação administrativa:

```bash
curl -X POST http://localhost:3333/api/sync/orders \
  -H "x-jrdev1-admin-token: SEU_TOKEN_OPERACIONAL"
```

Ela usa um cursor de `date_confirmed`, importa status e pedidos confirmados em páginas e mantém o histórico no banco local.

## Segurança operacional

- `JRDEV1_WRITE_ENABLED=false` é o padrão. Mudança de status e atualização de estoque só podem ser ativadas após homologação.
- Quando a escrita for habilitada, defina também `JRDEV1_ADMIN_TOKEN`; comandos exigem o cabeçalho `x-jrdev1-admin-token` e uma confirmação explícita no payload.
- A BaseLinker é chamada somente pelo backend, com `X-BLToken` em variável de ambiente.
- O cliente tem espaçamento de chamadas para respeitar o limite informado de 100 requisições por minuto.
- A interface apresenta estados de carregamento, erro e configuração incompleta; não inventa métricas quando não há conexão.

## Próximas iterações

Consulte [docs/ROADMAP.md](docs/ROADMAP.md) e [docs/PRODUCT_BACKLOG.md](docs/PRODUCT_BACKLOG.md).
