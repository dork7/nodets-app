export interface CacheConfig {
 url: string;
 body?: object[];
 query?: string[];
 ttl: number;
}

export interface ExtendedCacheConfig extends CacheConfig {
 cacheName: string;
 maxSize?: number;
}
