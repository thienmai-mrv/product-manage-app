/**
 * Nav control that opens Login or signs the administrator out.
 *
 * @param props.authenticated True when the session user is known
 * @param props.onLogin Opens the login page
 * @param props.onLogout Clears the session
 * @return Login or Logout button
 */
export default function AuthControl({ authenticated, onLogin, onLogout }) {
  if (authenticated) {
    return (
      <button type="button" className="nav-auth" onClick={onLogout}>
        Logout
      </button>
    );
  }
  return (
    <button type="button" className="nav-auth" onClick={onLogin}>
      Login
    </button>
  );
}
