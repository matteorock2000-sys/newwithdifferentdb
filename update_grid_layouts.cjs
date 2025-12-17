const fs = require('fs');

// Update _index.tsx (Dashboard) - change flex-wrap to grid layout
let indexContent = fs.readFileSync('app/routes/_index.tsx', 'utf8');
indexContent = indexContent.replace(
    /flex flex-wrap gap-6/,
    'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6'
);
fs.writeFileSync('app/routes/_index.tsx', indexContent);
console.log('Updated _index.tsx grid layout for dashboard');

// Update rooms.tsx (Rooms) - add items-stretch for equal height
let roomsContent = fs.readFileSync('app/routes/rooms.tsx', 'utf8');
roomsContent = roomsContent.replace(
    /grid grid-cols-1 md:grid-cols-2 gap-4/,
    'grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch'
);
fs.writeFileSync('app/routes/rooms.tsx', roomsContent);
console.log('Updated rooms.tsx grid layout with items-stretch');

// Update game.tsx (Lobby) - optimize for 4-column display
let gameContent = fs.readFileSync('app/routes/game.tsx', 'utf8');
gameContent = gameContent.replace(
    /grid grid-cols-1 md:grid-cols-4 gap-6/,
    'grid grid-cols-1 md:grid-cols-4 gap-6'
);
// Add lg:grid-cols-4 if not present
if (!gameContent.includes('lg:grid-cols-4')) {
    gameContent = gameContent.replace(
        /grid-cols-1 md:grid-cols-4/,
        'grid-cols-1 md:grid-cols-4 lg:grid-cols-4'
    );
}
fs.writeFileSync('app/routes/game.tsx', gameContent);
console.log('Updated game.tsx grid layout for lobby');
