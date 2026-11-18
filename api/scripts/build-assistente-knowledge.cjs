const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const api = path.resolve(__dirname, '..');
const output = path.join(api, 'assistente-knowledge.json');
const files = [];
const denied = /(^|\/)(auth|security|rm)(\/|$)|\.spec\.|\.test\.|(^|\/)(http|prisma\.service|LoginPage)\./i;
function walk(root, prefix) {
  if (!fs.existsSync(root)) return;
  for (const item of fs.readdirSync(root, { withFileTypes: true })) {
    const absolute = path.join(root, item.name);
    const name = prefix + '/' + item.name;
    if (item.isDirectory()) walk(absolute, name);
    else if (item.isFile() && /\.(ts|tsx|css|prisma|md)$/.test(name) && !denied.test(name)) {
      let text = fs.readFileSync(absolute, 'utf8');
      if (/sk-(?:ant-|proj-)[A-Za-z0-9_-]{16,}|BEGIN .*PRIVATE KEY/.test(text)) continue;
      text = text.replace(/((?:password|secret|token|apiKey)\s*[:=]\s*)(['"])[^'"\r\n]{6,}\2/gi, '$1"[redigido]"');
      files.push({ path: name, sha256: crypto.createHash('sha256').update(text).digest('hex'), text });
    }
  }
}
walk(path.join(api, 'src'), 'api/src');
const frontend = path.resolve(api, '../administration/src');
if (fs.existsSync(frontend)) walk(frontend, 'administration/src');
else if (fs.existsSync(output)) {
  // O contexto Docker da API recebe o pacote de frontend gerado pelo release.
  const previous = JSON.parse(fs.readFileSync(output, 'utf8'));
  files.push(...previous.files.filter((file) => file.path.startsWith('administration/src/')));
}
const schema = fs.readFileSync(path.join(api, 'prisma/schema.prisma'), 'utf8');
const allowed = new Set(['periodo', 'filial', 'execucao', 'execucao_funcionario', 'execucao_funcionario_base', 'formula', 'variavel', 'memoria_calculo', 'log_execucao', 'execucao_queue', 'execucao_create_queue', 'geo_queue', 'ajuste_manual']);
const publicSchema = [...schema.matchAll(/model (\w+) \{[\s\S]*?^\}/gm)]
  .filter((match) => allowed.has(match[1])).map((match) => match[0]).join('\n\n');
files.push({ path: 'api/prisma/schema.prisma', sha256: crypto.createHash('sha256').update(publicSchema).digest('hex'), text: publicSchema });
const revision = crypto.createHash('sha256').update(files.map((file) => file.sha256).join('')).digest('hex');
fs.writeFileSync(output, JSON.stringify({ generatedAt: new Date().toISOString(), revision, files }));
console.log('Conhecimento do Vale IA gerado (' + files.length + ' arquivos).');
