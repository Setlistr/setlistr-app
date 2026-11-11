// Local stand-in for the Anthropic Messages API (ANTHROPIC_BASE_URL=http://127.0.0.1:3998). Logs each request
// (never the image itself) and answers with a fixed song list. No external calls.
const http = require('http'), fs = require('fs')
const LOG = process.argv[2]
http.createServer((req, res) => {
  let size = 0
  req.on('data', d => { size += d.length })
  req.on('end', () => {
    fs.appendFileSync(LOG, JSON.stringify({ svc: 'anthropic', path: req.url, bytes: size, at: new Date().toISOString() }) + '\n')
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ id: 'msg_stub', type: 'message', role: 'assistant', model: 'stub', stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 },
      content: [{ type: 'text', text: '[{"title":"Photo Song One","artist":""},{"title":"Photo Song Two","artist":""}]' }] }))
  })
}).listen(3998, '127.0.0.1', () => console.log('anthropic stub on 3998'))
