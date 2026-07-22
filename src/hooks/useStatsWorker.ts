import { useState, useEffect, useCallback, useRef } from 'react';
import { Product, Count } from '@/lib/indexedDB';
import { dataCache, CACHE_KEYS, CACHE_TTL } from '@/lib/cache';

interface DashboardStats {
  productsCount: number;
  uniqueSkus: number;
  totalItems: number;
  activeDiscrepancies: number;
  positiveDiscrepancy: number;
  negativeDiscrepancy: number;
  financialDifference: number;
  errorsByInventor: Record<string, number>;
  notRegisteredCount: number;
  manualCount: number;
  totalAdjusted: number;
  adjustedItemsCount: number;
  adjustedSkusCount: number;
}

const initialStats: DashboardStats = {
  productsCount: 0,
  uniqueSkus: 0,
  totalItems: 0,
  activeDiscrepancies: 0,
  positiveDiscrepancy: 0,
  negativeDiscrepancy: 0,
  financialDifference: 0,
  errorsByInventor: {},
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
          
          if (counts.length === 0) {
            return {
              productsCount,
              uniqueSkus: 0,
              totalItems: 0,
              activeDiscrepancies: 0,
              positiveDiscrepancy: 0,
              negativeDiscrepancy: 0,
              financialDifference: 0,
              errorsByInventor: {},
              notRegisteredCount: 0,
              manualCount: 0,
              totalAdjusted: 0,
              adjustedItemsCount: 0,
              adjustedSkusCount: 0,
            };
          }
          
          const uniqueSkusCounted = new Set(counts.map(c => c.produto).filter(Boolean));
          const uniqueSkus = uniqueSkusCounted.size;
          
          const totalItems = counts.reduce((sum, c) => {
            return sum + (parseInt(c.quantidadeAjustada || c.quantidade) || 0);
          }, 0);

          const countsByProduct = counts.reduce((acc, count) => {
            const produto = count.produto || "N/A";
            if (!acc[produto]) {
              acc[produto] = { quantidadeAjustada: 0 };
            }
            acc[produto].quantidadeAjustada += parseInt(count.quantidadeAjustada || count.quantidade) || 0;
            return acc;
          }, {});

          let discCount = 0;
          let positiveSum = 0;
          let negativeSum = 0;

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
              const qtdeLoja = parseBRNumber(product.saldo);
              const qtdeAjustada = countData.quantidadeAjustada;
              const qtdeDivergente = qtdeAjustada - qtdeLoja;
              
              if (qtdeDivergente !== 0) {
                discCount++;
                const custo = parseBRNumber(product.custoGerencial);
                const valorDiferenca = custo * qtdeDivergente;
                
                if (valorDiferenca > 0) {
                  positiveSum += valorDiferenca;
                } else {
                  negativeSum += valorDiferenca;
                }
              }
            } else {
              const qtdeLoja = parseBRNumber(product.saldo);
              if (qtdeLoja !== 0) {
                discCount++;
                const custo = parseBRNumber(product.custoGerencial);
                const qtdeDivergente = 0 - qtdeLoja;
                const valorDiferenca = custo * qtdeDivergente;
                
                if (valorDiferenca > 0) {
                  positiveSum += valorDiferenca;
                } else {
                  negativeSum += valorDiferenca;
                }
              }
            }
          }

          const errorsByInventorMap = {};
          let notRegistered = 0;
          let manualInserts = 0;

          // Primeiro, agrupar contagens por produto para calcular ajustes corretamente
          const countsByProductForAdjust = {};
          counts.forEach((count) => {
            const produto = count.produto || "N/A";
            if (!countsByProductForAdjust[produto]) {
              countsByProductForAdjust[produto] = {
                totalEscaneada: 0,
                totalAjustada: 0,
                inventariadores: new Set()
              };
            }
            countsByProductForAdjust[produto].totalEscaneada += parseInt(count.quantidade) || 0;
            countsByProductForAdjust[produto].totalAjustada += parseInt(count.quantidadeAjustada || count.quantidade) || 0;
            if (count.inventariador) {
              countsByProductForAdjust[produto].inventariadores.add(count.inventariador);
            }

            if (count.descricao === "Produto não cadastrado") {
              notRegistered++;
            }

            if (count.coletor === "MANUAL") {
              manualInserts++;
            }
          });

          // Agora calcular métricas de ajuste baseado em produtos únicos
          let totalAdjustedQty = 0;
          let adjustedProductsCount = 0;
          const adjustedSkusSet = new Set();

          Object.entries(countsByProductForAdjust).forEach(([produto, data]) => {
            const difference = Math.abs(data.totalAjustada - data.totalEscaneada);
            
            if (difference > 0) {
              // Produto foi ajustado
              adjustedSkusSet.add(produto);
              adjustedProductsCount++;
              totalAdjustedQty += data.totalAjustada; // Total ajustado (não a diferença)
              
              // Erros por inventariador (usar a diferença)
              data.inventariadores.forEach(inv => {
                errorsByInventorMap[inv] = (errorsByInventorMap[inv] || 0) + difference;
              });
            }
          });

          return {
            productsCount,
            uniqueSkus,
            totalItems,
            activeDiscrepancies: discCount,
            positiveDiscrepancy: positiveSum,
            negativeDiscrepancy: negativeSum,
            financialDifference: positiveSum + negativeSum,
            errorsByInventor: errorsByInventorMap,
            notRegisteredCount: notRegistered,
            manualCount: manualInserts,
            totalAdjusted: totalAdjustedQty,
            adjustedItemsCount: adjustedProductsCount,
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
          setStats(resultStats);
          // Cache o resultado
          dataCache.set(CACHE_KEYS.STATS, resultStats, CACHE_TTL.MEDIUM);
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
      setStats(cachedStats);
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
            
            setStats(prev => ({ ...prev, productsCount }));
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
