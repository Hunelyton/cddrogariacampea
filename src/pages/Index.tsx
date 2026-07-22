import { useState, useEffect, useCallback, useMemo, lazy, Suspense } from "react";
import { DashboardHeader } from "@/components/DashboardHeader";
import { StatCard } from "@/components/StatCard";
import { FileText, Barcode, AlertTriangle, Wallet, TrendingUp, TrendingDown, PackageX, Edit3 } from "lucide-react";
import { getAllCounts, getAllProducts, Product, Count } from "@/lib/indexedDB";
import { parseBRNumber } from "@/lib/utils";
import { dataCache, CACHE_KEYS, CACHE_TTL } from "@/lib/cache";
import { useStatsWorker } from "@/hooks/useStatsWorker";
import pdfMake from "pdfmake/build/pdfmake";
// @ts-ignore
import pdfFonts from "pdfmake/build/vfs_fonts";
import { toast } from "sonner";

// Lazy load do componente de tabs para melhorar performance inicial
const DashboardTabs = lazy(() => import("@/components/DashboardTabs").then(m => ({ default: m.DashboardTabs })));

// Loading fallback
const TabsLoading = () => (
  <div className="flex items-center justify-center py-12">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
  </div>
);

const Index = () => {
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const { stats, calculateStats, invalidateCache, isCalculating } = useStatsWorker();

  useEffect(() => {
    const loadData = async () => {
      // Tenta usar cache primeiro
      const cachedProducts = dataCache.get<Product[]>(CACHE_KEYS.PRODUCTS);
      const cachedCounts = dataCache.get<Count[]>(CACHE_KEYS.COUNTS);
      
      let products: Product[];
      let counts: Count[];
      
      if (cachedProducts && cachedCounts) {
        products = cachedProducts;
        counts = cachedCounts;
      } else {
        products = await getAllProducts();
        counts = await getAllCounts();
        
        // Cache os dados
        dataCache.set(CACHE_KEYS.PRODUCTS, products, CACHE_TTL.MEDIUM);
        dataCache.set(CACHE_KEYS.COUNTS, counts, CACHE_TTL.MEDIUM);
      }
      
      calculateStats(products, counts);
    };
    
    loadData();
  }, [refreshTrigger, calculateStats]);

  const handleProductsUpdate = useCallback(() => {
    // Invalida todos os caches relacionados
    invalidateCache();
    dataCache.delete(CACHE_KEYS.PRODUCTS);
    dataCache.delete(CACHE_KEYS.COUNTS);
    dataCache.delete(CACHE_KEYS.DISCREPANCIES);
    
    setRefreshTrigger((prev) => prev + 1);
  }, [invalidateCache]);

  const exportDashboardToPDF = useCallback(async () => {
    try {
      // @ts-ignore
      pdfMake.vfs = pdfFonts.pdfMake ? pdfFonts.pdfMake.vfs : pdfFonts.vfs;

      // Load and convert logo to base64
      let logoBase64 = '';
      try {
        const response = await fetch('/logo-drogaria.png');
        const blob = await response.blob();
        logoBase64 = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(blob);
        });
      } catch (error) {
        console.warn('Failed to load logo:', error);
      }

      // Usa cache ou busca dados
      let products = dataCache.get<Product[]>(CACHE_KEYS.PRODUCTS);
      let counts = dataCache.get<Count[]>(CACHE_KEYS.COUNTS);
      
      if (!products || !counts) {
        products = await getAllProducts();
        counts = await getAllCounts();
      }

      // Agrupar contagens por produto
      const countsByProduct = counts.reduce((acc, count) => {
        const produto = count.produto || "N/A";
        if (!acc[produto]) {
          acc[produto] = {
            quantidadeEscaneada: 0,
            quantidadeAjustada: 0,
            secao: count.secao || "SEM SEÇÃO",
          };
        }
        acc[produto].quantidadeEscaneada += parseInt(count.quantidade) || 0;
        acc[produto].quantidadeAjustada += parseInt(count.quantidadeAjustada || count.quantidade) || 0;
        return acc;
      }, {} as Record<string, { quantidadeEscaneada: number; quantidadeAjustada: number; secao: string }>);

      // Calcular estatísticas por seção
      const statsBySection: Record<string, {
        divergenciaPositiva: number;
        divergenciaNegativa: number;
        diferencaTotal: number;
        itensEscaneados: number;
        skusUnicos: Set<string>;
      }> = {};

      // Processar divergências por seção
      for (const product of products) {
        let countData = countsByProduct[product.produto];
        
        if (!countData) {
          const eans = [
            product.ean1, product.ean2, product.ean3, product.ean4,
            product.ean5, product.ean6, product.ean7, product.ean8,
            product.ean9, product.ean10, product.ean11, product.ean12
          ].filter(Boolean);
          
          for (const ean of eans) {
            if (countsByProduct[ean]) {
              countData = countsByProduct[ean];
              break;
            }
          }
        }
        
        if (countData) {
          const secao = countData.secao || "SEM SEÇÃO";
          if (!statsBySection[secao]) {
            statsBySection[secao] = {
              divergenciaPositiva: 0,
              divergenciaNegativa: 0,
              diferencaTotal: 0,
              itensEscaneados: 0,
              skusUnicos: new Set()
            };
          }

          const qtdeLoja = parseBRNumber(product.saldo);
          const qtdeAjustada = countData.quantidadeAjustada;
          const qtdeDivergente = qtdeAjustada - qtdeLoja;
          
          if (qtdeDivergente !== 0) {
            const custo = parseBRNumber(product.custoGerencial);
            const valorDiferenca = custo * qtdeDivergente;
            
            if (valorDiferenca > 0) {
              statsBySection[secao].divergenciaPositiva += valorDiferenca;
            } else {
              statsBySection[secao].divergenciaNegativa += valorDiferenca;
            }
            statsBySection[secao].diferencaTotal += valorDiferenca;
          }
          
          statsBySection[secao].itensEscaneados += countData.quantidadeAjustada;
          statsBySection[secao].skusUnicos.add(product.produto);
        }
      }

      // Preparar dados das tabelas por seção
      const sectionTableData = Object.entries(statsBySection)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([secao, sectionStats]) => [
          { text: secao, fontSize: 9 },
          { text: `R$ ${sectionStats.divergenciaPositiva.toFixed(2)}`, fontSize: 9, color: 'green' },
          { text: `R$ ${Math.abs(sectionStats.divergenciaNegativa).toFixed(2)}`, fontSize: 9, color: 'red' },
          { text: `R$ ${sectionStats.diferencaTotal.toFixed(2)}`, fontSize: 9 },
          { text: sectionStats.itensEscaneados.toString(), fontSize: 9 },
          { text: sectionStats.skusUnicos.size.toString(), fontSize: 9 }
        ]);

      // Calcular divergências detalhadas para top 50
      interface ProductDiscrepancy {
        produto: string;
        descricao: string;
        secao: string;
        qtdeLoja: number;
        qtdeContada: number;
        diferencaQtde: number;
        custoUnitario: number;
        valorTotal: number;
      }

      const productDiscrepancies: ProductDiscrepancy[] = [];

      for (const product of products) {
        let countData = countsByProduct[product.produto];
        
        if (!countData) {
          const eans = [
            product.ean1, product.ean2, product.ean3, product.ean4,
            product.ean5, product.ean6, product.ean7, product.ean8,
            product.ean9, product.ean10, product.ean11, product.ean12
          ].filter(Boolean);
          
          for (const ean of eans) {
            if (countsByProduct[ean]) {
              countData = countsByProduct[ean];
              break;
            }
          }
        }

        const qtdeLoja = parseBRNumber(product.saldo);
        const qtdeContada = countData?.quantidadeAjustada || 0;
        const diferencaQtde = qtdeContada - qtdeLoja;
        
        if (diferencaQtde !== 0) {
          const custoUnitario = parseBRNumber(product.custoGerencial);
          const valorTotal = custoUnitario * diferencaQtde;
          
          productDiscrepancies.push({
            produto: product.produto || "N/A",
            descricao: product.descricao1 || "Sem descrição",
            secao: countData?.secao || "SEM SEÇÃO",
            qtdeLoja,
            qtdeContada,
            diferencaQtde,
            custoUnitario,
            valorTotal
          });
        }
      }

      // Top 50 maiores faltas
      const top50Faltas = productDiscrepancies
        .filter(p => p.valorTotal < 0)
        .sort((a, b) => a.valorTotal - b.valorTotal)
        .slice(0, 50)
        .map(p => [
          { text: p.produto, fontSize: 8 },
          { text: p.descricao.substring(0, 30), fontSize: 8 },
          { text: p.secao, fontSize: 8 },
          { text: p.qtdeLoja.toString(), fontSize: 8, alignment: 'center' },
          { text: p.qtdeContada.toString(), fontSize: 8, alignment: 'center' },
          { text: p.diferencaQtde.toString(), fontSize: 8, alignment: 'center', color: 'red' },
          { text: `R$ ${p.custoUnitario.toFixed(2)}`, fontSize: 8, alignment: 'right' },
          { text: `R$ ${Math.abs(p.valorTotal).toFixed(2)}`, fontSize: 8, alignment: 'right', color: 'red', bold: true }
        ]);

      // Top 50 maiores sobras
      const top50Sobras = productDiscrepancies
        .filter(p => p.valorTotal > 0)
        .sort((a, b) => b.valorTotal - a.valorTotal)
        .slice(0, 50)
        .map(p => [
          { text: p.produto, fontSize: 8 },
          { text: p.descricao.substring(0, 30), fontSize: 8 },
          { text: p.secao, fontSize: 8 },
          { text: p.qtdeLoja.toString(), fontSize: 8, alignment: 'center' },
          { text: p.qtdeContada.toString(), fontSize: 8, alignment: 'center' },
          { text: p.diferencaQtde.toString(), fontSize: 8, alignment: 'center', color: 'green' },
          { text: `R$ ${p.custoUnitario.toFixed(2)}`, fontSize: 8, alignment: 'right' },
          { text: `R$ ${p.valorTotal.toFixed(2)}`, fontSize: 8, alignment: 'right', color: 'green', bold: true }
        ]);

      const docDefinition: any = {
        pageSize: 'A4',
        pageOrientation: 'portrait',
        pageMargins: [40, logoBase64 ? 130 : 80, 40, 60],
        header: logoBase64 ? {
          stack: [
            {
              image: logoBase64,
              width: 100,
              alignment: 'center',
              margin: [0, 20, 0, 5]
            },
            {
              text: 'RELATÓRIO GERAL DO DASHBOARD',
              fontSize: 16,
              bold: true,
              alignment: 'center',
              margin: [0, 5, 0, 10]
            }
          ]
        } : {
          text: 'RELATÓRIO GERAL DO DASHBOARD',
          fontSize: 16,
          bold: true,
          alignment: 'center',
          margin: [0, 30, 0, 10]
        },
        content: [
          {
            text: 'RESUMO GERAL',
            style: 'sectionTitle',
            margin: [0, 0, 0, 15]
          },
          {
            columns: [
              {
                width: '50%',
                stack: [
                  { text: 'Produtos Cadastrados', style: 'cardLabel' },
                  { text: stats.productsCount.toString(), style: 'cardValue', color: '#0066CC' },
                  { text: 'Importação Planilha', style: 'cardSubtitle' },
                  { text: '\n' }
                ]
              },
              {
                width: '50%',
                stack: [
                  { text: 'Itens Contados', style: 'cardLabel' },
                  { text: `${stats.uniqueSkus} SKUs | ${stats.totalItems} un`, style: 'cardValue', color: '#0066CC' },
                  { text: 'SKUs diferentes + quantidade total', style: 'cardSubtitle' },
                  { text: '\n' }
                ]
              }
            ]
          },
          {
            columns: [
              {
                width: '50%',
                stack: [
                  { text: 'Divergências Ativas', style: 'cardLabel' },
                  { text: stats.activeDiscrepancies.toString(), style: 'cardValue', color: '#FF9500' },
                  { text: 'Considera filtros aplicados', style: 'cardSubtitle' },
                  { text: '\n' }
                ]
              },
              {
                width: '50%',
                stack: [
                  { text: 'Divergência Positiva', style: 'cardLabel' },
                  { text: `R$ ${stats.positiveDiscrepancy.toFixed(2)}`, style: 'cardValue', color: 'green' },
                  { text: 'Sobra de estoque', style: 'cardSubtitle' },
                  { text: '\n' }
                ]
              }
            ]
          },
          {
            columns: [
              {
                width: '50%',
                stack: [
                  { text: 'Divergência Negativa', style: 'cardLabel' },
                  { text: `R$ ${Math.abs(stats.negativeDiscrepancy).toFixed(2)}`, style: 'cardValue', color: 'red' },
                  { text: 'Falta de estoque', style: 'cardSubtitle' },
                  { text: '\n' }
                ]
              },
              {
                width: '50%',
                stack: [
                  { text: 'Diferença Financeira', style: 'cardLabel' },
                  { text: `R$ ${stats.financialDifference.toFixed(2)}`, style: 'cardValue', color: '#0066CC' },
                  { text: 'Total geral de divergência', style: 'cardSubtitle' },
                  { text: '\n' }
                ]
              }
            ]
          },
          {
            text: '\nERROS E AJUSTES',
            style: 'sectionTitle',
            margin: [0, 10, 0, 15]
          },
          {
            columns: [
              {
                width: '50%',
                stack: [
                  { text: 'Quantidade de SKU Ajustado', style: 'cardLabel' },
                  { text: `${stats.adjustedSkusCount} SKUs`, style: 'cardValue', color: '#FF9500' },
                  { 
                    text: `${stats.adjustedItemsCount} itens ajustados no total`, 
                    style: 'cardSubtitle' 
                  },
                  { text: '\n' }
                ]
              },
              {
                width: '50%',
                stack: [
                  { text: 'Não Cadastrados / Manuais', style: 'cardLabel' },
                  { text: `${stats.notRegisteredCount} não cadastrados | ${stats.manualCount} manuais`, style: 'cardValue', color: 'red' },
                  { text: 'Produtos não cadastrados e inserções manuais', style: 'cardSubtitle' },
                  { text: '\n' }
                ]
              }
            ]
          },
          {
            columns: [
              {
                width: '50%',
                stack: [
                  { text: 'Margem Total de Ajustes', style: 'cardLabel' },
                  { text: `${stats.totalAdjusted} un | ${stats.adjustedItemsCount} itens ajustados`, style: 'cardValue', color: '#0066CC' },
                  { text: 'Total de unidades ajustadas na contagem', style: 'cardSubtitle' }
                ]
              }
            ]
          },
          {
            text: '\nANÁLISE POR SEÇÃO',
            style: 'sectionTitle',
            margin: [0, 20, 0, 15],
            pageBreak: 'before'
          },
          {
            style: 'tableStyle',
            table: {
              headerRows: 1,
              widths: ['*', 'auto', 'auto', 'auto', 'auto', 'auto'],
              body: [
                [
                  { text: 'SEÇÃO', style: 'tableHeader' },
                  { text: 'DIVERGÊNCIA POSITIVA', style: 'tableHeader' },
                  { text: 'DIVERGÊNCIA NEGATIVA', style: 'tableHeader' },
                  { text: 'DIFERENÇA TOTAL', style: 'tableHeader' },
                  { text: 'ITENS ESCANEADOS', style: 'tableHeader' },
                  { text: 'SKUs ÚNICOS', style: 'tableHeader' }
                ],
                ...sectionTableData
              ]
            },
            layout: {
              fillColor: function (rowIndex: number) {
                return rowIndex === 0 ? '#CCCCCC' : (rowIndex % 2 === 0 ? '#F5F5F5' : null);
              }
            }
          },
          {
            text: '\nTOP 50 MAIORES FALTAS',
            style: 'sectionTitle',
            margin: [0, 20, 0, 15],
            pageBreak: 'before'
          },
          {
            style: 'tableStyle',
            table: {
              headerRows: 1,
              widths: [50, '*', 60, 40, 40, 40, 50, 60],
              body: [
                [
                  { text: 'PRODUTO', style: 'tableHeader' },
                  { text: 'DESCRIÇÃO', style: 'tableHeader' },
                  { text: 'SEÇÃO', style: 'tableHeader' },
                  { text: 'QTD LOJA', style: 'tableHeader' },
                  { text: 'QTD CONT.', style: 'tableHeader' },
                  { text: 'DIF.', style: 'tableHeader' },
                  { text: 'R$ UNIT.', style: 'tableHeader' },
                  { text: 'R$ TOTAL', style: 'tableHeader' }
                ],
                ...top50Faltas
              ]
            },
            layout: {
              fillColor: function (rowIndex: number) {
                return rowIndex === 0 ? '#CCCCCC' : (rowIndex % 2 === 0 ? '#F5F5F5' : null);
              }
            }
          },
          {
            text: '\nTOP 50 MAIORES SOBRAS',
            style: 'sectionTitle',
            margin: [0, 20, 0, 15],
            pageBreak: 'before'
          },
          {
            style: 'tableStyle',
            table: {
              headerRows: 1,
              widths: [50, '*', 60, 40, 40, 40, 50, 60],
              body: [
                [
                  { text: 'PRODUTO', style: 'tableHeader' },
                  { text: 'DESCRIÇÃO', style: 'tableHeader' },
                  { text: 'SEÇÃO', style: 'tableHeader' },
                  { text: 'QTD LOJA', style: 'tableHeader' },
                  { text: 'QTD CONT.', style: 'tableHeader' },
                  { text: 'DIF.', style: 'tableHeader' },
                  { text: 'R$ UNIT.', style: 'tableHeader' },
                  { text: 'R$ TOTAL', style: 'tableHeader' }
                ],
                ...top50Sobras
              ]
            },
            layout: {
              fillColor: function (rowIndex: number) {
                return rowIndex === 0 ? '#CCCCCC' : (rowIndex % 2 === 0 ? '#F5F5F5' : null);
              }
            }
          }
        ],
        footer: function(currentPage: number, pageCount: number) {
          return [
            {
              text: [
                { text: 'Razão Social: ', bold: true },
                'CD DROGARIAS CAMPEÃ  ',
                { text: 'CNPJ: ', bold: true },
                '46.756.296/0001-76  ',
                { text: 'Endereço: ', bold: true },
                'Rua Santa Mônica, 480 - Parque Industrial San José - Cotia/SP - CEP: 06715-865'
              ],
              fontSize: 8,
              alignment: 'center',
              margin: [40, 10, 40, 0]
            },
            {
              text: `Página ${currentPage} de ${pageCount}`,
              alignment: 'center',
              fontSize: 8,
              margin: [0, 5, 0, 0]
            }
          ];
        },
        styles: {
          sectionTitle: {
            fontSize: 14,
            bold: true,
            color: '#333333'
          },
          cardLabel: {
            fontSize: 10,
            bold: true,
            margin: [0, 0, 0, 5]
          },
          cardValue: {
            fontSize: 18,
            bold: true,
            margin: [0, 0, 0, 5]
          },
          cardSubtitle: {
            fontSize: 8,
            color: '#666666'
          },
          tableStyle: {
            margin: [0, 5, 0, 15]
          },
          tableHeader: {
            bold: true,
            fontSize: 9,
            color: 'black',
            alignment: 'center'
          }
        }
      };

      pdfMake.createPdf(docDefinition).download('relatorio-geral-dashboard.pdf');
      toast.success("Relatório exportado com sucesso!");
    } catch (error) {
      console.error("Erro ao exportar PDF:", error);
      toast.error("Erro ao exportar relatório");
    }
  }, [stats]);

  // Memoizar os StatCards para evitar re-renders desnecessários
  const statCards = useMemo(() => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
      <StatCard
        icon={<FileText className="w-6 h-6 text-info-blue-foreground" />}
        label="PRODUTOS CADASTRADOS"
        value={stats.productsCount}
        subtitle="Importação Planilha"
        variant="blue"
      />
      
      <StatCard
        icon={<Barcode className="w-6 h-6 text-info-blue-foreground" />}
        label="ITENS CONTADOS"
        value={stats.uniqueSkus}
        secondaryValue={stats.totalItems}
        secondaryLabel="un"
        subtitle="SKUs diferentes + quantidade total"
        variant="blue"
      />
      
      <StatCard
        icon={<AlertTriangle className="w-6 h-6 text-warning-orange-foreground" />}
        label="DIVERGÊNCIAS ATIVAS"
        value={stats.activeDiscrepancies}
        subtitle="Considera filtros aplicados"
        variant="warning"
      />
      
      <StatCard
        icon={<TrendingUp className="w-6 h-6 text-success-green-foreground" />}
        label="DIVERGÊNCIA POSITIVA"
        value={`R$ ${stats.positiveDiscrepancy.toFixed(2)}`}
        subtitle="Sobra de estoque"
        variant="success"
      />
      
      <StatCard
        icon={<TrendingDown className="w-6 h-6 text-destructive-foreground" />}
        label="DIVERGÊNCIA NEGATIVA"
        value={`R$ ${Math.abs(stats.negativeDiscrepancy).toFixed(2)}`}
        subtitle="Falta de estoque"
        variant="destructive"
      />
      
      <StatCard
        icon={<Wallet className="w-6 h-6 text-info-blue-foreground" />}
        label="DIFERENÇA FINANCEIRA"
        value={`R$ ${stats.financialDifference.toFixed(2)}`}
        subtitle="Total geral de divergência"
        variant="blue"
      />

      <StatCard
        icon={<Edit3 className="w-6 h-6 text-warning-orange-foreground" />}
        label="QUANTIDADE DE SKU AJUSTADO"
        value={`${stats.adjustedSkusCount} SKUs`}
        subtitle={`${stats.adjustedItemsCount} itens ajustados no total`}
        variant="warning"
      />

      <StatCard
        icon={<PackageX className="w-6 h-6 text-destructive-foreground" />}
        label="NÃO CADASTRADOS / MANUAIS"
        value={stats.notRegisteredCount}
        secondaryValue={stats.manualCount}
        secondaryLabel="manuais"
        subtitle="Produtos não cadastrados e inserções manuais"
        variant="destructive"
      />

      <StatCard
        icon={<Edit3 className="w-6 h-6 text-info-blue-foreground" />}
        label="MARGEM TOTAL DE AJUSTES"
        value={stats.totalAdjusted}
        secondaryValue={stats.adjustedItemsCount}
        secondaryLabel="itens ajustados"
        subtitle="Total de unidades ajustadas na contagem"
        variant="blue"
      />
    </div>
  ), [stats]);

  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      <div className="w-full">
        <DashboardHeader onProductsUpdate={handleProductsUpdate} onExportDashboard={exportDashboardToPDF} />
        
        {isCalculating && (
          <div className="flex items-center gap-2 mb-4 text-sm text-muted-foreground">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
            Calculando estatísticas...
          </div>
        )}
        
        {statCards}

        <Suspense fallback={<TabsLoading />}>
          <DashboardTabs refreshTrigger={refreshTrigger} onUpdate={handleProductsUpdate} />
        </Suspense>
      </div>
    </div>
  );
};

export default Index;
