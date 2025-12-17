import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { getRoomByCode } from "~/services/room.server";
import { logger } from "~/utils/logger";

// Dev-only endpoint to inspect a room row by code without requiring session
export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const roomCode = url.searchParams.get("roomCode");

  if (!roomCode) {
    return json({ error: 'Missing roomCode' }, { status: 400 });
  }

  try {
    const room = await getRoomByCode(roomCode);
    if (!room) return json({ error: 'Room not found' }, { status: 404 });
    return json({ room });
  } catch (error) {
    logger.error('[ROOM-INSPECT] Error fetching room', { roomCode, error: error instanceof Error ? error.message : String(error) });
    return json({ error: 'Failed to fetch room' }, { status: 500 });
  }
}

export async function action({ request }: ActionFunctionArgs) {
  // Accept form POST with roomCode as alternative
  const form = await request.formData();
  const roomCode = form.get('roomCode')?.toString();

  if (!roomCode) {
    return json({ error: 'Missing roomCode' }, { status: 400 });
  }

  try {
    const room = await getRoomByCode(roomCode);
    if (!room) return json({ error: 'Room not found' }, { status: 404 });
    return json({ room });
  } catch (error) {
    logger.error('[ROOM-INSPECT] Error fetching room (POST)', { roomCode, error: error instanceof Error ? error.message : String(error) });
    return json({ error: 'Failed to fetch room' }, { status: 500 });
  }
}

export default function Route() {
  return new Response(null, { status: 204 });
}
