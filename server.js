const http = require('http');
const fs = require('fs');
const path = require('path');

const port = process.env.PORT || 5173;
const expectedFlag = process.env.FLAG_01;
const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8'
};

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

const server = http.createServer((request, response) => {
  if (request.method === 'POST' && request.url === '/api/submit') {
    let body = '';
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => {
      try {
        const submission = JSON.parse(body);
        sendJson(response, 200, { correct: Boolean(expectedFlag && submission.flag === expectedFlag) });
      } catch {
        sendJson(response, 400, { correct: false });
      }
    });
    return;
  }

  const requestedPath = request.url === '/' ? '/index.html' : request.url;
  const filePath = path.join(__dirname, requestedPath);
  const extension = path.extname(filePath);
  fs.readFile(filePath, (error, file) => {
    if (error) {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Not found');
      return;
    }
    response.writeHead(200, { 'Content-Type': mimeTypes[extension] || 'application/octet-stream' });
    response.end(file);
  });
});

server.listen(port, () => {
  console.log(`PwnGenius CTF running at http://localhost:${port}`);
});
