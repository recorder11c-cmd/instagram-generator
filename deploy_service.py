#!/usr/bin/env python3
"""
kato-insta-support サービスサイト デプロイスクリプト
使い方:
  VERCEL_TOKEN=xxx ANTHROPIC_API_KEY=sk-ant-xxx python3 deploy_service.py
"""
import os, json, urllib.request, urllib.error, base64, time, sys

VERCEL_TOKEN = os.environ.get('VERCEL_TOKEN', '')
API_KEY      = os.environ.get('ANTHROPIC_API_KEY', '')
PROJECT_NAME = 'kato-insta-support'
BASE_DIR     = os.path.dirname(os.path.abspath(__file__))

# pitch.html を index.html として、他ファイルも含めてデプロイ
DEPLOY_FILES = {
    'index.html':       'pitch.html',
    'onboarding.html':  'onboarding.html',
    'sales_kit.html':   'sales_kit.html',
    'feedback.html':    'feedback.html',
    'api/proxy.js':     'api/proxy.js',
    'vercel.json':      'vercel.json',
}

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
    for dest, src in DEPLOY_FILES.items():
        path = os.path.join(BASE_DIR, src)
        with open(path, 'r', encoding='utf-8') as f:
            files.append({'file': dest, 'data': f.read(), 'encoding': 'utf-8'})
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

def disable_protection(project_id):
    body = b'{"ssoProtection":null,"passwordProtection":null}'
    req = urllib.request.Request(
        f'https://api.vercel.com/v9/projects/{project_id}',
        data=body,
        headers={'Authorization': 'Bearer ' + VERCEL_TOKEN, 'Content-Type': 'application/json'},
        method='PATCH'
    )
    with urllib.request.urlopen(req): pass

def main():
    if not VERCEL_TOKEN:
        print('❌ VERCEL_TOKEN が設定されていません')
        sys.exit(1)
    if not API_KEY:
        print('❌ ANTHROPIC_API_KEY が設定されていません')
        sys.exit(1)

    print('① ファイルを読み込み中…')
    files = load_files()
    print(f'  {len(files)} ファイル準備完了')
    for f in files:
        print(f'    {f["file"]}')

    print('② Vercel にデプロイ中…')
    d1 = deploy(files, PROJECT_NAME)
    project_id = d1.get('projectId')
    deploy1_id = d1.get('id')
    print(f'  プロジェクトID: {project_id}')

    print('③ デプロイ完了を待機中…')
    wait_ready(deploy1_id)

    print('④ 環境変数 ANTHROPIC_API_KEY を設定中…')
    try:
        vapi(f'/v10/projects/{project_id}/env', {
            'key': 'ANTHROPIC_API_KEY',
            'value': API_KEY,
            'type': 'encrypted',
            'target': ['production', 'preview'],
        })
        print('  設定完了')
    except Exception as e:
        print(f'  ※ 環境変数設定スキップ（既存の場合あり）: {e}')

    print('⑤ 2回目のデプロイ（環境変数を反映）…')
    d2 = deploy(files, PROJECT_NAME)
    deploy2_id = d2.get('id')

    print('⑥ 本番デプロイ完了を待機中…')
    wait_ready(deploy2_id)

    print('⑦ Deployment Protection を無効化…')
    try:
        disable_protection(project_id)
        print('  完了')
    except Exception as e:
        print(f'  ※ スキップ: {e}')

    print()
    print('=' * 50)
    print('✅ デプロイ完了！')
    print(f'🌐 URL: https://{PROJECT_NAME}.vercel.app')
    print('=' * 50)

if __name__ == '__main__':
    main()
