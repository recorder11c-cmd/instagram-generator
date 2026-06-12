import http.server
import json
import urllib.request
import urllib.error
import urllib.parse
import re
import os
from dotenv import load_dotenv; load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), '.env'))

API_KEY = os.environ.get('ANTHROPIC_API_KEY', '')

def fetch_webpage(url):
    """URLのHTMLを取得してテキストに変換する"""
    req = urllib.request.Request(
        url,
        headers={
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,*/*',
            'Accept-Language': 'ja,en;q=0.9',
        }
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        charset = 'utf-8'
        content_type = resp.headers.get('Content-Type', '')
        m = re.search(r'charset=([^\s;]+)', content_type)
        if m:
            charset = m.group(1).replace('"', '')
        raw = resp.read()

    try:
        html = raw.decode(charset, errors='replace')
    except Exception:
        html = raw.decode('utf-8', errors='replace')

    # <script> <style> タグを除去
    html = re.sub(r'<script[^>]*>.*?</script>', '', html, flags=re.DOTALL | re.IGNORECASE)
    html = re.sub(r'<style[^>]*>.*?</style>', '', html, flags=re.DOTALL | re.IGNORECASE)
    html = re.sub(r'<!--.*?-->', '', html, flags=re.DOTALL)

    # タグを除去してテキスト抽出
    text = re.sub(r'<[^>]+>', ' ', html)
    # 連続スペース・改行を整理
    text = re.sub(r'[ \t]+', ' ', text)
    text = re.sub(r'\n{3,}', '\n\n', text)
    text = text.strip()

    # 先頭30000文字に制限
    return text[:30000]

class ProxyHandler(http.server.SimpleHTTPRequestHandler):
    def do_POST(self):
        if self.path in ('/proxy', '/.netlify/functions/proxy', '/api/proxy'):
            length = int(self.headers['Content-Length'])
            body = self.rfile.read(length)

            api_key = API_KEY
            if not api_key:
                self._send_json(500, {'error': 'ANTHROPIC_API_KEY が設定されていません'})
                return

            req = urllib.request.Request(
                'https://api.anthropic.com/v1/messages',
                data=body,
                headers={
                    'Content-Type': 'application/json',
                    'x-api-key': api_key,
                    'anthropic-version': '2023-06-01'
                }
            )
            try:
                with urllib.request.urlopen(req) as resp:
                    result = resp.read()
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json')
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.end_headers()
                    self.wfile.write(result)
            except urllib.error.HTTPError as e:
                self.send_response(e.code)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(e.read())

        elif self.path == '/fetch-url':
            length = int(self.headers['Content-Length'])
            body = json.loads(self.rfile.read(length))
            url = body.get('url', '').strip()

            if not url:
                self._send_json(400, {'error': 'URLが指定されていません'})
                return
            if not url.startswith(('http://', 'https://')):
                url = 'https://' + url

            try:
                text = fetch_webpage(url)
                self._send_json(200, {'text': text, 'url': url})
            except Exception as e:
                self._send_json(500, {'error': f'ページの取得に失敗しました: {str(e)}'})

        else:
            self.send_response(404)
            self.end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def _send_json(self, status, data):
        body = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format, *args):
        pass

if __name__ == '__main__':
    if not API_KEY:
        print('⚠️  ANTHROPIC_API_KEY が設定されていません')
        print('   例: ANTHROPIC_API_KEY=sk-ant-... python3 server.py')
        exit(1)
    server = http.server.HTTPServer(('', 8080), ProxyHandler)
    print('✦ サーバー起動中: http://localhost:8080')
    print('  停止するには Control + C を押してください')
    server.serve_forever()
