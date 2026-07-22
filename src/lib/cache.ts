// Sistema de cache com TTL (Time To Live)

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

class DataCache {
  private cache: Map<string, CacheEntry<any>> = new Map();
  private readonly DEFAULT_TTL = 5 * 60 * 1000; // 5 minutos

  /**
   * Armazena um valor no cache
   * @param key Chave do cache
   * @param data Dados a armazenar
   * @param ttl Tempo de vida em ms (padrão: 5 minutos)
   */
  set<T>(key: string, data: T, ttl: number = this.DEFAULT_TTL): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl,
    });
  }

  /**
   * Recupera um valor do cache
   * @param key Chave do cache
   * @returns Dados ou null se expirado/inexistente
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return null;
    }

    // Verifica se expirou
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.data as T;
  }

  /**
   * Verifica se uma chave existe e é válida
   * @param key Chave do cache
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return false;
    }

    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Remove uma entrada do cache
   * @param key Chave do cache
   */
  delete(key: string): void {
    this.cache.delete(key);
  }

  /**
   * Limpa todas as entradas do cache
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Limpa entradas expiradas
   */
  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Invalida caches relacionados a um padrão
   * @param pattern Prefixo das chaves a invalidar
   */
  invalidatePattern(pattern: string): void {
    for (const key of this.cache.keys()) {
      if (key.startsWith(pattern)) {
        this.cache.delete(key);
      }
    }
  }
}

// Instância única do cache
export const dataCache = new DataCache();

// Constantes de chaves de cache
export const CACHE_KEYS = {
  PRODUCTS: 'products',
  COUNTS: 'counts',
  STATS: 'dashboard_stats',
  DISCREPANCIES: 'discrepancies',
} as const;

// TTLs específicos
export const CACHE_TTL = {
  SHORT: 1 * 60 * 1000,    // 1 minuto
  MEDIUM: 5 * 60 * 1000,   // 5 minutos
  LONG: 15 * 60 * 1000,    // 15 minutos
} as const;
