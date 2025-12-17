import { maskSensitiveData, logger } from './logger';

// Test data masking
const testContext = {
  userId: '12345678-1234-1234-1234-123456789012',
  roomCode: 'ABC123',
  characterId: '87654321-4321-4321-4321-210987654321',
  username: 'john_doe',
  slotIndex: 0
};

const masked = maskSensitiveData(testContext);
logger.info('Masked data', masked);

// Expected output:
// {
//   userId: '12345678...',
//   roomCode: 'ABC***',
//   characterId: '87654321...',
//   username: 'john_doe',
//   slotIndex: 0
// }

// Test logger methods
logger.debug('Debug message', testContext);
logger.info('Info message', testContext);
logger.warn('Warning message', testContext);
logger.error('Error message', testContext);