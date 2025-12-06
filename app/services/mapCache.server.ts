import { LRUCache } from 'lru-cache';

interface MapCacheEntry {
  mapImageBase64: string;
  timestamp: number;
}

// Cache for map images, with a max age of 1 hour (3600000 ms)
// and a maximum of 100 entries.
const mapCache = new LRUCache<string, MapCacheEntry>({
  max: 100,
  ttl: 1000 * 60 * 60, // 1 hour
  updateAgeOnGet: true, // Update TTL on access
});

export function setMapImage(id: string, mapImageBase64: string) {
  mapCache.set(id, { mapImageBase64, timestamp: Date.now() });
}

export function getMapImage(id: string): string | undefined {
  return mapCache.get(id)?.mapImageBase64;
}

export function deleteMapImage(id: string) {
  mapCache.delete(id);
}

export function clearMapCache() {
  mapCache.clear();
}
