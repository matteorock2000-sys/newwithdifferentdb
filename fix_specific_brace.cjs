const fs = require('fs');

let content = fs.readFileSync('app/routes/game.tsx', 'utf8');

// Split into lines
let lines = content.split('\n');

// Find the problematic line that has just a closing brace before the export
let lineIndex = -1;
for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === '}' && i > 0 && lines[i-1].trim() === '' && i < lines.length - 1 && lines[i+1].trim() === '' && lines[i+2].trim().startsWith('export')) {
        lineIndex = i;
        break;
    }
}

if (lineIndex !== -1) {
    // Remove the extra closing brace line
    lines.splice(lineIndex, 1);
    console.log(`Removed extra closing brace at line ${lineIndex + 1}`);
} else {
    console.log('Could not find the problematic line');
}

// Join back and write
content = lines.join('\n');
fs.writeFileSync('app/routes/game.tsx', content);
