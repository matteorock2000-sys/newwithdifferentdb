import type { ActionFunctionArgs } from '@remix-run/node';
import { json } from '@remix-run/node';
import { requireUser } from '~/services/auth.server';
import { 
  recordDiceRoll, 
  getRoomDiceResults, 
  checkTiebreakerCompletion, 
  clearRoomDiceRolls,
  getPlayerSlotInfo,
  startDiceRolling, // new
  getDiceRollingState // new
} from '~/services/room.server';

/**
 * Handle dice roll actions for tiebreakers and other game mechanics
 */
export async function action({ request }: ActionFunctionArgs) {
  try {
    const user = await requireUser(request);
    const formData = await request.formData();
    const intent = formData.get('intent')?.toString();
    const roomCode = formData.get('roomCode')?.toString();
    
    if (!roomCode) {
      return json({ success: false, error: 'Missing room code.' }, { status: 400 });
    }

    if (!intent) {
      return json({ success: false, error: 'Missing intent.' }, { status: 400 });
    }

    switch (intent) {
      case 'startDiceRolling': { // new
        const success = await startDiceRolling(roomCode);
        return json({ success });
      }

      case 'getDiceRollingState': { // new
        try {
          const diceRollingState = await getDiceRollingState(roomCode);
          return json({ success: !!diceRollingState, diceRollingState });
        } catch (error) {
          console.error('[DICE API] Error fetching dice rolling state:', error);
          return json({ 
            success: false, 
            error: 'Failed to fetch dice state due to server error',
            diceRollingState: null 
          }, { status: 500 });
        }
      }

      case 'rollDice': {
        const slotIndex = parseInt(formData.get('slotIndex')?.toString() || '0');
        const diceResult = parseInt(formData.get('diceResult')?.toString() || '1');
        const diceType = formData.get('diceType')?.toString() || 'd20';
        const rollReason = formData.get('rollReason')?.toString() || 'tiebreaker';
        const userIdForSlot = formData.get('userIdForSlot')?.toString();

        if (!userIdForSlot) {
          return json({ success: false, error: 'Missing userId for slot.' }, { status: 400 });
        }

        if (!diceResult || diceResult < 1 || diceResult > 20) {
          return json({ success: false, error: 'Invalid dice result.' }, { status: 400 });
        }

        const success = await recordDiceRoll(
          roomCode,
          userIdForSlot,
          'Human', // slotType is not used meaningfully in recordDiceRoll
          slotIndex,
          diceResult,
          diceType,
          rollReason
        );

        if (!success) {
          return json({ success: false, error: 'Failed to record dice roll.' }, { status: 500 });
        }

        // The completion status is now part of the dice_rolling_state
        const state = await getDiceRollingState(roomCode);

        return json({
          success: true,
          message: `Rolled ${diceResult} for slot ${slotIndex}`,
          diceResult,
          state
        });
      }

      case 'getDiceResults': {
        const results = await getRoomDiceResults(roomCode);
        const completionStatus = await checkTiebreakerCompletion(roomCode);
        
        return json({
          success: true,
          results,
          completionStatus
        });
      }

      case 'checkCompletion': {
        const completionStatus = await checkTiebreakerCompletion(roomCode);
        
        return json({
          success: true,
          completionStatus
        });
      }

      case 'clearDiceRolls': {
        const success = await clearRoomDiceRolls(roomCode);
        
        if (!success) {
          return json({ success: false, error: 'Failed to clear dice rolls.' }, { status: 500 });
        }

        return json({
          success: true,
          message: 'Cleared all dice rolls for the room.'
        });
      }

      case 'getSlotInfo': {
        const slotInfo = await getPlayerSlotInfo(roomCode, user.id);
        
        return json({
          success: true,
          slotInfo
        });
      }

      default:
        return json({ success: false, error: 'Unknown intent.' }, { status: 400 });
    }

  } catch (error) {
    console.error('[DICE API] Error handling dice action:', error);
    
    // Handle specific database timeout errors
    if (error instanceof Error && error.message.includes('ETIMEDOUT')) {
      return json({ 
        success: true, 
        message: 'Database temporarily unavailable, using offline mode',
        offlineMode: true 
      }, { status: 200 });
    }
    
    return json({ success: false, error: 'Internal server error.' }, { status: 500 });
  }
}