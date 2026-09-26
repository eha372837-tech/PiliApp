#!/usr/bin/env python3
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlsplit, unquote
from http.cookies import SimpleCookie
import hashlib
import hmac
import json
import os
import secrets
import threading
import time

ROOT = (Path(__file__).parent / 'kr.piliapp.com').resolve()
BASE = Path(__file__).parent.resolve()
DATA_DIR = Path(os.environ.get('DATA_DIR', str(BASE))).expanduser().resolve()
DATA_DIR.mkdir(parents=True, exist_ok=True)
PASSWORD_FILE = DATA_DIR / '.admin-password'
MODE_FILE = DATA_DIR / 'coin-mode.json'
DICE_FILE = DATA_DIR / 'dice-settings.json'
SESSION_COOKIE = 'coin_admin_session'
SESSION_TTL = 8 * 60 * 60
VALID_MODES = {'random', 'heads', 'tails'}
LOCK = threading.RLock()
SESSIONS = {}
FAILED_LOGINS = {}


def load_password():
    configured = os.environ.get('ADMIN_PASSWORD')
    if configured:
        return configured
    if PASSWORD_FILE.exists():
        return PASSWORD_FILE.read_text(encoding='utf-8').strip()
    password = secrets.token_urlsafe(24)
    PASSWORD_FILE.write_text(password + '\n', encoding='utf-8')
    try:
        PASSWORD_FILE.chmod(0o600)
    except OSError:
        pass
    print('Generated one-time admin password: ' + password, flush=True)
    return password


ADMIN_PASSWORD = load_password()


def load_mode():
    try:
        mode = json.loads(MODE_FILE.read_text(encoding='utf-8')).get('mode')
        return mode if mode in VALID_MODES else 'random'
    except (OSError, ValueError, AttributeError):
        return 'random'


COIN_MODE = load_mode()


def load_dice_target():
    try:
        value = json.loads(DICE_FILE.read_text(encoding='utf-8')).get('target_sum')
        if value is None:
            return None
        if isinstance(value, int) and not isinstance(value, bool) and 1 <= value <= 36:
            return value
    except (OSError, ValueError, AttributeError):
        pass
    return None


DICE_TARGET_SUM = load_dice_target()


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('X-Frame-Options', 'DENY')
        self.send_header('Referrer-Policy', 'same-origin')
        super().end_headers()

    def translate_path(self, request_path):
        raw_path = unquote(urlsplit(request_path).path)
        relative = raw_path.lstrip('/') or 'index.htm'
        target = (ROOT / relative).resolve()
        if target != ROOT and ROOT not in target.parents:
            return str(ROOT / '__not_found__')
        if target.is_dir():
            target = target / 'index.htm'
        if target == ROOT:
            target = ROOT / 'index.htm'
        return str(target)

    def _json(self, status, payload, extra_headers=None):
        body = json.dumps(payload, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(body)))
        if extra_headers:
            for name, value in extra_headers:
                self.send_header(name, value)
        self.end_headers()
        self.wfile.write(body)

    def _read_json(self):
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if length < 0 or length > 4096:
                return None
            return json.loads(self.rfile.read(length).decode('utf-8'))
        except (ValueError, UnicodeDecodeError, json.JSONDecodeError):
            return None

    def _same_origin(self):
        origin = self.headers.get('Origin')
        if not origin:
            return True
        return urlsplit(origin).netloc.lower() == self.headers.get('Host', '').lower()

    def _session_token(self):
        cookie = SimpleCookie()
        try:
            cookie.load(self.headers.get('Cookie', ''))
            return cookie[SESSION_COOKIE].value if SESSION_COOKIE in cookie else None
        except Exception:
            return None

    def _authorized(self):
        token = self._session_token()
        if not token:
            return False
        with LOCK:
            expiry = SESSIONS.get(token)
            if expiry is None:
                return False
            if expiry <= time.time():
                SESSIONS.pop(token, None)
                return False
            SESSIONS[token] = time.time() + SESSION_TTL
            return True

    def _secure_cookie(self):
        proto = self.headers.get('X-Forwarded-Proto', '').split(',')[0].strip().lower()
        return '; Secure' if proto == 'https' else ''

    def do_GET(self):
        route = urlsplit(self.path).path
        if route == '/api/health':
            return self._json(200, {'status': 'ok'})
        if route == '/api/coin-mode':
            with LOCK:
                mode = COIN_MODE
            return self._json(200, {'mode': mode})
        if route == '/api/dice-settings':
            with LOCK:
                target_sum = DICE_TARGET_SUM
            return self._json(200, {'target_sum': target_sum})
        if route == '/api/admin/status':
            with LOCK:
                mode = COIN_MODE
                target_sum = DICE_TARGET_SUM
            return self._json(200, {'authenticated': self._authorized(), 'mode': mode, 'dice_target_sum': target_sum})

        local_path = Path(self.translate_path(self.path))
        if not local_path.is_file():
            requested = urlsplit(self.path)
            destination = 'https://kr.piliapp.com' + requested.path
            if requested.query:
                destination += '?' + requested.query
            self.send_response(302)
            self.send_header('Location', destination)
            self.end_headers()
            return
        return super().do_GET()

    def do_POST(self):
        global COIN_MODE, DICE_TARGET_SUM
        route = urlsplit(self.path).path
        if not route.startswith('/api/admin/'):
            return self._json(404, {'error': 'Not found'})
        if not self._same_origin():
            return self._json(403, {'error': '요청 출처를 확인할 수 없습니다.'})
        data = self._read_json()
        if data is None:
            return self._json(400, {'error': '올바른 JSON 요청이 필요합니다.'})

        if route == '/api/admin/login':
            remote = self.client_address[0]
            now = time.time()
            with LOCK:
                attempts = [t for t in FAILED_LOGINS.get(remote, []) if now - t < 300]
                FAILED_LOGINS[remote] = attempts
            if len(attempts) >= 10:
                return self._json(429, {'error': '로그인 시도가 너무 많습니다. 잠시 후 다시 시도하세요.'})
            provided = data.get('password', '') if isinstance(data, dict) else ''
            if not isinstance(provided, str) or not hmac.compare_digest(provided.encode(), ADMIN_PASSWORD.encode()):
                with LOCK:
                    FAILED_LOGINS.setdefault(remote, []).append(now)
                return self._json(401, {'error': '비밀번호가 올바르지 않습니다.'})
            token = secrets.token_urlsafe(32)
            with LOCK:
                SESSIONS[token] = now + SESSION_TTL
                FAILED_LOGINS.pop(remote, None)
                mode = COIN_MODE
                target_sum = DICE_TARGET_SUM
            cookie = f'{SESSION_COOKIE}={token}; Path=/; HttpOnly; SameSite=Strict; Max-Age={SESSION_TTL}{self._secure_cookie()}'
            return self._json(200, {'authenticated': True, 'mode': mode, 'dice_target_sum': target_sum}, [('Set-Cookie', cookie)])

        if route == '/api/admin/logout':
            token = self._session_token()
            with LOCK:
                if token:
                    SESSIONS.pop(token, None)
            cookie = f'{SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0{self._secure_cookie()}'
            return self._json(200, {'authenticated': False}, [('Set-Cookie', cookie)])

        if not self._authorized():
            return self._json(401, {'error': '관리자 로그인이 필요합니다.'})

        if route == '/api/admin/mode':
            mode = data.get('mode') if isinstance(data, dict) else None
            if mode not in VALID_MODES:
                return self._json(400, {'error': '무작위, 앞면, 뒷면 중 하나를 선택하세요.'})
            with LOCK:
                COIN_MODE = mode
                temporary = MODE_FILE.with_suffix('.tmp')
                temporary.write_text(json.dumps({'mode': mode}), encoding='utf-8')
                temporary.replace(MODE_FILE)
            return self._json(200, {'mode': mode})

        if route == '/api/admin/dice-settings':
            target_sum = data.get('target_sum') if isinstance(data, dict) else None
            if target_sum is not None and (not isinstance(target_sum, int) or isinstance(target_sum, bool) or not 1 <= target_sum <= 36):
                return self._json(400, {'error': '주사위 합계는 무작위 또는 1~36의 정수로 선택하세요.'})
            with LOCK:
                DICE_TARGET_SUM = target_sum
                temporary = DICE_FILE.with_suffix('.tmp')
                temporary.write_text(json.dumps({'target_sum': target_sum}), encoding='utf-8')
                temporary.replace(DICE_FILE)
            return self._json(200, {'target_sum': target_sum})

        return self._json(404, {'error': 'Not found'})

    def log_message(self, fmt, *args):
        print('%s - %s' % (self.address_string(), fmt % args))


if __name__ == '__main__':
    port = int(os.environ.get('PORT', '8000'))
    server = ThreadingHTTPServer(('0.0.0.0', port), Handler)
    print(f'PiliApp snapshot serving on http://0.0.0.0:{port}', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
