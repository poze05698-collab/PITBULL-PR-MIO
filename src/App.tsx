import { FormEvent, useEffect, useState } from "react";
import { supabase } from "./lib/supabase";

type Mode = "login" | "signup";

export default function App() {
  const [session, setSession] = useState(() => supabase.auth.getSession());
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (mounted) setSession(Promise.resolve(data.session));
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      setSession(Promise.resolve(currentSession));
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const resolvedSession = session instanceof Promise ? null : session;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { display_name: displayName.trim() || null }
          }
        });
        if (error) throw error;
        setMessage("Cadastro criado. Verifique seu e-mail se a confirmação estiver ativada.");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível concluir a operação.");
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    await supabase.auth.signOut();
  }

  if (resolvedSession) {
    return (
      <main className="app-shell">
        <section className="welcome-card">
          <span className="eyebrow">PITBULL PRÊMIO</span>
          <h1>Você está conectado.</h1>
          <p>Conta autenticada com segurança pelo Supabase.</p>
          <button className="primary-button" onClick={logout}>Sair</button>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <section className="auth-card">
        <span className="eyebrow">PITBULL PRÊMIO</span>
        <h1>{mode === "login" ? "Entrar" : "Criar conta"}</h1>
        <p className="muted">
          {mode === "login"
            ? "Entre para acessar sua carteira e suas atividades."
            : "Crie sua conta para começar a usar o aplicativo."}
        </p>

        <form onSubmit={submit}>
          {mode === "signup" && (
            <label>
              Nome
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Seu nome"
                autoComplete="name"
              />
            </label>
          )}

          <label>
            E-mail
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="voce@email.com"
              autoComplete="email"
              required
            />
          </label>

          <label>
            Senha
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo de 6 caracteres"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              minLength={6}
              required
            />
          </label>

          <button className="primary-button" disabled={loading}>
            {loading ? "Aguarde..." : mode === "login" ? "Entrar" : "Criar conta"}
          </button>
        </form>

        {message && <div className="status-message">{message}</div>}

        <button
          className="link-button"
          onClick={() => {
            setMode(mode === "login" ? "signup" : "login");
            setMessage("");
          }}
        >
          {mode === "login" ? "Ainda não tenho conta" : "Já tenho uma conta"}
        </button>
      </section>
    </main>
  );
}