export function ReportPagination({ page, total, onPage, size = 25 }: {
  page: number; total: number; onPage: (page: number) => void; size?: number;
}) {
  const pages = Math.max(1, Math.ceil(total / size));
  if (pages < 2) return null;
  return <nav className="op-toolbar mt-3" aria-label="Paginação do relatório">
    <button className="btn btn-outline-primary" disabled={page <= 1} onClick={()=>onPage(page-1)}>Anterior</button>
    <span>Página {page} de {pages} · {total} linhas</span>
    <button className="btn btn-outline-primary" disabled={page >= pages} onClick={()=>onPage(page+1)}>Próxima</button>
  </nav>;
}

export async function exportReport(name: string, headers: string[], rows: (string | number | null)[][],
  context: Record<string,string>) {
  const {default:ExcelJS} = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Relatório', {views:[{state:'frozen',ySplit:1,xSplit:1}]});
  sheet.columns = headers.map((header,index)=>({header,width:index === 0 ? 40 : 24}));
  sheet.getRow(1).font={bold:true};
  sheet.getRow(1).alignment={wrapText:true};
  for (const row of rows) sheet.addRow(row);
  sheet.autoFilter={from:{row:1,column:1},to:{row:1,column:headers.length}};
  const metadata=workbook.addWorksheet('Contexto');
  metadata.columns=[{header:'Filtro',width:28},{header:'Valor',width:75}];
  for (const entry of Object.entries(context)) metadata.addRow(entry);
  const buffer=await workbook.xlsx.writeBuffer();
  const url=URL.createObjectURL(new Blob([new Uint8Array(buffer)],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
  const link=document.createElement('a'); link.href=url; link.download=name+'.xlsx'; link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
