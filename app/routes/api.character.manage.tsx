import { json, type ActionFunctionArgs } from "@remix-run/node";
import { getSession } from "~/sessions";
import { saveCharacter, getAllCharacters } from "~/services/characterCache.server";
import { getCharacterById } from "~/services/db.server";
import type { Character } from "~/types";

export async function action({ request }: ActionFunctionArgs) {
  const session = await getSession(request.headers.get("cookie"));
  const userId = session.get("userId");

  if (!userId) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "updateCharacter") {
    try {
      const characterString = formData.get("character");
      if (typeof characterString !== 'string') {
        return json({ error: "Invalid character data" }, { status: 400 });
      }
      const character: Character = JSON.parse(characterString);

      // ENHANCEMENT: Preserve avatarUrl if not provided in update
      if (character.id) {
        const existingCharacter = await getCharacterById(userId, character.id);
        if (existingCharacter && existingCharacter.avatarUrl && !character.avatarUrl) {
          console.log('[CHARACTER UPDATE] Preserving existing portrait');
          character.avatarUrl = existingCharacter.avatarUrl;
        }
      }

      const allCharacters = await getAllCharacters(userId);
      const maxSlots = 12;
      let slotToSave = -1;

      // Find an empty slot
      for (let i = 0; i < maxSlots; i++) {
        const slotExists = allCharacters.some(char => char.slotIndex === i);
        if (!slotExists) {
          slotToSave = i;
          break;
        }
      }

      if (slotToSave === -1) {
        // All slots are full, prompt for overwrite
        const overwriteSlot = formData.get("overwriteSlot");
        if (!overwriteSlot) {
          // No overwrite slot selected, return an error
          return json({ type: 'error', error: "All character slots are full. Please select a character to overwrite." }, { status: 400 });
        }

        const slot = parseInt(overwriteSlot as string, 10);
        if (isNaN(slot) || slot < 0 || slot >= maxSlots) {
          return json({ type: 'error', error: "Invalid slot selected for overwrite." }, { status: 400 });
        }

        character.slotIndex = slot; // Set the slot to overwrite
        const updatedCharacter = await saveCharacter(userId, character);
        return json({ type: 'success', character: updatedCharacter, overwrite: true });
      } else {
        // Save to an empty slot
        character.slotIndex = slotToSave;
        const updatedCharacter = await saveCharacter(userId, character);
        return json({ type: 'success', character: updatedCharacter });
      }
    } catch (error) {
      console.error("Failed to update character:", error);
      const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
      return json({ type: 'error', error: `Failed to update character: ${errorMessage}` }, { status: 500 });
    }
  }

  if (intent === "updatePortrait") {
    try {
      const characterId = formData.get("characterId")?.toString();
      const portraitBase64 = formData.get("portraitBase64")?.toString();
      
      if (!characterId || !portraitBase64) {
        return json({ error: "Missing characterId or portrait data" }, { status: 400 });
      }
      
      const existingCharacter = await getCharacterById(userId, characterId);
      if (!existingCharacter) {
        return json({ error: "Character not found" }, { status: 404 });
      }
      
      const updatedCharacter: Character = {
        ...existingCharacter,
        avatarUrl: portraitBase64,
      };
      
      await saveCharacter(userId, updatedCharacter);
      return json({ success: true, character: updatedCharacter });
    } catch (error) {
      console.error("Failed to update portrait:", error);
      return json({ error: "Failed to update portrait" }, { status: 500 });
    }
  }

  return json({ error: "Invalid intent" }, { status: 400 });
}
