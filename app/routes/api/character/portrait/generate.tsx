import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { requireUser } from "~/services/auth.server";
import { generateCharacterPortrait } from "~/services/gemini.server";
import { getCharacterById, saveCharacter } from "~/services/db.server";
import type { Character } from "~/types";

export async function action({ request }: ActionFunctionArgs) {
  console.log("[PORTRAIT API] Route action called");
  console.log("[PORTRAIT API] Request URL:", request.url);
  console.log("[PORTRAIT API] Request method:", request.method);
  
  const userId = (await requireUser(request)).id;
  const formData = await request.formData();
  const characterId = formData.get("characterId")?.toString();
  const characterDataStr = formData.get("characterData")?.toString();
  const intent = formData.get("intent")?.toString();

  console.log("[PORTRAIT API] Received request with intent:", intent);
  console.log("[PORTRAIT API] Character data present:", !!characterDataStr);

  if (!intent || intent !== 'generatePortrait') {
    return json({ success: false, error: "Invalid intent." }, { status: 400 });
  }

  if (!characterDataStr) {
    return json({ success: false, error: "Missing character data for portrait generation." }, { status: 400 });
  }

  try {
    const character: Character = JSON.parse(characterDataStr);
    console.log("[PORTRAIT API] Parsed character:", character.name);
    
    // Ensure the character belongs to the user or is a new character being created
    if (character.userId && character.userId !== userId) {
      return json({ success: false, error: "Unauthorized: Character does not belong to user." }, { status: 403 });
    }

    console.log("[PORTRAIT API] Generating portrait server-side...");
    const finalPortraitBase64 = await generateCharacterPortrait(character);
    console.log("[PORTRAIT API] Portrait generated successfully");

    // If a characterId is provided, save the portrait to the existing character
    if (characterId) {
      const existingCharacter = await getCharacterById(userId, characterId);
      if (!existingCharacter) {
        return json({ success: false, error: "Character not found." }, { status: 404 });
      }
      
      const updatedCharacter: Character = {
        ...existingCharacter,
        avatarUrl: finalPortraitBase64,
      };
      await saveCharacter(userId, updatedCharacter);
      console.log("[PORTRAIT API] Portrait saved to character");
    }

    return json({ success: true, portraitBase64: finalPortraitBase64, characterId }, { status: 200 });

  } catch (error) {
    console.error("[PORTRAIT GENERATION API] Error generating character portrait:", error);
    return json({ success: false, error: "Failed to generate character portrait." }, { status: 500 });
  }
}