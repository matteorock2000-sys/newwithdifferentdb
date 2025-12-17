// Test script to verify database functions work
import { getScenarioVotes, getScenarioVoteCounts, getRegenerateVoteCount, getScenarioVotesGrouped } from "~/services/scenarioVoteService.server";

async function testDatabaseFunctions() {
  const roomCode = "KJEZOR";
  
  console.log("Testing database functions for room:", roomCode);
  
  try {
    // Test getScenarioVotes
    console.log("Testing getScenarioVotes...");
    const votes = await getScenarioVotes(roomCode);
    console.log("getScenarioVotes result:", votes);
    
    // Test getScenarioVoteCounts
    console.log("Testing getScenarioVoteCounts...");
    const voteCounts = await getScenarioVoteCounts(roomCode);
    console.log("getScenarioVoteCounts result:", voteCounts);
    
    // Test getRegenerateVoteCount
    console.log("Testing getRegenerateVoteCount...");
    const regenCount = await getRegenerateVoteCount(roomCode);
    console.log("getRegenerateVoteCount result:", regenCount);
    
    // Test getScenarioVotesGrouped
    console.log("Testing getScenarioVotesGrouped...");
    const votesGrouped = await getScenarioVotesGrouped(roomCode);
    console.log("getScenarioVotesGrouped result:", votesGrouped);
    
    console.log("All tests passed!");
    
  } catch (error) {
    console.error("Test failed:", error);
  }
}

// Run the test
testDatabaseFunctions();
