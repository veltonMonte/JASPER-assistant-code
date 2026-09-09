const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('jasper.db');
db.all('SELECT * FROM memory', (err, rows) => {
  console.log(JSON.stringify(rows, null, 2));
});
