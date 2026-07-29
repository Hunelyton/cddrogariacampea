import { useState, useEffect, useCallback, useMemo, lazy, Suspense } from "react";
import { DashboardHeader } from "@/components/DashboardHeader";
import { StatCard } from "@/components/StatCard";
import { FileText, Barcode, AlertTriangle, Wallet, TrendingUp, TrendingDown, PackageX, Edit3, Users } from "lucide-react";
import { getAllCounts, getAllProducts, Product, Count } from "@/lib/indexedDB";
import { parseBRNumber } from "@/lib/utils";
import { dataCache, CACHE_KEYS, CACHE_TTL } from "@/lib/cache";
import { useStatsWorker } from "@/hooks/useStatsWorker";
import pdfMake from "pdfmake/build/pdfmake";
// @ts-expect-error O pacote de fontes do pdfMake não publica uma tipagem compatível.
import pdfFonts from "pdfmake/build/vfs_fonts";
import type { TDocumentDefinitions } from "pdfmake/interfaces";
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
      // @ts-expect-error A tipagem do build não expõe a propriedade vfs usada no navegador.
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

      const normalizeLot = (lot?: string) => lot?.trim().toUpperCase() || "";
      const normalizeLocator = (locator?: string) => locator?.trim().toUpperCase() || "";
      const countLotKey = (produto: string, lote?: string) => `${produto}\u0000${normalizeLot(lote)}`;
      const countGroupKey = (produto: string, lote?: string, locator?: string) =>
        `${countLotKey(produto, lote)}\u0000${normalizeLocator(locator)}`;
      const isNotRegistered = (count: Count) => count.descricao === "Produto não cadastrado";

      interface CountLotGroup {
        produto: string;
        quantidadeEscaneada: number;
        quantidadeAjustada: number;
        codLocalizador: string;
        codigoLv: string;
        lote: string;
        validade: string;
        coletor: string;
        inventariador: string;
        descricao: string;
        ean: string;
        naoCadastrado: boolean;
      }

      interface ReportDiscrepancy extends CountLotGroup {
        descricaoLocalizador: string;
        qtdeLoja: number;
        diferencaQtde: number;
        custoUnitario: number;
        valorTotal: number;
      }

      const countsByLot = counts.reduce((acc, count) => {
        const produto = count.produto || "N/A";
        const lote = count.lote?.trim() || "";
        const key = countLotKey(produto, lote);
        if (!acc[key]) {
          acc[key] = {
            produto,
            quantidadeEscaneada: 0,
            quantidadeAjustada: 0,
            codLocalizador: count.codLocalizador || "",
            codigoLv: count.codigoLv || "",
            lote,
            validade: count.validade || "",
            coletor: count.coletor || "",
            inventariador: count.inventariador || "",
            descricao: count.descricao || "",
            ean: count.ean || "",
            naoCadastrado: isNotRegistered(count),
          };
        }
        acc[key].quantidadeEscaneada += parseInt(count.quantidade) || 0;
        acc[key].quantidadeAjustada += parseInt(count.quantidadeAjustada || count.quantidade) || 0;
        return acc;
      }, {} as Record<string, CountLotGroup>);

      const reportDiscrepancies: ReportDiscrepancy[] = [];
      const handledCountKeys = new Set<string>();
      const handledProductsWithoutLot = new Set<string>();
      let missingExpectedLots = 0;
      let unexpectedCountedLots = 0;

      const addDiscrepancy = (
        product: Product,
        countData: CountLotGroup | undefined,
        qtdeLoja: number,
        qtdeContada: number,
        lote: string,
      ) => {
        const diferencaQtde = qtdeContada - qtdeLoja;
        if (diferencaQtde === 0) return;
        const custoUnitario = parseBRNumber(product.custoGerencial);
        reportDiscrepancies.push({
          produto: product.produto || "N/A",
          quantidadeEscaneada: countData?.quantidadeEscaneada || 0,
          quantidadeAjustada: qtdeContada,
          codLocalizador: countData?.codLocalizador || product.codLocalizador || "",
          descricaoLocalizador: product.descricaoLocalizador || "",
          codigoLv: countData?.codigoLv || product.codigoLv || "",
          lote,
          validade: countData?.validade || product.validade || "",
          coletor: countData?.coletor || "",
          inventariador: countData?.inventariador || "",
          descricao: product.descricao1 || countData?.descricao || "Sem descrição",
          ean: product.ean1 || countData?.ean || "",
          naoCadastrado: false,
          qtdeLoja,
          diferencaQtde,
          custoUnitario,
          valorTotal: custoUnitario * diferencaQtde,
        });
      };

      for (const product of products) {
        const productLot = product.lote?.trim() || "";
        const qtdeLoja = parseBRNumber(product.saldo);
        if (productLot) {
          const key = countLotKey(product.produto, productLot);
          const countData = countsByLot[key];
          if (countData) handledCountKeys.add(key);
          else missingExpectedLots += 1;
          addDiscrepancy(product, countData, qtdeLoja, countData?.quantidadeAjustada || 0, productLot);
        } else {
          if (handledProductsWithoutLot.has(product.produto)) continue;
          handledProductsWithoutLot.add(product.produto);
          const productCounts = Object.entries(countsByLot).filter(([, group]) => group.produto === product.produto);
          productCounts.forEach(([key]) => handledCountKeys.add(key));
          const total = productCounts.reduce((sum, [, group]) => sum + group.quantidadeAjustada, 0);
          const firstCount = productCounts[0]?.[1];
          const lots = [...new Set(productCounts.map(([, group]) => group.lote).filter(Boolean))].join(" / ");
          addDiscrepancy(product, firstCount, qtdeLoja, total, lots);
        }
      }

      for (const [key, countData] of Object.entries(countsByLot)) {
        if (handledCountKeys.has(key)) continue;
        const product = products.find((item) => item.produto === countData.produto);
        if (product) {
          unexpectedCountedLots += 1;
          addDiscrepancy(product, countData, 0, countData.quantidadeAjustada, countData.lote);
        } else {
          reportDiscrepancies.push({
            ...countData,
            descricao: "Produto não cadastrado",
            descricaoLocalizador: "",
            naoCadastrado: true,
            qtdeLoja: 0,
            diferencaQtde: countData.quantidadeAjustada,
            custoUnitario: 0,
            valorTotal: 0,
          });
        }
      }

      const registeredDiscrepancies = reportDiscrepancies.filter((item) => !item.naoCadastrado);
      const notRegisteredRows = reportDiscrepancies.filter((item) => item.naoCadastrado);
      const registeredProductCodes = new Set(products.map((product) => product.produto));

      interface OperatorStats {
        leituras: number;
        skus: Set<string>;
        grupos: Set<string>;
        localizadores: Set<string>;
        lotes: Set<string>;
        quantidadeEscaneada: number;
        quantidadeAjustada: number;
        gruposAjustados: Set<string>;
        skusAjustados: Set<string>;
        ajusteAbsoluto: number;
        naoCadastrados: Set<string>;
        divergencias: number;
        valorLiquido: number;
      }

      const operatorStats: Record<string, OperatorStats> = {};
      const getOperator = (name?: string) => name?.trim() || "NÃO INFORMADO";
      const ensureOperator = (name: string) => operatorStats[name] ||= {
        leituras: 0,
        skus: new Set(),
        grupos: new Set(),
        localizadores: new Set(),
        lotes: new Set(),
        quantidadeEscaneada: 0,
        quantidadeAjustada: 0,
        gruposAjustados: new Set(),
        skusAjustados: new Set(),
        ajusteAbsoluto: 0,
        naoCadastrados: new Set(),
        divergencias: 0,
        valorLiquido: 0,
      };

      const adjustmentGroups: Record<string, {
        produto: string;
        escaneada: number;
        ajustada: number;
        operadores: Set<string>;
      }> = {};

      counts.forEach((count) => {
        const operatorName = getOperator(count.inventariador);
        const operator = ensureOperator(operatorName);
        const produto = count.produto || "N/A";
        const groupKey = countGroupKey(produto, count.lote, count.codLocalizador);
        const scanned = parseInt(count.quantidade) || 0;
        const adjusted = parseInt(count.quantidadeAjustada || count.quantidade) || 0;
        operator.leituras += 1;
        operator.skus.add(produto);
        operator.grupos.add(groupKey);
        if (normalizeLocator(count.codLocalizador)) operator.localizadores.add(normalizeLocator(count.codLocalizador));
        if (normalizeLot(count.lote)) operator.lotes.add(normalizeLot(count.lote));
        operator.quantidadeEscaneada += scanned;
        operator.quantidadeAjustada += adjusted;
        adjustmentGroups[groupKey] ||= {
          produto,
          escaneada: 0,
          ajustada: 0,
          operadores: new Set(),
        };
        adjustmentGroups[groupKey].escaneada += scanned;
        adjustmentGroups[groupKey].ajustada += adjusted;
        adjustmentGroups[groupKey].operadores.add(operatorName);
        if (isNotRegistered(count) || !registeredProductCodes.has(count.produto || "")) {
          operator.naoCadastrados.add(groupKey);
        }
      });

      Object.entries(adjustmentGroups).forEach(([groupKey, group]) => {
        const difference = Math.abs(group.ajustada - group.escaneada);
        if (difference === 0) return;
        group.operadores.forEach((operatorName) => {
          const operator = ensureOperator(operatorName);
          operator.gruposAjustados.add(groupKey);
          operator.skusAjustados.add(group.produto);
          operator.ajusteAbsoluto += difference;
        });
      });

      registeredDiscrepancies.forEach((discrepancy) => {
        if (!discrepancy.inventariador) return;
        const operator = ensureOperator(getOperator(discrepancy.inventariador));
        operator.divergencias += 1;
        operator.valorLiquido += discrepancy.valorTotal;
      });

      const totalOperatorAdjustments = Object.values(operatorStats)
        .reduce((sum, data) => sum + data.ajusteAbsoluto, 0);
      const totalOperatorAdjustedSkus = Object.values(operatorStats)
        .reduce((sum, data) => sum + data.skusAjustados.size, 0);

      const operatorTableData = Object.entries(operatorStats)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([operator, data]) => {
          const adjustmentRate = data.quantidadeEscaneada > 0
            ? `${((data.ajusteAbsoluto / data.quantidadeEscaneada) * 100).toFixed(2).replace(".", ",")}%`
            : (data.ajusteAbsoluto > 0 ? "N/A" : "0,00%");
          const adjustmentShare = totalOperatorAdjustments > 0
            ? `${((data.ajusteAbsoluto / totalOperatorAdjustments) * 100).toFixed(2).replace(".", ",")}%`
            : "0,00%";

          return [
            operator,
            data.leituras.toString(),
            data.skus.size.toString(),
            data.localizadores.size.toString(),
            data.lotes.size.toString(),
            data.quantidadeEscaneada.toString(),
            data.quantidadeAjustada.toString(),
            data.skusAjustados.size.toString(),
            data.gruposAjustados.size.toString(),
            `${data.ajusteAbsoluto} un`,
            adjustmentRate,
            adjustmentShare,
            data.naoCadastrados.size.toString(),
            data.divergencias.toString(),
            `R$ ${data.valorLiquido.toFixed(2)}`,
          ].map((text) => ({ text, fontSize: 6.5, alignment: 'center' as const }));
        });

      const discrepancyRows = (items: ReportDiscrepancy[], color: string) => items.map((item) => [
        item.codLocalizador || "-", item.codigoLv || "-", item.produto, item.ean || "-",
        item.descricao.substring(0, 32), item.lote || "-", item.validade || "-",
        item.qtdeLoja.toString(), item.quantidadeAjustada.toString(), item.diferencaQtde.toString(),
        `R$ ${item.valorTotal.toFixed(2)}`,
      ].map((text, index) => ({ text, fontSize: 6.5, alignment: index >= 7 ? 'center' as const : 'left' as const, color: index >= 9 ? color : undefined })));

      const top50Faltas = discrepancyRows(
        registeredDiscrepancies.filter((item) => item.valorTotal < 0).sort((a, b) => a.valorTotal - b.valorTotal).slice(0, 50),
        'red',
      );
      const top50Sobras = discrepancyRows(
        registeredDiscrepancies.filter((item) => item.valorTotal > 0).sort((a, b) => b.valorTotal - a.valorTotal).slice(0, 50),
        'green',
      );
      const notRegisteredTableData = notRegisteredRows.map((item) => [
        item.codLocalizador || "-", item.codigoLv || "-", item.produto, item.ean || "-",
        item.descricao, item.lote || "-", item.validade || "-", item.quantidadeAjustada.toString(),
        item.coletor || "-", item.inventariador || "-",
      ].map((text) => ({ text, fontSize: 7 })));

      const operationalStats = {
        readings: counts.length,
        groups: new Set(counts.map((count) =>
          countGroupKey(count.produto || "N/A", count.lote, count.codLocalizador)
        )).size,
        scanned: counts.reduce((sum, count) => sum + (parseInt(count.quantidade) || 0), 0),
        adjusted: counts.reduce((sum, count) => sum + (parseInt(count.quantidadeAjustada || count.quantidade) || 0), 0),
        operators: Object.keys(operatorStats).length,
        notRegistered: notRegisteredRows.length,
        missingExpectedLots,
        unexpectedCountedLots,
      };

      const docDefinition: TDocumentDefinitions = {
        pageSize: 'A3',
        pageOrientation: 'landscape',
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
                  { text: `${stats.productsCount} SKU + ${stats.productLotCount} produtos com lotes diferentes + ${stats.registeredLocatorCount} localizadores`, style: 'cardValue', color: '#0066CC' },
                  { text: 'Códigos, combinações de produto/lote e localizadores únicos', style: 'cardSubtitle' },
                  { text: '\n' }
                ]
              },
              {
                width: '50%',
                stack: [
                  { text: 'Itens Contados', style: 'cardLabel' },
                  { text: `${stats.uniqueSkus} SKU + ${stats.totalItems} un contadas + ${stats.countedLocatorCount} localizadores + ${stats.countedLotCount} lotes`, style: 'cardValue', color: '#0066CC' },
                  { text: 'Totais únicos presentes na contagem', style: 'cardSubtitle' },
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
                  { text: 'Erro por Operador', style: 'cardLabel' },
                  { text: `${stats.operatorErrorSkusCount ?? 0} SKUs + ${stats.operatorErrorUnits ?? 0} itens`, style: 'cardValue', color: '#FF9500' },
                  { 
                    text: 'Total de todos os operadores; o detalhamento está na análise por operador',
                    style: 'cardSubtitle' 
                  },
                  { text: '\n' }
                ]
              },
              {
                width: '50%',
                stack: [
                  { text: 'Não Cadastrados / Manuais', style: 'cardLabel' },
                  { text: `${stats.notRegisteredCount} não cadastrados + ${stats.manualCount} inseridos manualmente`, style: 'cardValue', color: 'red' },
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
                  { text: `${stats.adjustedItemsCount} itens ajustados na contagem + ${stats.totalAdjusted} unidades ajustadas na contagem`, style: 'cardValue', color: '#0066CC' },
                  { text: 'Unidades representam a diferença absoluta entre escaneado e ajustado', style: 'cardSubtitle' }
                ]
              }
            ]
          },
          {
            text: '\nRESUMO OPERACIONAL',
            style: 'sectionTitle',
            margin: [0, 20, 0, 15],
            pageBreak: 'before'
          },
          {
            style: 'tableStyle',
            table: {
              headerRows: 1,
              widths: ['*', '*', '*', '*', '*', '*', '*', '*'],
              body: [
                ['LEITURAS', 'PRODUTO/LOTE/LOCALIZADOR', 'QTD ESCANEADA', 'QTD AJUSTADA', 'OPERADORES', 'NÃO CADASTRADOS', 'LOTES NÃO CONTADOS', 'LOTES INESPERADOS']
                  .map((text) => ({ text, style: 'tableHeader' })),
                [
                  operationalStats.readings,
                  operationalStats.groups,
                  operationalStats.scanned,
                  operationalStats.adjusted,
                  operationalStats.operators,
                  operationalStats.notRegistered,
                  operationalStats.missingExpectedLots,
                  operationalStats.unexpectedCountedLots,
                ].map((value) => ({ text: value.toString(), fontSize: 9, alignment: 'center' }))
              ]
            },
            layout: 'lightHorizontalLines'
          },
          {
            text: '\nANÁLISE DE ERROS POR OPERADOR',
            style: 'sectionTitle',
            margin: [0, 20, 0, 8]
          },
          {
            text: `${Object.keys(operatorStats).length} operadores | ${totalOperatorAdjustedSkus} SKUs com erro | ${totalOperatorAdjustments} unidades ajustadas`,
            fontSize: 10,
            bold: true,
            color: '#FF9500',
            margin: [0, 0, 0, 6]
          },
          {
            text: '“% SOBRE CONTAGEM” compara as unidades ajustadas com a quantidade escaneada pelo operador. “% DOS AJUSTES” mostra a participação do operador no total de unidades ajustadas. Divergências sem contagem não são atribuídas artificialmente.',
            fontSize: 8,
            color: '#666666',
            margin: [0, 0, 0, 10]
          },
          {
            style: 'tableStyle',
            table: {
              headerRows: 1,
              widths: ['*', 38, 38, 42, 38, 50, 50, 48, 48, 55, 55, 55, 45, 45, 65],
              body: [
                ['OPERADOR', 'LEITURAS', 'SKUs', 'LOCAIS', 'LOTES', 'QTD ESC.', 'QTD AJ.', 'SKUs AJ.', 'GRUPOS AJ.', 'UNID. AJ.', '% SOBRE CONTAGEM', '% DOS AJUSTES', 'NÃO CAD.', 'DIVERG.', 'VALOR LÍQUIDO']
                  .map((text) => ({ text, style: 'tableHeader' })),
                ...operatorTableData
              ]
            },
            layout: {
              fillColor: (rowIndex: number) => rowIndex === 0 ? '#CCCCCC' : (rowIndex % 2 === 0 ? '#F5F5F5' : null)
            }
          },
          {
            text: '\nPRODUTOS NÃO CADASTRADOS',
            style: 'sectionTitle',
            margin: [0, 20, 0, 10],
            pageBreak: 'before'
          },
          notRegisteredTableData.length > 0 ? {
            style: 'tableStyle',
            table: {
              headerRows: 1,
              widths: [65, 55, 55, 80, '*', 65, 55, 45, 55, 75],
              body: [
                ['LOCALIZADOR', 'CÓD. LV', 'PRODUTO', 'EAN', 'DESCRIÇÃO', 'LOTE', 'VALIDADE', 'QTD', 'COLETOR', 'OPERADOR']
                  .map((text) => ({ text, style: 'tableHeader' })),
                ...notRegisteredTableData
              ]
            },
            layout: {
              fillColor: (rowIndex: number) => rowIndex === 0 ? '#CCCCCC' : (rowIndex % 2 === 0 ? '#FFF4F4' : null)
            }
          } : { text: 'Nenhum produto não cadastrado encontrado.', fontSize: 9, color: '#666666' },
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
              widths: [65, 55, 50, 75, '*', 60, 55, 45, 45, 40, 70],
              body: [
                ['LOCALIZADOR', 'CÓD. LV', 'PRODUTO', 'EAN', 'DESCRIÇÃO', 'LOTE', 'VALIDADE', 'QTD LOJA', 'QTD CONT.', 'DIF.', 'R$ TOTAL']
                  .map((text) => ({ text, style: 'tableHeader' })),
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
              widths: [65, 55, 50, 75, '*', 60, 55, 45, 45, 40, 70],
              body: [
                ['LOCALIZADOR', 'CÓD. LV', 'PRODUTO', 'EAN', 'DESCRIÇÃO', 'LOTE', 'VALIDADE', 'QTD LOJA', 'QTD CONT.', 'DIF.', 'R$ TOTAL']
                  .map((text) => ({ text, style: 'tableHeader' })),
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
        value={`${stats.productsCount} SKU`}
        subtitle={`+ ${stats.productLotCount} produtos com lotes diferentes + ${stats.registeredLocatorCount} localizadores`}
        variant="blue"
      />
      
      <StatCard
        icon={<Barcode className="w-6 h-6 text-info-blue-foreground" />}
        label="ITENS CONTADOS"
        value={`${stats.uniqueSkus} SKU`}
        subtitle={`+ ${stats.totalItems} un contadas + ${stats.countedLocatorCount} localizadores + ${stats.countedLotCount} lotes`}
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
        icon={<Users className="w-6 h-6 text-warning-orange-foreground" />}
        label="ERRO POR OPERADOR"
        value={`${stats.operatorErrorSkusCount ?? 0} SKUs + ${stats.operatorErrorUnits ?? 0} itens`}
        subtitle="Total de todos os operadores"
        variant="warning"
      />

      <StatCard
        icon={<PackageX className="w-6 h-6 text-destructive-foreground" />}
        label="NÃO CADASTRADOS / MANUAIS"
        value={`${stats.notRegisteredCount} não cadastrados`}
        subtitle={`+ ${stats.manualCount} inseridos manualmente`}
        variant="destructive"
      />

      <StatCard
        icon={<Edit3 className="w-6 h-6 text-info-blue-foreground" />}
        label="MARGEM TOTAL DE AJUSTES"
        value={`${stats.adjustedItemsCount} itens ajustados`}
        subtitle={`+ ${stats.totalAdjusted} unidades ajustadas na contagem`}
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
