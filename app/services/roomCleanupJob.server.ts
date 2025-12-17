import { db } from "~/services/db.server";
import { calculateInactivityCleanup, persistRoomUpdate, checkAndCleanupRoom } from "./roomCleanup.server";
import { logger } from "~/utils/logger";

interface RoomCleanupJobResult {
  roomsProcessed: number;
  roomsUpdated: number;
  roomsDeleted: number;
  errors: string[];
}

/**
 * Background cleanup job that runs every 2 minutes to clean up inactive rooms and participants.
 * This should be called by a scheduled function or interval to avoid running cleanup on every
 * room fetch and heartbeat.
 */
export async function runRoomCleanupJob(): Promise<RoomCleanupJobResult> {
  const result: RoomCleanupJobResult = {
    roomsProcessed: 0,
    roomsUpdated: 0,
    roomsDeleted: 0,
    errors: []
  };

  try {
    logger.info('[CLEANUP-JOB] Starting background room cleanup job');

    // Fetch rooms that haven't been cleaned up recently (every 2 minutes)
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    
    const { data: rooms, error: fetchError } = await db
      .from('rooms')
      .select(`
        id,
        name,
        code,
        owner_id,
        user_id,
        host_id,
        status,
        created_at,
        updated_at,
        participants,
        setup_slots,
        active_slots,
        scenarios,
        dice_rolling_state,
        scenario_winner_id
      `)
      .neq('status', 'finished')
      .lt('updated_at', twoMinutesAgo);

    if (fetchError) {
      throw new Error(`Failed to fetch rooms for cleanup: ${fetchError.message}`);
    }

    if (!rooms || rooms.length === 0) {
      logger.debug('[CLEANUP-JOB] No rooms need cleanup at this time');
      return result;
    }

    logger.info(`[CLEANUP-JOB] Processing ${rooms.length} rooms for cleanup`);

    // Process rooms in batches to avoid overwhelming the database
    const batchSize = 10;
    for (let i = 0; i < rooms.length; i += batchSize) {
      const batch = rooms.slice(i, i + batchSize);
      
      await Promise.all(batch.map(async (room) => {
        try {
          result.roomsProcessed++;
          
          // Apply inactivity cleanup
          const { updatedRoom, needsDBUpdate } = await calculateInactivityCleanup(room);
          
          // Persist changes if needed
          if (needsDBUpdate) {
            const updatedRoomFromDB = await persistRoomUpdate(room.code, updatedRoom);
            if (updatedRoomFromDB) {
              result.roomsUpdated++;
            }
          }
          
          // Check for room deletion
          await checkAndCleanupRoom(room);
          result.roomsDeleted++;
          
        } catch (error) {
          logger.error(`[CLEANUP-JOB] Error processing room ${room.code}`, { error });
          result.errors.push(`Room ${room.code}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }));
      
      // Small delay between batches to prevent overwhelming the database
      if (i + batchSize < rooms.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    logger.info(`[CLEANUP-JOB] Completed cleanup job`, {
      roomsProcessed: result.roomsProcessed,
      roomsUpdated: result.roomsUpdated,
      roomsDeleted: result.roomsDeleted,
      errors: result.errors.length
    });

  } catch (error) {
    logger.error('[CLEANUP-JOB] Failed to run cleanup job', { error });
    result.errors.push(`Job error: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  return result;
}

/**
 * Schedule the cleanup job to run every 2 minutes.
 * This should be called once during server startup.
 */
export function scheduleRoomCleanupJob(): NodeJS.Timeout {
  logger.info('[CLEANUP-JOB] Scheduling room cleanup job every 2 minutes');
  
  return setInterval(async () => {
    try {
      const result = await runRoomCleanupJob();
      
      // Log summary if there were any changes or errors
      if (result.roomsUpdated > 0 || result.roomsDeleted > 0 || result.errors.length > 0) {
        logger.info('[CLEANUP-JOB] Job completed with summary', {
          roomsProcessed: result.roomsProcessed,
          roomsUpdated: result.roomsUpdated,
          roomsDeleted: result.roomsDeleted,
          errors: result.errors.length
        });
      }
    } catch (error) {
      logger.error('[CLEANUP-JOB] Scheduled job failed', { error });
    }
  }, 2 * 60 * 1000); // 2 minutes
}
