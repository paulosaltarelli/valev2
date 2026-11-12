import fcntl, json, pathlib, subprocess, time, urllib.request

root = pathlib.Path('/opt/valeexpresso')
release = root / 'releases/cpu-share-20261112'
release.mkdir(exist_ok=True)
config = root / 'app/deploy/compose.vps.yml'
def run(*args):
    return subprocess.check_output(args, text=True).strip()
locks = []
for name in ['frontend-deploy.lock', 'api-deploy.lock']:
    lock = open(root / 'releases' / name, 'a')
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    locks.append(lock)
before = json.loads(run('docker', 'inspect', 'valeexpresso-api-1'))[0]
state = {key: before['HostConfig'][key] for key in ['NanoCpus', 'CpuShares', 'CpuQuota', 'CpuPeriod', 'Memory']}
original = config.read_text()
assert '    cpus: 1.0\n' in original, 'Configuração mudou; revisar antes de aplicar'
(release / 'compose.before.yml').write_text(original)
(release / 'resources.before.json').write_text(json.dumps(state, indent=2))
benchmark = r'''
const {PrismaService}=require('/app/dist/src/prisma/prisma.service');
const {OperacaoService}=require('/app/dist/src/execucao/operacao.service');
const perfClock=require('node:perf_hooks').performance;
const fs=require('node:fs');
const db=new PrismaService();
(async()=>{
 const service=new OperacaoService(db,{});
 const queues=()=>db.execucao_queue.groupBy({by:['status'],_count:true});
 const paused=()=>db.execucao.groupBy({by:['controle_fila'],where:{execucao_queue:{some:{status:{in:['PENDENTE','PROCESSANDO']}}}},_count:true});
 const result={before:{queue:await queues(),executions:await paused()},measurements:[],cpuBefore:fs.readFileSync('/sys/fs/cgroup/cpu.stat','utf8')};
 for(const p of [11,12])await service.summary(p);
 for(let round=0;round<6;round++)for(const period of [11,12]){
  const start=perfClock.now();const data=await service.summary(period);
  result.measurements.push({round,period,ms:Math.round(perfClock.now()-start),bytes:Buffer.byteLength(JSON.stringify(data))});
 }
 result.cpuAfter=fs.readFileSync('/sys/fs/cgroup/cpu.stat','utf8');
 result.after={queue:await queues(),executions:await paused()};
 console.log(JSON.stringify(result));
})().catch(e=>{console.error(e.message);process.exitCode=1}).finally(()=>db.$disconnect());
'''
def measure(label):
    result = subprocess.run(['docker','exec','-i','valeexpresso-api-1','node','-'], input=benchmark, text=True, capture_output=True)
    if result.returncode: raise RuntimeError(result.stderr)
    data = json.loads(result.stdout)
    (release / (label + '.json')).write_text(json.dumps(data, indent=2))
    print(label, json.dumps(data), flush=True)
    return data
measure('before')
candidate = original.replace('    cpus: 1.0\n', '    cpu_shares: 512\n', 1)
config.write_text(candidate)
try:
    subprocess.run(['docker','compose','-f',str(config),'config','--quiet'],check=True)
    subprocess.run(['docker','compose','-f',str(config),'up','-d','--no-deps','--no-build','api'],check=True)
    after = json.loads(run('docker','inspect','valeexpresso-api-1'))[0]
    assert after['Image'] == before['Image']
    assert after['HostConfig']['NanoCpus']==0 and after['HostConfig']['CpuShares']==512
    assert after['HostConfig']['Memory']==state['Memory']
    assert run('docker','exec','valeexpresso-api-1','cat','/sys/fs/cgroup/cpu.max').startswith('max ')
    time.sleep(8)
    with urllib.request.urlopen('http://127.0.0.1:8081/api/',timeout=10) as response:
        assert response.status==200
except Exception:
    config.write_text(original)
    subprocess.run(['docker','compose','-f',str(config),'up','-d','--no-deps','--no-build','api'],check=True)
    raise
print('APPLIED',run('docker','exec','valeexpresso-api-1','cat','/sys/fs/cgroup/cpu.max'),flush=True)
measure('after')
(release/'published.json').write_text(json.dumps({'at':time.time(),'container':before['Id'],'cpuShares':512,'cpuLimit':None,'restart':True},indent=2))
print('DONE',flush=True)



