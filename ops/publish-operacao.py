#!/usr/bin/env python3
"""Publica somente as imagens candidatas já verificadas, com backup e reversão."""
import fcntl
import gzip
import hashlib
import json
import pathlib
import re
import shutil
import subprocess
import tarfile
import time
import urllib.error
import urllib.request

ROOT = pathlib.Path('/opt/valeexpresso')
APP = ROOT / 'app'
CANDIDATE = ROOT / 'releases/operacao-20261106-candidate'
RELEASE = ROOT / 'releases/operacao-20261106'
COMPOSE = ['docker', 'compose', '-f', str(APP / 'deploy/compose.vps.yml')]


def run(args, **kwargs):
    return subprocess.run(args, check=True, **kwargs)


def output(args):
    return run(args, capture_output=True, text=True).stdout.strip()


def sql(query):
    return output(['docker', 'exec', 'valeexpresso-db-1', 'bash', '-c',
                   'export SQLCMDPASSWORD="$MSSQL_SA_PASSWORD"; exec /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -C -b -h -1 -W -Q "$1"', 'sql', query])


def pending(db):
    value = sql(f"SET NOCOUNT ON; USE [{db}]; SELECT (SELECT COUNT(*) FROM execucao_queue WHERE status IN ('PENDENTE','PROCESSANDO'))+(SELECT COUNT(*) FROM execucao_create_queue WHERE status IN ('PENDENTE','PROCESSANDO'))+(SELECT COUNT(*) FROM geo_queue WHERE status IN ('PENDENTE','PROCESSANDO'));")
    return int([line.strip() for line in value.splitlines() if line.strip().isdigit()][-1])


def sha(path):
    h = hashlib.sha256()
    with open(path, 'rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def healthy():
    for _ in range(30):
        try:
            with urllib.request.urlopen('http://127.0.0.1:8081/api/', timeout=3) as response:
                if response.status == 200:
                    return
        except (OSError, urllib.error.URLError):
            time.sleep(1)
    raise RuntimeError('A API não passou no teste de saúde.')


def main():
    with open(ROOT / 'releases/frontend-deploy.lock', 'w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        if RELEASE.exists():
            raise RuntimeError('A pasta de publicação já existe. Revisar o estado antes de repetir.')
        db = output(['docker', 'exec', 'valeexpresso-api-1', 'printenv', 'DATABASE_NAME'])
        if not re.fullmatch(r'[A-Za-z0-9_]+', db) or db.startswith('vale_ux_test_'):
            raise RuntimeError('Banco ativo inesperado.')
        if pending(db):
            raise RuntimeError('Há filas ativas. A publicação deve aguardar a conclusão.')
        images = {name: output(['docker', 'inspect', '-f', '{{.Image}}', f'valeexpresso-{name}-1']) for name in ('api', 'web')}
        candidates = {name: output(['docker', 'image', 'inspect', '-f', '{{.Id}}', f'valeexpresso-{name}:operacao-candidate']) for name in ('api', 'web')}
        RELEASE.mkdir(mode=0o700)
        shutil.copy2(pathlib.Path(__file__).with_name('rollback-operacao.py'), RELEASE / 'rollback.py')
        manifest = {'database': db, 'previousImages': images, 'releaseImages': candidates, 'sourceCommit': (CANDIDATE / 'source-commit').read_text().strip()}
        (RELEASE / 'manifest.json').write_text(json.dumps(manifest, indent=2))
        # O backup específico desta release não participa da retenção diária.
        backup_name = 'operacao-20261106-before.bak'
        backup_host = ROOT / 'backups' / backup_name
        if backup_host.exists():
            raise RuntimeError('Backup já existe; não sobrescrever.')
        sql(f"BACKUP DATABASE [{db}] TO DISK=N'/var/opt/mssql/backup/{backup_name}' WITH COPY_ONLY, CHECKSUM; RESTORE VERIFYONLY FROM DISK=N'/var/opt/mssql/backup/{backup_name}' WITH CHECKSUM;")
        manifest['databaseBackup'] = str(backup_host)
        run(['tar', '-czf', str(RELEASE / 'source-before.tar.gz'), '--exclude=node_modules', '--exclude=dist', '--exclude=.env', '--exclude=.env.*', '-C', str(APP), 'api', 'administration', 'nginx'])
        with tarfile.open(RELEASE / 'source-before.tar.gz') as archive:
            if not archive.getmembers():
                raise RuntimeError('Backup de fontes vazio.')
        tags = []
        for name, image in images.items():
            tag = f'valeexpresso-{name}:before-operacao-20261106'
            run(['docker', 'tag', image, tag])
            tags.append(tag)
        with gzip.open(RELEASE / 'images-before.tar.gz', 'wb') as dest:
            process = subprocess.Popen(['docker', 'save', *tags], stdout=subprocess.PIPE)
            shutil.copyfileobj(process.stdout, dest)
            if process.wait() != 0:
                raise RuntimeError('Falha ao salvar imagens anteriores.')
        with gzip.open(RELEASE / 'images-before.tar.gz', 'rb') as stream:
            while stream.read(1024 * 1024):
                pass
        manifest['checksums'] = {name: sha(RELEASE / name) for name in ('source-before.tar.gz', 'images-before.tar.gz')}
        manifest['databaseBackupSha256'] = sha(backup_host)
        (RELEASE / 'manifest.json').write_text(json.dumps(manifest, indent=2))
        print('Backup de banco, fontes e imagens verificado.', flush=True)
        stopped = False
        try:
            stopped = True
            run(COMPOSE + ['stop', '-t', '60', 'api'])
            if pending(db):
                raise RuntimeError('Trabalho foi agendado durante o backup. Manter a versão anterior.')
            migration = (CANDIDATE / 'api/prisma/ux-operacao.sql').read_text()
            sql(f'USE [{db}];\n' + migration)
            for name in ('api', 'administration', 'nginx'):
                shutil.copytree(CANDIDATE / name, APP / name, dirs_exist_ok=True)
            for name, image in candidates.items():
                run(['docker', 'tag', image, f'valeexpresso-{name}:latest'])
            run(COMPOSE + ['up', '-d', '--no-deps', '--no-build', 'api', 'web'])
            healthy()
            for name, image in candidates.items():
                if output(['docker', 'inspect', '-f', '{{.Image}}', f'valeexpresso-{name}-1']) != image:
                    raise RuntimeError('Imagem em execução não corresponde à candidata.')
            with urllib.request.urlopen('http://127.0.0.1:8081/processamento', timeout=10) as response:
                html = response.read().decode()
            asset = re.search(r'/assets/index-[\w-]+\.js', html).group()
            with urllib.request.urlopen('http://127.0.0.1:8081' + asset, timeout=10) as response:
                if response.status != 200:
                    raise RuntimeError('Arquivo da interface indisponível.')
            try:
                urllib.request.urlopen('http://127.0.0.1:8081/api/operacao', timeout=10)
                raise RuntimeError('A operação deveria exigir autenticação.')
            except urllib.error.HTTPError as error:
                if error.code != 401:
                    raise
            manifest['publishedAsset'] = asset
            manifest['status'] = 'published'
            (RELEASE / 'manifest.json').write_text(json.dumps(manifest, indent=2))
            print('Publicado e verificado: ' + asset, flush=True)
        except Exception:
            if stopped:
                run(['python3', str(RELEASE / 'rollback.py'), '--lock-held', '--recover'])
            raise


if __name__ == '__main__':
    main()
