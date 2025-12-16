import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { requireUser } from "~/services/auth.server";
import { generateCharacterPortrait } from "~/services/gemini.server";
import { getCharacterById, saveCharacter } from "~/services/db.server";
import type { Character } from "~/types";
import { logger } from "~/utils/logger";

export async function action({ request }: ActionFunctionArgs) {
  logger.debug("[PORTRAIT API] Route action called");
  logger.debug("[PORTRAIT API] Request URL:", { url: request.url });
  logger.debug("[PORTRAIT API] Request method:", { method: request.method });
  
  const userId = (await requireUser(request)).id;
  const formData = await request.formData();
  const characterId = formData.get("characterId")?.toString();
  const characterDataStr = formData.get("characterData")?.toString();
  const intent = formData.get("intent")?.toString();

  logger.debug("[PORTRAIT API] Received request with intent:", { intent });
  logger.debug("[PORTRAIT API] Character data present:", { hasData: !!characterDataStr });

  if (!intent || intent !== 'generatePortrait') {
    return json({ success: false, error: "Invalid intent." }, { status: 400 });
  }

  if (!characterDataStr) {
    return json({ success: false, error: "Missing character data for portrait generation." }, { status: 400 });
  }

  try {
    const character: Character = JSON.parse(characterDataStr);
    logger.debug("[PORTRAIT API] Parsed character:", { 
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

    logger.debug("[PORTRAIT API] Generating portrait server-side...");
    // generateCharacterPortrait now returns a direct image URL
    const imageUrl = await generateCharacterPortrait(character);
    logger.debug("[PORTRAIT API] Portrait generated successfully, URL:", { imageUrl });

    // If a characterId is provided, save the portrait to the existing character
    if (characterId) {
      const existingCharacter = await getCharacterById(userId, characterId);
      if (!existingCharacter) {
        return json({ success: false, error: "Character not found." }, { status: 404 });
      }
      
      const updatedCharacter: Character = {
        ...existingCharacter,
        avatarUrl: imageUrl, // Save the URL, not the base64 string
      };
      await saveCharacter(userId, updatedCharacter);
      logger.debug("[PORTRAIT API] Portrait URL saved to character");
    }

    logger.debug("[PORTRAIT API] Returning portrait URL", { portraitUrl: imageUrl, characterId });
    return json({ success: true, portraitUrl: imageUrl, characterId }, { status: 200 });

  } catch (error) {
    logger.error("[PORTRAIT GENERATION API] Error generating character portrait", { error: error instanceof Error ? error.message : "Unknown error" });
    return json({ success: false, error: "Failed to generate character portrait." }, { status: 500 });
  }
}