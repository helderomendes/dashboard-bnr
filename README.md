# Dashboard Meta Ads · BNR Construtora 01

Dashboard web para entender **de onde vem cada lead**: qual campanha, qual conjunto e qual anúncio, com o **CPL de cada nível**. Os dados vêm direto da API oficial da Meta, sem nenhuma ferramenta paga no meio.

![stack](https://img.shields.io/badge/custo-R%24%200-12925b) ![stack](https://img.shields.io/badge/build-nenhum-14213d)

## O que o dashboard mostra

| Área | Pergunta que responde |
|---|---|
| **KPIs com variação** | Investimento, leads, CPL, conversão clique→lead, CTR, CPC, CPM e impressões, comparados com o período anterior de mesma duração |
| **Evolução** | Leads × CPL, investimento e CTR × CPC por dia, semana ou mês, com a linha do período anterior |
| **Insights automáticos** | Melhor anúncio, anúncios gastando sem lead, CPL subindo ou caindo por campanha, dependência de um único criativo, melhor posicionamento e melhor dia |
| **De onde vêm os leads** | Fluxo (Sankey) Campanha → Conjunto → Anúncio. Clique em um nó para filtrar ou abrir o criativo |
| **Participação por campanha** | Quanto cada campanha leva da verba e quanto entrega em resultados |
| **Ranking de anúncios** | Criativos com miniatura, ordenados por melhor ou pior CPL, volume, verba ou CTR. Um mínimo de resultados evita eleger um "campeão" com só 1 lead |
| **Tabela hierárquica** | Campanha › Conjunto › Anúncio com drill-down, ordenação por qualquer coluna e exportação em CSV |
| **Público e posicionamento** | Feed/Stories/Reels, mapa de calor de idade × gênero e regiões (por resultados, CPL ou investimento) |
| **Dia da semana e funil** | Melhor dia para anunciar e o funil impressão → clique → lead |

Recursos de uso:
- Datas com os mesmos atalhos do Gerenciador (hoje, ontem, 7/14/30/90 dias, este mês, mês passado, personalizado).
- **Leads × Conversas × Todos**: separa leads de formulário/site das conversas iniciadas no WhatsApp/Direct.
- Busca global (atalho `/`), filtros por campanha, conjunto e status.
- **Meta de CPL**: os CPLs ficam verdes, amarelos ou vermelhos conforme a meta.
- **Link compartilhável**: o período, os filtros e a busca vão junto na URL (menu ⋯ › Copiar link).
- Tema claro/escuro, layout responsivo para celular e atualização automática a cada 30 min com a aba aberta.

---

## Como conectar a conta (grátis, cerca de 10 minutos)

A arquitetura é: **GitHub Actions** (grátis) consulta a **Meta Marketing API** (grátis) a cada 3 horas e publica o site com os dados no **GitHub Pages** ou no **Cloudflare Pages** (ambos grátis). O token fica guardado como segredo no GitHub e nunca chega ao navegador.

### 1. Criar o token de acesso (Business Manager)

1. Acesse **business.facebook.com › Configurações do negócio › Usuários › Usuários do sistema**.
2. Clique em **Adicionar**, dê um nome (ex.: `dashboard-bnr`) e escolha a função **Funcionário**.
3. Com o usuário selecionado, clique em **Atribuir ativos › Contas de anúncios › BNR Construtora 01** e marque **Ver desempenho** (só leitura).
4. Se ainda não houver um app: **Configurações do negócio › Contas › Apps › Adicionar › Criar um novo app** (tipo *Empresa*). Um app em modo de desenvolvimento basta para ler a própria conta.
5. De volta ao usuário do sistema: **Gerar novo token**, escolha o app, em validade selecione **Nunca** e marque a permissão **`ads_read`**. Copie o token.
6. Copie o **ID da conta de anúncios**: é o número que aparece no Gerenciador (`act=123456789` na URL).

> O token de Usuário do Sistema não expira e só tem leitura. Se ele vazar, revogue-o no mesmo lugar onde foi criado.

### 2. Configurar o GitHub

No repositório: **Settings › Secrets and variables › Actions › New repository secret**

| Secret | Valor |
|---|---|
| `META_ACCESS_TOKEN` | o token do passo 1 |
| `META_AD_ACCOUNT_ID` | `act_123456789` (com ou sem `act_`) |

Variáveis opcionais (aba *Variables*): `DAYS` (histórico, padrão 180), `META_API_VERSION` (padrão `v23.0`) e `LEAD_ACTION_TYPES` (veja "O que conta como lead").

### 3. Publicar — escolha uma opção

**Opção A: GitHub Pages (mais simples)**
1. **Settings › Pages › Source: GitHub Actions**.
2. Em **Actions › Sincronizar Meta Ads e publicar dashboard › Run workflow**.
3. O link aparece no final do job (`https://<usuario>.github.io/dashboard-bnr/`).

⚠️ No GitHub Pages **qualquer pessoa com o link** vê os dados. A página tem `noindex` e não aparece no Google, mas não há senha. Se precisar de login, use a opção B.

**Opção B: Cloudflare Pages + login por e-mail (recomendada para cliente)**
1. Crie uma conta grátis na Cloudflare e, em **Workers & Pages**, um projeto Pages chamado `dashboard-bnr` (upload direto).
2. Crie um API Token com permissão **Cloudflare Pages: Edit**.
3. No GitHub, adicione os secrets `CLOUDFLARE_API_TOKEN` e `CLOUDFLARE_ACCOUNT_ID` e a variável `DEPLOY_TARGET = cloudflare`.
4. Em **Zero Trust › Access › Applications**, proteja o domínio `dashboard-bnr.pages.dev` com uma política que libere só os e-mails autorizados (grátis até 50 usuários). Quem acessar recebe um código no e-mail.

A partir daí, o dashboard se atualiza sozinho a cada 3 horas. Para atualizar na hora, use **Run workflow**.

### Rodar no seu computador

```bash
cp .env.example .env
```

```bash
npm run sync
```

```bash
npm run dev
```

Depois abra `http://localhost:3000`.

---

## Sem integração nenhuma: importar CSV

Para uma análise rápida, sem configurar nada:

1. No Gerenciador de Anúncios, vá até a aba **Anúncios**.
2. **Detalhamento › Por tempo › Dia** (para ter a evolução diária).
3. Garanta as colunas *Valor usado, Impressões, Cliques no link, Leads* e, se usar WhatsApp, *Conversas por mensagem iniciadas*.
4. **Relatórios › Exportar dados da tabela › .csv**.
5. No dashboard, use **⋯ › Importar CSV** ou arraste o arquivo para a página.

O CSV é lido só no navegador; nada é enviado para servidor nenhum. As quebras de público e posicionamento só aparecem com a sincronização pela API.

---

## Detalhes técnicos

- **O que conta como lead**: a ação `lead` da Meta, que soma formulário instantâneo e lead do pixel no site, sem contar duas vezes. Se a conta usa uma conversão personalizada, defina `LEAD_ACTION_TYPES` (ex.: `offsite_conversion.custom.123456`). **Conversas** = `onsite_conversion.messaging_conversation_started_7d`.
- **Atribuição**: `use_unified_attribution_setting=true`, então os números batem com o Gerenciador.
- **Quebras** (posicionamento, idade/gênero, região) vêm no nível de campanha. Por isso respeitam o filtro de campanha, mas não o de conjunto ou anúncio.
- **Alcance/frequência** não aparecem de propósito: o alcance não pode ser somado entre dias, e mostrar uma soma diária daria um número errado.
- Os anúncios excluídos continuam no histórico, com o nome tirado dos próprios insights.
- Stack: HTML + CSS + JS puros e [Apache ECharts](https://echarts.apache.org) via CDN. Não há build e o script de sincronização não tem dependências (Node 20).
- **Personalização visual**: as cores ficam em `assets/styles.css` (`--accent`, `--brand`, `--chart-*`). Para usar a identidade da BNR, troque esses tokens e o bloco `.logo`.

```
index.html                 estrutura da página
assets/styles.css          design system (tokens claro/escuro)
assets/app.js              filtros, agregações, gráficos, tabela, insights
assets/csv.js              importador do CSV do Gerenciador
assets/demo.js             dados de demonstração (quando não há sincronização)
scripts/fetch-meta.mjs     Meta Marketing API → data/insights.json
.github/workflows/         sincronização a cada 3 h + publicação
```

Enquanto não houver `data/insights.json`, o dashboard abre em **modo demonstração**. Também dá para forçar esse modo com `?demo=1`.
