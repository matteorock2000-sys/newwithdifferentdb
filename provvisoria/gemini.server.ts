import { GoogleGenerativeAI } from '@google/generative-ai';
import { json } from '@remix-run/node';
import type { Character, AdventureScenario, BossFight } from '~/types'; // Import BossFight type

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
  throw new Error('GEMINI_API_KEY environment variable not set.');
}

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

// Utility function to clean text by removing emojis and excessive whitespace
function cleanText(text: string): string {
  const emojiRegex = /(\u00a9|\u00ae|[\u2000-\u3300]|\ud83c[\ud000-\udfff]|\ud83d[\ud000-\udfff]|\ud83e[\ud000-\udfff])/g;
  let cleaned = text.replace(emojiRegex, '');
  cleaned = cleaned.replace(/(\r\n|\r|\n){2,}/g, '\n\n');
  cleaned = cleaned.replace(/[ \t]+/g, ' ');
  return cleaned.trim();
}

import { logger } from "~/utils/logger";

export async function generateScenariosForCharacter(character: Character, duration: string, regenerationPrompt?: string): Promise<AdventureScenario[]> {

  const regenerationContext = regenerationPrompt && regenerationPrompt.trim()
    ? `\n\nCRITICAL CONTEXT: The user has requested that these scenarios focus on the following theme: "${regenerationPrompt.trim()}". Incorporate this theme into all four scenarios.`
    : '';

  const prompt = `
  You are a Dungeon Master AI. Your task is to generate exactly 4 distinct, compelling starting adventure scenarios for a Dungeons & Dragons 5th Edition game.

  CRITICAL REQUIREMENT: All 4 scenarios must be fundamentally different from each other. Each scenario must have a unique title and a unique surrounding environment description. Do not repeat themes, titles, or locations across the scenarios. Ensure the surrounding descriptions are highly evocative and unique.

  The scenarios should be tailored to the starting level (Level ${character.level}) and class (${character.class}) of the player character.
  The desired campaign duration is: ${duration}.
  ${regenerationContext}

  Player Character Summary:
  Name: ${character.name}
  Race: ${character.race}
  Class: ${character.class}
  Background: ${character.background}
  Alignment: ${character.alignment}

  For each of the 4 scenarios, provide the following structure in a single JSON array. Ensure each scenario includes:
  - "id": A unique UUID string.
  - "title": A catchy and unique title for the adventure.
  - "surrounding": A detailed, evocative, and UNIQUE description of the immediate environment where the adventure begins (e.g., a bustling market, a desolate mountain pass, a forgotten temple entrance). Focus on sensory details and make it distinct for each scenario.
  - "objective": A clear, concise introduction to the immediate objective or conflict that starts the adventure.
  - "possibleEncounters": An array of strings, listing 2-3 potential minor encounters or challenges relevant to the scenario.
  - "possibleEnemies": An array of strings, listing 2-3 types of common enemies the player might face.
  - "bossFight": A JSON object describing a potential boss fight, including:
    - "name": The name of the boss.
    - "description": A brief description of the boss and its role in the scenario.
  - "mapDescription": A detailed description for generating a 1080p top-down battle map, including key terrain features, points of interest, and the starting position for the player character (e.g., 'Player starts near the northern entrance').

  Example structure for one scenario:
  {
    "id": "unique-uuid-1",
    "title": "The Sunken Temple",
    "surrounding": "The air is thick with the smell of brine and decay. Ancient, moss-covered stones jut out from the murky water of a flooded ruin. Eerie green light filters down from unseen cracks above.",
    "objective": "A desperate plea for help echoes from the depths of the temple. A local fisherman claims his son was dragged into the ruins by a shadowy creature.",
    "possibleEncounters": ["Navigating treacherous submerged passages", "Avoiding ancient pressure plate traps", "Dealing with swarms of mutated fish"],
    "possibleEnemies": ["Giant Constrictor Snake", "Merrow", "Sahuagin"],
    "bossFight": {
      "name": "The Abyssal Guardian",
      "description": "A hulking, multi-limbed monstrosity that guards the temple's inner sanctum, empowered by dark water magic."
    },
    "mapDescription": "A 1080p top-down view of a partially flooded ancient temple. The map features a central chamber with a large, ornate altar. Surrounding this are smaller rooms and corridors, some completely submerged. Water levels vary, creating shallow and deep areas. Key features include crumbling pillars, submerged statues, and glowing runes on the walls. Player starts near the southern entrance, partially submerged."
  }

  Ensure the output is ONLY the JSON array.
  `;

  try {
    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    logger.info("Gemini Scenario Response", { 
      characterName: character.name,
      characterClass: character.class,
      characterLevel: character.level,
      duration 
    });

    const jsonMatch = responseText.match(/```json\n([\s\S]*?)\n```/);
    let jsonString = responseText;
    if (jsonMatch && jsonMatch[1]) {
      jsonString = jsonMatch[1];
    }

    const parsedResponse = JSON.parse(jsonString);
    if (!Array.isArray(parsedResponse) || parsedResponse.length !== 4) {
      logger.warn("AI did not return exactly 4 scenarios in the correct format. Attempting to use partial response.");
    }

    // Ensure unique IDs for each scenario
    return parsedResponse.map((scenario: AdventureScenario) => ({
      ...scenario,
      id: scenario.id || crypto.randomUUID(), // Assign a UUID if missing
    }));
  } catch (error) {
    logger.error("Error calling Gemini API or parsing scenario response", { 
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    // Throw a specific error that can be caught by the action handler
    throw new Error('Failed to generate adventure scenarios.');
  }
}

export async function generateMapImage(scenario: AdventureScenario): Promise<string> {
  const RUNWARE_API_KEY = process.env.RUNWARE_API_KEY;
  if (!RUNWARE_API_KEY) {
    throw new Error('RUNWARE_API_KEY environment variable not set.');
  }

  const positivePrompt = `
    "fantasy map," "cartography," "tabletop RPG," "parchment texture," "top-down view," "satellite view,"
    Scenario: ${scenario.title}.
    Environment: ${scenario.surrounding}.
    Objective: ${scenario.objective}.
    Map Details: ${scenario.mapDescription}.
    high detailed multiple places. surrounding towns and buildings, highlight the map locations start point and objective located in the map with guide.
  `;

  const requestBody = [{
    "taskType": "imageInference",
    "model": "rundiffusion:110@101",
    "numberResults": 1,
    "outputFormat": "JPEG",
    "width": 1344,
    "height": 768,
    "steps": 4,
    "CFGScale": 1,
    "scheduler": "Euler Beta",
    "includeCost": true,
    "checkNSFW": true,
    "outputType": ["URL"],
    "outputQuality": 85,
    "positivePrompt": positivePrompt,
    "taskUUID": crypto.randomUUID()
  }];

  try {
    // 1. Submit the task and get the image URL directly
    logger.info("Submitting map generation task to Runware.ai...", { 
      scenarioTitle: scenario.title 
    });
    const initialResponse = await fetch('https://api.runware.ai/v1', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RUNWARE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!initialResponse.ok) {
      const errorText = await initialResponse.text();
      logger.error("Runware.ai initial request failed", { 
        status: initialResponse.status,
        errorText 
      });
      throw new Error(`Runware.ai API error: ${initialResponse.status} ${errorText}`);
    }

    const initialData = await initialResponse.json();
    const imageUrl = initialData.data?.[0]?.imageURL;

    if (!imageUrl) {
      logger.error("Runware.ai response missing imageURL", { initialData });
      throw new Error("Failed to get image URL from Runware.ai.");
    }
    logger.info("Image generated successfully", { imageUrl });

    // 2. Fetch the image and convert to base64
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      throw new Error(`Failed to download image from URL: ${imageUrl}`);
    }
    const imageBuffer = await imageResponse.arrayBuffer();
    const base64Image = Buffer.from(imageBuffer).toString('base64');
    
    return base64Image;

  } catch (error) {
    logger.error("Error calling Runware.ai API", { 
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    throw new Error('Failed to generate map image via Runware.ai.');
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
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY as string);
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    logger.info("Gemini Raw Response", { 
      context: context.partialCharacter ? 'partial' : 'full'
    });

    const jsonMatch = responseText.match(/```json\n([\s\S]*?)\n```/);
    let jsonString = responseText;
    if (jsonMatch && jsonMatch[1]) {
      jsonString = jsonMatch[1];
    }

    const parsedResponse = JSON.parse(jsonString);
    return parsedResponse;
  } catch (error) {
    logger.error("Error calling Gemini API or parsing response", { 
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    throw new Error('Failed to process character description with AI.');
  }
}

export async function continueAdventure(messages: { role: 'user' | 'model', text: string }[], party: any[], scenario: AdventureScenario): Promise<string> {
  const history = messages.map(msg => ({
    role: msg.role,
    parts: [{ text: msg.text }]
  }));

  // Remove the last message from history to use it as the current user input
  const currentUserInput = history.pop();
  if (!currentUserInput || currentUserInput.role !== 'user') {
    throw new Error("Last message must be from the user.");
  }

  const chat = model.startChat({
    history: history,
    generationConfig: {
      maxOutputTokens: 1000,
    },
  });

  const prompt = `
  You are the Dungeon Master. Continue the D&D adventure based on the user's last action.

  Scenario: ${scenario.title}
  Objective: ${scenario.objective}
  Party: ${JSON.stringify(party.map(p => p.character?.name || 'Unnamed Adventurer'))}

  Respond in a descriptive, engaging, and narrative style. Describe the consequences of the player's actions and present new challenges or information.

  User's Action: "${currentUserInput.parts[0].text}"
  `;

  const result = await chat.sendMessage(prompt);
  const response = result.response;
  return response.text();
}


export async function generateCharacterFeatures(characterClass: string, characterRace: string, characterBackground: string): Promise<string[]> {
  // Implementation here
  return ["Feature 1", "Feature 2"]; // Replace with actual implementation
}

export async function generateCharacterPersonality(characterClass: string, characterRace: string, characterBackground: string): Promise<{ trait: string; ideal: string; bond: string; flaw: string }> {
  // Implementation here
  return { trait: "Trait", ideal: "Ideal", bond: "Bond", flaw: "Flaw" }; // Replace with actual implementation
}
