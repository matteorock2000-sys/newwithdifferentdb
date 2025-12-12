import { json } from "@remix-run/node";
import { getRoomScenariosForVoting } from "~/services/room.server";

export async function loader({ request }: { request: Request }) {
  const url = new URL(request.url);
  const roomCode = url.searchParams.get('roomCode');
  
  if (!roomCode) {
    return json({ error: "Missing room code" }, { status: 400 });
  }
  
  try {
    const scenarios = await getRoomScenariosForVoting(roomCode);
    return json({ scenarios });
  } catch (error) {
    console.error("Error fetching room scenarios:", error);
    return json({ error: "Failed to fetch scenarios" }, { status: 500 });
  }
}
