import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { requireUser } from "~/services/auth.server";
import { updateParticipantActivity } from "~/services/room.server";

/**
 * Handles client-side pings to update participant activity status.
 * Also triggers cleanup of inactive participants in the room.
 */
export async function action({ request }: ActionFunctionArgs) {
    const userId = (await requireUser(request)).id;
    const formData = await request.formData();
    const roomCode = formData.get("roomCode")?.toString();

    if (!roomCode) {
        return json({ success: false, error: "Missing room code." }, { status: 400 });
    }

    try {
        const updatedRoom = await updateParticipantActivity(roomCode, userId);

        if (!updatedRoom) {
            // Room might have been deleted by cleanup or not found
            return json({ success: false, error: "Room not found or update failed." }, { status: 404 });
        }

        // Success response (we don't need to send back the whole room, just confirmation)
        return json({ success: true, participantsCount: updatedRoom.participants.length });

    } catch (error) {
        console.error(`Heartbeat failed for user ${userId} in room ${roomCode}:`, error);
        return json({ success: false, error: "Server error during heartbeat." }, { status: 500 });
    }
}
