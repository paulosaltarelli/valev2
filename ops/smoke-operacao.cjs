/* Somente leitura: valida o contrato da operação no banco ativo, sem chamar RM. */
const { PrismaClient } = require('@prisma/client');
const { PrismaMssql } = require('@prisma/adapter-mssql');
const { OperacaoService } = require('/app/dist/src/execucao/operacao.service');
const prisma = new PrismaClient({ adapter: new PrismaMssql({
  server: process.env.DATABASE_HOST, port: Number(process.env.DATABASE_PORT),
  user: process.env.DATABASE_USER, password: process.env.DATABASE_PASSWORD,
  database: process.env.DATABASE_NAME, options: { encrypt: true, trustServerCertificate: true },
}) });
(async () => {
  const service = new OperacaoService(prisma);
  const summary = await service.summary();
  let people = 0, resultChecked = false;
  if (summary.rows.length) {
    const detail = await service.detail(summary.rows[0].id, 1, '', 'todos');
    people = detail.total;
    const result = detail.bases.flatMap(b => b.execucao_funcionario)[0];
    if (result) {
      await service.result(summary.rows[0].id, result.execucao_funcionario_id);
      resultChecked = true;
    }
  }
  console.log(JSON.stringify({ ok: true, competencias: summary.periodos.length, execucoes: summary.rows.length, pessoasNaPrimeiraExecucao: people, resultadoConsultado: resultChecked }));
})().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
