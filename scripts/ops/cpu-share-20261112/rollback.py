import fcntl, pathlib, subprocess

root = pathlib.Path('/opt/valeexpresso')
release = root / 'releases/cpu-share-20261112'
config = root / 'app/deploy/compose.vps.yml'
locks = []
for name in ['frontend-deploy.lock', 'api-deploy.lock']:
    lock = open(root / 'releases' / name, 'a')
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    locks.append(lock)
original = (release / 'compose.before.yml').read_text()
expected = original.replace('    cpus: 1.0\n', '    cpu_shares: 512\n', 1)
assert config.read_text() == expected, 'Configuração posterior encontrada; revisar a reversão manualmente'
config.write_text(original)
subprocess.run(['docker','compose','-f',str(config),'up','-d','--no-deps','--no-build','api'],check=True)
print('Limite anterior restaurado; filas não modificadas. Verifique a saúde da API.')
