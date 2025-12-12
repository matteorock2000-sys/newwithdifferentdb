import type { PlayerSlot, ScenarioVote, ScenarioWithVotes, AdventureScenario } from "~/types";
import { db } from "~/services/db.server";
import { getRoomByCode, storeRoomScenarios } from "~/services/room.server";
import type { DBRoom } from "~/services/room.server";

const logPrefix = "[SCENARIO VOTE SERVICE]";

/**
 * Gets the number of votes a user can cast based on their active slots
 */
function getUserVoteCount(room: DBRoom, userId: string): number {
  return room.setup_slots.filter(slot => 
    (slot.type === 'Human' || slot.type === 'AI') && 
    slot.userId === userId
  ).length;
}

/**
 * Gets all votes for a scenario set
 */
export async function getScenarioVotes(roomCode: string): Promise<ScenarioVote[]> {
  const room = await getRoomByCode(roomCode);
  if (!room || !room.scenarios) {
    return [];
  }

  // Aggregate all user votes from all scenarios in the room
  const allVotes: ScenarioVote[] = [];
  for (const scenario of room.scenarios) {
    if (scenario.userVotes) {
      allVotes.push(...scenario.userVotes);
    }
  }
  return allVotes;
}

/**
 * Casts a vote for a scenario
 */
export async function castVote(
  roomCode: string, 
  scenarioId: string, 
  userId: string, 
  slotIndex: number
): Promise<{ success: boolean; message: string; userVoteCount: number }> {
  console.log(`${logPrefix} castVote called with:`, { roomCode, scenarioId, userId, slotIndex });
  
  const room = await getRoomByCode(roomCode);
  if (!room) {
    console.log(`${logPrefix} Room not found: ${roomCode}`);
    return { success: false, message: "Room not found.", userVoteCount: 0 };
  }
  
  // Validate that the slotIndex belongs to the requesting user
  const targetSlot = room.setup_slots[slotIndex];
  if (!targetSlot) {
    console.log(`${logPrefix} Slot ${slotIndex} does not exist in room ${roomCode}`);
    return { success: false, message: `Slot ${slotIndex} does not exist.`, userVoteCount: 0 };
  }
  
  if (targetSlot.userId !== userId) {
    console.log(`${logPrefix} Slot ${slotIndex} belongs to user ${targetSlot.userId}, not ${userId}`);
    return { success: false, message: `Slot ${slotIndex} does not belong to you.`, userVoteCount: 0 };
  }
  
  if (targetSlot.type !== 'Human' && targetSlot.type !== 'AI') {
    console.log(`${logPrefix} Slot ${slotIndex} is not a voting slot (type: ${targetSlot.type})`);
    return { success: false, message: `Slot ${slotIndex} cannot vote.`, userVoteCount: 0 };
  }
  
  // Handle REGENERATE votes as a special case
  if (scenarioId === 'REGENERATE') {
    console.log(`${logPrefix} Processing REGENERATE vote for slot ${slotIndex}`);
    
    // For REGENERATE votes, we don't need to check scenario existence
    // Just proceed with the vote casting logic
  } else {
    // Check if scenario exists in the room for regular scenario votes
    const scenarioExists = room.scenarios?.some(scenario => scenario.id === scenarioId);
    if (!scenarioExists) {
      console.log(`${logPrefix} Scenario ${scenarioId} not found in room ${roomCode}`);
      return { success: false, message: "Scenario not found in room.", userVoteCount: userVoteCount };
    }
  }
  
  // Check if user has available votes
  const userVoteCount = getUserVoteCount(room, userId);
  const allUserVotes = (await getScenarioVotes(roomCode)).filter(vote => 
    vote.userId === userId
  );
  
  console.log(`${logPrefix} User vote count: ${userVoteCount}, current votes: ${allUserVotes.length}`);
  
  // Check if the target slot already has a vote for a different scenario
  const slotVotes = allUserVotes.filter(vote => vote.slotIndex === slotIndex);
  const existingSlotVote = slotVotes.find(vote => vote.scenarioId !== scenarioId);
  
  // Count active votes (excluding the current slot's vote if changing)
  const activeVotesCount = existingSlotVote ? 
    allUserVotes.length - 1 : // Exclude the vote that will be changed
    allUserVotes.length;       // Count all votes if this is a new vote
  
  if (activeVotesCount >= userVoteCount) {
    console.log(`${logPrefix} User has no available slots for voting`);
    return {
      success: false,
      message: `You have already used all ${userVoteCount} of your voting slots.`,
      userVoteCount
    };
  }
  
  // Check if slot already has a vote for a different scenario and auto-retract it
  const existingDifferentVote = slotVotes.find(vote => vote.scenarioId !== scenarioId);
  
  console.log(`${logPrefix} Slot votes for slot ${slotIndex}:`, slotVotes);
  console.log(`${logPrefix} Existing different vote:`, existingDifferentVote);
  
  if (existingDifferentVote) {
    console.log(`${logPrefix} Auto-retracting all votes for slot ${slotIndex} from user ${userId}`);
    
    // Remove ALL votes for this userId and slotIndex across ALL scenarios
    const updatedScenariosForRetraction = room.scenarios?.map(scenario => {
      const filteredUserVotes = (scenario.userVotes || []).filter(vote =>
        !(vote.userId === userId && vote.slotIndex === slotIndex)
      );
      return {
        ...scenario,
        userVotes: filteredUserVotes
      };
    });

    if (updatedScenariosForRetraction) {
      const retractionSuccess = await storeRoomScenarios(roomCode, updatedScenariosForRetraction as AdventureScenario[]);
      if (retractionSuccess) {
        console.log(`${logPrefix} Successfully auto-retracted all votes for slot ${slotIndex}`);
      } else {
        console.error(`${logPrefix} Failed to auto-retract votes for slot ${slotIndex}`);
      }
    }
  }
  
  // Check if user already voted for this specific scenario with this slot
  const existingVote = allUserVotes.find(vote => 
    vote.scenarioId === scenarioId && vote.slotIndex === slotIndex
  );
  
  console.log(`${logPrefix} Existing vote check:`, existingVote);
  
  if (existingVote) {
    console.log(`${logPrefix} User already voted for this scenario with this slot`);
    return {
      success: false,
      message: "You have already voted for this scenario with this slot.",
      userVoteCount
    };
  }
  
  // Handle REGENERATE votes - return success after retraction, no storage needed
  if (scenarioId === 'REGENERATE') {
    console.log(`${logPrefix} REGENERATE vote registered for slot ${slotIndex}`);
    return {
      success: true,
      message: 'Regenerate vote registered!',
      userVoteCount
    };
  }
  
  // Create new vote for real scenarios
  const newVote: ScenarioVote = {
    scenarioId,
    userId,
    slotIndex,
    timestamp: new Date().toISOString()
  };
  
  // Update the scenario in the room's scenarios array
  const updatedScenarios = room.scenarios?.map(scenario => {
    if (scenario.id === scenarioId) {
      const currentUserVotes = scenario.userVotes || [];
      return {
        ...scenario,
        userVotes: [...currentUserVotes, newVote]
      };
    }
    return scenario;
  });

  if (!updatedScenarios) {
    console.log(`${logPrefix} No scenarios found in room: ${roomCode}`);
    return { success: false, message: "Scenario not found in room.", userVoteCount: userVoteCount };
  }
  
  // Check if the scenario was actually found and updated
  const scenarioFound = updatedScenarios.some(scenario => scenario.id === scenarioId);
  if (!scenarioFound) {
    console.log(`${logPrefix} Scenario ${scenarioId} not found in room ${roomCode}. Available scenarios:`, room.scenarios?.map(s => s.id));
    return { success: false, message: "Scenario not found in room.", userVoteCount: userVoteCount };
  }

  const success = await storeRoomScenarios(roomCode, updatedScenarios as AdventureScenario[]);
  
  console.log(`${logPrefix} Vote persistence result: ${success}`);
  
  if (!success) {
    console.error(`${logPrefix} Failed to persist vote for room ${roomCode}, scenario ${scenarioId}`);
    return { success: false, message: "Failed to cast vote due to database error.", userVoteCount };
  }
  
  console.log(`${logPrefix} Vote cast successfully for room ${roomCode}, scenario ${scenarioId}`);
  return {
    success: true,
    message: "Vote cast successfully!",
    userVoteCount
  };
}

/**
 * Retracts a vote for a scenario
 */
export async function retractVote(
  roomCode: string, 
  scenarioId: string, 
  userId: string, 
  slotIndex: number
): Promise<{ success: boolean; message: string }> {
  console.log(`${logPrefix} retractVote called with:`, { roomCode, scenarioId, userId, slotIndex });
  
  const room = await getRoomByCode(roomCode);
  if (!room) {
    console.log(`${logPrefix} Room not found: ${roomCode}`);
    return { success: false, message: "Room not found." };
  }

  let voteFoundAndRetracted = false;
  const updatedScenarios = room.scenarios?.map(scenario => {
    if (scenario.id === scenarioId) {
      const initialUserVotesCount = scenario.userVotes?.length || 0;
      const filteredUserVotes = (scenario.userVotes || []).filter(vote =>
        !(vote.userId === userId && vote.slotIndex === slotIndex)
      );
      if (filteredUserVotes.length < initialUserVotesCount) {
        voteFoundAndRetracted = true;
        console.log(`${logPrefix} Found and retracting vote for user ${userId} slot ${slotIndex} from scenario ${scenarioId}`);
      }
      return {
        ...scenario,
        userVotes: filteredUserVotes
      };
    }
    return scenario;
  });

  if (!voteFoundAndRetracted) {
    console.log(`${logPrefix} No vote found to retract for user ${userId} slot ${slotIndex} in scenario ${scenarioId}`);
    return { success: false, message: "No vote found to retract." };
  }

  if (!updatedScenarios) {
    console.log(`${logPrefix} No scenarios found in room: ${roomCode}`);
    return { success: false, message: "Scenario not found in room for retraction."};
  }

  const success = await storeRoomScenarios(roomCode, updatedScenarios as AdventureScenario[]);

  if (!success) {
    console.error(`${logPrefix} Failed to persist vote retraction for room ${roomCode}, scenario ${scenarioId}`);
    return { success: false, message: "Failed to retract vote due to database error." };
  }

  console.log(`${logPrefix} Vote retracted successfully for room ${roomCode}, scenario ${scenarioId}`);
  return {
    success: true,
    message: "Vote retracted successfully!"
  };
}

/**
 * Clears all votes for a scenario set
 */
export async function clearScenarioVotes(roomCode: string): Promise<void> {
  const room = await getRoomByCode(roomCode);
  if (!room || !room.scenarios) {
    console.warn(`${logPrefix} Room ${roomCode} not found or has no scenarios to clear votes from.`);
    return;
  }

  const updatedScenarios = room.scenarios.map(scenario => ({
    ...scenario,
    userVotes: [] // Clear all user votes for this scenario
  }));

  const success = await storeRoomScenarios(roomCode, updatedScenarios as AdventureScenario[]);

  if (!success) {
    console.error(`${logPrefix} Failed to clear scenario votes for room ${roomCode}`);
  }
}

/**
 * Gets scenario statistics with vote counts
 */
export async function getScenarioVoteStats(
  roomCode: string,
): Promise<ScenarioWithVotes[]> {
  const room = await getRoomByCode(roomCode);
  if (!room || !room.scenarios) {
    return [];
  }

  return room.scenarios.map(scenario => {
    const scenarioVotes = scenario.userVotes || [];
    
    return {
      ...scenario,
      votes: scenarioVotes.length,
      userVotes: scenarioVotes
    };
  });
}

/**
 * Gets user's voting status for all scenarios
 */
export async function getUserVotingStatus(
  roomCode: string, 
  userId: string
): Promise<{ votedScenarios: string[]; availableVotes: number; totalVotes: number }> {
  const room = await getRoomByCode(roomCode);
  if (!room) {
    return { votedScenarios: [], availableVotes: 0, totalVotes: 0 };
  }

  const allVotes = await getScenarioVotes(roomCode);
  const userVotes = allVotes.filter(vote => vote.userId === userId);
  const votedScenarios = [...new Set(userVotes.map(vote => vote.scenarioId))];

  const totalVotes = getUserVoteCount(room, userId);
  const availableVotes = totalVotes - userVotes.length;
  
  return {
    votedScenarios,
    availableVotes,
    totalVotes
  };
}

/**
 * Checks if voting period is over (can be extended with timer logic)
 */
export function isVotingOpen(scenarioSetId: string): boolean {
  // For now, voting is always open
  // In future, this could check against a timer or specific conditions
  return true;
}