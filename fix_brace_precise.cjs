const fs = require('fs');

let content = fs.readFileSync('app/routes/game.tsx', 'utf8');

// Split content into lines
let lines = content.split('\n');

// Find the line that contains just a closing brace after the return statement
// Looking for the pattern: empty line, closing brace, empty line, empty line, export
let targetLineIndex = -1;
for (let i = 0; i < lines.length - 3; i++) {
    if (lines[i].trim() === '' && 
        lines[i+1].trim() === '}' && 
        lines[i+2].trim() === '' && 
        lines[i+3].trim() === '' && 
        lines[i+4].trim().startsWith('export')) {
        targetLineIndex = i + 1;
        break;
    }
}

if (targetLineIndex !== -1) {
    console.log(`Found extra closing brace at line ${targetLineIndex + 1}, removing it...`);
    lines.splice(targetLineIndex, 1);
} else {
    console.log('Could not find the exact pattern, trying alternative...');
    // Try to find any standalone closing brace before export
    for (let i = 0; i < lines.length - 1; i++) {
        if (lines[i].trim() === '}' && lines[i+1].trim().startsWith('export')) {
            console.log(`Found standalone closing brace at line ${i + 1}, removing it...`);
            lines.splice(i, 1);
            break;
        }
    }
}

// Write back
fs.writeFileSync('app/routes/game.tsx', lines.join('\n'));
console.log('Fixed the syntax error');
