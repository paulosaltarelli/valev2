export const defaultConfig = {
  language: {
    url: "https://cdn.datatables.net/plug-ins/2.3.6/i18n/pt-BR.json",
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
