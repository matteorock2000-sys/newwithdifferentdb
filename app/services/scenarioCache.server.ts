import type { AdventureScenario } from "~/types";

/**
 * A simple in-memory cache to store generated scenarios on the server-side
 * to avoid bloating the session cookie.
 * The key is a unique ID (string), and the value is the array of scenarios.
 */
const scenarioCache = new Map<string, AdventureScenario[]>();

/**
 * Stores an array of scenarios in the cache and returns a unique ID.
 * @param scenarios The array of AdventureScenario objects to store.
 * @returns A unique string ID for retrieving the scenarios.
 */
export function storeScenarios(scenarios: AdventureScenario[]): string {
  const id = crypto.randomUUID();
  // Set a timeout to clear the cache entry after 15 minutes to prevent memory leaks
  setTimeout(() => {
    scenarioCache.delete(id);
    console.log(`[SCENARIO CACHE] Cleared expired scenarios for ID: ${id}`);
  }, 15 * 60 * 1000); 
  
  scenarioCache.set(id, scenarios);
  console.log(`[SCENARIO CACHE] Stored ${scenarios.length} scenarios with ID: ${id}`);
  return id;
}

/**
 * Retrieves an array of scenarios from the cache using its ID.
 * @param id The unique ID for the scenarios.
 * @returns The array of AdventureScenario objects or undefined if not found.
 */
export function getScenarios(id: string): AdventureScenario[] | undefined {
  console.log(`[SCENARIO CACHE] Retrieving scenarios for ID: ${id}`);
  return scenarioCache.get(id);
}

/**
 * Deletes a scenario entry from the cache.
 * @param id The unique ID of the scenarios to delete.
 */
export function clearScenarios(id: string): void {
  const deleted = scenarioCache.delete(id);
  if (deleted) {
    console.log(`[SCENARIO CACHE] Cleared scenarios for ID: ${id}`);
  }
}

/**
 * Stores an array of scenarios in the cache with a specific key (e.g., room code).
 * @param key The key to store the scenarios under (e.g., room code).
 * @param scenarios The array of AdventureScenario objects to store.
 */
export function storeScenariosWithKey(key: string, scenarios: AdventureScenario[]): void {
  // Set a timeout to clear the cache entry after 30 minutes to prevent memory leaks
  setTimeout(() => {
    scenarioCache.delete(key);
    console.log(`[SCENARIO CACHE] Cleared expired scenarios for room: ${key}`);
  }, 30 * 60 * 1000); // 30 minutes for rooms
  scenarioCache.set(key, scenarios);
  console.log(`[SCENARIO CACHE] Stored ${scenarios.length} scenarios for room: ${key}`);
}
