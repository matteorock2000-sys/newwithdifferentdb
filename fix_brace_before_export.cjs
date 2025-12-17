const fs = require('fs');

let content = fs.readFileSync('app/routes/game.tsx', 'utf8');

// Find and remove the extra closing brace that appears before the export statement
// Look for the pattern: "blank line + } + blank line + blank line + export"
content = content.replace(/\n\s*\}\s*\n\s*\nexport/, '\n}\nexport');

fs.writeFileSync('app/routes/game.tsx', content);
console.log('Fixed the extra closing brace before export statement');
