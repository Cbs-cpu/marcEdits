// Saves the path of the "marc edits" folder so the installed app knows where the library lives
const fs = require('fs'); const path = require('path');
const root = path.resolve(__dirname, '..', '..');
fs.writeFileSync(path.join(__dirname, '..', 'electron', 'root.json'), JSON.stringify({ root }, null, 2));
console.log('root.json ->', root);
