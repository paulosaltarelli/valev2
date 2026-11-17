// Execute após npm ci em administration: node scripts/check-formula-help.cjs.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const frontend=process.argv[2]?path.resolve(process.argv[2]):path.join(__dirname,'../administration');
const ts=require(path.join(frontend,'node_modules/typescript'));
const root=path.join(frontend,'src/pages/AjudaPage');
function load(file){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root,file+'.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:n=>load(n.replace('./','')),crypto:crypto.webcrypto,TextEncoder});return exports;}
(async()=>{
 const h=load('formulaReference');
 const golden=[['futureValue',0,440],['futureValue',1,350],['futureValue',2,290.4],['futureValue',3,25],['futureValue',4,350],['refundValue',0,60],['refundValue',1,52.5],['refundValue',2,39.6],['refundValue',3,25],['refundValue',4,null],['refundValue',5,0],['refundStrict',5,null],['refundValue',6,0],['discountValue',0,60],['discountValue',1,52.5],['discountValue',2,39.6],['discountValue',4,null],['discountValue',5,0],['discountValue',7,0],['discountDays',0,3],['discountDays',7,0],['refundDays',6,0],['futureDays',0,22]];
 for(const [pattern,index,value]of golden){const actual=h.calculateExample(pattern,h.examples[index].scope).value;if(value===null)assert.equal(actual,null);else assert.ok(Math.abs(actual-value)<1e-8,`${pattern}/${index}`);}
 assert.equal(await h.recognizeExpression('(:DESCONHECIDA) + 999'),null);
 assert.equal(h.expressionVariables('(:A) > 0 ? min((:B), 10) : Infinity').join(','),'A,B');
 const content=load('content');const ids=new Set(content.helpArticles.map(a=>a.id));assert.equal(ids.size,content.helpArticles.length);
 for(const a of content.helpArticles)for(const id of a.related)assert.ok(ids.has(id),id);
 assert.equal(content.helpArticles.find(a=>a.id==='conferencia-dia-a-dia').category,'operacao');
 assert.equal(content.helpArticles.find(a=>a.id==='formulas-por-filial').category,'tecnica');
 assert.ok(!content.helpArticles.find(a=>a.id==='conferencia-dia-a-dia').sections.some(s=>s.code));
 console.log(JSON.stringify({goldenCases:golden.length,unknownExpressionsBlocked:true,variableParserChecked:true,operationalTechnicalSeparation:true,linksValid:true}));
})().catch(error=>{console.error(error);process.exitCode=1});
