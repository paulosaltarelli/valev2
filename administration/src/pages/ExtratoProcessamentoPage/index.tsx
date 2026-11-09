import { useEffect, useState } from "react";
import { PageHeading } from "../../shared/components/PageHeading";
import { AnalysisNav } from "../../shared/components/AnalysisNav";
import { http } from "../../shared/lib/http";
import "./extrato.css";

type Options = {
  periodos: { periodo_id: number; competencia: string; ativo: boolean }[];
  periodo: number | null;
  execucoes: {
    execucao_id: number;
    data_execucao: string;
    filial: { filial_id: number; nome: string };
  }[];
};

type Formula = { formula_id: number; nome: string; versao: number; tipo: string | null };
type Employee = {
  id: number;
  nome: string | null;
  matricula: string;
  erroGeral: string | null;
  resultados: Record<number, { valor: string | null; erro: string | null } | undefined>;
};
type Report = { filial: string; competencia: string; formulas: Formula[]; funcionarios: Employee[] };

const endpoint = "/dash/reports/processamento";
const pageSize = 25;
const number = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });
const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dateTime = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });

export function ExtratoProcessamentoPage() {
  const [periodo, setPeriodo] = useState<number>();
  const [filial, setFilial] = useState<number>();
  const [execucao, setExecucao] = useState<number>();
  const [options, setOptions] = useState<Options>();
  const [result, setResult] = useState<{ id: number; data: Report }>();
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  const [request, setRequest] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setError("");
    http.get<Options>(endpoint + "/opcoes", { params: { periodoId: periodo }, signal: controller.signal })
      .then(({ data }) => { if (!controller.signal.aborted) setOptions(data); })
      .catch(() => { if (!controller.signal.aborted) setError("Não foi possível carregar as opções do relatório."); });
    return () => controller.abort();
  }, [periodo, request]);

  const currentOptions = periodo === undefined || options?.periodo === periodo ? options : undefined;
  const branches = [...new Map(currentOptions?.execucoes.map(({ filial }) => [filial.filial_id, filial])).values()]
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  const branchId = branches.find((branch) => branch.filial_id === filial)?.filial_id ?? branches[0]?.filial_id;
  const executions = currentOptions?.execucoes.filter(({ filial }) => filial.filial_id === branchId) ?? [];
  const executionId = executions.find((item) => item.execucao_id === execucao)?.execucao_id ?? executions[0]?.execucao_id;

  useEffect(() => {
    if (executionId === undefined) return;
    const controller = new AbortController();
    setError("");
    http.get<Report>(endpoint + "/" + executionId, { signal: controller.signal })
      .then(({ data }) => { if (!controller.signal.aborted) setResult({ id: executionId, data }); })
      .catch(() => { if (!controller.signal.aborted) setError("Não foi possível carregar a execução selecionada."); });
    return () => controller.abort();
  }, [executionId, request]);

  const report = result?.id === executionId ? result?.data : undefined;
  const term = search.trim().toLocaleLowerCase("pt-BR");
  const employees = report?.funcionarios.filter((employee) =>
    employee.nome?.toLocaleLowerCase("pt-BR").includes(term) || employee.matricula.toLocaleLowerCase("pt-BR").includes(term),
  ) ?? [];
  const pages = Math.max(1, Math.ceil(employees.length / pageSize));
  const visiblePage = Math.min(page, pages);
  const offset = (visiblePage - 1) * pageSize;
  const columns = report?.formulas.map((formula, _, all) => {
    const sameName = all.filter((other) => other.nome === formula.nome);
    const version = sameName.length > 1 ? ` · v${formula.versao}` : "";
    const id = sameName.filter((other) => other.versao === formula.versao).length > 1 ? ` · #${formula.formula_id}` : "";
    return { ...formula, label: formula.nome + version + id };
  }) ?? [];

  async function exportExcel() {
    if (!report || !employees.length) return;
    setExporting(true);
    setError("");
    try {
      const { default: ExcelJS } = await import("exceljs");
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet("Valores calculados", { views: [{ state: "frozen", xSplit: 2, ySplit: 1 }] });
      sheet.columns = [
        { header: "Funcionário", width: 36 },
        { header: "Matrícula", width: 16 },
        ...columns.map((column) => ({
          header: column.label,
          width: 27,
          style: { numFmt: column.tipo === "V" ? '"R$" #,##0.00' : "#,##0.##" },
        })),
      ];
      sheet.getRow(1).font = { bold: true };
      sheet.getRow(1).alignment = { wrapText: true, vertical: "middle" };
      for (const employee of employees) {
        const row = sheet.addRow([
          employee.nome ?? "",
          employee.matricula,
          ...columns.map(({ formula_id }) => {
            const cell = employee.resultados[formula_id];
            return cell?.erro ? `Erro · ${cell.erro}` : cell?.valor == null ? null : Number(cell.valor);
          }),
        ]);
        if (employee.erroGeral) {
          const name = row.getCell(1);
          name.value = `${employee.nome ?? ""}\nErro · ${employee.erroGeral}`;
          name.alignment = { wrapText: true };
        }
      }
      sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columnCount } };
      const buffer = await workbook.xlsx.writeBuffer();
      const url = URL.createObjectURL(new Blob([new Uint8Array(buffer)], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `extrato-${report.competencia.replace("/", "-")}-execucao-${executionId}.xlsx`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setError("Não foi possível gerar o Excel. Tente exportar novamente.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="op-page">
      <PageHeading
        area="Análise"
        title="Valores por funcionário"
        description="Consulte os valores calculados por funcionário e fórmula."
        actions={
          <button className="btn btn-primary" type="button" disabled={!employees.length || exporting} onClick={() => void exportExcel()}>
            {exporting ? "Gerando Excel…" : "Exportar Excel"}
          </button>
        }
      />
      <AnalysisNav />
      <section className="op-context extrato-filtros" aria-label="Filtros do extrato">
        <label>
          Competência
          <select value={periodo ?? options?.periodo ?? ""} disabled={!options?.periodos.length}
            onChange={(event) => { setPeriodo(Number(event.target.value)); setExecucao(undefined); setPage(1); }}>
            {!options?.periodos.length && <option value="">Nenhuma disponível</option>}
            {options?.periodos.map((item) => <option key={item.periodo_id} value={item.periodo_id}>{item.competencia}{item.ativo ? " · Ativa" : ""}</option>)}
          </select>
        </label>
        <label>
          Filial
          <select value={branchId ?? ""} disabled={!branches.length}
            onChange={(event) => { setFilial(Number(event.target.value)); setExecucao(undefined); setPage(1); }}>
            {!branches.length && <option value="">Nenhuma disponível</option>}
            {branches.map((branch) => <option key={branch.filial_id} value={branch.filial_id}>{branch.nome}</option>)}
          </select>
        </label>
        <label>
          Execução
          {executions.length === 1 ? <span className="ve-readonly-value">#{executions[0].execucao_id} · {dateTime.format(new Date(executions[0].data_execucao))}</span> : <select value={executionId ?? ""} disabled={!executions.length}
            onChange={(event) => { setExecucao(Number(event.target.value)); setPage(1); }}>
            {!executions.length && <option value="">Nenhuma disponível</option>}
            {executions.map((item, index) => (
              <option key={item.execucao_id} value={item.execucao_id}>
                #{item.execucao_id} · {dateTime.format(new Date(item.data_execucao))}{index === 0 ? " · Mais recente" : ""}
              </option>
            ))}
          </select>}
        </label>
        <label>
          Funcionário ou matrícula
          <input type="search" value={search} placeholder="Buscar no extrato"
            onChange={(event) => { setSearch(event.target.value); setPage(1); }} />
        </label>
      </section>
      {error && <p role="alert" className="op-danger">{error} <button type="button" className="btn btn-outline-primary btn-sm" onClick={() => setRequest((count) => count + 1)}>Recarregar</button></p>}
      {!error && !report && (!currentOptions || executionId !== undefined) && <p role="status">Carregando extrato…</p>}
      {!error && currentOptions && executionId === undefined && <p>Nenhuma execução disponível para esta competência.</p>}
      {report && <>
        <p className="op-muted" role="status">
          {employees.length} {employees.length === 1 ? "funcionário" : "funcionários"} · {columns.length} {columns.length === 1 ? "fórmula" : "fórmulas"} · — indica ausência de cálculo.
        </p>
        {employees.length ? (
          <div className="op-table-wrap">
            <div className="op-scroll extrato-tabela" tabIndex={0} role="region" aria-label="Valores calculados por funcionário">
              <table className="op-table">
                <thead>
                  <tr>
                    <th scope="col">Funcionário</th>
                    {columns.map((column) => <th scope="col" key={column.formula_id}>{column.label}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {employees.slice(offset, offset + pageSize).map((employee) => (
                    <tr key={employee.id}>
                      <th scope="row">
                        {employee.nome || "Nome indisponível"}
                        <small className="op-muted">{employee.matricula}</small>
                        {employee.erroGeral && <small className="op-danger">Erro · {employee.erroGeral}</small>}
                      </th>
                      {columns.map((column) => {
                        const cell = employee.resultados[column.formula_id];
                        return <td key={column.formula_id}>{
                          cell?.erro ? <details className="ve-cell-error"><summary className="op-danger">Erro · {cell.erro.split(":")[0].slice(0, 32)}</summary><p className="mt-2 mb-0">{cell.erro}</p></details> :
                            cell?.valor == null ? <span className="op-muted">—</span> :
                              (column.tipo === "V" ? money : number).format(Number(cell.valor))
                        }</td>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : <p>{term ? "Nenhum funcionário encontrado para esta busca." : "A execução ainda não tem funcionários registrados."}</p>}
        {pages > 1 && (
          <nav className="extrato-paginacao" aria-label="Paginação do extrato">
            <button type="button" className="btn btn-outline-primary btn-sm" disabled={visiblePage === 1} onClick={() => setPage(visiblePage - 1)}>Anterior</button>
            <span>Página {visiblePage} de {pages}</span>
            <button type="button" className="btn btn-outline-primary btn-sm" disabled={visiblePage === pages} onClick={() => setPage(visiblePage + 1)}>Próxima</button>
          </nav>
        )}
      </>}
    </div>
  );
}
