import { useState } from "react";

/**
 * Administrator login form.
 * API errors render in `.message.error`. Submit always calls the login API.
 *
 * @param props.onSubmit Called with the account and password
 * @param props.error Optional error already known to the caller
 * @return Login form
 */
export default function Login({ onSubmit, error = "" }) {
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [submitError, setSubmitError] = useState("");
  const message = error || submitError;

  /**
   * Post the form and keep the visitor on this page when the API rejects it.
   *
   * @param event Submit event
   */
  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitError("");
    try {
      await onSubmit?.(account, password);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Login failed");
    }
  }

  return (
    <section className="login-screen">
      <div className="login-card">
        <p className="login-kicker">Administrator</p>
        <p className="login-lead">Sign in to manage products, brands, and categories.</p>
        <form className="config-form" onSubmit={handleSubmit}>
          <label>
            Username or email
            <input
              name="account"
              autoComplete="username"
              value={account}
              onChange={(event) => setAccount(event.target.value)}
            />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          <button type="submit" className="primary">Login</button>
          {message ? <p className="message error">{message}</p> : null}
        </form>
      </div>
    </section>
  );
}
