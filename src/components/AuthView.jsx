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
    <main className="grid min-h-screen place-items-center p-4">
      <form
        className="grid w-full max-w-[420px] gap-[0.6rem] rounded-xl border border-[#dfe1e6] bg-white p-4"
        onSubmit={submit}
      >
        <h1>{mode === "login" ? "Sign in" : "Create account"}</h1>
        {error ? <p className="my-2 text-red-600">{error}</p> : null}
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
          className="border border-[#c1c7d0] bg-transparent text-[#0052cc]"
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
