import { FormEvent, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";

type Mode = "login" | "signup";
type View = "home" | "activities";
type Profile = { display_name: string | null; username: string | null };
type Wallet = { balance_points: number; pending_points: number; total_earned: number; total_withdrawn: number };
type Activity = {
  id: number;
  title: string;
  description: string | null;
  reward_points: number;
  kind: "SURVEY" | "OFFER";
  estimated_minutes?: number | null;
  category?: string | null;
};

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [mode, setMode] = useState<Mode>("login");
  const [view, setView] = useState<View>("home");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingHome, setLoadingHome] = useState(false);
  const [loadingActivities, setLoadingActivities] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) setSession(data.session);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, currentSession) => setSession(currentSession));
    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (session) {
      void loadHome(session.user.id);
      void loadActivities();
    } else {
      setProfile(null);
      setWallet(null);
      setActivities([]);
      setView("home");
    }
  }, [session]);

  async function loadHome(userId: string) {
    setLoadingHome(true);
    setMessage("");
    try {
      const [{ data: profileData, error: profileError }, { data: walletData, error: walletError }] = await Promise.all([
        supabase.from("profiles").select("display_name,username").eq("id", userId).single(),
        supabase.from("wallets").select("balance_points,pending_points,total_earned,total_withdrawn").eq("user_id", userId).single()
      ]);
      if (profileError) throw profileError;
      if (walletError) throw walletError;
      setProfile(profileData);
      setWallet(walletData);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível carregar sua conta.");
    } finally {
      setLoadingHome(false);
    }
  }

  async function loadActivities() {
    setLoadingActivities(true);
    setMessage("");
    try {
      const [{ data: surveys, error: surveysError }, { data: offers, error: offersError }] = await Promise.all([
        supabase.from("surveys").select("id,title,description,reward_points,estimated_minutes").order("reward_points", { ascending: false }),
        supabase.from("offers").select("id,title,description,reward_points,category").order("reward_points", { ascending: false })
      ]);
      if (surveysError) throw surveysError;
      if (offersError) throw offersError;

      setActivities([
        ...(surveys ?? []).map((item) => ({ ...item, kind: "SURVEY" as const })),
        ...(offers ?? []).map((item) => ({ ...item, kind: "OFFER" as const }))
      ]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível carregar as atividades.");
    } finally {
      setLoadingActivities(false);
    }
  }

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
          options: { data: { display_name: displayName.trim() || null } }
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

  if (session) {
    const name = profile?.display_name || profile?.username || session.user.email?.split("@")[0] || "Usuário";

    return (
      <main className="home-shell">
        <header className="topbar">
          <div>
            <span className="eyebrow">PITBULL PRÊMIO</span>
            <strong>Olá, {name} 👋</strong>
          </div>
          <button className="ghost-button" onClick={logout}>Sair</button>
        </header>

        {view === "home" ? (
          <>
            <section className="balance-card">
              <span>Saldo disponível</span>
              <strong>{wallet?.balance_points ?? 0}</strong>
              <small>pontos</small>
              <button className="secondary-button" onClick={() => void loadHome(session.user.id)} disabled={loadingHome}>
                {loadingHome ? "Atualizando..." : "Atualizar saldo"}
              </button>
            </section>

            <section className="stats-grid">
              <article><span>Pontos pendentes</span><strong>{wallet?.pending_points ?? 0}</strong></article>
              <article><span>Total ganho</span><strong>{wallet?.total_earned ?? 0}</strong></article>
              <article><span>Total retirado</span><strong>{wallet?.total_withdrawn ?? 0}</strong></article>
            </section>

            <section className="section-card">
              <span className="eyebrow">COMECE A GANHAR</span>
              <h2>Atividades</h2>
              <p>Escolha uma atividade disponível para acumular pontos.</p>
              <div className="activity-grid">
                <button className="activity-card" onClick={() => setView("activities")}>
                  <span>🔎</span><strong>Pesquisas</strong><small>Ver disponíveis</small>
                </button>
                <button className="activity-card" onClick={() => setView("activities")}>
                  <span>🎯</span><strong>Tarefas</strong><small>Ver disponíveis</small>
                </button>
                <button className="activity-card" disabled>
                  <span>📺</span><strong>Anúncios</strong><small>Em preparação</small>
                </button>
              </div>
            </section>
          </>
        ) : (
          <section className="section-card activities-page">
            <div className="page-heading">
              <div>
                <span className="eyebrow">GANHE PONTOS</span>
                <h1>Atividades disponíveis</h1>
              </div>
              <button className="secondary-button" onClick={() => void loadActivities()} disabled={loadingActivities}>
                {loadingActivities ? "Atualizando..." : "Atualizar"}
              </button>
            </div>

            {activities.length === 0 && !loadingActivities && (
              <div className="empty-state">
                <span>🎯</span>
                <strong>Nenhuma atividade disponível agora</strong>
                <p>As atividades aparecerão aqui quando um provedor estiver ativo e houver ofertas para seu perfil.</p>
              </div>
            )}

            <div className="activity-list">
              {activities.map((activity) => (
                <article className="activity-row" key={`${activity.kind}-${activity.id}`}>
                  <div className="activity-icon">{activity.kind === "SURVEY" ? "🔎" : "🎯"}</div>
                  <div className="activity-info">
                    <span className="activity-type">{activity.kind === "SURVEY" ? "Pesquisa" : "Tarefa"}</span>
                    <h3>{activity.title}</h3>
                    {activity.description && <p>{activity.description}</p>}
                    <small>
                      +{activity.reward_points} pontos
                      {activity.estimated_minutes ? ` • ~${activity.estimated_minutes} min` : ""}
                      {activity.category ? ` • ${activity.category}` : ""}
                    </small>
                  </div>
                  <button className="primary-button activity-start" disabled title="Abertura segura será ativada na próxima etapa">
                    Começar
                  </button>
                </article>
              ))}
            </div>
          </section>
        )}

        {message && <div className="status-message">{message}</div>}

        <nav className="bottom-nav">
          <button className={view === "home" ? "active" : ""} onClick={() => setView("home")}>🏠<span>Início</span></button>
          <button className={view === "activities" ? "active" : ""} onClick={() => setView("activities")}>🎯<span>Atividades</span></button>
          <button disabled>💰<span>Carteira</span></button>
          <button disabled>👥<span>Indicações</span></button>
          <button disabled>👤<span>Perfil</span></button>
        </nav>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <section className="auth-card">
        <span className="eyebrow">PITBULL PRÊMIO</span>
        <h1>{mode === "login" ? "Entrar" : "Criar conta"}</h1>
        <p className="muted">{mode === "login" ? "Entre para acessar sua carteira e suas atividades." : "Crie sua conta para começar a usar o aplicativo."}</p>
        <form onSubmit={submit}>
          {mode === "signup" && <label>Nome<input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Seu nome" autoComplete="name" /></label>}
          <label>E-mail<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@email.com" autoComplete="email" required /></label>
          <label>Senha<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mínimo de 6 caracteres" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={6} required /></label>
          <button className="primary-button" disabled={loading}>{loading ? "Aguarde..." : mode === "login" ? "Entrar" : "Criar conta"}</button>
        </form>
        {message && <div className="status-message">{message}</div>}
        <button className="link-button" onClick={() => { setMode(mode === "login" ? "signup" : "login"); setMessage(""); }}>
          {mode === "login" ? "Ainda não tenho conta" : "Já tenho uma conta"}
        </button>
      </section>
    </main>
  );
}
