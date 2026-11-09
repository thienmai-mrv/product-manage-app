import { useEffect, useState } from "react";
import { NavLink, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { requestJson } from "./api.js";
import { ADMIN_PATHS } from "./authPaths.js";
import AuthControl from "./components/AuthControl.jsx";
import Brands from "./components/Brands.jsx";
import Categories from "./components/Categories.jsx";
import Dashboard from "./components/Dashboard.jsx";
import Login from "./components/Login.jsx";
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
  "/brands": "Brands",
  "/categories": "Categories",
  "/login": "Login",
};

/**
 * Hide an admin page until the session call settles, then redirect anonymous visitors.
 *
 * @param props.ready True after GET /api/auth/session settles
 * @param props.user Public user, or null
 * @param props.children Admin page
 * @return Page, nothing, or a login redirect
 */
function AdminRoute({ ready, user, children }) {
  if (!ready) {
    return null;
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

/**
 * Render the dashboard, login page, and the product, brand, and category admin pages.
 * Express and the Worker serve this app for those routes. Unknown paths still open the Dashboard.
 *
 * @return Page element
 */
export default function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const [sessionReady, setSessionReady] = useState(false);
  const [user, setUser] = useState(null);
  const [logoutError, setLogoutError] = useState("");
  const isDashboard = location.pathname === "/dashboard";
  const isWidePage = ADMIN_PATHS.includes(location.pathname);
  const pageTitle = PAGE_TITLES[location.pathname] || "Dashboard";

  useEffect(() => {
    document.title = pageTitle;
  }, [pageTitle]);

  useEffect(() => {
    let cancelled = false;
    requestJson("/api/auth/session")
      .then((body) => {
        if (cancelled) {
          return;
        }
        if (body?.authenticated && body.user) {
          setUser(body.user);
        } else {
          setUser(null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setUser(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setSessionReady(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Store the public user and open the product admin page.
   *
   * @param account Username or email
   * @param password Password
   */
  async function handleLogin(account, password) {
    const body = await requestJson("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ account, password }),
      fallback: "Login failed",
    });
    setUser(body.user);
    setLogoutError("");
    navigate("/products");
  }

  /**
   * Clear the session cookie and open the Dashboard.
   * A failed logout stays on the current page and does not claim the session is gone.
   */
  async function handleLogout() {
    try {
      await requestJson("/api/auth/logout", {
        method: "POST",
        fallback: "Logout failed",
      });
      setUser(null);
      setLogoutError("");
      navigate("/dashboard");
    } catch (error) {
      setLogoutError(error instanceof Error ? error.message : "Logout failed");
    }
  }

  return (
    <main className={isDashboard ? "page page-dashboard" : isWidePage ? "page page-wide" : "page"}>
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
        <NavLink to="/brands" className={navClass}>
          Brands
        </NavLink>
        <NavLink to="/categories" className={navClass}>
          Categories
        </NavLink>
        <AuthControl
          authenticated={Boolean(user)}
          onLogin={() => navigate("/login")}
          onLogout={handleLogout}
        />
      </nav>
      {logoutError ? <p className="message error">{logoutError}</p> : null}
      <Routes>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/products" element={<AdminRoute ready={sessionReady} user={user}><Products /></AdminRoute>} />
        <Route path="/brands" element={<AdminRoute ready={sessionReady} user={user}><Brands /></AdminRoute>} />
        <Route path="/categories" element={<AdminRoute ready={sessionReady} user={user}><Categories /></AdminRoute>} />
        <Route
          path="/login"
          element={
            !sessionReady
              ? null
              : user
                ? <Navigate to="/products" replace />
                : <Login onSubmit={handleLogin} />
          }
        />
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </main>
  );
}
