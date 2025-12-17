const fs = require('fs');

// Update _index.tsx (Dashboard)
let indexContent = fs.readFileSync('app/routes/_index.tsx', 'utf8');
indexContent = indexContent.replace(
    /<PlayerSetupSlot\s+slotIndex={index}\s+playerSlot={slot}/g,
    '<PlayerSetupSlot\n                slotIndex={index}\n                playerSlot={slot}\n                viewMode="dashboard"'
);
fs.writeFileSync('app/routes/_index.tsx', indexContent);
console.log('Updated _index.tsx with dashboard viewMode');

// Update rooms.tsx (Rooms)
let roomsContent = fs.readFileSync('app/routes/rooms.tsx', 'utf8');
roomsContent = roomsContent.replace(
    /<PlayerSetupSlot\s+slotIndex={index}\s+playerSlot={slot}/g,
    '<PlayerSetupSlot\n                slotIndex={index}\n                playerSlot={slot}\n                viewMode="rooms"'
);
fs.writeFileSync('app/routes/rooms.tsx', roomsContent);
console.log('Updated rooms.tsx with rooms viewMode');

// Update game.tsx (Lobby)
let gameContent = fs.readFileSync('app/routes/game.tsx', 'utf8');
gameContent = gameContent.replace(
    /<PlayerSetupSlot\s+slotIndex={index}\s+playerSlot={slot}/g,
    '<PlayerSetupSlot\n                slotIndex={index}\n                playerSlot={slot}\n                viewMode="lobby"'
);
fs.writeFileSync('app/routes/game.tsx', gameContent);
console.log('Updated game.tsx with lobby viewMode');
