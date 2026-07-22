// Processador de dados em chunks para evitar bloqueio da UI

/**
 * Processa um array em chunks, permitindo que a UI respire entre cada chunk
 * @param items Array de items a processar
 * @param processor Função que processa cada item
 * @param chunkSize Tamanho de cada chunk (padrão: 500)
 * @param onProgress Callback de progresso opcional
 */
export async function processInChunks<T, R>(
  items: T[],
  processor: (item: T, index: number) => R,
  chunkSize: number = 500,
  onProgress?: (processed: number, total: number) => void
): Promise<R[]> {
  const results: R[] = [];
  const total = items.length;

  for (let i = 0; i < total; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);
    
    // Processa o chunk
    for (let j = 0; j < chunk.length; j++) {
      results.push(processor(chunk[j], i + j));
    }

    // Reporta progresso
    if (onProgress) {
      onProgress(Math.min(i + chunkSize, total), total);
    }

    // Permite que a UI respire
    await yieldToMain();
  }

  return results;
}

/**
 * Processa um array em chunks de forma assíncrona
 * @param items Array de items a processar
 * @param processor Função assíncrona que processa cada item
 * @param chunkSize Tamanho de cada chunk (padrão: 100)
 * @param onProgress Callback de progresso opcional
 */
export async function processInChunksAsync<T, R>(
  items: T[],
  processor: (item: T, index: number) => Promise<R>,
  chunkSize: number = 100,
  onProgress?: (processed: number, total: number) => void
): Promise<R[]> {
  const results: R[] = [];
  const total = items.length;

  for (let i = 0; i < total; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);
    
    // Processa o chunk em paralelo
    const chunkResults = await Promise.all(
      chunk.map((item, j) => processor(item, i + j))
    );
    
    results.push(...chunkResults);

    // Reporta progresso
    if (onProgress) {
      onProgress(Math.min(i + chunkSize, total), total);
    }

    // Permite que a UI respire
    await yieldToMain();
  }

  return results;
}

/**
 * Agrupa items em batches para inserção no banco
 * @param items Items a agrupar
 * @param batchSize Tamanho de cada batch
 */
export function createBatches<T>(items: T[], batchSize: number = 1000): T[][] {
  const batches: T[][] = [];
  
  for (let i = 0; i < items.length; i += batchSize) {
    batches.push(items.slice(i, i + batchSize));
  }
  
  return batches;
}

/**
 * Função auxiliar para dar "yield" ao main thread
 * Usa scheduler.yield se disponível, senão setTimeout
 */
function yieldToMain(): Promise<void> {
  // @ts-ignore - scheduler.yield é uma API nova
  if ('scheduler' in globalThis && 'yield' in globalThis.scheduler) {
    // @ts-ignore
    return globalThis.scheduler.yield();
  }
  
  return new Promise(resolve => setTimeout(resolve, 0));
}

/**
 * Debounce para processamento de dados
 */
export function debounceProcess<T extends (...args: any[]) => any>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout | null = null;
  
  return (...args: Parameters<T>) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    
    timeoutId = setTimeout(() => {
      fn(...args);
      timeoutId = null;
    }, delay);
  };
}

/**
 * Throttle para processamento de dados
 */
export function throttleProcess<T extends (...args: any[]) => any>(
  fn: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle = false;
  
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      fn(...args);
      inThrottle = true;
      setTimeout(() => {
        inThrottle = false;
      }, limit);
    }
  };
}
