import { useState, useEffect, useCallback, useRef } from 'react';
import { Product, Count } from '@/lib/indexedDB';
import { dataCache, CACHE_KEYS, CACHE_TTL } from '@/lib/cache';

interface DashboardStats {
  productsCount: number;
  productLotCount: number;
  registeredLocatorCount: number;
  uniqueSkus: number;
  totalItems: number;
  countedLocatorCount: number;
  countedLotCount: number;
  activeDiscrepancies: number;
  positiveDiscrepancy: number;
  negativeDiscrepancy: number;
  financialDifference: number;
  errorsByInventor: Record<string, number>;
  operatorErrorSkusCount: number;
  operatorErrorUnits: number;
  notRegisteredCount: number;
  manualCount: number;
  totalAdjusted: number;
  adjustedItemsCount: number;
  adjustedSkusCount: number;
}

const initialStats: DashboardStats = {
  productsCount: 0,
  productLotCount: 0,
  registeredLocatorCount: 0,
  uniqueSkus: 0,
  totalItems: 0,
  countedLocatorCount: 0,
  countedLotCount: 0,
  activeDiscrepancies: 0,
  positiveDiscrepancy: 0,
  negativeDiscrepancy: 0,
  financialDifference: 0,
  errorsByInventor: {},
  operatorErrorSkusCount: 0,
  operatorErrorUnits: 0,
  notRegisteredCount: 0,
  manualCount: 0,
  totalAdjusted: 0,
  adjustedItemsCount: 0,
  adjustedSkusCount: 0,
};

/**
 * Hook que usa Web Worker para calcular estatísticas do dashboard
 * Fallback para cálculo no main thread se Web Workers não estiverem disponíveis
 */
export function useStatsWorker() {
  const [stats, setStats] = useState<DashboardStats>(initialStats);
  const [isCalculating, setIsCalculating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const workerRef = useRef<Worker | null>(null);

  // Inicializa o worker
  useEffect(() => {
    try {
      // Cria o worker inline para evitar problemas de path
      const workerCode = `
        function parseBRNumber(value) {
          if (value === null || value === undefined) return 0;
          const str = String(value).trim();
          if (!str) return 0;
          const onlySymbols = str.replace(/[^[0-9.,-]]/g, "");
          if (onlySymbols.includes(",")) {
            const noThousands = onlySymbols.replace(/\\./g, "");
            const normalized = noThousands.replace(/,/g, ".");
            const n = Number(normalized);
            return isNaN(n) ? 0 : n;
          }
          const normalized = onlySymbols.replace(/,/g, "");
          const n = Number(normalized);
          return isNaN(n) ? 0 : n;
        }

        function calculateStats(products, counts) {
          const uniqueProductsCadastro = new Set(products.map(p => p.produto).filter(Boolean));
          const productsCount = uniqueProductsCadastro.size;
          const uniqueProductLotsCadastro = new Set(
            products
              .filter(p => p.produto)
              .map(p => p.produto + "::LOT::" + (p.lote ? String(p.lote).trim().toUpperCase() : ""))
          );
          const productLotCount = uniqueProductLotsCadastro.size;
          const registeredLocatorCount = new Set(
            products
              .map(p => p.codLocalizador ? String(p.codLocalizador).trim().toUpperCase() : "")
              .filter(Boolean)
          ).size;
          
          if (counts.length === 0) {
            return {
              productsCount,
              productLotCount,
              registeredLocatorCount,
              uniqueSkus: 0,
              totalItems: 0,
              countedLocatorCount: 0,
              countedLotCount: 0,
              activeDiscrepancies: 0,
              positiveDiscrepancy: 0,
              negativeDiscrepancy: 0,
              financialDifference: 0,
              errorsByInventor: {},
              operatorErrorSkusCount: 0,
              operatorErrorUnits: 0,
              notRegisteredCount: 0,
              manualCount: 0,
              totalAdjusted: 0,
              adjustedItemsCount: 0,
              adjustedSkusCount: 0,
            };
          }
          
          const uniqueSkusCounted = new Set(counts.map(c => c.produto).filter(Boolean));
          const uniqueSkus = uniqueSkusCounted.size;
          const countedLocatorCount = new Set(
            counts
              .map(c => c.codLocalizador ? String(c.codLocalizador).trim().toUpperCase() : "")
              .filter(Boolean)
          ).size;
          const countedLotCount = new Set(
            counts
              .map(c => c.lote ? String(c.lote).trim().toUpperCase() : "")
              .filter(Boolean)
          ).size;
          
          const totalItems = counts.reduce((sum, c) => {
            return sum + (parseInt(c.quantidadeAjustada || c.quantidade) || 0);
          }, 0);

          function normalizeLot(lot) {
            return lot ? String(lot).trim().toUpperCase() : "";
          }

          function lotKey(produto, lot) {
            return produto + "::LOT::" + normalizeLot(lot);
          }

          function adjustmentKey(produto, lot, locator) {
            const normalizedLocator = locator ? String(locator).trim().toUpperCase() : "";
            return lotKey(produto, lot) + "::LOCATOR::" + normalizedLocator;
          }

          const countsByLot = counts.reduce((acc, count) => {
            const produto = count.produto || "N/A";
            const key = lotKey(produto, count.lote);
            if (!acc[key]) {
              acc[key] = { produto, lote: count.lote || "", quantidadeAjustada: 0 };
            }
            acc[key].quantidadeAjustada += parseInt(count.quantidadeAjustada || count.quantidade) || 0;
            return acc;
          }, {});

          let discCount = 0;
          let positiveSum = 0;
          let negativeSum = 0;

          const handledCountKeys = new Set();
          const handledProductsWithoutLot = new Set();

          function applyDifference(product, expected, counted) {
            const difference = counted - expected;
            if (difference === 0) return;
            discCount++;
            const value = parseBRNumber(product.custoGerencial) * difference;
            if (value > 0) positiveSum += value;
            else negativeSum += value;
          }

          for (const product of products) {
            const productLot = normalizeLot(product.lote);
            const expected = parseBRNumber(product.saldo);
            if (productLot) {
              const key = lotKey(product.produto, productLot);
              const countData = countsByLot[key];
              if (countData) handledCountKeys.add(key);
              applyDifference(product, expected, countData ? countData.quantidadeAjustada : 0);
            } else {
              if (handledProductsWithoutLot.has(product.produto)) continue;
              handledProductsWithoutLot.add(product.produto);
              const productCounts = Object.entries(countsByLot)
                .filter((entry) => entry[1].produto === product.produto);
              productCounts.forEach((entry) => handledCountKeys.add(entry[0]));
              const counted = productCounts.reduce((sum, entry) => sum + entry[1].quantidadeAjustada, 0);
              applyDifference(product, expected, counted);
            }
          }

          Object.entries(countsByLot).forEach((entry) => {
            const key = entry[0];
            const countData = entry[1];
            if (handledCountKeys.has(key)) return;
            const product = products.find((item) => item.produto === countData.produto);
            if (product) applyDifference(product, 0, countData.quantidadeAjustada);
          });

          const errorsByInventorMap = {};
          const adjustedSkusByInventor = {};
          let notRegistered = 0;
          let manualInserts = 0;

          // Agrupar ajustes por produto, lote e localizador.
          const countsByProductForAdjust = {};
          counts.forEach((count) => {
            const produto = count.produto || "N/A";
            const groupKey = adjustmentKey(produto, count.lote, count.codLocalizador);
            if (!countsByProductForAdjust[groupKey]) {
              countsByProductForAdjust[groupKey] = {
                produto,
                totalEscaneada: 0,
                totalAjustada: 0,
                inventariadores: new Set()
              };
            }
            countsByProductForAdjust[groupKey].totalEscaneada += parseInt(count.quantidade) || 0;
            countsByProductForAdjust[groupKey].totalAjustada += parseInt(count.quantidadeAjustada || count.quantidade) || 0;
            const inventariador = count.inventariador
              ? String(count.inventariador).trim()
              : "NÃO INFORMADO";
            countsByProductForAdjust[groupKey].inventariadores.add(inventariador || "NÃO INFORMADO");

            if (count.descricao === "Produto não cadastrado") {
              notRegistered++;
            }

            if (count.coletor === "MANUAL") {
              manualInserts++;
            }
          });

          // Agora calcular métricas de ajuste baseado em produtos únicos
          let totalAdjustedUnits = 0;
          let adjustedGroupsCount = 0;
          const adjustedSkusSet = new Set();

          Object.values(countsByProductForAdjust).forEach((data) => {
            const difference = Math.abs(data.totalAjustada - data.totalEscaneada);
            
            if (difference > 0) {
              adjustedSkusSet.add(data.produto);
              adjustedGroupsCount++;
              totalAdjustedUnits += difference;
              
              // Erros por inventariador (usar a diferença)
              data.inventariadores.forEach(inv => {
                errorsByInventorMap[inv] = (errorsByInventorMap[inv] || 0) + difference;
                if (!adjustedSkusByInventor[inv]) adjustedSkusByInventor[inv] = new Set();
                adjustedSkusByInventor[inv].add(data.produto);
              });
            }
          });

          const operatorErrorSkusCount = Object.values(adjustedSkusByInventor)
            .reduce((sum, skus) => sum + skus.size, 0);
          const operatorErrorUnits = Object.values(errorsByInventorMap)
            .reduce((sum, units) => sum + units, 0);

          return {
            productsCount,
            productLotCount,
            registeredLocatorCount,
            uniqueSkus,
            totalItems,
            countedLocatorCount,
            countedLotCount,
            activeDiscrepancies: discCount,
            positiveDiscrepancy: positiveSum,
            negativeDiscrepancy: negativeSum,
            financialDifference: positiveSum + negativeSum,
            errorsByInventor: errorsByInventorMap,
            operatorErrorSkusCount,
            operatorErrorUnits,
            notRegisteredCount: notRegistered,
            manualCount: manualInserts,
            totalAdjusted: totalAdjustedUnits,
            adjustedItemsCount: adjustedGroupsCount,
            adjustedSkusCount: adjustedSkusSet.size,
          };
        }

        self.onmessage = function(event) {
          const { type, products, counts } = event.data;
          
          if (type === 'CALCULATE_STATS') {
            try {
              const stats = calculateStats(products, counts);
              self.postMessage({ type: 'STATS_RESULT', stats });
            } catch (error) {
              self.postMessage({ type: 'STATS_ERROR', error: String(error) });
            }
          }
        };
      `;

      const blob = new Blob([workerCode], { type: 'application/javascript' });
      const workerUrl = URL.createObjectURL(blob);
      workerRef.current = new Worker(workerUrl);

      workerRef.current.onmessage = (event) => {
        const { type, stats: resultStats, error: resultError } = event.data;
        
        if (type === 'STATS_RESULT') {
          const normalizedStats = { ...initialStats, ...resultStats };
          setStats(normalizedStats);
          // Cache o resultado
          dataCache.set(CACHE_KEYS.STATS, normalizedStats, CACHE_TTL.MEDIUM);
          setIsCalculating(false);
        } else if (type === 'STATS_ERROR') {
          setError(resultError);
          setIsCalculating(false);
        }
      };

      workerRef.current.onerror = (e) => {
        console.error('Worker error:', e);
        setError('Erro no worker de cálculo');
        setIsCalculating(false);
      };

      return () => {
        workerRef.current?.terminate();
        URL.revokeObjectURL(workerUrl);
      };
    } catch (e) {
      console.warn('Web Workers não suportados, usando fallback');
    }
  }, []);

  const calculateStats = useCallback((products: Product[], counts: Count[]) => {
    // Verifica cache primeiro
    const cachedStats = dataCache.get<DashboardStats>(CACHE_KEYS.STATS);
    if (cachedStats) {
      setStats({ ...initialStats, ...cachedStats });
      return;
    }

    setIsCalculating(true);
    setError(null);

    // Usa o worker se disponível
    if (workerRef.current) {
      workerRef.current.postMessage({
        type: 'CALCULATE_STATS',
        products,
        counts,
      });
    } else {
      // Fallback: calcula no main thread (código simplificado para fallback)
      setTimeout(() => {
        try {
          // Importa e usa a função de cálculo diretamente
          import('@/pages/Index').then(() => {
            // Cálculo inline como fallback
            const uniqueProductsCadastro = new Set(products.map(p => p.produto).filter(Boolean));
            const productsCount = uniqueProductsCadastro.size;
            const uniqueProductLotsCadastro = new Set(
              products
                .filter(p => p.produto)
                .map(p => `${p.produto}::LOT::${p.lote?.trim().toUpperCase() || ""}`)
            );
            const productLotCount = uniqueProductLotsCadastro.size;
            const registeredLocatorCount = new Set(
              products
                .map(p => p.codLocalizador?.trim().toUpperCase() || "")
                .filter(Boolean)
            ).size;
            const uniqueSkus = new Set(counts.map(c => c.produto).filter(Boolean)).size;
            const totalItems = counts.reduce(
              (sum, count) => sum + (parseInt(count.quantidadeAjustada || count.quantidade) || 0),
              0,
            );
            const countedLocatorCount = new Set(
              counts.map(c => c.codLocalizador?.trim().toUpperCase() || "").filter(Boolean)
            ).size;
            const countedLotCount = new Set(
              counts.map(c => c.lote?.trim().toUpperCase() || "").filter(Boolean)
            ).size;
            
            setStats(prev => ({
              ...prev,
              productsCount,
              productLotCount,
              registeredLocatorCount,
              uniqueSkus,
              totalItems,
              countedLocatorCount,
              countedLotCount,
            }));
            setIsCalculating(false);
          });
        } catch (e) {
          setError('Erro ao calcular estatísticas');
          setIsCalculating(false);
        }
      }, 0);
    }
  }, []);

  const invalidateCache = useCallback(() => {
    dataCache.delete(CACHE_KEYS.STATS);
  }, []);

  return {
    stats,
    isCalculating,
    error,
    calculateStats,
    invalidateCache,
  };
}
