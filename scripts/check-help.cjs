const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const ts=require('../administration/node_modules/typescript');
const source=fs.readFileSync(path.join(__dirname,'../administration/src/pages/AjudaPage/content.ts'),'utf8');
const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const exportsData={};vm.runInNewContext(output,{exports:exportsData});
const {helpArticles,categories,findArticles}=exportsData;
const ids=new Set(helpArticles.map(a=>a.id));assert.equal(ids.size,helpArticles.length);
const images=new Set();
for(const a of helpArticles){
 assert.match(a.id,/^[a-z0-9-]+$/);assert.ok(a.title&&a.summary&&a.sections.length);
 assert.ok(categories.some(c=>c.id===a.category));
 for(const id of a.related)assert.ok(ids.has(id),a.id+' related '+id);
 for(const s of a.sections){assert.ok(s.title);if(s.image){
  const file=path.join(__dirname,'../administration/public/manual-ajuda',s.image);assert.ok(fs.existsSync(file),file);
  const buffer=fs.readFileSync(file);assert.equal(buffer[0],255);assert.equal(buffer[1],216);assert.ok(s.imageAlt);images.add(s.image);
 }}
}
assert.ok(findArticles('divisao zero').some(a=>a.id==='fixo-zero-dias'));
assert.equal(findArticles('xyz_inexistente_987').length,0);
assert.ok(findArticles('','tecnica').every(a=>a.category==='tecnica'));
assert.ok(helpArticles.find(a=>a.id==='enviar-rm').sections.some(s=>s.note?.includes('diretamente')));
console.log(JSON.stringify({articles:helpArticles.length,categories:categories.length,screenshots:images.size,relatedLinksValid:true,searchAccentInsensitive:true}));
