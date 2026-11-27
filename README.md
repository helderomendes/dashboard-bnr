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
| **Vendas** | Qual anúncio gerou cada venda: o caminho anúncio → lead → etapas do Dommus → contrato, custo por venda, VGV por anúncio e taxa de lead para venda |

Recursos de uso:
- Datas com os mesmos atalhos do Gerenciador (hoje, ontem, 7/14/30/90 dias, este mês, mês passado, personalizado).
- **Leads × Conversas × Todos**: separa leads de formulário/site das conversas iniciadas no WhatsApp/Direct.
- Busca global (atalho `/`), filtros por campanha, conjunto e status.
- **Meta de CPL**: os CPLs ficam verdes, amarelos ou vermelhos conforme a meta.
- **Link compartilhável**: o período, os filtros e a busca vão junto na URL (menu ⋯ › Copiar link).
- Tema claro/escuro, layout responsivo para celular e atualização automática a cada 30 min com a aba aberta.

---

## Como conectar a conta (grátis, cerca de 15 minutos)

Como funciona: a cada 3 horas, o **GitHub Actions** busca os números na **Meta Marketing API** e publica o dashboard na **Vercel**, em https://dashboard-bnr.vercel.app. A página é aberta (sem login), mas responde com `X-Robots-Tag: noindex` para não aparecer em buscadores. Quem tiver o link vê os números. Os três serviços são gratuitos (Vercel no plano Hobby). O token da Meta fica guardado como segredo no GitHub e nunca chega ao navegador.

```
Meta Ads ──token só leitura──▶ GitHub Actions (a cada 3 h) ──▶ Vercel (noindex) ──▶ navegador
```

### 1. Criar o token da Meta (definitivo, só leitura)

Você precisa ser **administrador do Business** dono da conta de anúncios.

1. **Criar um app** (se ainda não houver): em **developers.facebook.com › Meus apps › Criar app**, escolha **Outro › Empresa**, dê o nome `Dashboard BNR` e vincule ao portfólio da BNR Construtora. Adicione o produto **API de Marketing**. O app pode ficar em modo de desenvolvimento.
2. **Criar o usuário do sistema**: em **business.facebook.com › Configurações › Usuários › Usuários do sistema › Adicionar**, use o nome `dashboard-bnr` e a função **Funcionário**.
3. **Atribuir ativos** ao usuário do sistema:
   - **Contas de anúncios › BNR Construtora 01**: marque só **Ver desempenho**.
   - **Apps › Dashboard BNR**: marque **Desenvolver app**. Sem isso, o app não aparece na hora de gerar o token.
4. **Gerar novo token**: escolha o app, coloque a validade **Nunca** e marque só a permissão **`ads_read`**. Copie o token na hora: ele aparece uma única vez.
5. **Conferir** em **developers.facebook.com/tools/debug/accesstoken**: precisa mostrar *Expira: Nunca*, *Escopos: ads_read* e *Tipo: System User*.

> O token só para de funcionar se for revogado, se o usuário do sistema for excluído ou se o acesso à conta for removido. Nunca cole o token em chat, e-mail ou código: só no secret do GitHub.

| Problema | Solução |
|---|---|
| Botão "Gerar novo token" cinza ou o app não aparece | Atribua o **app** ao usuário do sistema (passo 3) |
| `ads_read` não aparece na lista | Adicione o produto **API de Marketing** no app |
| Sem o menu "Usuários do sistema" | Você não é administrador desse Business |

### 2. Criar o projeto na Vercel

1. Crie uma conta grátis em **vercel.com** e um projeto vazio chamado `dashboard-bnr`. Não precisa conectar o Git: quem publica é o GitHub Actions.
2. Pegue os IDs:
   - **Team ID** (começa com `team_`): em **Team Settings › General**;
   - **Project ID** (começa com `prj_`): em **Project Settings › General**.
3. Crie um token em **Account Settings › Tokens**, com escopo no time do projeto.

### 3. Configurar o GitHub

No repositório: **Settings › Secrets and variables › Actions › New repository secret**

| Secret | Valor |
|---|---|
| `META_ACCESS_TOKEN` | o token do passo 1 |
| `META_AD_ACCOUNT_ID` | `act_1332542050584163` (BNR Construtora 01) |
| `VERCEL_TOKEN` | o token da Vercel |
| `VERCEL_ORG_ID` | o Team ID (`team_…`) |
| `VERCEL_PROJECT_ID` | o Project ID (`prj_…`) |
| `CACHE_KEY` | opcional: frase aleatória com 40 ou mais caracteres. Liga o cache incremental |

Variáveis opcionais (aba *Variables*): `DAYS` (histórico da primeira carga, padrão 1200 dias, limitado pela Meta a 37 meses), `REFRESH_DAYS` (dias recentes rebaixados a cada execução, padrão 28), `MAX_DAYS` (teto do histórico acumulado no cache, padrão 3650), `META_API_VERSION` (padrão `v23.0`) e `LEAD_ACTION_TYPES` (veja "O que conta como lead").

#### Cache incremental

Com `CACHE_KEY` definido, cada execução guarda o resultado no cache do GitHub Actions, **cifrado com AES-256-GCM** (o repositório é público, então nada fica legível fora do job). Na execução seguinte, só os últimos `REFRESH_DAYS` são baixados de novo, porque a Meta ainda ajusta atribuição e leads nesses dias. O resto é reaproveitado e o histórico passa a acumular além de `DAYS`, até `MAX_DAYS`.

Se o cache sumir (o GitHub apaga entradas sem uso por 7 dias), se a chave mudar ou se `LEAD_ACTION_TYPES` mudar, a execução simplesmente baixa o histórico completo de novo. Sem `CACHE_KEY`, tudo funciona como antes, sem cache.

Confira também se a branch padrão é a `main` (**Settings › General › Default branch**). O GitHub só roda a atualização agendada na branch padrão.

### 4. Publicar

1. Vá em **Actions › Sincronizar Meta Ads e publicar dashboard › Run workflow**.
2. Para testar antes de ter o token da Meta, marque **"Publicar com dados fictícios"**. Assim o passo da Meta é pulado e o dashboard abre em modo demonstração.
3. O link aparece no **resumo do job**, na linha "Dashboard: https://…". O endereço fixo é https://dashboard-bnr.vercel.app.

Depois disso, o dashboard se atualiza sozinho a cada 3 horas e também a cada mudança de código em `main`. Para atualizar na hora, use **Run workflow** sem marcar a opção de dados fictícios.

| Erro no job | Causa provável |
|---|---|
| `Configure VERCEL_… no GitHub Actions` | Falta um dos secrets da Vercel |
| `Could not retrieve Project Settings` / erro no passo "Vincular projeto da Vercel" | `VERCEL_ORG_ID` ou `VERCEL_PROJECT_ID` errado, ou o token não tem acesso ao time |
| `Token inválido ou expirado (erro 190)` | Gere de novo o token da Meta (passo 1) |
| `Sem permissão na conta (erro 200/10)` | O usuário do sistema não tem a conta de anúncios atribuída |

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

## Vendas: do anúncio ao contrato

A aba **Vendas** liga cada venda do Dommus ao anúncio que gerou o lead. Ela responde perguntas como "qual criativo vende, e não só qual traz o lead mais barato?".

```
Formulário da Meta (cada lead, com o anúncio) ─┐
                                               ├─▶ equivalência de contatos ─▶ data/sales.json (cliente mascarado)
Export do Dommus (oportunidades e etapas) ─────┘
```

### Como a equivalência é feita

Cada oportunidade do Dommus é comparada com os leads do formulário, nesta ordem:

| Ligação | Como | Confiança |
|---|---|---|
| UTM do anúncio | `utm_content` gravado no Dommus = ID do anúncio | alta |
| E-mail | minúsculo e sem espaços | alta |
| Telefone | DDD + 8 últimos dígitos: resolve o 9º dígito, o +55 e o DDD em campo separado | alta |
| Nome do anúncio | campanha, mídia ou origem do Dommus com o nome exato de um anúncio | média |
| Campanha | idem, com o nome de uma campanha (só a campanha fica identificada) | média |
| Nome e data | primeiro + último nome iguais e lead até 10 dias antes ou depois | baixa |

Uma pessoa pode ter gerado vários leads antes de comprar. A página deixa escolher quem leva o crédito: o **primeiro lead** ou o **último lead antes da venda**.

As etapas do Dommus viram o funil **No Dommus → Em atendimento → Visita → Proposta → Venda**. "Venda Ganha" (ou uma data de venda/contrato) conta como venda. "Desistência" e "Não Perturbe" contam como perdidos. A etapa do tipo "Venda" (fechamento antes da formalização) conta como proposta.

### Privacidade (LGPD)

A página é aberta, então **nenhum dado pessoal é publicado**. O cliente aparece como `João S.` e `(31) ••••-7777`. Nome completo, e-mail e telefone ficam só dentro do job do GitHub Actions e no cache cifrado (AES-256-GCM). O arquivo `build/leads.json` nunca é copiado para a Vercel.

### 1. Liberar os leads do formulário no token da Meta

O token atual só lê números (`ads_read`). Para ler cada lead:

1. Em **business.facebook.com › Configurações › Usuários do sistema › dashboard-bnr › Atribuir ativos**, adicione a **Página** da BNR com a permissão de **leads** (ou "Gerenciar Página").
2. **Gere um novo token** com `ads_read`, `leads_retrieval`, `pages_show_list`, `pages_read_engagement` e `pages_manage_ads`. Troque o secret `META_ACCESS_TOKEN`.
3. Opcional: variável `META_PAGE_IDS` com os IDs das Páginas, se o token tiver acesso a outras.

**Alternativa sem trocar o token principal:** crie o secret `META_LEADS_TOKEN` com um token que leia os leads (por exemplo, o seu token de usuário de longa duração, com `leads_retrieval`, `pages_show_list` e `pages_read_engagement`). Só a busca de leads usa esse token; os números do dashboard continuam com o `META_ACCESS_TOKEN`. Um token de usuário enxerga todas as Páginas que você administra, então defina também `META_PAGE_IDS` só com a Página da BNR. Token de usuário vence (o de longa duração dura cerca de 60 dias): quando vencer, a aba Vendas mostra o erro e os leads já baixados continuam no cache cifrado.

> A Meta só devolve leads de até **90 dias**. Por isso o `CACHE_KEY` é importante: o histórico vai se acumulando no cache cifrado. Sem ele, as vendas de leads com mais de 90 dias só são ligadas por UTM ou pelo nome do anúncio/campanha no Dommus.

### 2. Levar o Dommus até o dashboard

O Dommus não tem uma API de leitura documentada. O que existe é o **export**: no Prospecta, a Lista de Oportunidades / Pesquisa Geral, e no Vende, **Lupa › Relatório de Base Completa › Exportar Tabela**. Marque ao menos nome, e-mail, telefone (e DDD), data de cadastro, etapa/status, data da venda, valor, empreendimento, origem, mídia e campanha.

Escolha uma forma:

| Forma | Como | Para quem |
|---|---|---|
| **Automática** | Suba o export no Google Drive (ou numa Planilha Google) com acesso "qualquer pessoa com o link" e salve o link no secret `DOMMUS_EXPORT_URL`. Para atualizar, substitua o arquivo mantendo o mesmo link (Drive › Gerenciar versões). | Todos que abrem o dashboard veem as vendas |
| **No navegador** | Na aba Vendas, **Importar export do Dommus**. O arquivo é lido só no seu navegador. Para comparar e-mail e telefone, crie o secret `SALES_KEY` (frase com 12+ caracteres) e digite a mesma frase na página. | Só quem importou vê, até recarregar a página |
| **API** | Se o Dommus liberar um endpoint, use os secrets `DOMMUS_API_URL` e `DOMMUS_API_TOKEN` (cabeçalho em `DOMMUS_AUTH_HEADER`, padrão `Authorization: Bearer`). | Todos |

O DE/PARA das colunas é automático (aceita "Nome do Lead", "E-mail", "Telefone", "Etapa", "Data da Venda", "Valor da Venda", "Empreendimento"…). Se alguma coluna tiver outro nome, defina a variável `DOMMUS_FIELD_MAP`, por exemplo `{"stage":"Status Atual","value":"VGV Negociado","saleDate":"Data Assinatura"}`. Os campos são `name`, `email`, `ddd`, `phone`, `created`, `stage`, `stageType`, `saleDate`, `value`, `product`, `origin`, `media`, `campaign` e `utmContent`.

### 3. UTMs nos anúncios de landing page (comece hoje)

Lead de landing page não passa pelo formulário da Meta, então a única ligação exata é a UTM. Em **Anúncio › Destino › Parâmetros de URL**, use:

```
utm_source=meta&utm_medium=paid&utm_campaign={{campaign.id}}&utm_term={{adset.id}}&utm_content={{ad.id}}
```

E no formulário da LP, envie a `utm_content` para o Dommus num campo oculto (o webhook do Dommus aceita `campanha`, `midia`, `origem` e `tags`). Grave o `{{ad.id}}` em `midia` ou numa tag e aponte o `DOMMUS_FIELD_MAP` (`"utmContent":"Mídia"`). Lead antigo de LP sem UTM não tem como ser recuperado.

## Detalhes técnicos

- **O que conta como lead**: a ação `lead` da Meta, que soma formulário instantâneo e lead do pixel no site, sem contar duas vezes. Se a conta usa uma conversão personalizada, defina `LEAD_ACTION_TYPES` (ex.: `offsite_conversion.custom.123456`). **Conversas** = `onsite_conversion.messaging_conversation_started_7d`.
- **Atribuição**: `use_unified_attribution_setting=true`, então os números batem com o Gerenciador.
- **Quebras** (posicionamento, idade/gênero, região) vêm no nível de campanha. Por isso respeitam o filtro de campanha, mas não o de conjunto ou anúncio.
- **Alcance/frequência** não aparecem de propósito: o alcance não pode ser somado entre dias, e mostrar uma soma diária daria um número errado.
- Os anúncios excluídos continuam no histórico, com o nome tirado dos próprios insights.
- Dados: a sincronização gera um arquivo principal pequeno (`data/insights.json`) e partes mensais em `data/chunks/` com hash no nome e cache imutável; o painel baixa só os meses do período escolhido.
- Stack: HTML + CSS + JS puros e [Apache ECharts](https://echarts.apache.org) 5.5.1 servido localmente em `assets/vendor/` (licença Apache-2.0 em `assets/vendor/ECHARTS-LICENSE.txt`). Não há build e o script de sincronização não tem dependências (Node 20).
- **Personalização visual**: as cores ficam em `assets/styles.css` (`--accent`, `--brand`, `--chart-*`). Para usar a identidade da BNR, troque esses tokens e o bloco `.logo`.

```
index.html                 estrutura da página
assets/styles.css          design system (tokens claro/escuro)
assets/app.js              filtros, agregações, gráficos, tabela, insights
assets/csv.js              importador do CSV do Gerenciador
assets/demo.js             dados de demonstração (quando não há sincronização)
assets/sales-core.js       leitura do export do Dommus (CSV/XLSX/JSON), DE/PARA e equivalência de contatos
scripts/fetch-meta.mjs     Meta Marketing API → data/insights.json
scripts/fetch-leads.mjs    leads do formulário, um por um (dados pessoais: só no job e no cache cifrado)
scripts/build-sales.mjs    Dommus × leads → data/sales.json (cliente mascarado)
.github/workflows/         sincronização a cada 3 h + publicação na Vercel
```

Enquanto não houver `data/insights.json`, o dashboard abre em **modo demonstração**. Também dá para forçar esse modo com `?demo=1`.
