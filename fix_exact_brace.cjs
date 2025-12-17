const fs = require('fs');

let content = fs.readFileSync('app/routes/game.tsx', 'utf8');

// The issue is that there's an extra closing brace on line 313
// Let's replace the specific problematic pattern
content = content.replace(/\}\s*\n\s*\n\s*\nexport async function action/, '}\n\nexport async function action');

fs.writeFileSync('app/routes/game.tsx', content);
console.log('Fixed the extra closing brace');
