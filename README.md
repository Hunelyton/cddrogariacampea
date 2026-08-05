# Sistema de Inventário — CD Drogarias Campeã

Aplicação web para importar o cadastro de produtos da CD Drogarias Campeã, receber contagens realizadas por coletores, ajustar quantidades, identificar divergências de estoque e exportar relatórios operacionais.

O sistema funciona no navegador e não possui backend próprio. Produtos e contagens são persistidos localmente com IndexedDB; cálculos, importações e exportações são executados no dispositivo do usuário.

## Sumário

- [Objetivo e recursos](#objetivo-e-recursos)
- [Fluxo recomendado de uso](#fluxo-recomendado-de-uso)
- [Tecnologias](#tecnologias)
- [Instalação e execução](#instalação-e-execução)
- [Scripts disponíveis](#scripts-disponíveis)
- [Arquitetura](#arquitetura)
- [Layout e telas](#layout-e-telas)
- [Regras de importação](#regras-de-importação)
- [Regras de negócio e cálculos](#regras-de-negócio-e-cálculos)
- [Persistência e cache](#persistência-e-cache)
- [Exportações](#exportações)
- [Estrutura de arquivos](#estrutura-de-arquivos)
- [Funções e componentes](#funções-e-componentes)
- [Design system e responsividade](#design-system-e-responsividade)
- [Manutenção e limitações conhecidas](#manutenção-e-limitações-conhecidas)

## Objetivo e recursos

O aplicativo atende ao ciclo de inventário:

1. Importação do cadastro de produtos por planilha Excel.
2. Importação de um ou mais arquivos de contagem em TXT.
3. Associação da leitura ao produto por EAN ou código interno.
4. Agrupamento das leituras por produto.
5. Inclusão manual, ajuste ou exclusão de contagens.
6. Cálculo de divergências físicas e financeiras.
7. Exportação das contagens em TXT e dos relatórios em PDF.

Principais recursos:

- até 12 EANs por produto;
- download de um modelo XLSX de cadastro;
- importação em lotes com indicador de progresso;
- múltiplos arquivos TXT por operação;
- identificação de coletor e inventariador por arquivo;
- filtros, ordenação e paginação de 50 registros;
- filtros de produtos controlados e não cadastrados;
- cards de indicadores calculados em Web Worker;
- armazenamento local e cache temporário para melhorar desempenho;
- layout responsivo para desktop, tablet e celular.

## Fluxo recomendado de uso

1. Abra **Importar cadastro** e, se necessário, baixe o modelo XLSX.
2. Preencha ou exporte o cadastro no formato esperado e importe a planilha.
3. Realize as leituras nos coletores.
4. Abra **Importar contagem**, selecione os arquivos TXT e informe coletor e inventariador.
5. Confira a aba **Contagem**; inclua, ajuste ou exclua registros quando necessário.
6. Analise a aba **Divergências**.
7. Exporte o relatório geral, o relatório de divergências ou os arquivos TXT tratados.
8. Use **Limpar dados** somente ao iniciar um novo inventário ou quando quiser remover todo o conteúdo local.

> Os dados ficam no navegador utilizado. Trocar de computador, navegador, perfil ou limpar os dados do site pode tornar o inventário anterior indisponível.

## Tecnologias

| Tecnologia | Responsabilidade |
| --- | --- |
| React 18 | Componentes e estado da interface |
| TypeScript | Tipagem do código e dos modelos de dados |
| Vite 5 | Servidor de desenvolvimento e build de produção |
| Tailwind CSS | Layout responsivo e estilos utilitários |
| shadcn/ui + Radix UI | Componentes de interface acessíveis |
| IndexedDB | Persistência local de produtos e contagens |
| SheetJS (`xlsx`) | Leitura e geração de planilhas Excel |
| pdfMake | Geração dos relatórios PDF |
| Lucide React | Ícones da interface |
| React Router | Rotas `/` e página 404 |
| Sonner e Toast | Mensagens de sucesso e erro |
| Web Worker | Cálculo dos indicadores fora da thread principal |

## Instalação e execução

### Pré-requisitos

- Node.js 18 ou superior;
- npm 9 ou superior;
- navegador moderno com suporte a IndexedDB, Web Worker e APIs de download.

### Ambiente local

```bash
git clone <URL_DO_REPOSITORIO>
cd cddrogariacampea
npm install
npm run dev
```

O Vite exibirá no terminal o endereço local, normalmente `http://localhost:5173`.

### Build de produção

```bash
npm run build
npm run preview
```

O build é gravado em `dist/`. O deploy deve servir `index.html` como fallback para as rotas do React Router.

## Scripts disponíveis

| Comando | Ação |
| --- | --- |
| `npm run dev` | Inicia o Vite com atualização automática |
| `npm run build` | Compila TypeScript e gera o bundle de produção |
| `npm run build:dev` | Gera o build no modo development |
| `npm run lint` | Executa o ESLint em todo o projeto |
| `npm run preview` | Serve localmente o conteúdo de `dist/` |

## Arquitetura

```text
Usuário
  │
  ▼
React / páginas e componentes
  ├── importação XLS/XLSX ──► SheetJS ──► produtos
  ├── importação TXT ───────► parser ───► contagens
  ├── tabelas e ajustes ─────────────────► IndexedDB
  ├── indicadores ──────────► cache ─────► Web Worker
  └── exportações ──────────► TXT / XLSX / pdfMake
```

### Inicialização

1. `src/main.tsx` monta o React no elemento `#root`.
2. `src/App.tsx` configura providers globais, notificações e rotas.
3. A rota `/` renderiza `src/pages/Index.tsx`.
4. `Index` consulta IndexedDB/cache, solicita os indicadores e monta cabeçalho, cards e abas.
5. As tabelas são carregadas sob demanda com `React.lazy` e `Suspense`.

### Atualização dos dados

Importações e alterações chamam `handleProductsUpdate`. Esse callback:

- invalida os caches de produtos, contagens, estatísticas e divergências;
- incrementa `refreshTrigger`;
- recarrega os dados das tabelas;
- solicita um novo cálculo dos indicadores.

## Layout e telas

### Estrutura visual do dashboard

```text
┌──────────────────────────────────────────────────────────────┐
│ Logo + empresa              Botões de importar/exportar     │
├──────────────────────────────────────────────────────────────┤
│ Cards de indicadores (1, 2 ou 3 colunas conforme a tela)    │
├──────────────────────────────────────────────────────────────┤
│ Cadastro de Produtos | Contagem | Divergências              │
├──────────────────────────────────────────────────────────────┤
│ Busca, filtros, ações e tabela paginada                     │
└──────────────────────────────────────────────────────────────┘
```

### Cabeçalho

Exibe logo, razão social, CNPJ e endereço. Possui quatro ações:

- **Importar cadastro:** abre o modal de XLS/XLSX;
- **Importar contagem:** abre o modal de arquivos TXT;
- **Exportar relatório:** baixa o PDF geral do dashboard;
- **Limpar dados:** apaga produtos, contagens, `localStorage`, `sessionStorage` e caches do navegador, depois recarrega a página.

### Cards de indicadores

O dashboard apresenta nove cards:

| Card | Conteúdo |
| --- | --- |
| Produtos cadastrados | SKUs únicos, combinações de produto + lote e localizadores únicos do cadastro |
| Itens contados | SKUs, unidades ajustadas/contadas, localizadores e lotes únicos presentes na contagem |
| Divergências ativas | Produtos cuja quantidade contada difere do saldo |
| Divergência positiva | Valor financeiro das sobras |
| Divergência negativa | Valor financeiro absoluto das faltas |
| Diferença financeira | Soma algébrica das divergências positivas e negativas |
| Erro por operador | Soma dos SKUs e das unidades com ajuste atribuídos aos operadores |
| Não cadastrados / manuais | Leituras sem cadastro e inclusões manuais |
| Margem total de ajustes | Grupos de produto + lote + localizador ajustados e soma absoluta das unidades alteradas |

### Aba Cadastro de Produtos

- busca por código do produto, descrição ou qualquer EAN;
- tabela horizontal com os principais campos importados;
- exibe inicialmente EAN 1, EAN 2 e EAN 3; o botão **Mostrar mais EANs** revela EAN 4 a EAN 12 e permite ocultá-los novamente;
- ordenação crescente, decrescente e sem ordenação ao clicar nos cabeçalhos;
- paginação de 50 produtos;
- mensagem de orientação quando não há cadastro.

### Aba Contagem

- pesquisa geral por produto, EAN, descrição, código localizador, lote, validade, código LV, coletor ou inventariador;
- formulário de inclusão manual com código localizador, EAN, quantidade, lote, validade e código LV;
- filtros **Mostrar controlados** e **MOSTRAR SOMENTE NÃO CADASTRADOS**; ao ativar o segundo, apenas contagens sem cadastro são exibidas;
- agrupamento das leituras pela combinação de produto, lote e localizador, sem unir localizadores ou lotes diferentes;
- exibição apenas do EAN 1 normalizado do cadastro;
- exibição de código localizador, lote, validade e código LV recebidos na contagem;
- a descrição do localizador é preenchida pelo cadastro e exibida abaixo do código localizador, na mesma célula;
- a tabela inicia pelas colunas Localizador, Código LV, Produto, EAN 1 e Descrição;
- código localizador, lote e validade vazios são apresentados como `-`, sem alterar o valor armazenado ou exportado;
- soma da quantidade escaneada e da quantidade ajustada;
- edição inline da quantidade ajustada, com Enter para salvar e Escape para cancelar;
- exclusão das leituras de um produto, lote e localizador, após confirmação;
- a confirmação de exclusão apresenta logo, nome da empresa, produto, EAN, descrição, lote, validade e localizador;
- exportação TXT com ponto e vírgula ou vírgula;
- exportação Excel com todos os campos, respeitando os filtros e a ordenação selecionados;
- ordenação por cabeçalho e paginação de 50 grupos.

Inclusões manuais recebem automaticamente:

- descrição do localizador obtida do cadastro;
- coletor `MANUAL`;
- inventariador `MANUAL`.

A inclusão manual exige que o EAN exista no cadastro.
O EAN informado pode corresponder a qualquer um dos 12 EANs do produto; a tela armazena e apresenta o EAN 1 do cadastro.

### Aba Divergências

- calcula divergências usando cadastro e contagens ajustadas;
- pesquisa por localizador, descrição do localizador, código LV, produto, EAN, descrição, lote, validade, coletor ou inventariador;
- exibe localizador, descrição do localizador, código LV, lote e validade junto dos dados financeiros e quantitativos;
- produtos não cadastrados ficam ocultos por padrão; ao marcar **Mostrar não cadastrados**, a tabela passa a exibir exclusivamente esses itens;
- valores positivos em verde e negativos em vermelho;
- ordenação por qualquer coluna visível;
- paginação de 50 registros;
- exportação do conjunto filtrado e ordenado para PDF e Excel.

### Página não encontrada

Qualquer rota diferente de `/` renderiza `NotFound.tsx`, registra a tentativa no console e oferece retorno à página inicial.

## Regras de importação

### Cadastro XLS/XLSX

O modal **Importar Cadastro de Produtos** aceita `.xlsx` e `.xls`. A primeira planilha do arquivo é utilizada, a linha 1 é tratada como cabeçalho e os dados começam na linha 2.

O botão **Baixar modelo XLSX** gera `MODELO_IMPORTACAO_CADASTRO.xlsx`, com a aba `Cadastro` e as colunas na ordem correta.

| Coluna | Cabeçalho do modelo | Campo interno | Obrigatoriedade prática |
| --- | --- | --- | --- |
| A | EMPRESA | `empresa` | Opcional |
| B | PRODUTO | `produto` | Identificador principal |
| C | DESCRICAO | `descricao1` | Recomendado |
| D | SALDO | `saldo` | Necessário para divergências |
| E | CONTROLADO | `controlado` | Opcional; `S` ou `SIM` ativa o filtro |
| F | CUSTO_GERENCIAL | `custoGerencial` | Necessário para cálculo financeiro |
| G–R | EAN1–EAN12 | `ean1`–`ean12` | Pelo menos um recomendado |
| S | LOTE | `lote` | Opcional |
| T | VALIDADE | `validade` | Opcional |
| U | COD.LOCALIZADOR | `codLocalizador` | Opcional |
| V | DESCRICAO LOCALIZADOR | `descricaoLocalizador` | Opcional |
| W | CODIGO LV | `codigoLv` | Opcional |

Se todos os EANs estiverem vazios, o importador copia o código de `PRODUTO` para `EAN1`. Os registros são preparados no navegador e gravados em lotes de 500. O progresso possui as fases **Lendo arquivo Excel** e **Salvando produtos**.

> Uma nova importação adiciona registros à base existente; ela não limpa automaticamente o cadastro anterior.

### Contagem TXT

O modal aceita vários arquivos `.txt`. Cada arquivo recebe um coletor entre `C1` e `C30` e exige o nome do inventariador.

Formatos aceitos:

```text
LOC-001;7891234567890;8;LT-2026;12/2027;LV-001
```

ou:

```text
LOC-001,7891234567890,8,LT-2026,12/2027,LV-001
```

Regras do parser:

- detecta `;` ou `,` em cada linha;
- ignora linhas vazias;
- exige ao menos código localizador, EAN e quantidade;
- interpreta as posições na ordem: código localizador, EAN, quantidade, lote, validade e código LV;
- procura o EAN recebido em qualquer um dos 12 EANs do cadastro;
- código localizador e código LV são mantidos como dados da contagem, mas não substituem o confronto pelos 12 EANs;
- quando encontra o produto, normaliza a leitura para seu `EAN1` e código interno;
- quando não encontra, mantém o código lido e usa a descrição `Produto não cadastrado`;
- guarda código localizador, lote, validade e código LV junto da contagem;
- inicia `quantidadeAjustada` com o mesmo valor de `quantidade`;
- adiciona as contagens à base já existente em lotes de 500.

O arquivo não deve possuir cabeçalho, pois qualquer linha com duas posições é interpretada como contagem.

## Regras de negócio e cálculos

### Associação entre cadastro e contagem

A associação principal é feita pelo campo `produto`. Quando necessário, o sistema também tenta associar pelos EANs do cadastro. Um cache em memória mapeia cada um dos 12 EANs para seu produto.

### Agrupamento da contagem

Todas as leituras com o mesmo `produto`, o mesmo `lote` e o mesmo `localizador` formam um grupo. Lotes ou localizadores diferentes do mesmo produto permanecem em linhas separadas. Nesse grupo:

- `quantidadeEscaneada` é a soma de `quantidade`;
- `quantidadeAjustada` é a soma de `quantidadeAjustada`, usando `quantidade` como fallback;
- EANs repetidos são exibidos apenas uma vez;
- seção, coletor e inventariador vêm do primeiro registro do grupo.

Ao editar uma quantidade ajustada, o total informado é salvo no primeiro registro da combinação produto + lote + localizador e os demais registros desse mesmo grupo recebem `0`. Isso preserva o total sem misturar lotes ou localizadores.

### Números brasileiros

`parseBRNumber` converte saldo e custo para número:

- `1.234,56` vira `1234.56`;
- símbolos monetários e espaços são removidos;
- valores inválidos ou vazios viram `0`.

### Divergência

```text
quantidade divergente = quantidade ajustada - saldo da loja
valor da diferença    = custo gerencial × quantidade divergente
diferença financeira  = divergência positiva + divergência negativa
```

- resultado positivo representa sobra;
- resultado negativo representa falta;
- resultado zero não aparece na tabela de divergências;
- produto cadastrado com saldo diferente de zero e sem contagem é considerado contado como zero.

O lote também participa do confronto:

- quando o cadastro possui lote, somente a contagem do mesmo produto e lote é comparada ao saldo;
- um lote contado diferente do lote cadastrado gera uma divergência própria com saldo esperado igual a zero;
- a ausência de contagem para o lote cadastrado gera uma divergência negativa;
- quando o produto não possui lote no cadastro, os lotes continuam separados na aba Contagem, mas suas quantidades são somadas para o confronto com o saldo do produto.

### Indicadores e ajustes

Um grupo de produto + lote + localizador é considerado ajustado quando a soma ajustada difere da soma originalmente escaneada. A diferença absoluta é atribuída aos inventariadores relacionados ao grupo para a métrica `errorsByInventor` e para o card **Erro por operador**.

## Persistência e cache

### IndexedDB

Banco: `InventoryDB`<br>
Versão: `3`

| Object store | Chave | Índices | Conteúdo |
| --- | --- | --- | --- |
| `products` | `id`, auto incremento | `produto`, `ean1` | Cadastro importado |
| `counts` | `id`, auto incremento | `ean`, `coletor`, `produto` | Leituras e ajustes |

Modelo resumido de produto:

```ts
interface Product {
  id?: number;
  empresa: string;
  produto: string;
  descricao1: string;
  saldo: string;
  controlado: string;
  custoGerencial: string;
  ean1: string; // até ean12
  lote?: string;
  validade?: string;
  codLocalizador?: string;
  descricaoLocalizador?: string;
  codigoLv?: string;
}
```

Modelo de contagem:

```ts
interface Count {
  id?: number;
  codLocalizador?: string;
  ean: string;
  quantidade: string;
  quantidadeAjustada?: string;
  lote?: string;
  validade?: string;
  codigoLv?: string;
  descricaoLocalizador?: string;
  secao: string;
  coletor: string;
  inventariador: string;
  produto?: string;
  descricao?: string;
}
```

### Cache em memória

`DataCache` armazena valores com TTL e possui as chaves:

- `products`;
- `counts`;
- `dashboard_stats`;
- `discrepancies`.

TTLs disponíveis: curto de 1 minuto, médio de 5 minutos e longo de 15 minutos. O dashboard utiliza principalmente o TTL médio. O cache não substitui o IndexedDB e é perdido ao recarregar a aplicação.

### Desempenho

- gravações em IndexedDB são divididas em lotes de 500;
- a execução devolve o controle à interface entre os lotes;
- buscas usam debounce de 300 ms;
- filtros, agrupamentos e ordenações usam memoização;
- linhas de tabela usam `React.memo`;
- tabelas e abas usam lazy loading;
- indicadores são calculados em um Web Worker inline;
- se Web Worker não estiver disponível, existe um fallback simplificado que calcula apenas produtos cadastrados.

## Exportações

### Modelo do cadastro

- arquivo: `MODELO_IMPORTACAO_CADASTRO.xlsx`;
- aba: `Cadastro`;
- conteúdo: cabeçalho das 23 colunas e larguras ajustadas.

### Contagem Excel

- arquivo: `contagem_filtrada_YYYY-MM-DD.xlsx`;
- aba: `Contagem`;
- exporta todos os resultados dos filtros e da ordenação atuais, não apenas a página visível;
- inclui, nesta ordem: produto, quantidade ajustada, lote, validade (mês/ano), código localizador e código LV;
- deixa o código LV em branco quando a contagem não possuir esse dado.

### PDF de divergências

- arquivo: `relatorio-divergencia.pdf`;
- papel A3 em paisagem para comportar todos os campos;
- logo e título no cabeçalho;
- tabela filtrada e ordenada com localizador, descrição do localizador, código LV, produto, EAN 1, descrição, lote, validade, coletor, inventariador, custo, quantidades e valor da diferença;
- resumo de divergências positivas, negativas e diferença financeira;
- dados da empresa e paginação no rodapé.

### Excel de divergências

- arquivo: `divergencias_filtradas_YYYY-MM-DD.xlsx`;
- aba: `Divergências`;
- respeita a busca, os filtros e a ordenação selecionados;
- exporta todos os resultados filtrados, não apenas a página atual;
- inclui todos os campos do PDF e a indicação de produto controlado.

### PDF geral

- arquivo: `relatorio-geral-dashboard.pdf`;
- papel A3 em paisagem para comportar os novos campos;
- inclui os indicadores financeiros e de contagem do dashboard;
- confronta cadastro e contagem por produto e lote, seguindo a mesma regra da aba de divergências;
- apresenta um resumo operacional com leituras, grupos únicos de produto/lote, quantidades escaneada e ajustada, operadores, produtos não cadastrados, lotes esperados sem contagem e lotes inesperados;
- inclui análise de erros por operador/inventariador com leituras, SKUs, localizadores, lotes, quantidades, SKUs e grupos ajustados, unidades alteradas, não cadastrados, divergências associadas e valor líquido;
- informa, para cada operador, o percentual de unidades ajustadas sobre sua própria quantidade escaneada e sua participação percentual no total de ajustes;
- faltas sem nenhuma contagem não são atribuídas artificialmente a um operador;
- lista todos os produtos não cadastrados com localizador, código LV, produto, EAN, descrição, lote, validade, quantidade, coletor e operador;
- apresenta as 50 maiores faltas e sobras, incluindo localizador, código LV, EAN, lote, validade e quantidades;
- utiliza o cadastro e as contagens atuais, incluindo inserções manuais e ajustes;
- inclui identificação da empresa, logo e paginação.

## Estrutura de arquivos

```text
.
├── public/                  # Arquivos públicos copiados sem transformação
├── src/
│   ├── assets/              # Imagens importadas pelo bundle
│   ├── components/          # Componentes funcionais do dashboard
│   │   └── ui/              # Componentes-base do shadcn/Radix
│   ├── hooks/               # Hooks reutilizáveis
│   ├── lib/                 # Persistência, cache e utilitários
│   ├── pages/               # Páginas ligadas às rotas
│   ├── App.tsx              # Providers e roteamento
│   ├── index.css            # Tokens globais e Tailwind
│   └── main.tsx             # Entrada do React
├── index.html               # Documento HTML do Vite
├── package.json             # Dependências e scripts
├── tailwind.config.ts       # Tema Tailwind
├── vite.config.ts           # Configuração do build
└── tsconfig*.json           # Configuração TypeScript
```

### Arquivos da raiz

| Arquivo | Responsabilidade |
| --- | --- |
| `README.md` | Documentação funcional e técnica |
| `index.html` | HTML base e elemento `#root` |
| `package.json` | Metadados, scripts, dependências e versões |
| `package-lock.json` / `bun.lockb` | Travamento de dependências para npm/Bun |
| `vite.config.ts` | Plugin React SWC, aliases e configuração do Vite |
| `tsconfig.json` | Referências gerais dos projetos TypeScript |
| `tsconfig.app.json` | Opções TypeScript do código da aplicação |
| `tsconfig.node.json` | Opções TypeScript dos arquivos de configuração |
| `tailwind.config.ts` | Cores, raios, animações e caminhos analisados pelo Tailwind |
| `postcss.config.js` | Pipeline PostCSS/Tailwind/Autoprefixer |
| `eslint.config.js` | Regras de qualidade e lint |
| `components.json` | Configuração e aliases do shadcn/ui |
| `.gitignore` | Arquivos ignorados pelo Git |
| `dist/` | Saída gerada pelo build; não deve ser editada manualmente |

### Arquivos públicos e assets

| Arquivo | Uso |
| --- | --- |
| `public/logo-drogaria.png` | Logo carregada via `fetch` nos PDFs |
| `src/assets/logo-drogaria-campea.png` | Logo exibida no cabeçalho pelo bundle |
| `public/favicon.png` / `favicon.ico` | Ícones do site com a identidade da Drogarias Campeã |
| `public/robots.txt` | Orientação para rastreadores |
| `public/placeholder.svg` | Imagem genérica de placeholder |

### Componentes de negócio

| Arquivo | Responsabilidade |
| --- | --- |
| `src/components/DashboardHeader.tsx` | Identificação da empresa, ações principais, limpeza e abertura dos modais |
| `src/components/StatCard.tsx` | Card reutilizável para indicadores e variantes de cor |
| `src/components/DashboardTabs.tsx` | Navegação entre as três abas e lazy loading das tabelas |
| `src/components/ImportDialog.tsx` | Download do modelo e importação do cadastro Excel |
| `src/components/ImportCountDialog.tsx` | Seleção, parametrização, parsing e importação dos TXT |
| `src/components/ProductsTable.tsx` | Busca, ordenação, paginação e visualização do cadastro |
| `src/components/CountTable.tsx` | Agrupamento, filtros, inclusão manual, ajustes, exclusão e exportação TXT |
| `src/components/DiscrepanciesTable.tsx` | Cálculo, filtros, tabela e PDF das divergências |

### Hooks e bibliotecas internas

| Arquivo | Responsabilidade |
| --- | --- |
| `src/hooks/useStatsWorker.ts` | Web Worker, cache e estado dos indicadores |
| `src/hooks/use-debounce.ts` | `useDebounce` para valores e `useDebouncedCallback` para callbacks |
| `src/hooks/use-mobile.tsx` | Detecta viewport abaixo de 768 px |
| `src/hooks/use-toast.ts` | Store, reducer e API do sistema de toast shadcn |
| `src/lib/indexedDB.ts` | Modelos, abertura do banco e CRUD de produtos/contagens |
| `src/lib/cache.ts` | Cache em memória com TTL e invalidação |
| `src/lib/chunkProcessor.ts` | Processamento síncrono/assíncrono em chunks, batches, debounce e throttle |
| `src/lib/utils.ts` | União de classes (`cn`) e conversão de número brasileiro |

### Páginas e arquivos globais

| Arquivo | Responsabilidade |
| --- | --- |
| `src/main.tsx` | Inicializa `ReactDOM.createRoot` |
| `src/App.tsx` | QueryClient, tooltips, toasts, BrowserRouter e rotas |
| `src/pages/Index.tsx` | Orquestra dashboard, cards, dados e relatório PDF geral |
| `src/pages/NotFound.tsx` | Página 404 |
| `src/index.css` | Diretivas Tailwind, variáveis de tema claro/escuro e estilos globais |
| `src/App.css` | Estilos legados do template Vite; não é importado atualmente |
| `src/vite-env.d.ts` | Tipos de ambiente fornecidos pelo Vite |

### Componentes de interface (`src/components/ui`)

São primitivas geradas/adaptadas do shadcn/ui e Radix. Não contêm regras de inventário; devem permanecer genéricas.

| Grupo | Arquivos |
| --- | --- |
| Formulários | `button`, `input`, `textarea`, `checkbox`, `radio-group`, `select`, `switch`, `slider`, `input-otp`, `label`, `form` |
| Navegação | `tabs`, `navigation-menu`, `menubar`, `breadcrumb`, `pagination`, `sidebar` |
| Overlays | `dialog`, `alert-dialog`, `drawer`, `sheet`, `popover`, `tooltip`, `hover-card`, `dropdown-menu`, `context-menu`, `command` |
| Conteúdo | `card`, `table`, `badge`, `avatar`, `alert`, `skeleton`, `progress`, `separator`, `aspect-ratio`, `chart` |
| Estrutura/interação | `accordion`, `collapsible`, `carousel`, `resizable`, `scroll-area`, `toggle`, `toggle-group`, `calendar` |
| Notificações | `toast`, `toaster`, `sonner`, `use-toast` |

## Funções e componentes

### `src/lib/indexedDB.ts`

| Função | Efeito |
| --- | --- |
| `openDB` | Abre/cria `InventoryDB` e seus stores/índices |
| `addProducts` | Insere produtos em lotes e invalida o mapa de EANs |
| `getAllProducts` | Retorna todos os produtos |
| `getProductsCount` | Retorna o número bruto de registros de produto |
| `clearProducts` | Remove todos os produtos |
| `addCounts` | Insere contagens em lotes |
| `getAllCounts` | Retorna todas as contagens |
| `getCountsCount` | Retorna o número bruto de registros de contagem |
| `clearCounts` | Remove todas as contagens |
| `buildEanCache` | Monta o mapa interno EAN → produto |
| `getProductByEan` | Busca um produto no mapa de EANs |
| `getProductsByEans` | Busca vários EANs de uma vez |
| `deleteCountsByProduct` | Exclui as contagens de uma combinação produto + lote + localizador |
| `updateCountsByProduct` | Redistribui e salva o total ajustado de uma combinação produto + lote + localizador |
| `invalidateProductCache` | Descarta explicitamente o mapa EAN → produto |

### `src/components/ImportDialog.tsx`

| Função | Efeito |
| --- | --- |
| `handleFileChange` | Guarda o arquivo selecionado e inicia a importação |
| `handleImport` | Lê a primeira planilha, mapeia as 23 colunas e grava produtos |
| `handleClose` | Limpa estado/progresso e fecha o modal |
| `handleDownloadTemplate` | Gera e baixa o modelo XLSX |

### `src/components/ImportCountDialog.tsx`

| Função | Efeito |
| --- | --- |
| `handleFileChange` | Adiciona os TXT selecionados à lista |
| `updateFileData` | Atualiza coletor ou inventariador de um arquivo |
| `removeFile` | Remove um arquivo antes da importação |
| `parseCountFile` | Interpreta linhas e associa códigos aos produtos |
| `handleImport` | Valida, consolida e grava todas as contagens |

### `src/components/CountTable.tsx`

| Função | Efeito |
| --- | --- |
| `loadCounts` | Busca contagens e adiciona informação de controlado |
| `handleSort` / `getSortIcon` | Controla o ciclo e ícone da ordenação |
| `handleAdjustedQtyEdit` | Inicia a edição inline |
| `handleAdjustedQtySave` | Persiste o total ajustado e atualiza o dashboard |
| `handleAdjustedQtyCancel` | Cancela a edição |
| `handleAddCount` | Cria uma contagem manual por EAN |
| `handleDeleteProduct` | Exclui as contagens do produto após confirmação |
| `handleExportExcel` | Exporta a contagem filtrada para Excel |
| `handlePageChange` | Limita e troca a página atual |

### `src/components/ProductsTable.tsx` e `DiscrepanciesTable.tsx`

- `loadProducts` e `loadDiscrepancies` consultam e preparam os dados;
- `handleSort` alterna entre crescente, decrescente e padrão;
- `getSortIcon` representa visualmente a ordenação;
- `handlePageChange` controla a paginação;
- `exportToPDF`, em divergências, monta e baixa o relatório filtrado.

### `src/pages/Index.tsx`

| Função/bloco | Efeito |
| --- | --- |
| `loadData` | Carrega produtos/contagens do cache ou IndexedDB |
| `handleProductsUpdate` | Invalida caches e aciona atualização global |
| `exportDashboardToPDF` | Consolida produto/lote, não cadastrados, estatísticas operacionais e análise de erros por operador para gerar o PDF geral |
| `statCards` | Memoriza a grade dos nove indicadores |

### Utilitários

- `cn`: combina classes condicionais e resolve conflitos do Tailwind;
- `parseBRNumber`: converte texto numérico brasileiro;
- `useDebounce`: só publica um valor após o intervalo sem mudanças;
- `useDebouncedCallback`: cria um callback adiado;
- `processInChunks`: processa itens em blocos no main thread;
- `processInChunksAsync`: processa cada bloco com `Promise.all`;
- `createBatches`: divide um array em matrizes menores;
- `debounceProcess`: posterga chamadas repetidas;
- `throttleProcess`: limita chamadas dentro de um intervalo;
- `useIsMobile`: informa se a largura é menor que 768 px.

## Design system e responsividade

O tema é definido por variáveis HSL em `src/index.css` e exposto ao Tailwind em `tailwind.config.ts`.

Principais tokens adicionais:

- `mint`: importação do cadastro;
- `info-blue`: informações e indicadores neutros;
- `warning-orange`: alertas e ajustes;
- `success-green`: ações/valores positivos;
- `danger-pink`: limpeza e estados destrutivos;
- `stat-blue`: fundos dos cards informativos;
- raio padrão: `0.75rem`.

Há tokens para tema escuro, embora a interface atual não exponha um seletor de tema.

Comportamento responsivo:

- cabeçalho empilha logo e ações abaixo do breakpoint `lg`;
- cards usam 1 coluna no celular, 2 em `md` e 3 em `lg`;
- abas ficam em 1 coluna no celular e 3 em `md`;
- barras de ação mudam de coluna para linha em `md`;
- tabelas mantêm todas as colunas e usam rolagem horizontal em telas estreitas;
- modais possuem largura máxima e, na importação TXT, rolagem vertical.

## Manutenção e limitações conhecidas

- Não há autenticação, API ou sincronização entre dispositivos.
- IndexedDB é a fonte persistente; o cache em memória é apenas uma otimização.
- Importações são cumulativas. Use **Limpar dados** antes de um novo inventário quando não quiser somar dados antigos.
- A limpeza remove todos os dados locais do aplicativo no navegador e recarrega a página.
- Leituras sem produto cadastrado aparecem na Contagem e no indicador próprio; na aba Divergências ficam ocultas até o filtro **Mostrar não cadastrados** ser ativado, quando passam a ser o único conjunto exibido, com custo e valor financeiro iguais a zero.
- O fallback sem Web Worker calcula somente a quantidade de produtos cadastrados; os demais cards podem permanecer zerados.
- A aplicação possui dois sistemas de toast (`shadcn` e `Sonner`) por compatibilidade entre componentes.
- `App.css` é legado e não participa do bundle enquanto não for importado.
- O build atual pode alertar sobre bundle grande por causa das bibliotecas de Excel e PDF; isso não impede a geração.
- Antes de publicar mudanças, execute `npm run build` e `npm run lint`.

## Licença e propriedade

Projeto de uso interno da CD Drogarias Campeã. Defina neste repositório as regras de licença, distribuição e acesso aplicáveis à organização.
