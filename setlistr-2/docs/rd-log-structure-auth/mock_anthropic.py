# Local stand-in for the Anthropic Messages API: counts calls, returns one canned JSON entry.
import json, http.server
COUNT = {'n': 0}
class H(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        self.rfile.read(int(self.headers.get('content-length') or 0))
        COUNT['n'] += 1
        body = {"id": "msg_mock", "type": "message", "role": "assistant", "model": "mock", "stop_reason": "end_turn", "stop_sequence": None,
                "usage": {"input_tokens": 1, "output_tokens": 1},
                "content": [{"type": "text", "text": json.dumps({"workstream": "mock", "technical_problem": "", "hypothesis": "", "work_performed": "", "outcome": "", "remaining_uncertainty": "", "related_file": "", "funding_relevance": []})}]}
        out = json.dumps(body).encode(); self.send_response(200); self.send_header('content-type', 'application/json'); self.send_header('content-length', str(len(out))); self.end_headers(); self.wfile.write(out)
    def do_GET(self):
        out = json.dumps(COUNT).encode(); self.send_response(200); self.send_header('content-length', str(len(out))); self.end_headers(); self.wfile.write(out)
    def log_message(self, *a): pass
http.server.HTTPServer(('127.0.0.1', 54627), H).serve_forever()
