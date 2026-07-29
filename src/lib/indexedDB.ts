const DB_NAME = "InventoryDB";
const DB_VERSION = 3;
const PRODUCTS_STORE = "products";
const COUNTS_STORE = "counts";

// Tamanho do batch para inserções
const BATCH_SIZE = 500;

export interface Product {
  id?: number;
  empresa: string;
  produto: string;
  descricao1: string;
  saldo: string;
  controlado: string;
  custoGerencial: string;
  ean1: string;
  ean2: string;
  ean3: string;
  ean4: string;
  ean5: string;
  ean6: string;
  ean7: string;
  ean8: string;
  ean9: string;
  ean10: string;
  ean11: string;
  ean12: string;
  lote?: string;
  validade?: string;
  codLocalizador?: string;
  descricaoLocalizador?: string;
  codigoLv?: string;
}

export interface Count {
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

// Cache interno para produtos (mapa EAN -> produto)
let productEanCache: Map<string, Product> | null = null;

const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      
      if (!db.objectStoreNames.contains(PRODUCTS_STORE)) {
        const objectStore = db.createObjectStore(PRODUCTS_STORE, {
          keyPath: "id",
          autoIncrement: true,
        });
        objectStore.createIndex("produto", "produto", { unique: false });
        objectStore.createIndex("ean1", "ean1", { unique: false });
      }

      if (!db.objectStoreNames.contains(COUNTS_STORE)) {
        const countStore = db.createObjectStore(COUNTS_STORE, {
          keyPath: "id",
          autoIncrement: true,
        });
        countStore.createIndex("ean", "ean", { unique: false });
        countStore.createIndex("coletor", "coletor", { unique: false });
        countStore.createIndex("produto", "produto", { unique: false });
      }
    };
  });
};

// Função auxiliar para yield ao main thread
const yieldToMain = (): Promise<void> => {
  return new Promise(resolve => setTimeout(resolve, 0));
};

/**
 * Adiciona produtos em batches para melhor performance
 * @param products Array de produtos a adicionar
 * @param onProgress Callback opcional de progresso
 */
export const addProducts = async (
  products: Product[],
  onProgress?: (processed: number, total: number) => void
): Promise<void> => {
  const db = await openDB();
  const total = products.length;
  
  // Processa em batches
  for (let i = 0; i < total; i += BATCH_SIZE) {
    const batch = products.slice(i, i + BATCH_SIZE);
    
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction([PRODUCTS_STORE], "readwrite");
      const store = transaction.objectStore(PRODUCTS_STORE);

      for (const product of batch) {
        store.add(product);
      }

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });

    // Reporta progresso
    if (onProgress) {
      onProgress(Math.min(i + BATCH_SIZE, total), total);
    }

    // Permite que a UI respire entre batches
    await yieldToMain();
  }
  
  // Invalida o cache de EANs
  productEanCache = null;
  
  db.close();
};

/**
 * Obtém todos os produtos
 */
export const getAllProducts = async (): Promise<Product[]> => {
  const db = await openDB();
  const transaction = db.transaction([PRODUCTS_STORE], "readonly");
  const store = transaction.objectStore(PRODUCTS_STORE);
  const request = store.getAll();

  return new Promise((resolve, reject) => {
    request.onsuccess = () => {
      db.close();
      resolve(request.result);
    };
    request.onerror = () => reject(request.error);
  });
};

/**
 * Obtém a contagem de produtos
 */
export const getProductsCount = async (): Promise<number> => {
  const db = await openDB();
  const transaction = db.transaction([PRODUCTS_STORE], "readonly");
  const store = transaction.objectStore(PRODUCTS_STORE);
  const request = store.count();

  return new Promise((resolve, reject) => {
    request.onsuccess = () => {
      db.close();
      resolve(request.result);
    };
    request.onerror = () => reject(request.error);
  });
};

/**
 * Limpa todos os produtos
 */
export const clearProducts = async (): Promise<void> => {
  const db = await openDB();
  const transaction = db.transaction([PRODUCTS_STORE], "readwrite");
  const store = transaction.objectStore(PRODUCTS_STORE);
  const request = store.clear();

  // Invalida o cache
  productEanCache = null;

  return new Promise((resolve, reject) => {
    request.onsuccess = () => {
      db.close();
      resolve();
    };
    request.onerror = () => reject(request.error);
  });
};

/**
 * Adiciona contagens em batches para melhor performance
 * @param counts Array de contagens a adicionar
 * @param onProgress Callback opcional de progresso
 */
export const addCounts = async (
  counts: Count[],
  onProgress?: (processed: number, total: number) => void
): Promise<void> => {
  const db = await openDB();
  const total = counts.length;
  
  // Processa em batches
  for (let i = 0; i < total; i += BATCH_SIZE) {
    const batch = counts.slice(i, i + BATCH_SIZE);
    
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction([COUNTS_STORE], "readwrite");
      const store = transaction.objectStore(COUNTS_STORE);

      for (const count of batch) {
        store.add(count);
      }

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });

    // Reporta progresso
    if (onProgress) {
      onProgress(Math.min(i + BATCH_SIZE, total), total);
    }

    // Permite que a UI respire entre batches
    await yieldToMain();
  }
  
  db.close();
};

/**
 * Obtém todas as contagens
 */
export const getAllCounts = async (): Promise<Count[]> => {
  const db = await openDB();
  const transaction = db.transaction([COUNTS_STORE], "readonly");
  const store = transaction.objectStore(COUNTS_STORE);
  const request = store.getAll();

  return new Promise((resolve, reject) => {
    request.onsuccess = () => {
      db.close();
      resolve(request.result);
    };
    request.onerror = () => reject(request.error);
  });
};

/**
 * Obtém a contagem de registros de contagem
 */
export const getCountsCount = async (): Promise<number> => {
  const db = await openDB();
  const transaction = db.transaction([COUNTS_STORE], "readonly");
  const store = transaction.objectStore(COUNTS_STORE);
  const request = store.count();

  return new Promise((resolve, reject) => {
    request.onsuccess = () => {
      db.close();
      resolve(request.result);
    };
    request.onerror = () => reject(request.error);
  });
};

/**
 * Limpa todas as contagens
 */
export const clearCounts = async (): Promise<void> => {
  const db = await openDB();
  const transaction = db.transaction([COUNTS_STORE], "readwrite");
  const store = transaction.objectStore(COUNTS_STORE);
  const request = store.clear();

  return new Promise((resolve, reject) => {
    request.onsuccess = () => {
      db.close();
      resolve();
    };
    request.onerror = () => reject(request.error);
  });
};

/**
 * Constrói o cache de EANs para buscas rápidas
 */
const buildEanCache = async (): Promise<Map<string, Product>> => {
  if (productEanCache) {
    return productEanCache;
  }

  const products = await getAllProducts();
  const cache = new Map<string, Product>();

  for (const product of products) {
    // Adiciona todos os EANs do produto ao cache
    const eans = [
      product.ean1, product.ean2, product.ean3, product.ean4,
      product.ean5, product.ean6, product.ean7, product.ean8,
      product.ean9, product.ean10, product.ean11, product.ean12
    ];

    for (const ean of eans) {
      if (ean) {
        cache.set(ean, product);
      }
    }
  }

  productEanCache = cache;
  return cache;
};

/**
 * Busca um produto por EAN usando cache
 */
export const getProductByEan = async (ean: string): Promise<Product | null> => {
  const cache = await buildEanCache();
  return cache.get(ean) || null;
};

/**
 * Busca múltiplos produtos por EAN de forma eficiente
 */
export const getProductsByEans = async (eans: string[]): Promise<Map<string, Product>> => {
  const cache = await buildEanCache();
  const results = new Map<string, Product>();

  for (const ean of eans) {
    const product = cache.get(ean);
    if (product) {
      results.set(ean, product);
    }
  }

  return results;
};

/**
 * Deleta contagens por produto, lote e localizador
 */
export const deleteCountsByProduct = async (
  produto: string,
  lote?: string,
  codLocalizador?: string
): Promise<void> => {
  const db = await openDB();
  const transaction = db.transaction([COUNTS_STORE], "readwrite");
  const store = transaction.objectStore(COUNTS_STORE);
  const request = store.getAll();

  return new Promise((resolve, reject) => {
    request.onsuccess = () => {
      const counts = request.result as Count[];
      const normalizedLot = lote?.trim().toUpperCase() || "";
      const normalizedLocator = codLocalizador?.trim().toUpperCase() || "";
      const countsToDelete = counts.filter(c =>
        c.produto === produto &&
        (c.lote?.trim().toUpperCase() || "") === normalizedLot &&
        (c.codLocalizador?.trim().toUpperCase() || "") === normalizedLocator
      );
      
      countsToDelete.forEach(count => {
        if (count.id) {
          store.delete(count.id);
        }
      });

      transaction.oncomplete = () => {
        db.close();
        resolve();
      };
      transaction.onerror = () => reject(transaction.error);
    };
    request.onerror = () => reject(request.error);
  });
};

/**
 * Atualiza quantidade ajustada por produto, lote e localizador
 */
export const updateCountsByProduct = async (
  produto: string,
  quantidadeAjustada: string,
  lote?: string,
  codLocalizador?: string
): Promise<void> => {
  const db = await openDB();
  const transaction = db.transaction([COUNTS_STORE], "readwrite");
  const store = transaction.objectStore(COUNTS_STORE);
  const request = store.getAll();

  return new Promise((resolve, reject) => {
    request.onsuccess = () => {
      const counts = request.result as Count[];
      const normalizedLot = lote?.trim().toUpperCase() || "";
      const normalizedLocator = codLocalizador?.trim().toUpperCase() || "";
      const countsToUpdate = counts.filter(c =>
        c.produto === produto &&
        (c.lote?.trim().toUpperCase() || "") === normalizedLot &&
        (c.codLocalizador?.trim().toUpperCase() || "") === normalizedLocator
      );
      
      // Distribui a quantidade ajustada total entre os registros
      // O primeiro registro recebe a quantidade total, os demais recebem 0
      countsToUpdate.forEach((count, index) => {
        count.quantidadeAjustada = index === 0 ? quantidadeAjustada : "0";
        store.put(count);
      });

      transaction.oncomplete = () => {
        db.close();
        resolve();
      };
      transaction.onerror = () => reject(transaction.error);
    };
    request.onerror = () => reject(request.error);
  });
};

/**
 * Invalida o cache de produtos (chamar após importações)
 */
export const invalidateProductCache = (): void => {
  productEanCache = null;
};
