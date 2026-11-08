export const defaultConfig = {
  language: {
    search: "Buscar:",
    lengthMenu: "Mostrar _MENU_ registros",
    info: "_START_ a _END_ de _TOTAL_ registros",
    infoEmpty: "Nenhum registro",
    infoFiltered: "(de _MAX_ registros)",
    emptyTable: "Nenhum registro para exibir",
    zeroRecords: "Nenhum resultado para a busca",
    loadingRecords: "Carregando…",
    processing: "Carregando…",
    paginate: { first: "Primeira", previous: "Anterior", next: "Próxima", last: "Última" },
    select: { rows: { _: "%d selecionados", 1: "1 selecionado", 0: "" } },
  },
  // Ajuda em React 18 (StrictMode/HMR) a evitar "Cannot reinitialise DataTable"
  retrieve: true,
  autoWidth: false,
  lengthMenu: [
    [5, 10, 25, 50, -1],
    [5, 10, 25, 50, "Todos"],
  ], // menu para alterar a quantidade de registro
  orderCellsTop: true,
  fixedHeader: true,
  responsive: true,
  // order: [[0, 'asc']], // ordenação padrão
};

export const processamentoTableConfig = {
  ...defaultConfig,
  language: {
    search: "Buscar:",
    lengthMenu: "Mostrar _MENU_ registros",
    info: "_START_ a _END_ de _TOTAL_ registros",
    infoEmpty: "Nenhum registro",
    infoFiltered: "(de _MAX_ registros)",
    emptyTable: "Nenhum registro para exibir",
    zeroRecords: "Nenhum resultado para a busca",
    loadingRecords: "Carregando…",
    processing: "Carregando…",
    paginate: { first: "Primeira", previous: "Anterior", next: "Próxima", last: "Última" },
    select: {
      rows: { _: "%d selecionados", 1: "1 selecionado", 0: "" },
    },
  },
};
