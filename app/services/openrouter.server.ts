import { json } from '@remix-run/node';
import type { Character, AdventureScenario, BossFight, PlayerSlot } from '~/types';
import { logger } from '~/utils/logger';
import { getRoomScenariosForVoting } from '~/services/roomScenarios.server';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_API_BASE = 'https://openrouter.ai/api/v1';

if (!OPENROUTER_API_KEY) {
  throw new Error('OPENROUTER_API_KEY environment variable not set.');
}

// OpenRouter model configuration
const MODEL_PREFERENCES = [
  'kwaipilot/kat-coder-pro:free',  // Primary model as requested
  'google/gemini-flash-8b',        // Fallback model
  'anthropic/claude-3.5-sonnet'    // Additional fallback
];

// Cache for storing recently generated scenarios to avoid duplicate API calls
const scenarioCache = new Map<string, { scenarios: any[], timestamp: number }>();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour cache

// Utility function to clean text by removing emojis and excessive whitespace
function cleanText(text: string): string {
  const emojiRegex = /(\u00a9|\u00ae|[\u2000-\u3300]|\ud83c[\ud000-\udfff]|\ud83d[\ud000-\udfff]|\ud83e[\ud000-\udfff])/g;
  let cleaned = text.replace(emojiRegex, '');
  cleaned = cleaned.replace(/(\r\n|\r|\n){2,}/g, '\n\n');
  cleaned = cleaned.replace(/[ \t]+/g, ' ');
  return cleaned.trim();
}

// Enhanced generateContent with retry logic and model fallback
async function generateContentWithRetry(prompt: string, maxRetries: number = 3): Promise<any> {
  let lastError = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    for (const modelPreference of MODEL_PREFERENCES) {
      try {
        logger.debug(`[OPENROUTER] Attempting to generate content with model: ${modelPreference} (attempt ${attempt}/${maxRetries})`);
        logger.info(`[OPENROUTER] Using model: ${modelPreference} for scenario generation`);
        
        const response = await fetch(`${OPENROUTER_API_BASE}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
            'HTTP-Referer': process.env.URL || 'http://localhost:5173',
            'X-Title': 'D&D Campaign Manager'
          },
          body: JSON.stringify({
            model: modelPreference,
            messages: [
              {
                role: 'user',
                content: prompt
              }
            ],
            max_tokens: 8000,
            temperature: 0.8,
            top_p: 0.95,
            frequency_penalty: 0.1,
            presence_penalty: 0.1
          })
        });
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const result = await response.json();
        
        if (!result.choices || !result.choices[0] || !result.choices[0].message) {
          throw new Error('Invalid response format from OpenRouter');
        }
        
        logger.debug(`[OPENROUTER] Successfully generated content with model: ${modelPreference}`);
        return {
          response: {
            text: () => result.choices[0].message.content
          }
        };
        
      } catch (error: any) {
        lastError = error;
        logger.error(`[OPENROUTER] Error with model ${modelPreference} (attempt ${attempt})`, { error: error.message });
        
        // Check if this is a quota error
        if (error.message && error.message.includes('429')) {
          logger.warn(`[OPENROUTER] Quota exceeded for model ${modelPreference}, trying next model...`);
          continue; // Try next model
        }
        
        // Check if this is a model not found error
        if (error.message && (error.message.includes('404') || error.message.includes('not found'))) {
          logger.warn(`[OPENROUTER] Model ${modelPreference} not found or unavailable, trying next model...`);
          continue; // Try next model
        }
        
        // Check if this is a service unavailable error (503)
        if (error.message && error.message.includes('503')) {
          logger.warn(`[OPENROUTER] Service temporarily unavailable for model ${modelPreference}, trying next model...`);
          continue; // Try next model
        }
        
        // For other errors, break and try next attempt
        break;
      }
    }
    
    // If we've tried all models and none worked, wait before retrying
    if (attempt < maxRetries) {
      const delay = Math.pow(2, attempt) * 1000; // Exponential backoff: 2s, 4s, 8s
      logger.debug(`[OPENROUTER] Waiting ${delay}ms before retry ${attempt + 1}...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  // If all retries failed, throw the last error with additional context
  throw new Error(`OpenRouter API failed after ${maxRetries} attempts with all models (${MODEL_PREFERENCES.join(', ')}). This may be due to high server load or network issues. Please try again in a few minutes. Last error: ${lastError?.message || 'Unknown error'}`);
}

// Function to generate fallback scenarios (now removed - we wait for OpenRouter instead)
function generateFallbackScenarios(character: Character, duration: string, partyContext: string = ''): AdventureScenario[] {
  logger.debug('[OPENROUTER] API call failed but fallback scenarios are disabled - throwing error instead');
  throw new Error('OpenRouter API call failed. Please try again.');
}

export async function generateScenariosForCharacter(
  character: Character,
  duration: string,
  regenerationPrompt?: string,
  partyCharacters?: Character[],
  partySlots?: PlayerSlot[],
  roomCode?: string,
  forceNewGeneration?: boolean,
  unique?: boolean
): Promise<AdventureScenario[]> {
  console.log(`[OPENROUTER] Starting scenario generation for character: ${character.name}, room: ${roomCode}`);

  // Build cache key for this specific scenario generation request
  const cacheKey = JSON.stringify({
    characterId: character.id,
    characterName: character.name,
    duration,
    partyCharacters: partyCharacters?.map(c => c.id).sort(),
    regenerationPrompt: regenerationPrompt || '',
    roomCode: roomCode || ''
  });

  // Check cache first (before checking database) unless forced or uniqueness requested
  const cached = scenarioCache.get(cacheKey);
  if (!forceNewGeneration && !unique && cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log(`[OPENROUTER] Returning cached scenarios for cache key: ${cacheKey.substring(0, 100)}...`);
    return cached.scenarios;
  }

  // Build party summary
  const activePartyMembers = (partyCharacters || []).filter(c => c);
  const partyDescription = activePartyMembers.length > 0 
    ? activePartyMembers.map(c => `${c.name} (${c.race} ${c.class})`).join(', ')
    : `${character.name} (${character.race} ${character.class})`;

  const partyContext = activePartyMembers.length > 1
    ? `This is a PARTY adventure. The party consists of: ${partyDescription}. Design scenarios that challenge and engage ALL party members, not just one character. Consider the synergies and conflicts between different classes and skills.`
    : '';

  const regenerationContext = regenerationPrompt && regenerationPrompt.trim()
    ? `\n\nCRITICAL CONTEXT: The user has requested that these scenarios focus on the following theme: "${regenerationPrompt.trim()}". Incorporate this theme into all four scenarios.`
    : '';

  // Fetch previous scenarios to ensure uniqueness
  let previousScenarios: AdventureScenario[] = [];
  if (roomCode) {
    try {
      previousScenarios = await getRoomScenariosForVoting(roomCode);
      console.log(`[OPENROUTER] Found ${previousScenarios.length} previous scenarios for room ${roomCode}`);
    } catch (error) {
      console.warn(`[OPENROUTER] Failed to fetch previous scenarios for room ${roomCode}:`, error);
    }
  }

  const previousScenariosContext = previousScenarios.length > 0
    ? `\n\nCRITICAL REQUIREMENT: These new scenarios MUST be completely different from the following previously generated scenarios:\n${previousScenarios.map((s, i) => 
        `${i + 1}. Title: "${s.title}"\n   Environment: ${s.surrounding}\n   Objective: ${s.objective}`
      ).join('\n\n')}\n\nEnsure the new scenarios have different titles, environments, objectives, and core conflicts.`
    : '';

  const prompt = `
  You are an expert Dungeons & Dragons 5th Edition Dungeon Master AI, renowned for crafting innovative and engaging adventures. Your task is to generate exactly 4 distinct, compelling, and highly dynamic starting adventure scenarios for a D&D 5th Edition game.

  CRITICAL REQUIREMENT: All 4 scenarios must be fundamentally different from each other in terms of plot hook, pacing, environment, and core conflict. Each scenario must have a unique title, a unique and highly evocative surrounding environment description, and a unique primary objective. Do not repeat themes, titles, locations, or core mechanics across the scenarios. Ensure the surrounding descriptions are rich in sensory details and atmosphere, making each one distinct.
  Aim for a balance of combat, exploration, social interaction, and potential moral dilemmas across the set of scenarios.

  ${previousScenariosContext}

  The scenarios should be perfectly tailored to the starting level (Level ${character.level}) and the specific party composition.
  The desired campaign duration is: ${duration}.
  ${partyContext}
  ${regenerationContext}

  **Dynamic Scenario Elements to Emphasize:**
  - Introduce unexpected twists or turns early in the objective.
  - Include opportunities for player choice that can significantly alter the path of the adventure.
  - Suggest minor NPCs who could be allies, rivals, or sources of information.
  - Ensure the "surrounding" description sets a strong, unique tone for each adventure.

  ${activePartyMembers.length > 1 ? `Party Composition:\n${activePartyMembers.map(c => `- ${c.name}: Level ${c.level} ${c.race} ${c.class} (${c.background})`).join('\n')}\n` : ''}
  
  Primary Character: ${character.name}
  Primary Character Race: ${character.race}
  Primary Character Class: ${character.class}
  Primary Character Background: ${character.background}
  Primary Character Alignment: ${character.alignment}

  For each of the 4 scenarios, provide the following structure in a single JSON array. Ensure each scenario includes:
  - "id": A unique UUID string.
  - "title": A catchy, unique, and intriguing title for the adventure.
  - "surrounding": A detailed, evocative, and UNIQUE description of the immediate environment where the adventure begins (e.g., a bustling market, a desolate mountain pass, a forgotten temple entrance). Focus on sensory details and make it distinct for each scenario. Hint at the initial mood or challenge.
  - "objective": A clear, concise introduction to the immediate objective or conflict that starts the adventure. This should be a strong hook.
  - "possibleEncounters": An array of strings, listing 2-3 distinct potential minor encounters or challenges relevant to the scenario (e.g., "Navigating a cunning goblin ambush", "Negotiating with a wary forest spirit", "Solving an ancient dwarven riddle").
  - "possibleEnemies": An array of strings, listing 2-3 types of common enemies or adversaries the player might face, appropriate for the environment and level.
  - "bossFight": A JSON object describing a potential boss fight, including:
    - "name": The name of the formidable boss.
    - "description": A brief, compelling description of the boss, its motivations, and its role as a significant challenge in the scenario.
  - "mapDescription": A detailed description for generating a 1080p top-down battle map. Include key terrain features (e.g., 'dense fog', 'treacherous ravine', 'crumbling ruins'), points of interest (e.g., 'ancient monolith', 'bandit camp', 'dragon's hoard'), and precise starting positions for all player characters (e.g., 'Player characters start at the northern edge, clustered near a fallen log'). Provide enough detail for a rich, interactive map generation.

  Example structure for one scenario:
  {
    "id": "unique-uuid-1",
    "title": "Whispers of the Petrified Grove",
    "surrounding": "The air hangs heavy with the scent of ozone and ancient earth. Twisted, petrified trees, frozen mid-motion, cast grotesque shadows under a perpetual twilight sky. Strange, glowing fungi illuminate the path, leading deeper into a silence that feels unnatural.",
    "objective": "A desperate messenger from the nearby village of Oakhaven pleads for aid. Their sacred grove has been struck by a mysterious blight, turning living things to stone, and their druid protector has vanished searching for a cure. The villagers offer a hefty reward for rescue and a return to normalcy.",
    "possibleEncounters": ["Navigating fields of sharp, crystalline flora that drain vitality", "A patrol of suspicious, heavily armored cultists guarding a research outpost", "An encounter with confused, petrified animals that animate briefly as hazards"],
    "possibleEnemies": ["Animated Stone Golems", "Myconid Spore Servants", "Corrupted Druids"],
    "bossFight": {
      "name": "The Gorgon Queen of Stone",
      "description": "A once-benevolent fey queen, twisted and corrupted by the blight, now a monstrous gorgon with the power to turn all who defy her into statues. She lurks deep within the heart of the grove, defending the source of her new, terrible power."
    },
    "mapDescription": "A 1080p top-down battle map of a petrified forest. The terrain is jagged and uneven, with petrified trees forming natural barriers and choke points. Patches of glowing fungi provide dim illumination. A small, overgrown ruin stands in the center, hinting at a lost magical site. Player characters start on a clear path at the southern entrance, just before a cluster of petrified deer."
  }

  Ensure the output is ONLY the JSON array. Do not include any explanatory text before or after the JSON. The JSON array must contain exactly 4 distinct scenario objects, each adhering strictly to the specified structure and content requirements.
  `;

  try {
    // Add timeout to prevent hanging
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('OpenRouter API request timed out after 120 seconds')), 120000);
    });
    
    console.log(`[OPENROUTER] Starting scenario generation with prompt length: ${prompt.length}`);
    
    const result = await Promise.race([
      generateContentWithRetry(prompt),
      timeoutPromise
    ]);
    
    console.log(`[OPENROUTER] Received API response`);
    
    // Debug the response
    const responseText = result.response.text();
    console.log(`[OPENROUTER] Response text length: ${responseText.length}`);
    console.log(`[OPENROUTER] Response text first 100 chars:`, { chars: responseText.substring(0, 100) });
    
    // Check if response is HTML (error page)
    if (responseText.trim().startsWith('<!DOCTYPE') || responseText.trim().startsWith('<html') || responseText.trim().startsWith('<!')) {
      console.error(`[OPENROUTER] Received HTML response instead of JSON. This might be an error page.`);
      throw new Error('OpenRouter API returned HTML instead of JSON. Check API key and endpoint.');
    }
    
    logger.debug("OpenRouter Scenario Response:", { responseText });

    // Try multiple patterns to extract JSON
    let jsonString = responseText;
    let extractionMethod = "raw";
    
    // Pattern 1: JSON wrapped in markdown code blocks
    const jsonMarkdownMatch = responseText.match(/```json\n([\s\S]*?)\n```/);
    if (jsonMarkdownMatch && jsonMarkdownMatch[1]) {
      jsonString = jsonMarkdownMatch[1];
      extractionMethod = "markdown";
    } else {
      // Pattern 2: Plain JSON array starting with [
      const jsonArrayMatch = responseText.match(/\[\s*\{[\s\S]*\}\s*\]/);
      if (jsonArrayMatch) {
        jsonString = jsonArrayMatch[0];
        extractionMethod = "array";
      }
    }

    logger.debug(`[OPENROUTER] Using extraction method: ${extractionMethod}`);
    logger.debug(`[OPENROUTER] Extracted JSON length: ${jsonString.length}`);
    logger.debug(`[OPENROUTER] First 200 chars of extracted JSON:`, { chars: jsonString.substring(0, 200) });
    
    // Clean up common JSON issues
    jsonString = jsonString.trim();
    
    // Fix any remaining problematic characters first
    jsonString = jsonString.replace(/[\u0000-\u001F\u007F-\u009F]/g, ''); // Remove control characters
    jsonString = jsonString.replace(/[\uD800-\uDFFF]/g, ''); // Remove surrogate pairs that can break JSON
    
    // Strategy 1: Fix common quote issues (more conservative approach)
    // Only fix obvious cases that are clearly wrong
    jsonString = jsonString
      .replace(/\\'/g, "'") // Fix escaped single quotes
      .replace(/\\n/g, '\\n') // Keep escaped newlines as-is
      .replace(/\\r/g, '\\r') // Keep escaped carriage returns as-is  
      .replace(/\\t/g, '\\t') // Keep escaped tabs as-is
      .replace(/\\([^{"])/g, '$1'); // Remove unnecessary escape characters (but preserve valid ones)
    
    // Strategy 2: Fix trailing commas and other syntax issues (conservative)
    // Only remove trailing commas if they're clearly trailing
    jsonString = jsonString.replace(/,(\s*[}\]])/g, '$1');
    
    // Strategy 3: Fix array formatting issues (only if clearly malformed)
    // Look for arrays that are missing commas between items
    const arrayPatterns = [
      /\[\s*"([^"]+)"\s*"([^"]+)"\s*\]/g, // 2-item arrays
      /\[\s*"([^"]+)"\s*"([^"]+)"\s*"([^"]+)"\s*\]/g, // 3-item arrays  
      /\[\s*"([^"]+)"\s*"([^"]+)"\s*"([^"]+)"\s*"([^"]+)"\s*\]/g, // 4-item arrays
      /\[\s*"([^"]+)"\s*"([^"]+)"\s*"([^"]+)"\s*"([^"]+)"\s*"([^"]+)"\s*\]/g // 5-item arrays
    ];
    
    for (const pattern of arrayPatterns) {
      if (pattern.test(jsonString)) {
        // Only apply this fix if we're confident it's a malformed array
        const match = jsonString.match(pattern);
        if (match) {
          const items = match.slice(1).filter(item => item && item.trim());
          const fixedArray = `[${items.map(item => `"${item}"`).join(', ')}]`;
          jsonString = jsonString.replace(pattern, fixedArray);
        }
      }
    }
    
    logger.debug(`[OPENROUTER] Cleaned JSON length: ${jsonString.length}`);
    
    let parsedResponse;
    try {
      logger.debug(`[OPENROUTER] Attempting initial JSON parse:`);
      logger.debug(`[OPENROUTER] First 200 chars:`, { chars: jsonString.substring(0, 200) });
      logger.debug(`[OPENROUTER] Last 200 chars:`, { chars: jsonString.substring(Math.max(0, jsonString.length - 200)) });
      
      parsedResponse = JSON.parse(jsonString);
      logger.debug(`[OPENROUTER] Successfully parsed initial JSON`);
    } catch (jsonError) {
      logger.error(`[OPENROUTER] JSON parsing failed`, { error: jsonError.message });
      logger.error(`[OPENROUTER] JSON at position ${jsonError.position}:`, { chars: jsonString.substring(Math.max(0, jsonError.position - 50), jsonError.position + 50) });
      
      // Log more context around the error
      const contextStart = Math.max(0, jsonError.position - 100);
      const contextEnd = Math.min(jsonString.length, jsonError.position + 100);
      logger.error(`[OPENROUTER] Full context around error:`, { chars: jsonString.substring(contextStart, contextEnd) });
      
      // Try multiple fallback strategies
      let cleanedJson = jsonString;
      
      // Strategy 1: Conservative fixes only
      cleanedJson = cleanedJson
        .replace(/\\'/g, "'") // Fix escaped single quotes only
        .replace(/\\n/g, '\\n') // Keep escaped newlines  
        .replace(/\\r/g, '\\r') // Keep escaped carriage returns
        .replace(/\\t/g, '\\t') // Keep escaped tabs
        .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // Remove control characters
        .replace(/[\uD800-\uDFFF]/g, '') // Remove surrogate pairs that can break JSON
        .replace(/\\([^{"])/g, '$1'); // Remove unnecessary escape characters (but preserve valid ones)
      
      // Strategy 2: Fix trailing commas (conservative)
      cleanedJson = cleanedJson.replace(/,(\s*[}\]])/g, '$1');
      
      // Strategy 3: Only fix arrays if we can detect clear patterns
      const arrayMatches = cleanedJson.match(/\[\s*"[^"]*"\s*"[^"]*"\s*\]/g);
      if (arrayMatches) {
        for (const match of arrayMatches) {
          const items = match.match(/"[^"]*"/g);
          if (items && items.length === 2) {
            cleanedJson = cleanedJson.replace(match, `[${items.join(', ')}]`);
          }
        }
      }
        
      // Strategy 3: Extract just the scenarios array
      const arrayMatch = cleanedJson.match(/\[.*\]/s);
      if (arrayMatch) {
        cleanedJson = arrayMatch[0];
        logger.debug(`[OPENROUTER] Extracted array match, length: ${cleanedJson.length}`);
      } else {
        logger.debug(`[OPENROUTER] No array match found in cleaned JSON`);
      }
      
      try {
        logger.debug(`[OPENROUTER] Attempting to parse cleaned JSON (length: ${cleanedJson.length}):`);
        logger.debug(`[OPENROUTER] First 200 chars:`, { chars: cleanedJson.substring(0, 200) });
        logger.debug(`[OPENROUTER] Last 200 chars:`, { chars: cleanedJson.substring(cleanedJson.length - 200) });
        
        parsedResponse = JSON.parse(cleanedJson);
        logger.debug(`[OPENROUTER] Successfully parsed after comprehensive cleaning`);
      } catch (cleanError2) {
        logger.error(`[OPENROUTER] Comprehensive cleaning failed`, { error: cleanError2.message });
        
        // Strategy 4: Retry with OpenRouter by sending the error and asking for correction
        logger.error(`[OPENROUTER] Attempting retry with OpenRouter feedback...`);
        
        try {
          const retryPrompt = `
The JSON response you provided has parsing errors. Please fix the JSON and return only valid JSON.

ERROR: ${cleanError2.message}
AT POSITION: ${cleanError2.position}
ORIGINAL RESPONSE: ${responseText}

Common issues to fix:
1. Ensure all property names are in double quotes
2. Ensure all string values are in double quotes  
3. Escape any quotes within string values with backslashes
4. Remove trailing commas after the last item in objects and arrays
5. Do not include any text before or after the JSON array
6. Ensure the JSON array contains exactly 4 scenario objects

Please provide the corrected JSON array of exactly 4 scenarios with proper JSON formatting. Return ONLY the JSON array, nothing else.
          `;
          
          // Add timeout to retry call as well
          const retryTimeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('OpenRouter retry request timed out after 60 seconds')), 60000);
          });
          
          const retryResult = await Promise.race([
            generateContentWithRetry(retryPrompt),
            retryTimeoutPromise
          ]);
          
          const retryResponseText = retryResult.response.text();
          logger.debug(`[OPENROUTER RETRY] Response from retry:`, { response: retryResponseText });
          
          // Extract JSON from retry response - SIMPLIFIED APPROACH
          let retryJsonString = retryResponseText;
          
          // Pattern 1: JSON wrapped in markdown code blocks
          const retryJsonMarkdownMatch = retryResponseText.match(/```json\n([\s\S]*?)\n```/);
          if (retryJsonMarkdownMatch && retryJsonMarkdownMatch[1]) {
            retryJsonString = retryJsonMarkdownMatch[1];
          } else {
            // Pattern 2: Plain JSON array starting with [
            const retryJsonArrayMatch = retryResponseText.match(/\[\s*\{[\s\S]*\}\s*\]/);
            if (retryJsonArrayMatch) {
              retryJsonString = retryJsonArrayMatch[0];
            } else {
              // Pattern 3: Try to find any JSON array in the response
              const retryAnyArrayMatch = retryResponseText.match(/\[.*\]/s);
              if (retryAnyArrayMatch) {
                retryJsonString = retryAnyArrayMatch[0];
              }
            }
          }
          
          parsedResponse = JSON.parse(retryJsonString);
          logger.debug(`[OPENROUTER] Successfully parsed after retry with OpenRouter feedback`);
          
        } catch (retryError) {
          logger.error(`[OPENROUTER] Retry with OpenRouter feedback failed`, { error: retryError.message });
          
          // Instead of creating fallback scenarios, throw an error
          logger.error(`[OPENROUTER] JSON parsing failed after all attempts - throwing error instead of fallback`);
          throw new Error(`Failed to generate scenarios: OpenRouter API returned invalid JSON after all retry attempts. Please try again.`);
        }
      }
      
      // Ensure parsedResponse is always defined
      if (!parsedResponse) {
        logger.error(`[OPENROUTER] parsedResponse is undefined - throwing error instead of fallback`);
        throw new Error(`Failed to generate scenarios: OpenRouter API returned no response. Please try again.`);
      }
    }
    
    if (!Array.isArray(parsedResponse)) {
      logger.error("Response is not an array:", { response: parsedResponse });
      logger.error("Throwing error instead of creating fallback scenarios");
      
      // Instead of creating fallback scenarios, throw an error
      throw new Error(`Failed to generate scenarios: OpenRouter API returned invalid response format. Please try again.`);
    }

    // Validate each scenario has required fields
    const validatedScenarios = parsedResponse.map((scenario: any, index) => {
      if (!scenario || typeof scenario !== 'object') {
        logger.warn(`[VALIDATION] Invalid scenario at index ${index}:`, { scenario });
        throw new Error(`Failed to generate scenarios: Invalid scenario data at index ${index}. Please try again.`);
      }

      // Ensure required fields exist
      return {
        id: scenario.id || crypto.randomUUID(),
        title: scenario.title || `Adventure ${index + 1}`,
        surrounding: scenario.surrounding || "An interesting setting.",
        objective: scenario.objective || "Complete the quest.",
        possibleEncounters: Array.isArray(scenario.possibleEncounters) ? scenario.possibleEncounters : [],
        possibleEnemies: Array.isArray(scenario.possibleEnemies) ? scenario.possibleEnemies : [],
        bossFight: scenario.bossFight || {
          name: "Unknown Boss",
          description: "A mysterious adversary."
        },
        mapDescription: scenario.mapDescription || "A generic map."
      };
    });

    // Ensure uniqueness based on title
    const titles = new Set<string>();
    const uniqueScenarios = validatedScenarios.filter(scenario => {
        const trimmedTitle = scenario.title.toLowerCase().trim();
        if (titles.has(trimmedTitle)) {
            logger.warn(`[OPENROUTER] Duplicate scenario title found, removing: "${scenario.title}"`);
            return false;
        }
        titles.add(trimmedTitle);
        return true;
    });

    let finalScenarios = uniqueScenarios;

    if (finalScenarios.length !== 4) {
      logger.warn(`AI returned ${finalScenarios.length} unique scenarios instead of 4. Throwing error instead of padding.`);
      throw new Error(`Failed to generate scenarios: OpenRouter API returned ${finalScenarios.length} scenarios instead of 4. Please try again.`);
    }

    // Store in cache before returning
    scenarioCache.set(cacheKey, {
      scenarios: finalScenarios,
      timestamp: Date.now()
    });
    console.log(`[OPENROUTER] Stored scenarios in cache for cache key: ${cacheKey.substring(0, 100)}...`);

    // Return the validated scenarios
    return finalScenarios.map((scenario: any) => {
      if (!scenario.id) {
        scenario.id = crypto.randomUUID();
      }
      if (!scenario.title) {
        scenario.title = "Unnamed Adventure";
      }
      if (!scenario.surrounding) {
        scenario.surrounding = "A mysterious location awaits...";
      }
      if (!scenario.objective) {
        scenario.objective = "Begin your adventure here.";
      }
      if (!scenario.possibleEncounters) {
        scenario.possibleEncounters = [];
      }
      if (!scenario.possibleEnemies) {
        scenario.possibleEnemies = [];
      }
      return scenario as AdventureScenario;
    });
  } catch (error: unknown) {
    logger.error("Error calling OpenRouter API or parsing scenario response", { error: error instanceof Error ? error.message : "Unknown error" });
    
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : 'No stack trace available';
    const errorName = error instanceof Error ? error.name : 'UnknownError';
    
    logger.error("Error details:", {
      message: errorMessage,
      stack: errorStack,
      name: errorName
    });
    
    // If it's a timeout error, provide specific guidance
    if (errorMessage.includes('timed out')) {
      logger.error("[OPENROUTER] Request timed out - this may indicate high server load or network issues");
      throw new Error('OpenRouter API request timed out. Please try again.');
    }
    
    // Check for quota-related errors and throw error instead of using fallback scenarios
    if (errorMessage && (errorMessage.includes('429 Too Many Requests') || 
                         errorMessage.includes('quota') || 
                         errorMessage.includes('Quota exceeded') ||
                         errorMessage.includes('OpenRouter API failed after'))) {
      logger.warn("[OPENROUTER] Quota or API limit reached - throwing error instead of generating fallback scenarios");
      throw new Error('OpenRouter API quota exceeded. Please try again later.');
    }
    
    // Throw a specific error that can be caught by the action handler
    throw new Error(`Failed to generate adventure scenarios: ${errorMessage}`);
  }
}

// Placeholder functions for image generation (not implemented for OpenRouter)
export async function generateMapImage(scenario: AdventureScenario): Promise<string> {
  throw new Error('Map image generation is not implemented for OpenRouter');
}

export async function generateCharacterPawn(character: Character): Promise<string> {
  throw new Error('Character pawn generation is not implemented for OpenRouter');
}

export async function generateCharacterPortrait(character: Character): Promise<string> {
  throw new Error('Character portrait generation is not implemented for OpenRouter');
}

// Placeholder functions for other AI features (not implemented for OpenRouter)
export async function parseCharacterDescription(text: string, context: any = {}) {
  throw new Error('Character description parsing is not implemented for OpenRouter');
}

export async function continueAdventure(messages: { role: 'user' | 'model', text: string }[], party: Character[], scenario: AdventureScenario): Promise<string> {
  throw new Error('Adventure continuation is not implemented for OpenRouter');
}

export async function generateCharacterFeatures(characterClass: string, characterRace: string, characterBackground: string): Promise<string[]> {
  throw new Error('Character features generation is not implemented for OpenRouter');
}

export async function generateCharacterPersonality(characterClass: string, characterRace: string, characterBackground: string): Promise<{ trait: string; ideal: string; bond: string; flaw: string }> {
  throw new Error('Character personality generation is not implemented for OpenRouter');
}
