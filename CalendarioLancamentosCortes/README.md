# Calendário de Lançamentos — Migração Streamlit/TiDB → HTML+JS/Supabase

Aplicação para **data de corte e data de lançamento por competência**,
migrada de Streamlit+TiDB para HTML/CSS/JavaScript + Supabase (PostgreSQL).

> Escopo: este projeto cuida **apenas do calendário de lançamentos**.
> A tabela `usuarios` (com `tipo_usuario` e `cargo`) e a **tela de login**
> são responsabilidade do colega. O login usa **Supabase Auth (e-mail/senha)**
> em um **app separado, domínio diferente**, mas compatilhando o mesmo banco.

---

## 1. Pré-requisitos (dependência do colega)

Antes de rodar qualquer coisa deste projeto, precisam existir no mesmo banco
(schema `public`), já criadas e populadas pelo colega:

1. A tabela `usuarios`:

```sql
usuarios (
    id            uuid PK + FK -> auth.users.id,
    nome_completo varchar NOT NULL,
    email         varchar UNIQUE NOT NULL,
    tipo_usuario  varchar NOT NULL,   -- 'admin' | 'viewer' | 'master'
    ativo         boolean NOT NULL DEFAULT true,
    criado_em     timestamptz NOT NULL default now(),
    cargo         varchar             -- 'lancador' | 'validador' | 'supervisor'
)
```

2. **Usuários criados no Supabase Auth** (Auth → Users), para o login por
   e-mail/senha funcionar, com o MESMO `id` (uuid) vinculado à linha da tabela
   `usuarios`.

Sem esses dois itens, o DDL falha nas FKs/triggers e o login não autentica.

---

## 2. Como a sessão chega a este app (domínios diferentes)

O login é feito **no app do colega**. Ao navegar para este calendário, a sessão
chega de uma destas formas (o `js/auth.js` tenta as duas, em ordem):

1. **Sessão já no navegador** — `supabase.auth.getSession()` (funciona se o
   app do colega e o calendário compartilham a mesma origem/origin do Supabase).
2. **Tokens na URL** — o app do colega redireciona para cá passando
   `?access_token=...&refresh_token=...` (ou `#access_token=...`). O `auth.js`
   faz `supabase.auth.setSession(...)` e limpa a URL em seguida.

> Se os domínios forem realmente diferentes, o caminho 1 não funciona sozinho
> (o localStorage não é compartilhado entre origens). Nesse caso, o colega
> precisa te redirecionar com os tokens na URL (caminho 2).

**Configuração necessária no `js/auth.js`:**

```js
const URL_LOGIN_COLEGA = 'https://app-do-colega.com/login';
```

Troque pela URL real do login do colega. É para lá que o botão "Sair"
redireciona após o `signOut()`.

---

## 3. Ordem de execução no SQL Editor

1. Supabase → **SQL Editor**.
2. Execute **`ddl_calendario.sql`** (tabelas, triggers, view, RLS).
3. Execute **`rpc_calendario.sql`** (`unaccent` + `criar_competencia` + `importar_planilha`).

> IMPORTANTE: rode nessa ordem. O RPC depende das tabelas do DDL.

---

## 4. Dependências de front (arquivos para baixar)

Os HTMLs não carregam CDN de framework. Baixe **dois arquivos** e coloque em `js/`:

| Arquivo | De onde baixar | Para que serve |
|---|---|---|
| `js/supabase-js.js` | https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2 | Cliente oficial do Supabase |
| `js/xlsx.full.min.js` | https://cdn.jsdelivr.net/npm/xlsx/dist/xlsx.full.min.js | Leitura de planilha (.xlsx/.csv) no upload |

---

## 5. Configuração das credenciais

Abra **`js/supabase.js`** e substitua:

```js
const SUPABASE_URL      = 'https://SEU-PROJETO.supabase.co';
const SUPABASE_ANON_KEY = 'SUA-CHAVE-ANON-AQUI';
```

Ambas em **Supabase → Project Settings → API**.

---

## 6. Estrutura de pastas esperada

```
/public
├── calendario.html
├── css/
│   └── estilo.css
└── js/
    ├── supabase-js.js        ← (baixado, passo 4)
    ├── xlsx.full.min.js      ← (baixado, passo 4)
    ├── supabase.js
    ├── auth.js
    ├── calendario.js
    ├── upload.js
    └── app.js
```

> Não há mais `index.html` (a tela de login é do colega). Sirva a pasta `public`
> com qualquer servidor estático (Nginx, Vercel, Netlify, Supabase Static Hosting).

---

## 7. Funcionalidades e regras de negócio

### Grade "Pendências de Hoje" (topo)
- **Lançamentos de Hoje** → `data_de_lancamento = hoje`
- **Cortes de Hoje** → `data_de_corte = hoje`
- **Em Período de Lançamento** → `lançamento <= hoje <= corte`

### Alertas (sobre linhas 100% completas)
1. **Lançamento ≥ Corte**.
2. **Lançamento em fim de semana** (sábado/domingo).
3. **Lançamento a mais de 30 dias** de distância de hoje.
4. **Corte a mais de 30 dias** de distância de hoje.

### Regra "NÃO lança"
Uma linha é **"não lança"** se **qualquer um** destes estiver vazio:
`lancador_id`, `validador_id`, `data_de_corte` ou `data_de_lancamento`.
Convênios "não lança" **não geram alerta** — ficam visíveis apenas na base.

### Permissões (RLS)
- **Leitura**: qualquer usuário autenticado e ativo.
- **Escrita**: `master` e `admin`.
- **Gestão de privilégios**: somente `master` (fora deste projeto).

---

## 8. Roteiro de teste (aceite)

1. Entre no **app do colega** e autentique; em seguida acesse o calendário.
2. **Criar competência** → botão "Nova competência" gera as linhas em branco.
3. **Upload de planilha** → sobe um `.xlsx`; mesmo nome mantém id, nome novo cria convênio.
4. **Edição célula a célula** → altera data ou responsável e salva no change.
5. **Alertas** → confira os 4 tipos apenas para linhas completas.
6. **`viewer`** → só lê (botões desabilitados).
7. **`admin`** → edita dados, mas não gerencia privilégios.

---

## 9. Arquivos deste projeto

| Arquivo | Papel |
|---|---|
| `ddl_calendario.sql` | Tabelas, triggers, view, RLS |
| `rpc_calendario.sql` | `unaccent` + `criar_competencia` e `importar_planilha` |
| `calendario.html` | Interface principal |
| `css/estilo.css` | Tema escuro |
| `js/supabase.js` | Cliente + helpers |
| `js/auth.js` | Sessão (getSession + tokens da URL) |
| `js/calendario.js` | Lógica (alertas, filtros, "não lança") |
| `js/upload.js` | Leitura/importação de planilha (SheetJS) |
| `js/app.js` | Orquestração da interface |
