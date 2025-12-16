import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { requireUser } from "~/services/auth.server";
import { generateCharacterPortrait } from "~/services/gemini.server";
import { getCharacterById, saveCharacter } from "~/services/db.server";
import type { Character } from "~/types";
import { logger } from "~/utils/logger";
import * as fs from 'node:fs';
import * as path from 'node:path';

const publicDirPath = path.join(process.cwd(), 'public');
const tempPortraitsDir = path.join(publicDirPath, 'temp_portraits');

// Ensure the temporary directory exists
fs.mkdirSync(tempPortraitsDir, { recursive: true });

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
    logger.debug("[PORTRAIT API] Parsed character:", { characterName: character.name });
    
    // Ensure the character belongs to the user or is a new character being created
    if (character.userId && character.userId !== userId) {
      return json({ success: false, error: "Unauthorized: Character does not belong to user." }, { status: 403 });
    }

    logger.debug("[PORTRAIT API] Generating portrait server-side...");
    const finalPortraitBase64 = await generateCharacterPortrait(character);
    logger.debug("[PORTRAIT API] Portrait generated successfully");

    // Save the base64 image to a temporary file
    const uniqueFilename = `${character.id || crypto.randomUUID()}.jpeg`;
    const filePath = path.join(tempPortraitsDir, uniqueFilename);
    const base64Data = finalPortraitBase64.replace(/^data:image\/\w+;base64,/, "");
    const imageBuffer = Buffer.from(base64Data, 'base64');
    fs.writeFileSync(filePath, imageBuffer);

    const publicUrl = `/temp_portraits/${uniqueFilename}`;
    logger.debug("[PORTRAIT API] Image saved to temporary file", { filePath, publicUrl });

    // If a characterId is provided, save the portrait to the existing character
    if (characterId) {
      const existingCharacter = await getCharacterById(userId, characterId);
      if (!existingCharacter) {
        return json({ success: false, error: "Character not found." }, { status: 404 });
      }
      
      const updatedCharacter: Character = {
        ...existingCharacter,
        avatarUrl: publicUrl, // Save the URL, not the base64 string
      };
      await saveCharacter(userId, updatedCharacter);
      logger.debug("[PORTRAIT API] Portrait URL saved to character");
    }

    return json({ success: true, portraitUrl: publicUrl, characterId }, { status: 200 });

  } catch (error) {
    logger.error("[PORTRAIT GENERATION API] Error generating character portrait", { error: error instanceof Error ? error.message : "Unknown error" });
    return json({ success: false, error: "Failed to generate character portrait." }, { status: 500 });
  }
}