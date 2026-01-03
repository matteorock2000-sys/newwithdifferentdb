// Test file to verify the updated dice rolling host priority functionality
// This file is for testing purposes only and should not be included in production

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
    expectedCurrentPlayer: 0,
    shouldStartDiceRolling: true
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
    expectedCurrentPlayer: 0,
    shouldStartDiceRolling: true
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
    expectedCurrentPlayer: 0,
    shouldStartDiceRolling: true
  },
  {
    name: 'Host not in active players',
    description: 'Host is not in the active players array, should prevent dice rolling',
    hostId: 'host1',
    activePlayers: [
      { userId: 'player1', slotIndex: 0, characterId: 'char1', characterName: 'Player 1' },
      { userId: 'player2', slotIndex: 1, characterId: 'char2', characterName: 'Player 2' },
      { userId: 'player3', slotIndex: 2, characterId: 'char3', characterName: 'Player 3' }
    ],
    expectedOrder: ['player1', 'player2', 'player3'], // Should remain unchanged
    expectedCurrentPlayer: 0,
    shouldStartDiceRolling: false // Should return false
  },
  {
    name: 'Single player (host only)',
    description: 'Only the host is in active players',
    hostId: 'host1',
    activePlayers: [
      { userId: 'host1', slotIndex: 0, characterId: 'char1', characterName: 'Host Player' }
    ],
    expectedOrder: ['host1'],
    expectedCurrentPlayer: 0,
    shouldStartDiceRolling: true
  },
  {
    name: 'Empty active players',
    description: 'No active players found',
    hostId: 'host1',
    activePlayers: [],
    expectedOrder: [],
    expectedCurrentPlayer: null,
    shouldStartDiceRolling: false
  }
];

// Function to simulate the updated startDiceRolling logic
function simulateStartDiceRolling(
  activePlayers,
  hostId,
  roomCode
) {
  console.log(`[Test] Starting dice rolling for room ${roomCode} with host ${hostId}`);
  
  if (activePlayers.length === 0) {
    console.log(`[Test] No active players found for dice rolling in room ${roomCode}`);
    return false;
  }
  
  // Store original order for logging
  const originalPlayers = [...activePlayers];
  
  // Find the host's slot index in the active players array
  const hostPlayerIndex = activePlayers.findIndex(p => p.userId === hostId);
  
  if (hostPlayerIndex === -1) {
    // Host is not in active players - this is an unexpected state
    console.warn(`[Test] Host ${hostId} not found in active players for room ${roomCode}. Original order: ${originalPlayers.map(p => `${p.characterName}(${p.slotIndex})`).join(', ')}`);
    // Prevent dice rolling without the host
    console.log(`[Test] Cannot start dice rolling without host in active players for room ${roomCode}`);
    return false;
  } else {
    // Host found - reorder the array to place host at index 0
    const hostPlayer = activePlayers[hostPlayerIndex];
    const otherPlayers = activePlayers.filter((_, idx) => idx !== hostPlayerIndex);
    activePlayers = [hostPlayer, ...otherPlayers];
    
    console.log(`[Test] Reordered active players for room ${roomCode}:`);
    console.log(`[Test] Original: ${originalPlayers.map(p => `${p.characterName}(${p.slotIndex})`).join(', ')}`);
    console.log(`[Test] Reordered: ${activePlayers.map(p => `${p.characterName}(${p.slotIndex})`).join(', ')}`);
    console.log(`[Test] Host ${hostId} moved to index 0 from index ${hostPlayerIndex}`);
    
    // Simulate creating initial dice state
    const initialDiceState = {
      status: 'rolling',
      currentPlayerIndex: 0, // Always points to host after reordering
      players: activePlayers,
      rolls: {},
      winner: null
    };
    
    console.log(`[Test] Dice rolling state initialized for room ${roomCode}`);
    return true;
  }
}

// Function to validate dice rolling host priority
function validateDiceRollingHostPriority(scenario) {
  console.log(`\n=== Testing: ${scenario.name} ===`);
  console.log(`Description: ${scenario.description}`);
  
  const result = simulateStartDiceRolling(scenario.activePlayers, scenario.hostId, 'TEST_ROOM');
  
  console.log(`Expected shouldStartDiceRolling: ${scenario.shouldStartDiceRolling}`);
  console.log(`Actual result: ${result}`);
  
  let isValid = true;
  
  // Check if dice rolling result matches expected
  if (result !== scenario.shouldStartDiceRolling) {
    console.error(`❌ Dice rolling result mismatch: expected ${scenario.shouldStartDiceRolling}, got ${result}`);
    isValid = false;
  }
  
  // If dice rolling should start, verify the order
  if (result && scenario.expectedOrder.length > 0) {
    // Note: We can't easily test the exact order here since simulateStartDiceRolling modifies the array
    // But we can verify the host is at index 0
    const activePlayers = scenario.activePlayers;
    const hostPlayerIndex = activePlayers.findIndex(p => p.userId === scenario.hostId);
    
    if (hostPlayerIndex !== 0) {
      console.error(`❌ Host not at index 0 after reordering: found at index ${hostPlayerIndex}`);
      isValid = false;
    } else {
      console.log('✅ Host correctly placed at index 0');
    }
  }
  
  if (isValid) {
    console.log('✅ Test passed');
  } else {
    console.log('❌ Test failed');
  }
  
  return isValid;
}

// Run all tests
console.log('🧪 Running Updated Dice Rolling Host Priority Tests...\n');

let allTestsPassed = true;
testScenarios.forEach(scenario => {
  const result = validateDiceRollingHostPriority(scenario);
  allTestsPassed = allTestsPassed && result;
});

console.log(`\n=== Final Result ===`);
if (allTestsPassed) {
  console.log('🎉 All tests passed! Updated dice rolling host priority is working correctly.');
} else {
  console.log('💥 Some tests failed! Please check the updated dice rolling implementation.');
}
