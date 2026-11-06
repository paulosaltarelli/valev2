#!/usr/bin/env python3
"""Restaura API e interface anteriores. Conserva dados e colunas aditivas."""
import fcntl
import gzip
import hashlib
import json
import pathlib
import subprocess
import sys
import time
import urllib.request

ROOT = pathlib.Path('/opt/valeexpresso')
RELEASE = ROOT / 'releases/operacao-20261106'
APP = ROOT / 'app'
COMPOSE = ['docker', 'compose', '-f', str(APP / 'deploy/compose.vps.yml')]


def run(args, **kwargs):
    return subprocess.run(args, check=True, **kwargs)


def sha(path):
    h = hashlib.sha256()
    with open(path, 'rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def main():
    lock = open(ROOT / 'releases/frontend-deploy.lock', 'w')
    if '--lock-held' not in sys.argv:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    manifest = json.loads((RELEASE / 'manifest.json').read_text())
    for name, expected in manifest['checksums'].items():
        if sha(RELEASE / name) != expected:
            raise RuntimeError('Backup não passou na verificação: ' + name)
    if '--recover' not in sys.argv:
        for name, expected in manifest['releaseImages'].items():
            current = run(['docker', 'inspect', '-f', '{{.Image}}', f'valeexpresso-{name}-1'], capture_output=True, text=True).stdout.strip()
            if current != expected:
                raise RuntimeError('Há outra versão publicada; não sobrescrever.')
        db = manifest['database']
        query = f"SET NOCOUNT ON; USE [{db}]; SELECT (SELECT COUNT(*) FROM execucao_queue WHERE status IN ('PENDENTE','PROCESSANDO'))+(SELECT COUNT(*) FROM execucao_create_queue WHERE status IN ('PENDENTE','PROCESSANDO'))+(SELECT COUNT(*) FROM geo_queue WHERE status IN ('PENDENTE','PROCESSANDO'));"
        result = run(['docker', 'exec', 'valeexpresso-db-1', 'bash', '-c', 'export SQLCMDPASSWORD="$MSSQL_SA_PASSWORD"; exec /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -C -b -h -1 -W -Q "$1"', 'sql', query], capture_output=True, text=True).stdout
        if int([s.strip() for s in result.splitlines() if s.strip().isdigit()][-1]):
            raise RuntimeError('Aguarde as filas concluírem antes de reverter.')
    if any(subprocess.run(['docker', 'image', 'inspect', image], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode for image in manifest['previousImages'].values()):
        with gzip.open(RELEASE / 'images-before.tar.gz', 'rb') as stream:
            process = subprocess.Popen(['docker', 'load'], stdin=subprocess.PIPE)
            import shutil
            shutil.copyfileobj(stream, process.stdin)
            process.stdin.close()
            if process.wait() != 0:
                raise RuntimeError('Não foi possível carregar as imagens do backup.')
    run(['tar', '-xzmf', str(RELEASE / 'source-before.tar.gz'), '-C', str(APP)])
    for name, image in manifest['previousImages'].items():
        run(['docker', 'tag', image, f'valeexpresso-{name}:latest'])
    run(COMPOSE + ['up', '-d', '--no-deps', '--no-build', 'api', 'web'])
    for _ in range(30):
        try:
            urllib.request.urlopen('http://127.0.0.1:8081/api/', timeout=3).close()
            manifest['status'] = 'rolled-back'
            (RELEASE / 'manifest.json').write_text(json.dumps(manifest, indent=2))
            print('API e interface anteriores restauradas. Dados preservados.')
            return
        except OSError:
            time.sleep(1)
    raise RuntimeError('Reversão aplicada, mas saúde precisa de verificação.')


if __name__ == '__main__':
    main()
