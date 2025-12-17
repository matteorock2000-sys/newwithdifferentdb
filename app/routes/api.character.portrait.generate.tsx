import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { requireUser } from "~/services/auth.server";
import { generateCharacterPortrait } from "~/services/gemini.server";
import { getCharacterById, saveCharacter } from "~/services/db.server";
import type { Character } from "~/types";
import { logger } from "~/utils/logger";

export async function action({ request }: ActionFunctionArgs) {
  logger.debug('Route action called', { 
    url: request.url,
    method: request.method
  });
  
  const userId = (await requireUser(request)).id;
  
  // Check if request is JSON or FormData
  const contentType = request.headers.get('content-type');
  let characterId: string | undefined;
  let characterDataStr: string | undefined;
  let intent: string | undefined;
  let portraitBase64: string | undefined;
  let avatarUrl: string | undefined;
  let model: string | undefined;
  let provider: string | undefined;

  if (contentType && contentType.includes('application/json')) {
    // Handle JSON request body
    const requestData = await request.json();
    characterId = requestData.characterId;
    characterDataStr = JSON.stringify(requestData.characterData);
    intent = requestData.intent;
    portraitBase64 = requestData.portraitBase64;
    avatarUrl = requestData.avatarUrl;
    model = requestData.model;
    provider = requestData.provider;
  } else {
    // Handle FormData request
    const formData = await request.formData();
    characterId = formData.get("characterId")?.toString();
    characterDataStr = formData.get("characterData")?.toString();
    intent = formData.get("intent")?.toString();
    portraitBase64 = formData.get("portraitBase64")?.toString();
    avatarUrl = formData.get("avatarUrl")?.toString();
    model = formData.get("model")?.toString();
    provider = formData.get("provider")?.toString();
  }

  logger.debug('Received request with intent', { 
    intent,
    characterDataPresent: !!characterDataStr,
    portraitBase64Present: !!portraitBase64,
    avatarUrlPresent: !!avatarUrl,
    contentType
  });

  if (!intent || (intent !== 'generatePortrait' && intent !== 'savePortraitUrl')) {
    return json({ success: false, error: "Invalid intent." }, { status: 400 });
  }

  if (intent === 'savePortraitUrl') {
    if (!characterId || !avatarUrl) {
      return json({ success: false, error: "Missing characterId or avatarUrl for saving." }, { status: 400 });
    }
    const existingCharacter = await getCharacterById(userId, characterId);
    if (!existingCharacter) {
      return json({ success: false, error: "Character not found." }, { status: 404 });
    }
    const updatedCharacter: Character = { ...existingCharacter, avatarUrl };
    await saveCharacter(userId, updatedCharacter);
    logger.debug('Portrait URL saved to character', { characterId });
    return json({ success: true, message: "Portrait URL saved." });
  }

  try {
    if (!characterDataStr) {
      return json({ success: false, error: "Missing character data for portrait generation." }, { status: 400 });
    }
    
    // Parse character data safely
    let character: Character;
    try {
      character = JSON.parse(characterDataStr);
    } catch (parseError) {
      logger.error('Failed to parse character data', { error: parseError });
      return json({ success: false, error: "Invalid character data format." }, { status: 400 });
    }
    
    logger.debug('Parsed character', { 
    characterName: character.name,
    characterId: character.id,
    race: character.race,
    class: character.class,
    level: character.level,
    avatarUrl: character.avatarUrl ? `${character.avatarUrl.substring(0, 50)}...` : character.avatarUrl
  });
    
    // Ensure the character belongs to the user or is a new character being created
    if (character.userId && character.userId !== userId) {
      return json({ success: false, error: "Unauthorized: Character does not belong to user." }, { status: 403 });
    }

    // Directly generate portrait server-side with timeout handling
    logger.debug('Generating portrait server-side');
    
    try {
      // Use Promise.race to implement timeout
      const portraitPromise = generateCharacterPortrait(character);
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Portrait generation timed out')), 30000); // 30 second timeout
      });
      
      const portraitFilePath = await Promise.race([portraitPromise, timeoutPromise]);
      logger.debug('Portrait generated successfully');

      // If a characterId is provided, save the portrait to the existing character
      if (characterId && portraitFilePath) {
        const existingCharacter = await getCharacterById(userId, characterId);
        if (!existingCharacter) {
          return json({ success: false, error: "Character not found." }, { status: 404 });
        }
        
        const updatedCharacter: Character = {
          ...existingCharacter,
          avatarUrl: portraitFilePath,
        };
        await saveCharacter(userId, updatedCharacter);
        logger.debug('Portrait saved to character', { characterId });
      }

      return json({ success: true, portraitUrl: portraitFilePath }, { status: 200 });
    } catch (error: any) {
      logger.error('Portrait generation failed', { error: error.message });
      return json({ success: false, error: `Portrait generation failed: ${error.message}` }, { status: 500 });
    }

  } catch (error: any) { // Add any to error type
    logger.error('Error generating character portrait', { error });
    return json({ success: false, error: `Failed to generate character portrait: ${error.message}` }, { status: 500 });
  }
}