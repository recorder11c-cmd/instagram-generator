#!/usr/bin/env python3
"""
Vercel デプロイスクリプト
使い方:
  VERCEL_TOKEN=xxx ANTHROPIC_API_KEY=sk-ant-xxx python3 deploy_to_vercel.py
"""
import os, json, urllib.request, urllib.error, base64, time, sys

VERCEL_TOKEN = os.environ.get('VERCEL_TOKEN', '')
API_KEY      = os.environ.get('ANTHROPIC_API_KEY', '')
PROJECT_NAME = 'johkoya-instagram-gen'
BASE_DIR     = os.path.dirname(os.path.abspath(__file__))

FILES = [
    'index.html',
    'api/proxy.js',
    'vercel.json',
]

def vapi(path, data=None, method=None):
    url = 'https://api.vercel.com' + path
    body = json.dumps(data).encode() if data else None
    req = urllib.request.Request(
        url,
        data=body,
        headers={
            'Authorization': 'Bearer ' + VERCEL_TOKEN,
            'Content-Type': 'application/json',
        },
        method=method or ('POST' if body else 'GET')
    )
    try:
        with urllib.request.urlopen(req) as res:
            return json.loads(res.read())
    except urllib.error.HTTPError as e:
        err = json.loads(e.read())
        msg = (err.get('error') or {}).get('message') or err.get('message') or str(e)
        raise RuntimeError(f'Vercel API error: {msg}')

def load_files():
    files = []
    for rel in FILES:
        path = os.path.join(BASE_DIR, rel)
        with open(path, 'r', encoding='utf-8') as f:
            files.append({'file': rel, 'data': f.read(), 'encoding': 'utf-8'})
    return files

def deploy(files, name):
    return vapi('/v13/deployments', {
        'name': name,
        'files': files,
        'projectSettings': {'framework': None},
        'target': 'production',
    })

def wait_ready(deploy_id, timeout=120):
    for _ in range(timeout // 5):
        time.sleep(5)
        d = vapi(f'/v13/deployments/{deploy_id}', method='GET')
        state = d.get('readyState') or d.get('state', '')
        print(f'  状態: {state}')
        if state in ('READY', 'ready'):
            return d
        if state in ('ERROR', 'CANCELED'):
            raise RuntimeError('デプロイ失敗: ' + state)
    raise RuntimeError('タイムアウト')

def main():
    if not VERCEL_TOKEN:
        print('❌ VERCEL_TOKEN が設定されていません')
        print('  例: VERCEL_TOKEN=xxx python3 deploy_to_vercel.py')
        sys.exit(1)
    if not API_KEY:
        print('❌ ANTHROPIC_API_KEY が設定されていません')
        sys.exit(1)

    print('① ファイルを読み込み中…')
    files = load_files()
    print(f'  {len(files)} ファイル準備完了')

    print('② Vercel に1回目のデプロイ（プロジェクト作成）…')
    d1 = deploy(files, PROJECT_NAME)
    project_id = d1.get('projectId')
    deploy1_id = d1.get('id')
    print(f'  プロジェクトID: {project_id}')
    print(f'  デプロイID: {deploy1_id}')

    print('③ 1回目のデプロイ完了を待機中…')
    wait_ready(deploy1_id)

    print('④ 環境変数 ANTHROPIC_API_KEY を設定中…')
    vapi(f'/v10/projects/{project_id}/env', {
        'key': 'ANTHROPIC_API_KEY',
        'value': API_KEY,
        'type': 'encrypted',
        'target': ['production', 'preview'],
    })
    print('  設定完了')

    print('⑤ 2回目のデプロイ（環境変数を反映）…')
    d2 = deploy(files, PROJECT_NAME)
    deploy2_id = d2.get('id')

    print('⑥ 本番デプロイ完了を待機中…')
    wait_ready(deploy2_id)

    print('⑦ Deployment Protection を無効化（誰でも開けるように）…')
    vapi(f'/v9/projects/{project_id}', None, method='PATCH')
    # ssoProtection と passwordProtection を null に
    import urllib.request as _ur
    _body = b'{"ssoProtection":null,"passwordProtection":null}'
    _req = _ur.Request(
        f'https://api.vercel.com/v9/projects/{project_id}',
        data=_body,
        headers={'Authorization': 'Bearer ' + VERCEL_TOKEN, 'Content-Type': 'application/json'},
        method='PATCH'
    )
    with _ur.urlopen(_req): pass
    print('  完了')

    url = f'https://{PROJECT_NAME}.vercel.app'
    print()
    print('=' * 50)
    print('✅ デプロイ完了！')
    print(f'🌐 URL: {url}')
    print('=' * 50)

if __name__ == '__main__':
    main()
