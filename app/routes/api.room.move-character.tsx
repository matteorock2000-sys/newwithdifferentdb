import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { requireUser } from "~/services/auth.server";
import { updateCharacterCoordinates, getRoomByCode } from "~/services/room.server"; // Import getRoomByCode for authorization

export async function action({ request }: ActionFunctionArgs) {
  const userId = (await requireUser(request)).id;
  const formData = await request.formData();
  const roomCode = formData.get("roomCode")?.toString();
  const characterId = formData.get("characterId")?.toString();
  const x = parseFloat(formData.get("x")?.toString() || "");
  const y = parseFloat(formData.get("y")?.toString() || "");

  if (!roomCode || !characterId || isNaN(x) || isNaN(y)) {
    return json({ success: false, error: "Missing or invalid movement parameters." }, { status: 400 });
  }

  // Basic validation for normalized coordinates
  if (x < 0 || x > 1 || y < 0 || y > 1) {
    return json({ success: false, error: "Coordinates must be normalized between 0.0 and 1.0." }, { status: 400 });
  }

  try {
    // Authorize the request: Ensure the user owns the character or is the host of the room
    const room = await getRoomByCode(roomCode);
    if (!room) {
      return json({ success: false, error: "Room not found." }, { status: 404 });
    }

    const characterSlot = room.setup_slots.find(slot => slot.characterId === characterId);
    if (!characterSlot) {
      return json({ success: false, error: "Character not found in room." }, { status: 404 });
    }

    // A user can move their own character or the host can move any character
    if (characterSlot.userId !== userId && room.owner_id !== userId) {
      return json({ success: false, error: "Unauthorized to move this character." }, { status: 403 });
    }

    const success = await updateCharacterCoordinates(roomCode, characterId, x, y);

    if (success) {
      return json({ success: true, message: "Character moved successfully." }, { status: 200 });
    } else {
      return json({ success: false, error: "Failed to update character coordinates." }, { status: 500 });
    }
  } catch (error) {
    console.error("[MOVE CHARACTER API] Error moving character:", error);
    return json({ success: false, error: "Internal server error." }, { status: 500 });
  }
}