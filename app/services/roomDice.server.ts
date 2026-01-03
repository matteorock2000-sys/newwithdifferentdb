import { db } from "~/services/db.server";
import type { DiceRollingState } from "~/types";
import { getRoomByCode, withOptimisticLock } from "~/services/roomCore.server";
import { logger } from "~/utils/logger";

// Type definitions for dice-related types
export interface DiceRollResult {
  slotIndex: number;
  userId: string;
  result: number;
  characterName: string;
}

export interface TiebreakerStatus {
  isComplete: boolean;
  winner: number | null;
  results: Array<{ slotIndex: number; result: number }>;
}

// Retry logic constants
const MAX_DICE_RETRIES = 3;
const DICE_RETRY_DELAY_MS = 1000;

/**
 * Initiates a dice rolling sequence for a room, typically for tie-breaking.
 * @param roomCode - The code of the room.
 * @returns A promise that resolves when the dice rolling state is initiated.
 */
export async function startDiceRolling(roomCode: string): Promise<boolean> {
    logger.debug(`[roomDice.server] startDiceRolling: room ${roomCode}`);
    
    try {
        const room = await getRoomByCode(roomCode);
        if (!room) {
            logger.warn(`[roomDice.server] Room not found: ${roomCode}`);
            return false;
        }
        
        // Extract active players from setup_slots
        let activePlayers = room.setup_slots
            .map((slot, index) => {
                if (slot && (slot.type === 'Human' || slot.type === 'AI')) {
                    return {
                        userId: slot.userId || (slot.type === 'AI' ? room.host_id : 'unknown'),
                        slotIndex: index,
                        characterId: slot.characterId || 'unknown',
                        characterName: slot.characterName || `Player ${index + 1}`
                    };
                }
                return null;
            })
            .filter(Boolean) as Array<{
                userId: string;
                slotIndex: number;
                characterId: string;
                characterName: string;
            }>;

        // Resolve character names from character data to ensure accuracy
        if (activePlayers.length > 0) {
            const characterIds = activePlayers.map(p => p.characterId).filter(id => id !== 'unknown');
            if (characterIds.length > 0) {
                // Fetch all characters mentioned in the room slots
                const { data: charactersData, error: charsError } = await db
                    .from('characters')
                    .select('id, name, userId')
                    .in('id', characterIds);

                if (charsError) {
                    logger.warn(`[roomDice.server] Error fetching characters for dice rolling:`, { roomCode, error: charsError.message });
                } else if (charactersData) {
                    // Create a map of characterId to character name
                    const characterMap = new Map(charactersData.map(c => [c.id, c.name]));
                    
                    // Update activePlayers with correct character names
                    activePlayers = activePlayers.map(player => {
                        const characterName = characterMap.get(player.characterId) || 
                                            player.characterName || 
                                            `Player ${player.slotIndex + 1}`;
                        
                        return {
                            ...player,
                            characterName
                        };
                    });
                    
                    logger.debug(`[roomDice.server] Updated character names for dice rolling:`, {
                        roomCode,
                        players: activePlayers.map(p => ({ slotIndex: p.slotIndex, characterName: p.characterName }))
                    });
                }
            }
        }
        
        if (activePlayers.length === 0) {
            logger.warn(`[roomDice.server] No active players found for dice rolling in room ${roomCode}`);
            return false;
        }
        
        // Ensure the host rolls first in the turn order
        // This maintains consistency with the tiebreaker logic where the host wins ties
        // and provides a clear, predictable turn sequence for all players
        
        // Store original order for logging
        const originalPlayers = [...activePlayers];
        
        // Find the host's slot index in the active players array
        const hostPlayerIndex = activePlayers.findIndex(p => p.userId === room.host_id);
        
        if (hostPlayerIndex === -1) {
            // Host is not in active players - this is an unexpected state
            logger.warn(`[roomDice.server] Host ${room.host_id} not found in active players for room ${roomCode}. Original order: ${originalPlayers.map(p => `${p.characterName}(${p.slotIndex})`).join(', ')}`);
            // Prevent dice rolling without the host
            logger.debug(`[roomDice.server] Cannot start dice rolling without host in active players for room ${roomCode}`);
            return false;
        } else {
            // Host found - reorder the array to place host at index 0
            const hostPlayer = activePlayers[hostPlayerIndex];
            const otherPlayers = activePlayers.filter((_, idx) => idx !== hostPlayerIndex);
            activePlayers = [hostPlayer, ...otherPlayers];
            
            logger.debug(`[roomDice.server] Reordered active players for room ${roomCode}:`);
            logger.debug(`[roomDice.server] Original: ${originalPlayers.map(p => `${p.characterName}(${p.slotIndex})`).join(', ')}`);
            logger.debug(`[roomDice.server] Reordered: ${activePlayers.map(p => `${p.characterName}(${p.slotIndex})`).join(', ')}`);
            logger.debug(`[roomDice.server] Host ${room.host_id} moved to index 0 from index ${hostPlayerIndex}`);
        }
        
        // Initialize dice rolling state
        const initialDiceState: DiceRollingState = {
            status: 'rolling',
            currentPlayerIndex: 0, // Always points to host after reordering
            players: activePlayers,
            rolls: {},
            winner: null
        };
        
        // Update room with new dice state
        const { error } = await db.from("rooms").update({
            dice_rolling_state: initialDiceState,
            updated_at: new Date().toISOString()
        }).eq("code", roomCode);
        
        if (error) {
            logger.error(`[roomDice.server] Error starting dice rolling:`, { roomCode, error });
            return false;
        }
        
        return true;
    } catch (error) {
        logger.error(`[roomDice.server] Exception starting dice rolling:`, { roomCode, error });
        return false;
    }
}

/**
 * Records a single dice roll for a participant in a room.
 * @param roomCode - The code of the room.
 * @param userId - The ID of the user who rolled the dice.
 * @param slotType - The type of the slot ('Human' or 'AI').
 * @param slotIndex - The index of the slot for which the dice was rolled.
 * @param diceResult - The result of the dice roll.
 * @param diceType - The type of dice rolled (e.g., 'd20').
 * @param rollReason - The reason for the roll (e.g., 'tiebreaker').
 * @returns A promise that resolves with the updated DiceRollingState.
 */
export async function recordDiceRoll(
    roomCode: string,
    userId: string,
    slotType: string,
    slotIndex: number,
    diceResult: number,
    diceType: string,
    rollReason: string
): Promise<boolean> {
    logger.debug(`[roomDice.server] recordDiceRoll: room ${roomCode}, user ${userId}, slot ${slotIndex}, result ${diceResult}`);
    
    try {
        // Use optimistic locking for concurrent updates
        const result = await withOptimisticLock(async () => {
            const room = await getRoomByCode(roomCode);
            if (!room || !room.dice_rolling_state) {
                logger.warn(`[roomDice.server] No active dice rolling state found for room ${roomCode}`);
                return false;
            }
            
            const diceRollingState = { ...room.dice_rolling_state };
            
            // Validate the player is allowed to roll
            const currentPlayer = diceRollingState.players[diceRollingState.currentPlayerIndex];
            if (!currentPlayer || currentPlayer.slotIndex !== slotIndex || currentPlayer.userId !== userId) {
                logger.warn(`[roomDice.server] Invalid dice roll attempt by ${userId} at slot ${slotIndex}`);
                return false;
            }
            
            // Record the roll
            diceRollingState.rolls[slotIndex] = diceResult;
            
            // Check if all players have rolled
            const allPlayersRolled = diceRollingState.players.every(player => 
                diceRollingState.rolls[player.slotIndex] !== undefined
            );
            
            // Update current player index to next player who hasn't rolled yet
            if (!allPlayersRolled) {
                let nextPlayerIndex = diceRollingState.currentPlayerIndex;
                do {
                    nextPlayerIndex = (nextPlayerIndex + 1) % diceRollingState.players.length;
                } while (
                    nextPlayerIndex !== diceRollingState.currentPlayerIndex &&
                    diceRollingState.rolls[diceRollingState.players[nextPlayerIndex].slotIndex] !== undefined
                );
                
                diceRollingState.currentPlayerIndex = nextPlayerIndex;
            }
            
            if (allPlayersRolled) {
                // Determine winner
                let maxRoll = -1;
                const potentialWinners: Array<{ slotIndex: number; userId: string }> = [];
                
                const hostId = room.host_id;
                
                for (const player of diceRollingState.players) {
                    const roll = diceRollingState.rolls[player.slotIndex];
                    if (roll > maxRoll) {
                        maxRoll = roll;
                        potentialWinners.length = 0;
                        potentialWinners.push({ slotIndex: player.slotIndex, userId: player.userId });
                    } else if (roll === maxRoll) {
                        potentialWinners.push({ slotIndex: player.slotIndex, userId: player.userId });
                    }
                }
                
                logger.debug(`[roomDice.server] Max roll: ${maxRoll}, potential winners: ${potentialWinners.length}`);
                
                let winnerIndex = -1;
                let winnerCharacterId = '';
                
                if (potentialWinners.length === 1) {
                    winnerIndex = potentialWinners[0].slotIndex;
                    const winnerPlayer = diceRollingState.players.find(p => p.slotIndex === winnerIndex);
                    winnerCharacterId = winnerPlayer?.characterId || '';
                    logger.debug(`[roomDice.server] Single winner: ${winnerIndex} (character: ${winnerCharacterId})`);
                } else if (potentialWinners.length > 1) {
                    const hostWinner = potentialWinners.find(p => p.userId === hostId);
                    if (hostWinner) {
                        winnerIndex = hostWinner.slotIndex;
                        const winnerPlayer = diceRollingState.players.find(p => p.slotIndex === winnerIndex);
                        winnerCharacterId = winnerPlayer?.characterId || '';
                        logger.debug(`[roomDice.server] Host winner in tie: ${winnerIndex} (character: ${winnerCharacterId})`);
                    } else {
                        // If host is not in the tie, default to the first person who rolled that score
                        winnerIndex = potentialWinners[0].slotIndex;
                        const winnerPlayer = diceRollingState.players.find(p => p.slotIndex === winnerIndex);
                        winnerCharacterId = winnerPlayer?.characterId || '';
                        logger.debug(`[roomDice.server] First winner in tie: ${winnerIndex} (character: ${winnerCharacterId})`);
                    }
                }
                
                diceRollingState.winner = winnerIndex;
                diceRollingState.winnerCharacterId = winnerCharacterId;
                diceRollingState.status = 'completed';
                logger.debug(`[roomDice.server] Dice rolling completed, winner: ${winnerIndex} (character: ${winnerCharacterId}), status: ${diceRollingState.status}`);
            }
            
            // Update room record with new state
            const { error: updateError } = await db.from('rooms').update({ 
                dice_rolling_state: diceRollingState,
                updated_at: new Date().toISOString()
            }).eq('code', roomCode);
            
            if (updateError) {
                logger.error(`[roomDice.server] Error updating room dice rolling state:`, { roomCode, updateError });
                throw updateError;
            }
            
            return true;
        });
        
        return result;
    } catch (error) {
        logger.error(`[roomDice.server] Error recording dice roll:`, error);
        return false;
    }
}

/**
 * Retrieves the current dice rolling state for a room.
 * @param roomCode - The code of the room.
 * @returns A promise that resolves with the DiceRollingState, or null if not active.
 */
export async function getDiceRollingState(roomCode: string): Promise<DiceRollingState | null> {
    logger.debug(`[roomDice.server] getDiceRollingState called for room: ${roomCode}`);
    
    try {
        const { data, error } = await db.from('rooms').select('dice_rolling_state').eq('code', roomCode).single();
        
        logger.debug(`[roomDice.server] getDiceRollingState query result:`, { data, error });
        
        if (error || !data) {
            logger.error(`[roomDice.server] Error fetching dice rolling state:`, { roomCode, error });
            return null;
        }
        
        // Reduce verbosity - only log when there's actual dice data
        if (data.dice_rolling_state && Object.keys(data.dice_rolling_state.rolls || {}).length > 0) {
            logger.debug('Returning dice rolling state:', data.dice_rolling_state);
        } else {
            logger.debug(`[roomDice.server] getDiceRollingState: room ${roomCode} (no active rolls)`);
        }
        return data.dice_rolling_state || null;
    } catch (error) {
        logger.error(`[roomDice.server] Exception getting dice rolling state:`, { roomCode, error });
        return null;
    }
}

/**
 * Retrieves all recorded dice results for a room.
 * @param roomCode - The code of the room.
 * @returns A promise that resolves with an array of DiceRollResult.
 */
export async function getRoomDiceResults(roomCode: string): Promise<DiceRollResult[]> {
    logger.debug(`[roomDice.server] getRoomDiceResults: room ${roomCode}`);
    
    try {
        const diceRollingState = await getDiceRollingState(roomCode);
        
        if (!diceRollingState) {
            logger.warn(`[roomDice.server] No dice rolling state found for room ${roomCode}`);
            return [];
        }
        
        // Map rolls to array with player details
        const results: DiceRollResult[] = [];
        
        for (const [slotIndexStr, result] of Object.entries(diceRollingState.rolls)) {
            const slotIndex = parseInt(slotIndexStr);
            const player = diceRollingState.players.find((p) => p.slotIndex === slotIndex);
            
            if (player && result !== undefined) {
                results.push({
                    slotIndex,
                    userId: player.userId,
                    result: result as number,
                    characterName: player.characterName
                });
            }
        }
        
        // Sort by slotIndex
        return results.sort((a, b) => a.slotIndex - b.slotIndex);
    } catch (error) {
        logger.error(`[roomDice.server] Error getting room dice results:`, { roomCode, error });
        return [];
    }
}

/**
 * Checks if a tiebreaker dice roll is complete and determines the winner.
 * @param roomCode - The code of the room.
 * @returns A promise that resolves with the TiebreakerStatus.
 */
export async function checkTiebreakerCompletion(roomCode: string): Promise<TiebreakerStatus> {
    logger.debug(`[roomDice.server] checkTiebreakerCompletion: room ${roomCode}`);
    
    try {
        const diceRollingState = await getDiceRollingState(roomCode);
        
        if (!diceRollingState) {
            return { isComplete: false, winner: null, results: [] };
        }
        
        return {
            isComplete: diceRollingState.status === 'completed',
            winner: diceRollingState.winner,
            results: Object.entries(diceRollingState.rolls).map(([slotIndex, result]) => ({
                slotIndex: parseInt(slotIndex),
                result
            }))
        };
    } catch (error) {
        logger.error(`[roomDice.server] Error checking tiebreaker completion:`, { roomCode, error });
        return { isComplete: false, winner: null, results: [] };
    }
}

/**
 * Clears all dice roll data for a room.
 * @param roomCode - The code of the room.
 * @returns A promise that resolves when the dice rolls are cleared.
 */
export async function clearRoomDiceRolls(roomCode: string): Promise<boolean> {
    logger.debug(`[roomDice.server] clearRoomDiceRolls: room ${roomCode}`);
    
    try {
        const { error } = await db.from('rooms').update({ 
            dice_rolling_state: {
                status: 'not-started',
                currentPlayerIndex: 0,
                players: [],
                rolls: {},
                winner: null
            },
            updated_at: new Date().toISOString()
        }).eq('code', roomCode);
        
        if (error) {
            logger.error(`[roomDice.server] Error clearing dice rolls:`, { roomCode, error });
            return false;
        }
        
        return true;
    } catch (error) {
        logger.error(`[roomDice.server] Error clearing room dice rolls:`, { roomCode, error });
        return false;
    }
}

/**
 * Retrieves player slot information for dice rolling.
 * @param roomCode - The code of the room.
 * @param userId - The ID of the user.
 * @returns A promise that resolves with an array of player slot info.
 */
export async function getPlayerSlotInfo(roomCode: string, userId: string): Promise<Array<{ slotIndex: number; characterId: string; characterName: string }>> {
    logger.debug(`[roomDice.server] getPlayerSlotInfo: room ${roomCode}, user ${userId}`);
    
    try {
        const { data, error } = await db.from('rooms').select('setup_slots').eq('code', roomCode).single();
        
        if (error || !data) {
            logger.error(`[roomDice.server] Error fetching player slot info:`, { roomCode, userId, error });
            return [];
        }
        
        const slots: Array<{ slotIndex: number; characterId: string; characterName: string }> = [];
        
        if (data.setup_slots) {
            for (let i = 0; i < data.setup_slots.length; i++) {
                const slot = data.setup_slots[i];
                if (slot && slot.userId === userId) {
                    slots.push({
                        slotIndex: i,
                        characterId: slot.characterId || '',
                        characterName: slot.characterName || `Player ${i + 1}`
                    });
                }
            }
        }
        
        return slots;
    } catch (error) {
        logger.error(`[roomDice.server] Error getting player slot info:`, { roomCode, userId, error });
        return [];
    }
}
