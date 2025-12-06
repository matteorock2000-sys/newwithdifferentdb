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
  const portraitBase64 = formData.get("portraitBase64")?.toString(); // NEW: Accept base64 image from client
  const avatarUrl = formData.get("avatarUrl")?.toString(); // For saving URLs from client
  const model = formData.get("model")?.toString(); // For specifying generation model
  const provider = formData.get("provider")?.toString(); // For specifying generation provider

  console.log("[PORTRAIT API] Received request with intent:", intent);
  console.log("[PORTRAIT API] Character data present:", !!characterDataStr);
  console.log("[PORTRAIT API] Portrait base64 present:", !!portraitBase64);
  console.log("[PORTRAIT API] Avatar URL present:", !!avatarUrl);

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
    console.log("[PORTRAIT API] Portrait URL saved to character");
    return json({ success: true, message: "Portrait URL saved." });
  }

  try {
    if (!characterDataStr) {
      return json({ success: false, error: "Missing character data for portrait generation." }, { status: 400 });
    }
    const character: Character = JSON.parse(characterDataStr);
    console.log("[PORTRAIT API] Parsed character:", character.name);
    
    // Ensure the character belongs to the user or is a new character being created
    if (character.userId && character.userId !== userId) {
      return json({ success: false, error: "Unauthorized: Character does not belong to user." }, { status: 403 });
    }

    // Directly generate portrait server-side
    console.log("[PORTRAIT API] Generating portrait server-side...");
    const portraitBase64Data = await generateCharacterPortrait(character);
    console.log("[PORTRAIT API] Portrait generated successfully.");

    // If a characterId is provided, save the portrait to the existing character
    if (characterId && portraitBase64Data) {
      const existingCharacter = await getCharacterById(userId, characterId);
      if (!existingCharacter) {
        return json({ success: false, error: "Character not found." }, { status: 404 });
      }
      
      const updatedCharacter: Character = {
        ...existingCharacter,
        avatarUrl: portraitBase64Data,
      };
      await saveCharacter(userId, updatedCharacter);
      console.log("[PORTRAIT API] Portrait saved to character");
    }

    return json({ success: true, portraitUrl: portraitBase64Data }, { status: 200 });

  } catch (error: any) { // Add any to error type
    console.error("[PORTRAIT GENERATION API] Error generating character portrait:", error);
    return json({ success: false, error: `Failed to generate character portrait: ${error.message}` }, { status: 500 });
  }
}