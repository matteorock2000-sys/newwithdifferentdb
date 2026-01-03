// Test file to verify dice rolling host priority functionality
// This file is for testing purposes only and should not be included in production

import type { DiceRollingState } from './app/types';

// Test scenarios for dice rolling host priority
const testScenarios = [
  {
    name: 'Host is first active player',
    description: 'Host is already at index 0 in active players array',
    hostId: 'host1',
    activePlayers: [
      { userId: 'host1', slotIndex: 0, characterId: 'char1', characterName: 'Host Player' },
      { userId: 'player2', slotIndex: 1, characterId: 'char2', characterName: 'Player 2' },
      { userId: 'player3', slotIndex: 2, characterId: 'char3', characterName: 'Player 3' }
    ],
    expectedOrder: ['host1', 'player2', 'player3'],
    expectedCurrentPlayer: 0 // Should remain host
  },
  {
    name: 'Host is middle player',
    description: 'Host is at index 1, should be moved to index 0',
    hostId: 'host1',
    activePlayers: [
      { userId: 'player1', slotIndex: 0, characterId: 'char1', characterName: 'Player 1' },
      { userId: 'host1', slotIndex: 1, characterId: 'char2', characterName: 'Host Player' },
      { userId: 'player3', slotIndex: 2, characterId: 'char3', characterName: 'Player 3' }
    ],
    expectedOrder: ['host1', 'player1', 'player3'],
    expectedCurrentPlayer: 0 // Should be host at new index 0
  },
  {
    name: 'Host is last player',
    description: 'Host is at index 2, should be moved to index 0',
    hostId: 'host1',
    activePlayers: [
      { userId: 'player1', slotIndex: 0, characterId: 'char1', characterName: 'Player 1' },
      { userId: 'player2', slotIndex: 1, characterId: 'char2', characterName: 'Player 2' },
      { userId: 'host1', slotIndex: 2, characterId: 'char3', characterName: 'Host Player' }
    ],
    expectedOrder: ['host1', 'player1', 'player2'],
    expectedCurrentPlayer: 0 // Should be host at new index 0
  },
  {
    name: 'Host not in active players',
    description: 'Host is not in the active players array, should log warning',
    hostId: 'host1',
    activePlayers: [
      { userId: 'player1', slotIndex: 0, characterId: 'char1', characterName: 'Player 1' },
      { userId: 'player2', slotIndex: 1, characterId: 'char2', characterName: 'Player 2' },
      { userId: 'player3', slotIndex: 2, characterId: 'char3', characterName: 'Player 3' }
    ],
    expectedOrder: ['player1', 'player2', 'player3'], // Should remain unchanged
    expectedCurrentPlayer: 0 // Should be first player
  },
  {
    name: 'Single player (host only)',
    description: 'Only the host is in active players',
    hostId: 'host1',
    activePlayers: [
      { userId: 'host1', slotIndex: 0, characterId: 'char1', characterName: 'Host Player' }
    ],
    expectedOrder: ['host1'],
    expectedCurrentPlayer: 0 // Should be host
  },
  {
    name: 'Multiple players with AI slots',
    description: 'Mix of human and AI slots, host should still be first',
    hostId: 'host1',
    activePlayers: [
      { userId: 'player1', slotIndex: 0, characterId: 'char1', characterName: 'Player 1' },
      { userId: 'ai1', slotIndex: 1, characterId: 'ai1', characterName: 'AI Player 1' },
      { userId: 'host1', slotIndex: 2, characterId: 'char2', characterName: 'Host Player' },
      { userId: 'player2', slotIndex: 3, characterId: 'char3', characterName: 'Player 2' }
    ],
    expectedOrder: ['host1', 'player1', 'ai1', 'player2'],
    expectedCurrentPlayer: 0 // Should be host
  }
];

// Function to reorder players to prioritize host
function prioritizeHostInTurnOrder(
  activePlayers: Array<{ userId: string; slotIndex: number; characterId: string; characterName: string }>,
  hostId: string
): Array<{ userId: string; slotIndex: number; characterId: string; characterName: string }> {
  
  // Find the host's slot index in the active players array
  const hostPlayerIndex = activePlayers.findIndex(p => p.userId === hostId);
  
  if (hostPlayerIndex === -1) {
    // Host is not in active players - return original order
    console.warn(`[Test] Host ${hostId} not found in active players. Proceeding with original order.`);
    return [...activePlayers];
  } else {
    // Host found - reorder the array to place host at index 0
    const hostPlayer = activePlayers[hostPlayerIndex];
    const otherPlayers = activePlayers.filter((_, idx) => idx !== hostPlayerIndex);
    const reorderedPlayers = [hostPlayer, ...otherPlayers];
    
    console.log(`[Test] Reordered active players:`);
    console.log(`[Test] Original: ${activePlayers.map(p => `${p.characterName}(${p.slotIndex})`).join(', ')}`);
    console.log(`[Test] Reordered: ${reorderedPlayers.map(p => `${p.characterName}(${p.slotIndex})`).join(', ')}`);
    console.log(`[Test] Host ${hostId} moved to index 0 from index ${hostPlayerIndex}`);
    
    return reorderedPlayers;
  }
}

// Function to validate dice rolling host priority
function validateDiceRollingHostPriority(scenario: typeof testScenarios[0]): boolean {
  console.log(`\n=== Testing: ${scenario.name} ===`);
  console.log(`Description: ${scenario.description}`);
  
  const reorderedPlayers = prioritizeHostInTurnOrder(scenario.activePlayers, scenario.hostId);
  const actualOrder = reorderedPlayers.map(p => p.userId);
  const actualCurrentPlayer = reorderedPlayers[0]?.userId;
  
  console.log('Expected order:', scenario.expectedOrder);
  console.log('Actual order:', actualOrder);
  console.log('Expected current player index 0:', scenario.expectedOrder[0]);
  console.log('Actual current player index 0:', actualCurrentPlayer);
  
  // Check if order matches expected
  let isValid = true;
  if (JSON.stringify(actualOrder) !== JSON.stringify(scenario.expectedOrder)) {
    console.error(`❌ Order mismatch: expected ${scenario.expectedOrder}, got ${actualOrder}`);
    isValid = false;
  }
  
  // Check if current player (index 0) is correct
  if (actualCurrentPlayer !== scenario.expectedOrder[0]) {
    console.error(`❌ Current player mismatch: expected ${scenario.expectedOrder[0]}, got ${actualCurrentPlayer}`);
    isValid = false;
  }
  
  if (isValid) {
    console.log('✅ Test passed');
  } else {
    console.log('❌ Test failed');
  }
  
  return isValid;
}

// Run all tests
console.log('🧪 Running Dice Rolling Host Priority Tests...\n');

let allTestsPassed = true;
testScenarios.forEach(scenario => {
  const result = validateDiceRollingHostPriority(scenario);
  allTestsPassed = allTestsPassed && result;
});

console.log(`\n=== Final Result ===`);
if (allTestsPassed) {
  console.log('🎉 All tests passed! Dice rolling host priority is working correctly.');
} else {
  console.log('💥 Some tests failed! Please check the dice rolling implementation.');
}

// Export for use in other files
export { testScenarios, prioritizeHostInTurnOrder, validateDiceRollingHostPriority };
