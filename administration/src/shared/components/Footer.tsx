export function Footer() {
  return (
    <footer className="d-footer">
      <div className="row align-items-center justify-content-between">
        <div className="col-auto">
          <p className="mb-0">©{new Date().getFullYear()} Expresso Nepomuceno. Todos os direitos reservados.</p>
        </div>
        <div className="col-auto">
          {/* <p className="mb-0">
            Made by <span className="text-primary-600">wowtheme7</span>
          </p> */}
        </div>
      </div>
    </footer>
  );
}
