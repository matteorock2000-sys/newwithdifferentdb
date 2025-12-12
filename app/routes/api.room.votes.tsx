import { json } from "@remix-run/node";
import { getScenarioVotes } from "~/services/scenarioVoteService.server";

export async function loader({ request }: { request: Request }) {
  const url = new URL(request.url);
  const roomCode = url.searchParams.get('roomCode');
  
  console.log(`[API VOTES] Received GET request for room: ${roomCode}`);
  
  if (!roomCode) {
    console.log(`[API VOTES] Missing room code`);
    return json({ error: "Missing room code" }, { status: 400 });
  }
  
  try {
    // Get all votes for the room
    const votes = await getScenarioVotes(roomCode);
    
    // Calculate vote counts per scenario
    const voteCounts = {};
    votes.forEach(vote => {
      voteCounts[vote.scenario_id] = (voteCounts[vote.scenario_id] || 0) + 1;
    });
    
    console.log(`[API VOTES] Returning ${votes.length} votes for room: ${roomCode}`);
    return json({ 
      votes,
      voteCounts
    });
  } catch (error) {
    console.error("Error fetching votes:", error);
    return json({ error: "Failed to fetch votes" }, { status: 500 });
  }
}