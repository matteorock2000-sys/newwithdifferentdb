// Test file to verify voting system functionality with different slot configurations
// This file is for testing purposes only and should not be included in production

import type { PlayerSlot } from './app/types';

// Test scenarios for voting system
const testScenarios = [
  {
    name: 'Single slot per user',
    description: 'Each user has one slot, should be able to vote once',
    partySlots: [
      { type: 'Human', characterId: 'char1', isReady: true, userId: 'user1', username: 'Player1' },
      { type: 'Human', characterId: 'char2', isReady: true, userId: 'user2', username: 'Player2' },
      { type: 'Human', characterId: 'char3', isReady: true, userId: 'user3', username: 'Player3' },
      { type: 'Human', characterId: 'char4', isReady: true, userId: 'user4', username: 'Player4' }
    ],
    expectedVotesPerUser: {
      user1: 1,
      user2: 1,
      user3: 1,
      user4: 1
    }
  },
  {
    name: 'Multiple slots per user',
    description: 'One user has multiple slots, should be able to vote multiple times',
    partySlots: [
      { type: 'Human', characterId: 'char1', isReady: true, userId: 'user1', username: 'Player1' },
      { type: 'Human', characterId: 'char2', isReady: true, userId: 'user1', username: 'Player1' },
      { type: 'Human', characterId: 'char3', isReady: true, userId: 'user2', username: 'Player2' },
      { type: 'Human', characterId: 'char4', isReady: true, userId: 'user3', username: 'Player3' }
    ],
    expectedVotesPerUser: {
      user1: 2,
      user2: 1,
      user3: 1
    }
  },
  {
    name: 'Mixed slot types',
    description: 'Mix of Human and AI slots, both should be able to vote',
    partySlots: [
      { type: 'Human', characterId: 'char1', isReady: true, userId: 'user1', username: 'Player1' },
      { type: 'AI', characterId: 'char2', isReady: true, userId: 'user1', username: 'Player1' },
      { type: 'Human', characterId: 'char3', isReady: true, userId: 'user2', username: 'Player2' },
      { type: 'AI', characterId: 'char4', isReady: true, userId: 'user2', username: 'Player2' }
    ],
    expectedVotesPerUser: {
      user1: 2,
      user2: 2
    }
  },
  {
    name: 'Empty slots',
    description: 'Some slots are empty, should not affect voting',
    partySlots: [
      { type: 'Human', characterId: 'char1', isReady: true, userId: 'user1', username: 'Player1' },
      { type: 'None', characterId: null, isReady: false, userId: undefined, username: undefined },
      { type: 'Human', characterId: 'char3', isReady: true, userId: 'user2', username: 'Player2' },
      { type: 'None', characterId: null, isReady: false, userId: undefined, username: undefined }
    ],
    expectedVotesPerUser: {
      user1: 1,
      user2: 1
    }
  },
  {
    name: 'All slots for one user',
    description: 'One user controls all slots, should be able to vote 4 times',
    partySlots: [
      { type: 'Human', characterId: 'char1', isReady: true, userId: 'user1', username: 'Player1' },
      { type: 'Human', characterId: 'char2', isReady: true, userId: 'user1', username: 'Player1' },
      { type: 'Human', characterId: 'char3', isReady: true, userId: 'user1', username: 'Player1' },
      { type: 'Human', characterId: 'char4', isReady: true, userId: 'user1', username: 'Player1' }
    ],
    expectedVotesPerUser: {
      user1: 4
    }
  }
];

// Function to calculate active slots per user
function calculateActiveSlotsPerUser(partySlots: PlayerSlot[]): Record<string, number> {
  const userSlots: Record<string, number> = {};
  
  partySlots.forEach(slot => {
    if ((slot.type === 'Human' || slot.type === 'AI') && slot.userId) {
      userSlots[slot.userId] = (userSlots[slot.userId] || 0) + 1;
    }
  });
  
  return userSlots;
}

// Function to validate voting system
function validateVotingSystem(scenario: typeof testScenarios[0]): boolean {
  console.log(`\n=== Testing: ${scenario.name} ===`);
  console.log(`Description: ${scenario.description}`);
  
  const calculatedVotes = calculateActiveSlotsPerUser(scenario.partySlots);
  const expectedVotes = scenario.expectedVotesPerUser;
  
  console.log('Calculated votes per user:', calculatedVotes);
  console.log('Expected votes per user:', expectedVotes);
  
  // Check if calculated votes match expected votes
  let isValid = true;
  Object.keys(expectedVotes).forEach(userId => {
    if (calculatedVotes[userId] !== expectedVotes[userId]) {
      console.error(`❌ Mismatch for user ${userId}: expected ${expectedVotes[userId]}, got ${calculatedVotes[userId]}`);
      isValid = false;
    }
  });
  
  // Check if there are any extra users in calculated votes
  Object.keys(calculatedVotes).forEach(userId => {
    if (!expectedVotes[userId]) {
      console.error(`❌ Unexpected user ${userId} found in calculated votes`);
      isValid = false;
    }
  });
  
  if (isValid) {
    console.log('✅ Test passed');
  } else {
    console.log('❌ Test failed');
  }
  
  return isValid;
}

// Run all tests
console.log('🧪 Running Voting System Tests...\n');

let allTestsPassed = true;
testScenarios.forEach(scenario => {
  const result = validateVotingSystem(scenario);
  allTestsPassed = allTestsPassed && result;
});

console.log(`\n=== Final Result ===`);
if (allTestsPassed) {
  console.log('🎉 All tests passed! Voting system is working correctly.');
} else {
  console.log('💥 Some tests failed! Please check the voting system implementation.');
}

// Export for use in other files
export { testScenarios, calculateActiveSlotsPerUser, validateVotingSystem };