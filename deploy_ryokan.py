#!/usr/bin/env python3
import os, json, urllib.request, urllib.error, time, sys

VERCEL_TOKEN = os.environ.get('VERCEL_TOKEN', '')
API_KEY      = os.environ.get('ANTHROPIC_API_KEY', '')
PROJECT_NAME = 'yamanone-ryokan-gen'
BASE_DIR     = os.path.dirname(os.path.abspath(__file__))

def vapi(path, data=None, method=None):
    url = 'https://api.vercel.com' + path
    body = json.dumps(data).encode() if data else None
    req = urllib.request.Request(
        url, data=body,
        headers={'Authorization': 'Bearer ' + VERCEL_TOKEN, 'Content-Type': 'application/json'},
        method=method or ('POST' if body else 'GET')
    )
    try:
        with urllib.request.urlopen(req) as res:
            return json.loads(res.read())
    except urllib.error.HTTPError as e:
        err = json.loads(e.read())
        raise RuntimeError((err.get('error') or {}).get('message') or err.get('message') or str(e))

def wait_ready(deploy_id, timeout=120):
    for _ in range(timeout // 5):
        time.sleep(5)
        d = vapi(f'/v13/deployments/{deploy_id}', method='GET')
        state = d.get('readyState') or d.get('state', '')
        print(f'  状態: {state}')
        if state in ('READY', 'ready'): return
        if state in ('ERROR', 'CANCELED'): raise RuntimeError('デプロイ失敗: ' + state)
    raise RuntimeError('タイムアウト')

def main():
    if not VERCEL_TOKEN or not API_KEY:
        print('❌ VERCEL_TOKEN と ANTHROPIC_API_KEY を設定してください')
        sys.exit(1)

    # ryokan.html を index.html として読み込み
    with open(os.path.join(BASE_DIR, 'ryokan.html'), encoding='utf-8') as f:
        ryokan_html = f.read()
    with open(os.path.join(BASE_DIR, 'api/proxy.js'), encoding='utf-8') as f:
        proxy_js = f.read()
    with open(os.path.join(BASE_DIR, 'vercel.json'), encoding='utf-8') as f:
        vercel_json = f.read()

    files = [
        {'file': 'index.html', 'data': ryokan_html, 'encoding': 'utf-8'},
        {'file': 'api/proxy.js', 'data': proxy_js, 'encoding': 'utf-8'},
        {'file': 'vercel.json', 'data': vercel_json, 'encoding': 'utf-8'},
    ]

    suffix = str(int(time.time()))[-4:]
    name = PROJECT_NAME + '-' + suffix

    print('① デプロイ中…')
    d1 = vapi('/v13/deployments', {'name': name, 'files': files, 'projectSettings': {'framework': None}, 'target': 'production'})
    project_id = d1['projectId']
    wait_ready(d1['id'])

    print('② APIキーを設定中…')
    try:
        vapi(f'/v10/projects/{project_id}/env', {'key': 'ANTHROPIC_API_KEY', 'value': API_KEY, 'type': 'encrypted', 'target': ['production', 'preview']})
    except: pass

    print('③ 再デプロイ中…')
    d2 = vapi('/v13/deployments', {'name': name, 'files': files, 'projectSettings': {'framework': None}, 'target': 'production'})
    wait_ready(d2['id'])

    print('④ 公開設定中…')
    req = urllib.request.Request(
        f'https://api.vercel.com/v9/projects/{project_id}',
        data=b'{"ssoProtection":null,"passwordProtection":null}',
        headers={'Authorization': 'Bearer ' + VERCEL_TOKEN, 'Content-Type': 'application/json'},
        method='PATCH'
    )
    with urllib.request.urlopen(req): pass

    print()
    print('=' * 50)
    print('✅ デプロイ完了！')
    print(f'🌐 URL: https://{name}.vercel.app')
    print('=' * 50)

if __name__ == '__main__':
    main()
