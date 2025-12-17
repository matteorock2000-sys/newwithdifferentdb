const fs = require('fs');

let content = fs.readFileSync('app/routes/game.tsx', 'utf8');

// Remove the extra closing brace on line 313
content = content.replace(/\}\s*\n\s*\n\s*\nexport async function action/, '}\n\nexport async function action');

fs.writeFileSync('app/routes/game.tsx', content);
console.log('Removed the extra closing brace');
