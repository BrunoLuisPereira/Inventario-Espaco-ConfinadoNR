// Synthetic fixture: no database, SMTP, AWS or external requests.
const fs = require('node:fs');
const http = require('node:http');
const release = JSON.parse(fs.readFileSync('../frontend/release.json')).sha;
if (release === '1'.repeat(40) && fs.existsSync('/run/nr33-lab/fail-baseline')) process.exit(42);
const server = http.createServer((req, res) => {
  res.statusCode = release === '2'.repeat(40) && fs.existsSync('/run/nr33-lab/fail-candidate') ? 503 : 200;
  res.end(JSON.stringify({ synthetic: true, release }));
});
server.listen(3000, '127.0.0.1');
process.on('SIGTERM', () => server.close(() => process.exit(0)));
