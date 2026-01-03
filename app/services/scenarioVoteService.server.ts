import { db } from "~/services/db.server";
import { getRoomByCode, storeRoomScenarios } from "~/services/room.server";
import { setRoomScenarioWinner } from "~/services/roomScenarios.server";
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
 * Gets all votes for a scenario set from the database
 */
export async function getScenarioVotes(roomCode: string): Promise<ScenarioVote[]> {
  try {
    const { data, error } = await db
      .from('room_scenario_votes')
      .select('*')
      .eq('room_code', roomCode)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('[SCENARIO VOTE SERVICE] Error fetching votes', { 
        roomCode, 
        error: error.message,
        details: error.details 
      });
      return [];
    }

    if (!data) {
      return [];
    }

    // Try to enrich votes with characterId from the room's setup_slots when available
    const room = await getRoomByCode(roomCode);

    return data.map(row => ({
      id: row.id,
      scenarioId: row.scenario_id,
      userId: row.user_id,
      slotIndex: row.slot_index,
      timestamp: row.created_at,
      voteType: row.vote_type,
      characterId: (row as any).character_id || room?.setup_slots?.[row.slot_index]?.characterId || ''
    }));
  } catch (error) {
    console.error('[SCENARIO VOTE SERVICE] Exception fetching votes', { 
      roomCode, 
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    return [];
  }
}

/**
 * Casts a vote for a scenario
 */
export async function castVote(
  roomCode: string, 
  scenarioId: string, 
  userId: string, 
  slotIndex: number,
  characterId?: string
): Promise<{ success: boolean; message: string; userVoteCount: number }> {
  console.log(`${logPrefix} castVote called with:`, { roomCode, scenarioId, userId, slotIndex, characterId });
  
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
  
  // Use characterId from slot if not provided
  const voteCharacterId = characterId || targetSlot.characterId || '';
  if (!voteCharacterId) {
    console.log(`${logPrefix} Cannot determine character ID for vote`);
    return { success: false, message: "Character ID is required for voting.", userVoteCount: 0 };
  }
  
  // Check if user has available votes
  const userVoteCount = getUserVoteCount(room, userId);
  const allUserVotes = (await getScenarioVotes(roomCode)).filter(vote => 
    vote.userId === userId
  );
  
  console.log(`${logPrefix} User vote count: ${userVoteCount}, current votes: ${allUserVotes.length}`);
  
  // Check if user already voted for this specific scenario with this character
  const existingVote = allUserVotes.find(vote => 
    vote.scenarioId === scenarioId && vote.characterId === voteCharacterId
  );
  
  console.log(`${logPrefix} Existing vote check:`, existingVote);
  
  if (existingVote) {
    console.log(`${logPrefix} User already voted for this scenario with this character`);
    return {
      success: false,
      message: "You have already voted for this scenario with this character.",
      userVoteCount
    };
  }
  
  // Check if character already has a vote for a different scenario
  const characterVotes = allUserVotes.filter(vote => vote.characterId === voteCharacterId);
  const existingCharacterVote = characterVotes.find(vote => vote.scenarioId !== scenarioId);
  
  // Count active votes (excluding the current character's vote if changing)
  const activeVotesCount = existingCharacterVote ? 
    allUserVotes.length - 1 : // Exclude the vote that will be changed
    allUserVotes.length;       // Count all votes if this is a new vote
  
  if (activeVotesCount >= userVoteCount) {
    console.log(`${logPrefix} User has no available votes`);
    return {
      success: false,
      message: `You have already used all ${userVoteCount} of your votes.`,
      userVoteCount
    };
  }
  
  // Handle REGENERATE votes and regular scenario votes
  if (scenarioId === 'REGENERATE') {
    // Check if user already voted for REGENERATE with this character
    const existingRegenerateVote = allUserVotes.find(vote => 
      vote.scenarioId === 'REGENERATE' && vote.characterId === voteCharacterId
    );
    
    if (existingRegenerateVote) {
      console.log(`${logPrefix} User already voted for REGENERATE with this character`);
      return {
        success: false,
        message: "You have already voted to regenerate with this character.",
        userVoteCount
      };
    }
    
    // Create REGENERATE vote in memory (add to scenarios array)
    const newVote: ScenarioVote = {
      scenarioId: 'REGENERATE',
      userId,
      characterId: voteCharacterId,
      slotIndex,
      timestamp: new Date().toISOString()
    };
    
    // Update room scenarios to add this vote
    const updatedScenarios = room.scenarios?.map(scenario => {
      if (scenario.id === 'REGENERATE') {
        const currentUserVotes = scenario.userVotes || [];
        return {
          ...scenario,
          userVotes: [...currentUserVotes, newVote]
        };
      }
      return scenario;
    });

    if (!updatedScenarios) {
      return { success: false, message: "No scenarios in room.", userVoteCount };
    }

    // Persist regenerate vote to DB
    const { error: insertError } = await db.from('room_scenario_votes').insert([
      {
        room_code: roomCode,
        user_id: userId,
        slot_index: slotIndex,
        scenario_id: null,
        vote_type: 'regenerate'
      }
    ]);

    if (insertError) {
      console.error(`${logPrefix} Failed to persist regenerate vote`, { roomCode, userId, slotIndex, error: insertError.message });
      return { success: false, message: 'Failed to save vote to database.', userVoteCount };
    }

    // Save updated room with new vote in scenarios JSON for compatibility
    await storeRoomScenarios(roomCode, updatedScenarios);

    console.log(`${logPrefix} REGENERATE vote stored successfully for character ${voteCharacterId}`);
    return {
      success: true,
      message: 'Regenerate vote registered!',
      userVoteCount
    };
  }

  // For regular scenario votes, check if scenario exists
  const scenarioExists = room.scenarios?.some(scenario => scenario.id === scenarioId);
  if (!scenarioExists) {
    console.log(`${logPrefix} Scenario ${scenarioId} not found in room ${roomCode}`);
    return { success: false, message: "Scenario not found in room.", userVoteCount: userVoteCount };
  }
  
  // Create new vote with characterId
  const newVote: ScenarioVote = {
    scenarioId,
    userId,
    characterId: voteCharacterId,
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
    return { success: false, message: "No scenarios in room.", userVoteCount };
  }

  // Persist vote to DB
  const { error: insertError } = await db.from('room_scenario_votes').insert([
    {
      room_code: roomCode,
      user_id: userId,
      slot_index: slotIndex,
      scenario_id: scenarioId,
      vote_type: 'scenario'
    }
  ]);

  if (insertError) {
    console.error(`${logPrefix} Failed to persist vote`, { roomCode, scenarioId, userId, slotIndex, error: insertError.message });
    return { success: false, message: 'Failed to save vote to database.', userVoteCount };
  }

  // Update the room's scenarios JSON for compatibility with clients that read it
  await storeRoomScenarios(roomCode, updatedScenarios);

  console.log(`${logPrefix} Vote cast successfully for room ${roomCode}, scenario ${scenarioId}, character ${voteCharacterId}`);

  // After storing the vote, check for a strict majority winner and persist it
  try {
    const voteCounts = await getScenarioVoteCounts(roomCode);
    const totalActiveSlots = room.setup_slots.filter((s: any) => s.type === 'Human' || s.type === 'AI').length;

    // Determine if any scenario has a strict majority (> totalActiveSlots / 2)
    for (const [sId, count] of Object.entries(voteCounts)) {
      if (count > totalActiveSlots / 2) {
        try {
          await setRoomScenarioWinner(roomCode, sId);
          console.log(`${logPrefix} Majority winner detected and saved: ${sId} for room ${roomCode}`);
        } catch (err) {
          console.error(`${logPrefix} Failed to persist majority winner`, { roomCode, scenarioId: sId, err });
        }
        break; // Only one scenario can have strict majority
      }
    }
  } catch (err) {
    console.error(`${logPrefix} Error while checking for majority after vote`, { roomCode, err });
  }
  
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

  // Delete vote from database
  const { error } = await db
    .from('room_scenario_votes')
    .delete()
    .eq('room_code', roomCode)
    .eq('user_id', userId)
    .eq('slot_index', slotIndex);

  if (error) {
    console.error(`${logPrefix} Failed to retract vote`, { 
      roomCode, userId, slotIndex, error: error.message 
    });
    return { success: false, message: "Failed to retract vote due to database error." };
  }

  console.log(`${logPrefix} Vote retracted successfully for user ${userId} slot ${slotIndex}`);
  return {
    success: true,
    message: "Vote retracted successfully!"
  };
}

/**
 * Clears all votes for a scenario set
 */
export async function clearScenarioVotes(roomCode: string): Promise<void> {
  // Delete all votes from database
  const { error } = await db
    .from('room_scenario_votes')
    .delete()
    .eq('room_code', roomCode);

  if (error) {
    console.error(`${logPrefix} Failed to clear scenario votes`, { 
      roomCode, error: error.message 
    });
    return;
  }

  console.log(`${logPrefix} Successfully cleared all votes for room ${roomCode}`);
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

  // Get all votes from database
  const allVotes = await getScenarioVotes(roomCode);

  return room.scenarios.map(scenario => {
    const scenarioVotes = allVotes.filter(vote => vote.scenarioId === scenario.id);
    
    return {
      ...scenario,
      votes: scenarioVotes.length,
      userVotes: scenarioVotes
    };
  });
}

/**
 * Gets vote counts for all scenarios in a room from the database
 */
export async function getScenarioVoteCounts(roomCode: string): Promise<Record<string, number>> {
  try {
    const { data, error } = await db
      .from('room_scenario_votes')
      .select('scenario_id')
      .eq('room_code', roomCode)
      .not('scenario_id', 'is', null);

    if (error) {
      console.error('[SCENARIO VOTE SERVICE] Error fetching vote counts', { 
        roomCode, 
        error: error.message,
        details: error.details 
      });
      return {};
    }

    if (!data) {
      return {};
    }

    const voteCounts: Record<string, number> = {};
    data.forEach(row => {
      if (row.scenario_id) {
        voteCounts[row.scenario_id] = (voteCounts[row.scenario_id] || 0) + 1;
      }
    });

    return voteCounts;
  } catch (error) {
    console.error('[SCENARIO VOTE SERVICE] Exception fetching vote counts', { 
      roomCode, 
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    return {};
  }
}

/**
 * Gets regenerate vote count for a room from the database
 */
export async function getRegenerateVoteCount(roomCode: string): Promise<number> {
  try {
    const { count, error } = await db
      .from('room_scenario_votes')
      .select('user_id', { count: 'exact', head: true })
      .eq('room_code', roomCode)
      .eq('vote_type', 'regenerate');

    if (error) {
      console.error('[SCENARIO VOTE SERVICE] Error fetching regenerate votes', { 
        roomCode, 
        error: error.message,
        details: error.details 
      });
      return 0;
    }

    return count ?? 0;
  } catch (error) {
    console.error('[SCENARIO VOTE SERVICE] Exception fetching regenerate votes', { 
      roomCode, 
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    return 0;
  }
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
