import type { AdventureScenario } from "~/types";

/**
 * A simple in-memory cache to store generated scenarios on the server-side
 * to avoid bloating the session cookie.
 * The key is a unique ID (string), and the value is the array of scenarios.
 */
const scenarioCache = new Map<string, AdventureScenario[]>();

import { logger } from "~/utils/logger";

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
    logger.debug('Cleared expired scenarios', { id });
  }, 15 * 60 * 1000); 
  
  scenarioCache.set(id, scenarios);
  logger.info('Stored scenarios', { id, count: scenarios.length });
  return id;
}

/**
 * Retrieves an array of scenarios from the cache using its ID.
 * @param id The unique ID for the scenarios.
 * @returns The array of AdventureScenario objects or undefined if not found.
 */
export function getScenarios(id: string): AdventureScenario[] | undefined {
  logger.debug('Retrieving scenarios', { id });
  return scenarioCache.get(id);
}

/**
 * Deletes a scenario entry from the cache.
 * @param id The unique ID of the scenarios to delete.
 */
export function clearScenarios(id: string): void {
  const deleted = scenarioCache.delete(id);
  if (deleted) {
    logger.info('Cleared scenarios', { id });
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
    logger.debug('Cleared expired scenarios for room', { key });
  }, 30 * 60 * 1000); // 30 minutes for rooms
  scenarioCache.set(key, scenarios);
  logger.info('Stored scenarios for room', { key, count: scenarios.length });
}
