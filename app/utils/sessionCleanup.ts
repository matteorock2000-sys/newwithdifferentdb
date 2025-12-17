import { getSession, commitSession } from '~/sessions';

/**
 * Cleans up temporary session data after a room is completed or abandoned.
 */
export function cleanupSession(session: any): any {
  // Remove temporary session data
  session.unset('party');
  session.unset('scenario');
  session.unset('messages');
  session.unset('diceResults');
  session.unset('currentScenario');
  session.unset('characterCacheId');
  session.unset('scenarioCacheId');
  session.unset('mapCacheId');
  session.unset('error');
  
  return session;
}