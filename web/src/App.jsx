import { useEffect } from "react";
import { NavLink, Navigate, Route, Routes, useLocation } from "react-router-dom";
import Categories from "./components/Categories.jsx";
import Dashboard from "./components/Dashboard.jsx";
import Products from "./components/Products.jsx";

/**
 * Build the navigation link class.
 *
 * @param isActive True when this route is active
 * @return Link class name
 */
function navClass({ isActive }) {
  return isActive ? "nav-link active" : "nav-link";
}

const PAGE_TITLES = {
  "/dashboard": "Dashboard",
  "/products": "Products",
  "/categories": "Categories",
};

/**
 * Render the dashboard and the product and category admin pages.
 * Express serves this app for /dashboard, /products, and /categories.
 *
 * @return Page element
 */
export default function App() {
  const location = useLocation();
  const isDashboard = location.pathname === "/dashboard";
  const pageTitle = PAGE_TITLES[location.pathname] || "Dashboard";

  useEffect(() => {
    document.title = pageTitle;
  }, [pageTitle]);

  return (
    <main className={isDashboard ? "page page-dashboard" : "page"}>
      {isDashboard ? null : (
        <header className="header">
          <h1>{pageTitle}</h1>
        </header>
      )}
      <nav className="nav">
        <NavLink to="/dashboard" className={navClass}>
          Dashboard
        </NavLink>
        <NavLink to="/products" className={navClass}>
          Products
        </NavLink>
        <NavLink to="/categories" className={navClass}>
          Categories
        </NavLink>
      </nav>
      <Routes>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/products" element={<Products />} />
        <Route path="/categories" element={<Categories />} />
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </main>
  );
}
