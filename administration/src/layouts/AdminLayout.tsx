import { Outlet } from "react-router";
import { Footer } from "../shared/components/Footer";
import { Navbar } from "../shared/components/Navbar";
import { Sidebar } from "../shared/components/Sidebar";
import { useThemeContext } from "../contexts/ThemeContext/useThemeContext";

export function AdminLayout() {
  const { state } = useThemeContext();
  return (
    <section className={state.mobileMenu ? "overlay active" : "overlay "}>
      <Sidebar />
      <main
        className={
          state.sidebarActive ? "dashboard-main active" : "dashboard-main"
        }
      >
        <Navbar />
        <div className="dashboard-main-body">
          <Outlet />
        </div>
        <Footer />
      </main>
    </section>
  );
}
