const fs = require('fs');
const code = fs.readFileSync('public/app.js', 'utf8');
console.log(code.includes('function updateState'));
