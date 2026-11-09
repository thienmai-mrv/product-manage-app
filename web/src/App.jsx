import { useEffect, useRef, useState } from "react";
import { NavLink, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { requestJson } from "./api.js";
import { ADMIN_PATHS } from "./authPaths.js";
import AuthControl from "./components/AuthControl.jsx";
import LoadingState from "./components/LoadingState.jsx";
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

const ADMIN_LEADS = {
  "/products": "Manage catalog items, images, stock, and what shoppers can see.",
  "/brands": "Keep brand names unique and see how many products use each one.",
  "/categories": "Group the catalog and see how many products sit in each category.",
};

/**
 * Top or side navigation, including Login and Logout.
 *
 * @param props.user Public user, or null
 * @param props.onLogin Opens the login page
 * @param props.onLogout Clears the session
 * @return Navigation element
 */
function SiteNav({ user, onLogin, onLogout }) {
  return (
    <nav className="nav">
      <NavLink to="/dashboard" className={navClass}>
        Dashboard
      </NavLink>
      {user ? (
        <>
          <NavLink to="/products" className={navClass}>
            Products
          </NavLink>
          <NavLink to="/brands" className={navClass}>
            Brands
          </NavLink>
          <NavLink to="/categories" className={navClass}>
            Categories
          </NavLink>
        </>
      ) : null}
      <AuthControl
        authenticated={Boolean(user)}
        onLogin={onLogin}
        onLogout={onLogout}
      />
    </nav>
  );
}

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
    return <LoadingState label="Loading…" />;
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
  const pendingLogout = useRef(false);
  const pathnameRef = useRef(location.pathname);
  pathnameRef.current = location.pathname;
  const isDashboard = location.pathname === "/dashboard";
  const isLogin = location.pathname === "/login";
  const isWidePage = ADMIN_PATHS.includes(location.pathname);
  const pageTitle = PAGE_TITLES[location.pathname] || "Dashboard";
  const shellClass = isDashboard
    ? "page page-dashboard"
    : isLogin
      ? "page page-login"
      : isWidePage
        ? "page page-wide page-admin"
        : "page";

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

  useEffect(() => {
    if (pendingLogout.current && location.pathname === "/dashboard") {
      pendingLogout.current = false;
      setUser(null);
    }
  }, [location.pathname]);

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
   * The user stays signed in until /dashboard commits, so AdminRoute does not
   * replace that navigation with /login. A failed logout stays on the current page.
   */
  async function handleLogout() {
    try {
      await requestJson("/api/auth/logout", {
        method: "POST",
        fallback: "Logout failed",
      });
      setLogoutError("");
      if (pathnameRef.current === "/dashboard") {
        setUser(null);
        return;
      }
      pendingLogout.current = true;
      navigate("/dashboard");
    } catch (error) {
      pendingLogout.current = false;
      setLogoutError(error instanceof Error ? error.message : "Logout failed");
    }
  }

  const navigation = (
    <SiteNav
      user={user}
      onLogin={() => navigate("/login")}
      onLogout={handleLogout}
    />
  );

  return (
    <main className={shellClass}>
      {isWidePage ? (
        <aside className="admin-side">
          <div className="admin-brand">
            <span className="admin-mark" aria-hidden="true">PM</span>
            <span>Product admin</span>
          </div>
          {navigation}
        </aside>
      ) : null}
      <div className={isWidePage ? "admin-body" : undefined}>
      {isDashboard ? null : (
        <header className="header">
          <div>
            {isWidePage ? <p className="admin-kicker">Administration</p> : null}
            <h1>{pageTitle}</h1>
            {isWidePage ? <p className="admin-lead">{ADMIN_LEADS[location.pathname]}</p> : null}
          </div>
        </header>
      )}
      {isWidePage ? null : navigation}
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
              ? <LoadingState label="Loading…" />
              : user
                ? <Navigate to="/products" replace />
                : <Login onSubmit={handleLogin} />
          }
        />
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
      </div>
    </main>
  );
}
