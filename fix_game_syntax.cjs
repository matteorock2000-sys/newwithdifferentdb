const fs = require('fs');

let content = fs.readFileSync('app/routes/game.tsx', 'utf8');

// Fix the extra closing brace issue around line 312-314
// Replace the problematic section with the correct syntax
content = content.replace(
    /    return json<LoaderData>\(\{ party, resolvedParty, allRoomCharacters, currentUserId: userId, activeCharacter, scenarios: scenariosForDisplay, messages, isInGame, roomCode, isHost, roomStatus: room\?\.(status|status \|\| null) \}\);\s*\n\s*\n\s*\nexport async function action/,
    '    return json<LoaderData>({ party, resolvedParty, allRoomCharacters, currentUserId: userId, activeCharacter, scenarios: scenariosForDisplay, messages, isInGame, roomCode, isHost, roomStatus: room?.status || null });\n\nexport async function action'
);

fs.writeFileSync('app/routes/game.tsx', content);
console.log('Fixed the extra closing brace issue in game.tsx');
