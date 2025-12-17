import { json, type ActionFunctionArgs } from "@remix-run/node";
import { getSession } from "~/sessions";
import { saveCharacter } from "~/services/characterCache.server"; // ASSUMED: This service handles saving the character object to DB
import type { Character } from "~/types";
import { generateCharacterFeatures, generateCharacterPersonality, parseCharacterText } from "~/services/gemini.server";
import { logger } from "~/utils/logger";

// NOTE: Since we cannot see the full implementation of gemini.server.ts, we must rely on existing exports 
// and assume we can prompt Gemini to generate a complete character structure, similar to how parseCharacterText works.

/**
 * Helper function to generate a complete character object from scratch using Gemini.
 * This mimics the complexity required to generate stats, features, personality, etc., all at once.
 */
async function generateCompleteCharacter(cClass: string, cRace: string, cBackground: string): Promise<Omit<Character, 'userId' | 'slotIndex'>> {
    // We leverage the existing parser/generator functions if possible, or construct a prompt 
    // that forces a full JSON output based on the known schema structure.
    
    // For this implementation, we will call the existing feature/personality generators and then 
    // use a prompt designed to generate the rest (stats, derived values) based on the context.
    
    const features = await generateCharacterFeatures(cClass, cRace, cBackground);
    const personality = await generateCharacterPersonality(cClass, cRace, cBackground);

    // Since we cannot see the full schema definition or the internal logic of parseCharacterText, 
    // we must rely on a prompt that forces Gemini to output a complete structure, 
    // assuming the underlying Gemini model setup can handle this request via parseCharacterText's mechanism.
    
    const fullPrompt = `Generate a complete D&D 5e character sheet in JSON format for a Level 3 character. 
    Race: ${cRace}, Class: ${cClass}, Background: ${cBackground}. 
    Ensure all fields are populated, including rolling 4d6 drop lowest for stats, calculating derived stats (HP, AC, Initiative, Proficiency Bonus +2), and generating appropriate equipment, features, personality (trait, ideal, bond, flaw), and appearance.
    Use the features generated: [${features.join(', ')}] and personality: ${JSON.stringify(personality)}.
    Return ONLY the JSON object adhering strictly to the Character type definition.`;

    // We call parseCharacterText with this comprehensive prompt, assuming it handles the full generation request.
    const characterText = await parseCharacterText(fullPrompt);
    
    // parseCharacterText is assumed to return the JSON string matching the Character schema.
    let parsedCharacter: Omit<Character, 'userId' | 'slotIndex'> = JSON.parse(characterText.trim());
    
    // Ensure id is present
    if (!parsedCharacter.id) {
        parsedCharacter.id = crypto.randomUUID();
    }

    // Ensure level 3 defaults are set if Gemini missed them (e.g., proficiency bonus)
    if (!parsedCharacter.level) parsedCharacter.level = 3;
    if (!parsedCharacter.proficiencyBonus) parsedCharacter.proficiencyBonus = 2;
    
    return parsedCharacter;
}


export async function action({ request }: ActionFunctionArgs) {
  const session = await getSession(request.headers.get("cookie"));
  const userId = session.get("userId");

  if (!userId) {
    return json({ type: 'error', error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const generateFull = formData.get("generateFull");
  const cClass = formData.get("class") as string || 'Random';
  const cRace = formData.get("race") as string || 'Random';
  const cBackground = formData.get("background") as string || 'Random';


  if (generateFull !== 'true') {
    return json({ type: 'error', error: "Invalid request: Must request full generation." }, { status: 400 });
  }

  try {
    // We use the parameters passed from the client form now.
    
    const characterData = await generateCompleteCharacter(cClass, cRace, cBackground); 

    // 4. Save the character
    const newCharacter = await saveCharacter(userId, characterData); 

    return json({ 
        type: 'success', 
        data: { 
            characterData: newCharacter 
        } 
    });

  } catch (error) {
    logger.error("AI Full Character Creation Failed", { error: error instanceof Error ? error.message : "Unknown error" });
    return json({ 
        type: 'error', 
        error: `Failed to generate character: ${error instanceof Error ? error.message : String(error)}` 
    }, { status: 500 });
  }
}
