import { GoogleGenerativeAI } from '@google/generative-ai';
import { json } from '@remix-run/node';
import type { Character, AdventureScenario, BossFight, PlayerSlot } from '~/types'; // Import BossFight type
import { generateImage as generateImageWithFreepik } from '~/services/freepik.server'; // Import Freepik service

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
  throw new Error('GEMINI_API_KEY environment variable not set.');
}

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// Try different models in order of preference to handle quota issues
// Note: gemini-1.5-flash is not available in v1beta, so we only use the available models
const MODEL_PREFERENCES = [
  'gemini-2.5-flash-preview-09-2025',  // Primary model, as requested by user
  'gemini-2.0-flash'     // Fallback model, as requested by user
];

// Cache for storing recently generated scenarios to avoid duplicate API calls
const scenarioCache = new Map<string, { scenarios: any[], timestamp: number }>();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour cache

function getModel() {
  return genAI.getGenerativeModel({ model: MODEL_PREFERENCES[0] });
}

// Enhanced generateContent with retry logic and model fallback
async function generateContentWithRetry(prompt: string, maxRetries: number = 3): Promise<any> {
  let lastError = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    for (const modelPreference of MODEL_PREFERENCES) {
      try {
        const model = genAI.getGenerativeModel({ model: modelPreference });
        console.log(`[GEMINI] Attempting to generate content with model: ${modelPreference} (attempt ${attempt}/${maxRetries})`);
        
        const result = await model.generateContent(prompt);
        console.log(`[GEMINI] Successfully generated content with model: ${modelPreference}`);
        return result;
        
      } catch (error: any) {
        lastError = error;
        console.error(`[GEMINI] Error with model ${modelPreference} (attempt ${attempt}):`, error.message);
        
        // Check if this is a quota error
        if (error.message && error.message.includes('429 Too Many Requests')) {
          console.warn(`[GEMINI] Quota exceeded for model ${modelPreference}, trying next model...`);
          continue; // Try next model
        }
        
        // Check if this is a model not found error
        if (error.message && (error.message.includes('404 Not Found') || error.message.includes('not found for API version'))) {
          console.warn(`[GEMINI] Model ${modelPreference} not found or unavailable, trying next model...`);
          continue; // Try next model
        }
        
        // For other errors, break and try next attempt
        break;
      }
    }
    
    // If we've tried all models and none worked, wait before retrying
    if (attempt < maxRetries) {
      const delay = Math.pow(2, attempt) * 1000; // Exponential backoff: 2s, 4s, 8s
      console.log(`[GEMINI] Waiting ${delay}ms before retry ${attempt + 1}...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  // If all retries failed, throw the last error with additional context
  throw new Error(`Gemini API failed after ${maxRetries} attempts with all models. Last error: ${lastError?.message || 'Unknown error'}`);
}

// Fallback scenario generator for when API fails
function generateFallbackScenarios(character: Character, duration: string, partyContext: string = ''): AdventureScenario[] {
  console.log('[GEMINI] Generating fallback scenarios due to API failure');
  
  const scenarios: AdventureScenario[] = [];
  const themes = [
    { title: 'The Cursed Relic', environment: 'ancient ruins', objective: 'retrieve a cursed artifact', enemies: ['Skeletal Warriors', 'Shadow Wraiths'] },
    { title: 'Forest of Whispers', environment: 'enchanted forest', objective: 'investigate mysterious disappearances', enemies: ['Corrupted Dryads', 'Giant Spiders'] },
    { title: 'Tomb of the Forgotten King', environment: 'underground crypt', objective: 'uncover ancient secrets', enemies: ['Mummified Guards', 'Spectral Sentinels'] },
    { title: 'Siege of Brightwatch', environment: 'fortified town', objective: 'defend against invading forces', enemies: ['Orc Raiders', 'Goblin Sappers'] }
  ];
  
  for (let i = 0; i < 4; i++) {
    const theme = themes[i];
    scenarios.push({
      id: `fallback-${Date.now()}-${i}`,
      title: theme.title,
      surrounding: `The ${theme.environment} looms before you, filled with an eerie silence. The air is thick with anticipation as you prepare to ${theme.objective}.`,
      objective: `A local ${character.race} has hired you to ${theme.objective}. Time is of the essence!`,
      possibleEncounters: [
        `Navigating treacherous terrain in the ${theme.environment}`,
        `Encountering mysterious clues about the ${theme.title}`,
        `Solving ancient puzzles left by forgotten civilizations`
      ],
      possibleEnemies: theme.enemies,
      bossFight: {
        name: `${theme.title} Guardian`,
        description: `A powerful entity that protects the secrets of the ${theme.title}. Only the worthy may pass.`
      },
      mapDescription: `A detailed 1080p map of ${theme.environment} with key locations marked. Player characters start at the entrance, ready to explore.`
    });
  }
  
  return scenarios;
}

// Utility function to clean text by removing emojis and excessive whitespace
function cleanText(text: string): string {
  const emojiRegex = /(\u00a9|\u00ae|[\u2000-\u3300]|\ud83c[\ud000-\udfff]|\ud83d[\ud000-\udfff]|\ud83e[\ud000-\udfff])/g;
  let cleaned = text.replace(emojiRegex, '');
  cleaned = cleaned.replace(/(\r\n|\r|\n){2,}/g, '\n\n');
  cleaned = cleaned.replace(/[ \t]+/g, ' ');
  return cleaned.trim();
}

export async function generateScenariosForCharacter(character: Character, duration: string, regenerationPrompt?: string, partyCharacters?: Character[], partySlots?: PlayerSlot[]): Promise<AdventureScenario[]> {

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

  const prompt = `
  You are an expert Dungeons & Dragons 5th Edition Dungeon Master AI, renowned for crafting innovative and engaging adventures. Your task is to generate exactly 4 distinct, compelling, and highly dynamic starting adventure scenarios for a D&D 5th Edition game.

  CRITICAL REQUIREMENT: All 4 scenarios must be fundamentally different from each other in terms of plot hook, pacing, environment, and core conflict. Each scenario must have a unique title, a unique and highly evocative surrounding environment description, and a unique primary objective. Do not repeat themes, titles, locations, or core mechanics across the scenarios. Ensure the surrounding descriptions are rich in sensory details and atmosphere, making each one distinct.
  Aim for a balance of combat, exploration, social interaction, and potential moral dilemmas across the set of scenarios.

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
      setTimeout(() => reject(new Error('Gemini API request timed out after 30 seconds')), 30000);
    });
    
    const result = await Promise.race([
      generateContentWithRetry(prompt),
      timeoutPromise
    ]);
    
    const responseText = result.response.text();
    console.log("Gemini Scenario Response:", responseText);

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

    console.log(`[GEMINI] Using extraction method: ${extractionMethod}`);
    console.log(`[GEMINI] Extracted JSON length: ${jsonString.length}`);
    console.log(`[GEMINI] First 200 chars of extracted JSON:`, jsonString.substring(0, 200));
    
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
    
    console.log(`[GEMINI] Cleaned JSON length: ${jsonString.length}`);
    
    let parsedResponse;
    try {
      console.log(`[GEMINI] Attempting initial JSON parse:`);
      console.log(`[GEMINI] First 200 chars:`, jsonString.substring(0, 200));
      console.log(`[GEMINI] Last 200 chars:`, jsonString.substring(Math.max(0, jsonString.length - 200)));
      
      parsedResponse = JSON.parse(jsonString);
      console.log(`[GEMINI] Successfully parsed initial JSON`);
    } catch (jsonError) {
      console.error(`[GEMINI] JSON parsing failed:`, jsonError.message);
      console.error(`[GEMINI] JSON at position ${jsonError.position}:`, jsonString.substring(Math.max(0, jsonError.position - 50), jsonError.position + 50));
      
      // Log more context around the error
      const contextStart = Math.max(0, jsonError.position - 100);
      const contextEnd = Math.min(jsonString.length, jsonError.position + 100);
      console.error(`[GEMINI] Full context around error:`, jsonString.substring(contextStart, contextEnd));
      
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
        console.log(`[GEMINI] Extracted array match, length: ${cleanedJson.length}`);
      } else {
        console.log(`[GEMINI] No array match found in cleaned JSON`);
      }
      
      try {
        console.log(`[GEMINI] Attempting to parse cleaned JSON (length: ${cleanedJson.length}):`);
        console.log(`[GEMINI] First 200 chars:`, cleanedJson.substring(0, 200));
        console.log(`[GEMINI] Last 200 chars:`, cleanedJson.substring(cleanedJson.length - 200));
        
        parsedResponse = JSON.parse(cleanedJson);
        console.log(`[GEMINI] Successfully parsed after comprehensive cleaning`);
      } catch (cleanError2) {
        console.error(`[GEMINI] Comprehensive cleaning failed:`, cleanError2.message);
        
        // Strategy 4: Retry with Gemini by sending the error and asking for correction
        console.error(`[GEMINI] Attempting retry with Gemini feedback...`);
        
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
            setTimeout(() => reject(new Error('Gemini retry request timed out after 20 seconds')), 20000);
          });
          
          const retryResult = await Promise.race([
            generateContentWithRetry(retryPrompt),
            retryTimeoutPromise
          ]);
          
          const retryResponseText = retryResult.response.text();
          console.log(`[GEMINI RETRY] Response from retry:`, retryResponseText);
          
          // Extract JSON from retry response
          let retryJsonString = retryResponseText;
          const retryJsonMatch = retryResponseText.match(/```json\n([\s\S]*?)\n```/) || retryResponseText.match(/\[\s*\{[\s\S]*\}\s*\]/);
          if (retryJsonMatch && retryJsonMatch[1]) {
            retryJsonString = retryJsonMatch[1];
          } else if (retryJsonMatch) {
            retryJsonString = retryJsonMatch[0];
          }
          
          parsedResponse = JSON.parse(retryJsonString);
          console.log(`[GEMINI] Successfully parsed after retry with Gemini feedback`);
          
        } catch (retryError) {
          console.error(`[GEMINI] Retry with Gemini feedback failed:`, retryError.message);
          
          // Strategy 5: Create fallback scenarios manually
          console.error(`[GEMINI] Creating fallback scenarios due to parsing failure`);
          parsedResponse = [
          {
            id: crypto.randomUUID(),
            title: "The Mysterious Adventure",
            surrounding: "A mysterious land filled with danger and wonder.",
            objective: "Explore the unknown and discover its secrets.",
            possibleEncounters: ["Meeting strange creatures", "Solving ancient puzzles"],
            possibleEnemies: ["Mysterious monsters"],
            bossFight: {
              name: "The Guardian",
              description: "A powerful being protecting the land's secrets."
            },
            mapDescription: "A simple map with a few key locations."
          },
          {
            id: crypto.randomUUID(),
            title: "The Ancient Ruins",
            surrounding: "Crumbled ruins hinting at a forgotten civilization.",
            objective: "Uncover the truth behind the ancient culture.",
            possibleEncounters: ["Exploring hidden chambers", "Deciphering old texts"],
            possibleEnemies: ["Guardian constructs"],
            bossFight: {
              name: "The Last Guardian",
              description: "An ancient protector of the ruins."
            },
            mapDescription: "Ruins with various chambers and hidden passages."
          },
          {
            id: crypto.randomUUID(),
            title: "The Enchanted Forest",
            surrounding: "A magical forest teeming with life and mystery.",
            objective: "Navigate the forest and meet its magical inhabitants.",
            possibleEncounters: ["Meeting forest creatures", "Finding hidden glades"],
            possibleEnemies: ["Forest predators"],
            bossFight: {
              name: "The Forest Spirit",
              description: "A powerful entity embodying the forest's magic."
            },
            mapDescription: "A forest map with clearings and magical sites."
          },
          {
            id: crypto.randomUUID(),
            title: "The Dark Dungeon",
            surrounding: "A foreboding dungeon filled with traps and monsters.",
            objective: "Survive the dungeon and claim its treasure.",
            possibleEncounters: ["Disarming traps", "Fighting monsters"],
            possibleEnemies: ["Dungeon denizens"],
            bossFight: {
              name: "The Dungeon Master",
              description: "A cunning master of the dungeon's dangers."
            },
            mapDescription: "A dungeon map with rooms and treasure locations."
          }
        ];
        console.log(`[GEMINI] Created 4 fallback scenarios`);
        }
      }
      
      // Ensure parsedResponse is always defined
      if (!parsedResponse) {
        console.error(`[GEMINI] parsedResponse is undefined, creating fallback scenarios`);
        parsedResponse = [
          {
            id: crypto.randomUUID(),
            title: "The Mysterious Adventure",
            surrounding: "A mysterious land filled with danger and wonder.",
            objective: "Explore the unknown and discover its secrets.",
            possibleEncounters: ["Meeting strange creatures", "Solving ancient puzzles"],
            possibleEnemies: ["Mysterious monsters"],
            bossFight: {
              name: "The Guardian",
              description: "A powerful being protecting the land's secrets."
            },
            mapDescription: "A simple map with a few key locations."
          },
          {
            id: crypto.randomUUID(),
            title: "The Ancient Ruins",
            surrounding: "Crumbled ruins hinting at a forgotten civilization.",
            objective: "Uncover the truth behind the ancient culture.",
            possibleEncounters: ["Exploring hidden chambers", "Deciphering old texts"],
            possibleEnemies: ["Guardian constructs"],
            bossFight: {
              name: "The Last Guardian",
              description: "An ancient protector of the ruins."
            },
            mapDescription: "Ruins with various chambers and hidden passages."
          },
          {
            id: crypto.randomUUID(),
            title: "The Enchanted Forest",
            surrounding: "A magical forest teeming with life and mystery.",
            objective: "Navigate the forest and meet its magical inhabitants.",
            possibleEncounters: ["Meeting forest creatures", "Finding hidden glades"],
            possibleEnemies: ["Forest predators"],
            bossFight: {
              name: "The Forest Spirit",
              description: "A powerful entity embodying the forest's magic."
            },
            mapDescription: "A forest map with clearings and magical sites."
          },
          {
            id: crypto.randomUUID(),
            title: "The Dark Dungeon",
            surrounding: "A foreboding dungeon filled with traps and monsters.",
            objective: "Survive the dungeon and claim its treasure.",
            possibleEncounters: ["Disarming traps", "Fighting monsters"],
            possibleEnemies: ["Dungeon denizens"],
            bossFight: {
              name: "The Dungeon Master",
              description: "A cunning master of the dungeon's dangers."
            },
            mapDescription: "A dungeon map with rooms and treasure locations."
          }
        ];
      }
    }
    
    if (!Array.isArray(parsedResponse)) {
      console.error("Response is not an array:", parsedResponse);
      console.error("Creating fallback scenarios due to invalid response format");
      
      // Create fallback scenarios
      parsedResponse = [
        {
          id: crypto.randomUUID(),
          title: "The Mysterious Adventure",
          surrounding: "A mysterious land filled with danger and wonder.",
          objective: "Explore the unknown and discover its secrets.",
          possibleEncounters: ["Meeting strange creatures", "Solving ancient puzzles"],
          possibleEnemies: ["Mysterious monsters"],
          bossFight: {
            name: "The Guardian",
            description: "A powerful being protecting the land's secrets."
          },
          mapDescription: "A simple map with a few key locations."
        },
        {
          id: crypto.randomUUID(),
          title: "The Ancient Ruins",
          surrounding: "Crumbled ruins hinting at a forgotten civilization.",
          objective: "Uncover the truth behind the ancient culture.",
          possibleEncounters: ["Exploring hidden chambers", "Deciphering old texts"],
          possibleEnemies: ["Guardian constructs"],
          bossFight: {
            name: "The Last Guardian",
            description: "An ancient protector of the ruins."
          },
          mapDescription: "Ruins with various chambers and hidden passages."
        },
        {
          id: crypto.randomUUID(),
          title: "The Enchanted Forest",
          surrounding: "A magical forest teeming with life and mystery.",
          objective: "Navigate the forest and meet its magical inhabitants.",
          possibleEncounters: ["Meeting forest creatures", "Finding hidden glades"],
          possibleEnemies: ["Forest predators"],
          bossFight: {
            name: "The Forest Spirit",
            description: "A powerful entity embodying the forest's magic."
          },
          mapDescription: "A forest map with clearings and magical sites."
        },
        {
          id: crypto.randomUUID(),
          title: "The Dark Dungeon",
          surrounding: "A foreboding dungeon filled with traps and monsters.",
          objective: "Survive the dungeon and claim its treasure.",
          possibleEncounters: ["Disarming traps", "Fighting monsters"],
          possibleEnemies: ["Dungeon denizens"],
          bossFight: {
            name: "The Dungeon Master",
            description: "A cunning master of the dungeon's dangers."
          },
          mapDescription: "A dungeon map with rooms and treasure locations."
        }
      ];
    }

    // Validate each scenario has required fields
    const validatedScenarios = parsedResponse.map((scenario: any, index) => {
      if (!scenario || typeof scenario !== 'object') {
        console.warn(`[VALIDATION] Invalid scenario at index ${index}:`, scenario);
        return {
          id: crypto.randomUUID(),
          title: `Fallback Scenario ${index + 1}`,
          surrounding: "A mysterious adventure awaits.",
          objective: "Explore and discover what lies ahead.",
          possibleEncounters: ["Basic encounters"],
          possibleEnemies: ["Common foes"],
          bossFight: {
            name: "The Guardian",
            description: "A standard guardian of the realm."
          },
          mapDescription: "A basic adventure map."
        };
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

    if (validatedScenarios.length !== 4) {
      console.warn(`AI returned ${validatedScenarios.length} scenarios instead of 4. Padding or trimming as needed.`);
      // If less than 4, pad with fallback scenarios
      while (validatedScenarios.length < 4) {
        validatedScenarios.push({
          id: crypto.randomUUID(),
          title: `Additional Adventure ${validatedScenarios.length + 1}`,
          surrounding: "Another exciting location.",
          objective: "Another quest to complete.",
          possibleEncounters: ["Extra encounters"],
          possibleEnemies: ["Additional foes"],
          bossFight: {
            name: "Extra Boss",
            description: "An additional challenge."
          },
          mapDescription: "Another adventure map."
        });
      }
      // If more than 4, trim to 4
      validatedScenarios.length = 4;
    }

    // Return the validated scenarios
    return validatedScenarios.map((scenario: any) => {
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
    console.error("Error calling Gemini API or parsing scenario response:", error);
    
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : 'No stack trace available';
    const errorName = error instanceof Error ? error.name : 'UnknownError';
    
    console.error("Error details:", {
      message: errorMessage,
      stack: errorStack,
      name: errorName
    });
    
    // If it's a timeout error, provide specific guidance
    if (errorMessage.includes('timed out')) {
      console.error("[GEMINI] Request timed out - this may indicate high server load or network issues");
    }
    
    // Check for quota-related errors and use fallback scenarios
    if (errorMessage && (errorMessage.includes('429 Too Many Requests') || 
                         errorMessage.includes('quota') || 
                         errorMessage.includes('Quota exceeded') ||
                         errorMessage.includes('Gemini API failed after'))) {
      console.warn("[GEMINI] Quota or API limit reached, generating fallback scenarios");
      
      // Generate fallback scenarios
      const fallbackScenarios = generateFallbackScenarios(character, duration, regenerationPrompt);
      
      // Cache the fallback scenarios to avoid repeated API calls
      const cacheKey = JSON.stringify({
        characterId: character.id,
        duration,
        regenerationPrompt: regenerationPrompt?.trim(),
        partySize: partyCharacters?.length || 0
      });
      
      scenarioCache.set(cacheKey, {
        scenarios: fallbackScenarios,
        timestamp: Date.now()
      });
      
      return fallbackScenarios;
    }
    
    // Throw a specific error that can be caught by the action handler
    throw new Error(`Failed to generate adventure scenarios: ${errorMessage}`);
  }
}

export async function generateMapImage(scenario: AdventureScenario): Promise<string> {
  const positivePrompt = `
    "fantasy map," "cartography," "tabletop RPG," "parchment texture," "top-down view," "satellite view,"
    Scenario: ${scenario.title}.
    Environment: ${scenario.surrounding}.
    Objective: ${scenario.objective}.
    Map Details: ${scenario.mapDescription}.
    high detailed multiple places. surrounding towns and buildings, highlight the map locations start point and objective located in the map with guide.
  `;

  try {
    const base64Image = await generateImageWithFreepik(positivePrompt, 'landscape_16_9');
    console.log("Map image generation completed successfully.");
    return base64Image;
  } catch (error) {
    console.error("Error generating map image with Freepik:", error);
    throw new Error(`Failed to generate map image: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function generateCharacterPawn(character: Character): Promise<string> {
  const characterDescription = `A Dungeons & Dragons character, 3D render, middle-body statue style, front-facing portrait, highly detailed. 
  Race: ${character.race}. Class: ${character.class}. 
  ${character.appearance ? `Appearance: ${character.appearance}.` : ''}
  Consider their armor: ${character.armor || 'standard'}, and weapons: ${character.weapons?.primary?.name || 'none'}.`;

  const positivePrompt = `
    "fantasy character," "RPG pawn," "3D statue render," "middle-body shot," "front view," "high detail," "unreal engine," "octane render,"
    Character: ${characterDescription}.
    Detailed background features.
  `;

  try {
    console.log("Generating character pawn for:", character.name);
    const base64Image = await generateImageWithFreepik(positivePrompt, 'square_1_1'); // Assuming square for pawns as well
    console.log("Character pawn generation completed successfully.");
    return base64Image;
  } catch (error) {
    console.error("Error generating character pawn with Freepik:", error);
    throw new Error(`Failed to generate character pawn: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function generateCharacterPortrait(character: Character): Promise<string> {
  const characterDescription = `A Dungeons & Dragons character portrait, 2D digital art, front-facing bust shot, direct eye contact, highly detailed fantasy illustration.

Character Details:
- Race: ${character.race}, Class: ${character.class}, Level: ${character.level}
- Alignment: ${character.alignment}, Background: ${character.background}
- Appearance: ${character.appearance || 'No specific appearance details'}
- Armor & Equipment: ${character.armor || 'standard'}${character.equipment && character.equipment.length > 0 ? `, ${character.equipment.join(', ')}` : ''}
- Weapons: Primary: ${character.weapons?.primary?.name || 'none'}, Secondary: ${character.weapons?.secondary?.name || 'none'}, Ranged: ${character.weapons?.ranged?.name || 'none'}
- Personality: Trait: ${character.personality?.trait || 'none'}, Ideal: ${character.personality?.ideal || 'none'}, Bond: ${character.personality?.bond || 'none'}, Flaw: ${character.personality?.flaw || 'none'}
- Visual Style: ${character.class} with ${character.class === 'Wizard' ? 'arcane symbols and magical aura' : character.class === 'Cleric' ? 'holy symbol and divine light' : character.class === 'Rogue' ? 'stealthy clothing and daggers' : character.class === 'Fighter' ? 'battle-worn armor and weapons' : 'class-appropriate visual elements'}

Art Direction: Professional fantasy character portrait, neutral expression, detailed facial features, vibrant colors, dramatic lighting, parchment background texture.`;

  const positivePrompt = `
    "fantasy character portrait," "RPG avatar," "2D digital art," "bust shot," "front view," "high detail," "fantasy illustration," "concept art,"
    Character: ${characterDescription}.
    Neutral expression, direct eye contact, detailed lighting, vibrant colors, dramatic composition.
  `;

  try {
    console.log("Generating character portrait for:", character.name);
    const base64Image = await generateImageWithFreepik(positivePrompt, 'square_1_1');
    console.log("Character portrait generation completed successfully.");
    return base64Image;
  } catch (error) {
    console.error("Error generating character portrait with Freepik:", error);
    throw new Error(`Failed to generate character portrait: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function parseCharacterDescription(text: string, context: any = {}) {
  const cleanedText = cleanText(text);

  const prompt = `
  You are a Dungeon Master AI. Your task is to parse a Dungeons & Dragons 5th Edition character description and extract key information into a structured JSON format.
  If you need more information to complete the character, ask specific questions.

  Here's the character description:
  "${cleanedText}"

  ${context.partialCharacter ? `Current partial character data: ${JSON.stringify(context.partialCharacter)}\n` : ''}
  ${context.answers ? `User provided answers: ${JSON.stringify(context.answers)}\n` : ''}

  Follow these rules:
  1. Extract the following fields into a JSON object. If a field is not explicitly mentioned, use a reasonable default or leave it undefined if it's optional.
     - id (string, generate a UUID if not present, but for parsing, don't generate, just extract if given)
     - name (string)
     - race (string)
     - class (string)
     - level (number)
     - experience (number, default 0 if not specified)
     - alignment (string, e.g., "Lawful Good", "Chaotic Neutral")
     - background (string)
     - speed (number, in feet, extract only the number)
     - hitDice (string, e.g., "1d8", "3d8", "d10 / d6")
     - hp (number, extract only the number from "X HP")
     - maxHp (number, assume hp is maxHp if only one is given)
     - proficiencyBonus (number, extract only the number from "+X")
     - stats: { strength, dexterity, constitution, intelligence, wisdom, charisma } (all numbers)
     - primaryAttribute (string, e.g., "Strength", "Charisma")
     - secondaryAttribute (string, e.g., "Constitution", "Dexterity")
     - armor (string, e.g., "Leather", "Chain Mail")
     - fightStyle (string, e.g., "Dueling", "Defense")
     - ac (number, extract total AC)
     - initiative (number, extract only the number from "+X")
     - passivePerception (number)
     - savingThrows (array of strings, e.g., ["Strength", "Dexterity"], extract only the attribute name)
     - skills (array of strings, e.g., ["Acrobatics", "Stealth"])
     - weapons: { primary: Weapon, secondary?: Weapon, ranged?: Weapon }
       - Weapon: { name: string, attackBonus: string, damage: string, damageAttribute: string, special?: string }
       - If multiple weapons are listed, try to categorize them into primary, secondary, ranged. If only one, make it primary.
       - For "Arcane Focus", treat it as an equipment item, not a weapon.
     - equipment (array of strings, utility items, include "Arcane Focus" here)
     - spells: { cantrips: string[], level1: string[], level2: string[] }
       - Extract spell names and their brief descriptions.
     - spellSlots: { level1: { current: number; max: number }; level2: { current: number; max: number } }
       - Extract current and max slots from the text (e.g., "3 slots" means current: 3, max: 3).
     - spellcastingAbility (string, e.g., "Charisma")
     - spellSaveDC (number)
     - spellAttackBonus (string, e.g., "+5")
     - features (array of strings, Features & Traits, extract name and description)
     - inventory (array of strings, specific items, list each item separately)
     - personality: { trait: string, ideal: string, bond: string, flaw: string }
     - appearance (string)

  2. If you have enough information to fully parse the character, return a JSON object with \`status: "complete"\` and the \`character\` object.
  3. If you need more information, return a JSON object with \`status: "incomplete"\`, a \`partialCharacter\` object containing what you've parsed so far, and an array of \`questions\` (strings) asking for the missing details.
  4. If the input is completely unparseable or nonsensical, return \`status: "error"\` and a \`message\`.
  5. Ensure all numbers are parsed as actual numbers, not strings.
  6. For arrays (savingThrows, skills, equipment, cantrips, level1, level2, features, inventory), ensure they are arrays of strings.
  7. For weapons, ensure the structure matches the \`Weapon\` type.
  8. Be flexible with input format, but prioritize structured sections.
  9. Always respond with a single JSON object. Do not include any other text or markdown outside the JSON.
  10. For any field that is a number but the text provides a modifier (e.g., "+2"), extract only the numerical value.
  11. For spell slots, if only "X slots" is given, assume current and max are both X.
  12. For HP, if only "X HP" is given, assume both hp and maxHp are X.
  13. For "Arcane Focus", it should be in the \`equipment\` array, not \`weapons\`.
  `;

  try {
    const result = await generateContentWithRetry(prompt, 2); // Use fewer retries for character generation
    const responseText = result.response.text();
    console.log("Gemini Raw Response:", responseText);

    const jsonMatch = responseText.match(/```json\n([\s\S]*?)\n```/);
    let jsonString = responseText;
    if (jsonMatch && jsonMatch[1]) {
      jsonString = jsonMatch[1];
    }

    const parsedResponse = JSON.parse(jsonString);
    return parsedResponse;
  } catch (error) {
    console.error("Error calling Gemini API or parsing response:", error);
    throw new Error('Failed to process character description with AI.');
  }
}

export async function continueAdventure(messages: { role: 'user' | 'model', text: string }[], party: Character[], scenario: AdventureScenario): Promise<string> {
  const history = messages.map(msg => ({
    role: msg.role,
    parts: [{ text: msg.text }]
  }));

  const currentUserInput = history.pop();
  if (!currentUserInput || currentUserInput.role !== 'user') {
    throw new Error("Last message must be from the user.");
  }

  // Extract relevant character data for the AI
  const partyDetails = party.map(char => {
    const relevantSkills = char.skills?.slice(0, 3).join(', ') || 'none'; // Top 3 skills
    const relevantEquipment = char.equipment?.slice(0, 3).join(', ') || 'none'; // Top 3 equipment
    const primaryWeapon = char.weapons?.primary?.name || 'unarmed';
    const primaryStats = `STR:${char.stats?.strength || 10} DEX:${char.stats?.dexterity || 10} CON:${char.stats?.constitution || 10} INT:${char.stats?.intelligence || 10} WIS:${char.stats?.wisdom || 10} CHA:${char.stats?.charisma || 10}`;

    return `
    - ${char.name} (${char.race} ${char.class}, Level ${char.level})
      HP: ${char.hp}/${char.maxHp}, AC: ${char.ac}
      Stats: ${primaryStats}
      Skills: ${relevantSkills}
      Equipment: ${relevantEquipment}
      Weapon: ${primaryWeapon}
      Personality Trait: ${char.personality?.trait || 'N/A'}
    `;
  }).join('\n');

  const chat = model.startChat({
    history: history,
    generationConfig: {
      maxOutputTokens: 1000,
    },
  });

  const prompt = `
  You are an expert Dungeon Master AI. Continue the D&D adventure based on the user's last action and the provided party information.
  Your responses should be descriptive, engaging, and in character as a Dungeon Master. Describe the consequences of the player's actions, introduce new challenges, and provide information relevant to the scene. Always end your turn with a question or a clear prompt for the players' next action.

  Current Scenario:
  Title: ${scenario.title}
  Environment: ${scenario.surrounding}
  Objective: ${scenario.objective}

  Current Party:
  ${partyDetails}

  Player's Action: "${currentUserInput.parts[0].text}"

  What happens next? Describe the scene and present the party with their next challenge or decision.
  `;

  const result = await chat.sendMessage(prompt);
  const response = result.response;
  return response.text();
}


export async function generateCharacterFeatures(characterClass: string, characterRace: string, characterBackground: string): Promise<string[]> {
  try {
    const result = await generateContentWithRetry(`Generate a D&D character features for a ${characterClass} ${characterRace} with a ${characterBackground} background. List the features in bullet points.`, 2);
    const responseText = result.response.text();
    console.log("Gemini Raw Response:", responseText);

    // Parse the response
    const lines = responseText.split('\n');
    const features: string[] = [];
    let inFeaturesSection = false;

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (trimmedLine.toLowerCase().includes('features')) {
        inFeaturesSection = true;
        continue;
      }
      if (inFeaturesSection && trimmedLine.startsWith('-')) {
        features.push(trimmedLine.substring(1).trim());
      }
    }

    console.log("Parsed Features:", features);
    return features;
  } catch (error) {
    console.error("Error generating character features:", error);
    throw error;
  }
}

export async function generateCharacterPersonality(characterClass: string, characterRace: string, characterBackground: string): Promise<{ trait: string; ideal: string; bond: string; flaw: string }> {
  try {
    const result = await generateContentWithRetry(`Generate a D&D character personality for a ${characterClass} ${characterRace} with a ${characterBackground} background. Include a trait, ideal, bond, and flaw. Format the response as: Trait: [text] Ideal: [text] Bond: [text] Flaw: [text]`, 2);
    const responseText = result.response.text();
    console.log("Gemini Raw Response:", responseText);

    // Parse the response
    const lines = responseText.split('\n');
    const personality = { trait: '', ideal: '', bond: '', flaw: '' };

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (trimmedLine.toLowerCase().startsWith('trait:')) {
        personality.trait = trimmedLine.substring(6).trim();
      } else if (trimmedLine.toLowerCase().startsWith('ideal:')) {
        personality.ideal = trimmedLine.substring(6).trim();
      } else if (trimmedLine.toLowerCase().startsWith('bond:')) {
        personality.bond = trimmedLine.substring(5).trim();
      } else if (trimmedLine.toLowerCase().startsWith('flaw:')) {
        personality.flaw = trimmedLine.substring(5).trim();
      }
    }

    console.log("Parsed Personality:", personality);
    return personality;
  } catch (error) {
    console.error("Error generating character personality:", error);
    throw error;
  }
}
