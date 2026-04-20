import { useState } from "react";

function EMPTY_FORM() {
  return { name: "", email: "", password: "" };
}

export default function AuthView({ onLogin, onRegister, loading, error }) {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState(EMPTY_FORM());

  const submit = (event) => {
    event.preventDefault();
    if (mode === "login") {
      onLogin({ email: form.email, password: form.password });
      return;
    }
    onRegister(form);
  };

  return (
    <main className="auth-shell">
      <form className="auth-card" onSubmit={submit}>
        <h1>{mode === "login" ? "Sign in" : "Create account"}</h1>
        {error ? <p className="error">{error}</p> : null}
        {mode === "register" ? (
          <input
            placeholder="Full name"
            value={form.name}
            onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
          />
        ) : null}
        <input
          placeholder="Email"
          value={form.email}
          onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
        />
        <input
          type="password"
          placeholder="Password"
          value={form.password}
          onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
        />
        <button type="submit" disabled={loading}>
          {loading ? "Loading..." : mode === "login" ? "Sign in" : "Register"}
        </button>
        <button
          type="button"
          className="link-btn"
          onClick={() => {
            setMode((prev) => (prev === "login" ? "register" : "login"));
            setForm(EMPTY_FORM());
          }}
        >
          {mode === "login" ? "Need an account?" : "Already have an account?"}
        </button>
      </form>
    </main>
  );
}
