import { FormEvent, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";

type Mode = "login" | "signup";
type View = "home" | "activities" | "surveys" | "wallet" | "referrals" | "profile";
type Profile = { display_name: string | null; username: string | null; avatar_url?: string | null; referral_code: string | null };
type Referral = { id: number; referred_user_id: string; status: string; reward_points: number; created_at: string };
type Wallet = { balance_points: number; pending_points: number; total_earned: number; total_withdrawn: number };
type WalletTransaction = { id: number; type: string; amount: number; balance_after: number; source: string | null; description: string | null; created_at: string };
type Activity = {
  id: number;
  title: string;
  description: string | null;
  reward_points: number;
  kind: "SURVEY" | "OFFER";
  estimated_minutes?: number | null;
  category?: string | null;
};
type CpxSurvey = {
  external_id: string;
  title: string;
  reward: number;
  estimated_minutes: number | null;
  url: string | null;
  payout_publisher_usd?: number | null;
  conversion_rate?: string | number | null;
  payout_type?: string | null;
  survey_type?: string | null;
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
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [referralCodeInput, setReferralCodeInput] = useState("");
  const [loadingReferrals, setLoadingReferrals] = useState(false);
  const [applyingReferral, setApplyingReferral] = useState(false);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [surveys, setSurveys] = useState<CpxSurvey[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingHome, setLoadingHome] = useState(false);
  const [loadingWallet, setLoadingWallet] = useState(false);
  const [loadingActivities, setLoadingActivities] = useState(false);
  const [loadingSurveys, setLoadingSurveys] = useState(false);
  const [startingActivity, setStartingActivity] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [emailConfirmationSent, setEmailConfirmationSent] = useState(false);

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
      setDisplayName("");
      setWallet(null);
      setActivities([]);
      setSurveys([]);
      setView("home");
    }
  }, [session]);

  async function loadHome(userId: string) {
    setLoadingHome(true);
    setMessage("");
    try {
      const [{ data: profileData, error: profileError }, { data: walletData, error: walletError }] = await Promise.all([
        supabase.from("profiles").select("display_name,username,avatar_url,referral_code").eq("id", userId).single(),
        supabase.from("wallets").select("balance_points,pending_points,total_earned,total_withdrawn").eq("user_id", userId).single()
      ]);
      if (profileError) throw profileError;
      if (walletError) throw walletError;
      setProfile(profileData);
      setDisplayName(profileData.display_name || "");
      setWallet(walletData);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível carregar sua conta.");
    } finally {
      setLoadingHome(false);
    }
  }

  async function loadProfile() {
    if (!session) return;
    setMessage("");
    try {
      const { data, error } = await supabase.from("profiles").select("display_name,username,avatar_url,referral_code").eq("id", session.user.id).single();
      if (error) throw error;
      setProfile(data);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível carregar seu perfil.");
    }
  }

  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    if (!session) return;
    setLoading(true);
    setMessage("");
    try {
      const cleanName = displayName.trim();
      const cleanUsername = profile?.username?.trim() || "";
      const { data, error } = await supabase.from("profiles").update({
        display_name: cleanName || null,
        username: cleanUsername || null
      }).eq("id", session.user.id).select("display_name,username,avatar_url,referral_code").single();
      if (error) throw error;
      setProfile(data);
      setDisplayName(data.display_name || "");
      setMessage("Perfil atualizado com sucesso.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível salvar seu perfil.");
    } finally {
      setLoading(false);
    }
  }

  async function openProfile() {
    if (!profile) await loadProfile();
    setDisplayName(profile?.display_name || "");
    setView("profile");
  }

  async function loadReferrals() {
    if (!session) return;
    setLoadingReferrals(true);
    setMessage("");
    try {
      const { data, error } = await supabase.from("referrals").select("id,referred_user_id,status,reward_points,created_at").eq("referrer_user_id", session.user.id).order("created_at", { ascending: false });
      if (error) throw error;
      setReferrals(data ?? []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível carregar suas indicações.");
    } finally {
      setLoadingReferrals(false);
    }
  }

  async function openReferrals() {
    setView("referrals");
    await loadReferrals();
  }

  async function copyReferralLink() {
    if (!profile?.referral_code) return;
    try {
      await navigator.clipboard.writeText(window.location.origin + "/?ref=" + profile.referral_code);
      setMessage("Link de indicação copiado.");
    } catch {
      setMessage("Não foi possível copiar automaticamente. Compartilhe seu código: " + profile.referral_code);
    }
  }

  async function applyReferral() {
    const code = referralCodeInput.trim();
    if (!code) {
      setMessage("Digite um código de indicação.");
      return;
    }
    setApplyingReferral(true);
    setMessage("");
    try {
      const { error } = await supabase.rpc("apply_referral_code", { p_referral_code: code });
      if (error) throw error;
      setReferralCodeInput("");
      setMessage("Indicação registrada. A recompensa será liberada após a qualificação.");
    } catch (error) {
      const raw = error instanceof Error ? error.message : "";
      if (raw.includes("REFERRAL_CODE_INVALID")) setMessage("Código de indicação inválido.");
      else if (raw.includes("REFERRAL_SELF_NOT_ALLOWED")) setMessage("Você não pode usar seu próprio código.");
      else if (raw.includes("REFERRAL_ALREADY_USED")) setMessage("Você já utilizou um código de indicação.");
      else if (raw.includes("ECONOMY_NOT_CONFIGURED")) setMessage("O programa de recompensas ainda está sendo configurado.");
      else setMessage("Não foi possível registrar a indicação.");
    } finally {
      setApplyingReferral(false);
    }
  }

  async function loadWallet() {
    if (!session) return;
    setLoadingWallet(true);
    setMessage("");
    try {
      const [{ data: walletData, error: walletError }, { data: transactionData, error: transactionError }] = await Promise.all([
        supabase.from("wallets").select("balance_points,pending_points,total_earned,total_withdrawn").eq("user_id", session.user.id).single(),
        supabase.from("point_transactions").select("id,type,amount,balance_after,source,description,created_at").eq("user_id", session.user.id).order("created_at", { ascending: false }).limit(30)
      ]);
      if (walletError) throw walletError;
      if (transactionError) throw transactionError;
      setWallet(walletData);
      setTransactions(transactionData ?? []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível carregar sua carteira.");
    } finally {
      setLoadingWallet(false);
    }
  }

  async function openWallet() {
    setView("wallet");
    await loadWallet();
  }

  async function loadActivities() {
    setLoadingActivities(true);
    setMessage("");
    try {
      const [{ data: surveysData, error: surveysError }, { data: offers, error: offersError }] = await Promise.all([
        supabase.from("surveys").select("id,title,description,reward_points,estimated_minutes").order("reward_points", { ascending: false }),
        supabase.from("offers").select("id,title,description,reward_points,category").order("reward_points", { ascending: false })
      ]);
      if (surveysError) throw surveysError;
      if (offersError) throw offersError;
      setActivities([
        ...(surveysData ?? []).map((item) => ({ ...item, kind: "SURVEY" as const })),
        ...(offers ?? []).map((item) => ({ ...item, kind: "OFFER" as const }))
      ]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível carregar as atividades.");
    } finally {
      setLoadingActivities(false);
    }
  }

  async function loadCpxSurveys() {
    setLoadingSurveys(true);
    setMessage("");
    try {
      const { data, error } = await supabase.functions.invoke("cpx-surveys", { body: {} });
      if (error) throw error;
      const list = Array.isArray(data?.surveys) ? data.surveys : [];
      setSurveys(list);
      if (list.length === 0) setMessage("Nenhuma pesquisa CPX disponível para seu perfil agora.");
    } catch (error) {
      setSurveys([]);
      setMessage(error instanceof Error ? error.message : "Não foi possível carregar as pesquisas.");
    } finally {
      setLoadingSurveys(false);
    }
  }

  async function openSurveys() {
    setView("surveys");
    await loadCpxSurveys();
  }

  async function startActivity(activity: Activity) {
    const key = `${activity.kind}-${activity.id}`;
    setStartingActivity(key);
    setMessage("");

    try {
      const { data, error } = await supabase.rpc("start_user_activity", {
        p_activity_type: activity.kind,
        p_activity_id: activity.id
      });
      if (error) throw error;
      const started = Array.isArray(data) ? data[0] : data;
      if (!started?.activity_id) throw new Error("Não foi possível iniciar a atividade.");
      setMessage(`Atividade iniciada com sucesso. ID: ${started.activity_id}.`);
    } catch (error) {
      const raw = error instanceof Error ? error.message : "";
      if (raw.includes("ACTIVITY_NOT_AVAILABLE")) {
        setMessage("Essa atividade não está mais disponível.");
        void loadActivities();
      } else if (raw.includes("PROVIDER_NOT_AVAILABLE")) {
        setMessage("O provedor dessa atividade está temporariamente indisponível.");
        void loadActivities();
      } else if (raw.includes("AUTH_REQUIRED")) {
        setMessage("Sua sessão expirou. Entre novamente.");
      } else {
        setMessage("Não foi possível iniciar a atividade. Tente novamente.");
      }
    } finally {
      setStartingActivity(null);
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
        const redirectTo = window.location.origin;
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: redirectTo,
            data: { display_name: displayName.trim() || null }
          }
        });
        if (error) throw error;
        setEmailConfirmationSent(!data.session);
        setMessage(
          data.session
            ? "Cadastro concluído. Sua conta já está pronta."
            : "Cadastro criado. Enviamos um e-mail para confirmar sua conta."
        );
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
                <button className="activity-card" onClick={() => void openSurveys()}>
                  <span>🔎</span><strong>Pesquisas</strong><small>Ver pesquisas CPX</small>
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
        ) : view === "wallet" ? (
          <section className="section-card activities-page">
            <div className="page-heading">
              <div><span className="eyebrow">MINHA CARTEIRA</span><h1>Carteira</h1></div>
              <button className="secondary-button" onClick={() => void loadWallet()} disabled={loadingWallet}>{loadingWallet ? "Atualizando..." : "Atualizar"}</button>
            </div>
            <section className="balance-card">
              <span>Saldo disponível</span><strong>{wallet?.balance_points ?? 0}</strong><small>pontos</small>
            </section>
            <section className="stats-grid">
              <article><span>Pontos pendentes</span><strong>{wallet?.pending_points ?? 0}</strong></article>
              <article><span>Total ganho</span><strong>{wallet?.total_earned ?? 0}</strong></article>
              <article><span>Total retirado</span><strong>{wallet?.total_withdrawn ?? 0}</strong></article>
            </section>
            <div className="withdrawal-placeholder">
              <div><span>💸</span><strong>Saque via Pix</strong><p>O saque será liberado quando a regra econômica e o processamento de pagamentos estiverem configurados.</p></div>
              <button className="secondary-button" disabled>Indisponível</button>
            </div>
            <div className="history-header"><div><span className="eyebrow">HISTÓRICO</span><h2>Movimentações</h2></div><span>{transactions.length}</span></div>
            {transactions.length === 0 ? (
              <div className="empty-state"><span>📋</span><strong>Nenhuma movimentação ainda</strong><p>Seus ganhos aparecerão aqui.</p></div>
            ) : (
              <div className="transaction-list">
                {transactions.map((transaction) => {
                  const positive = transaction.amount > 0;
                  const date = new Date(transaction.created_at).toLocaleString("pt-BR");
                  return <article className="transaction-row" key={transaction.id}>
                    <div className="transaction-icon">{positive ? "⬆️" : "⬇️"}</div>
                    <div className="transaction-info"><strong>{transaction.description || transaction.source || transaction.type}</strong><small>{date}</small></div>
                    <div className={positive ? "transaction-positive" : "transaction-negative"}>{positive ? "+" : ""}{transaction.amount}<small> pts</small></div>
                  </article>;
                })}
              </div>
            )}
            <button className="link-button" onClick={() => setView("home")}>← Voltar</button>
          </section>
        ) : view === "referrals" ? (
          <section className="section-card activities-page">
            <div className="page-heading"><div><span className="eyebrow">PROGRAMA DE INDICAÇÃO</span><h1>Indique amigos</h1></div><button className="secondary-button" onClick={() => void loadReferrals()} disabled={loadingReferrals}>{loadingReferrals ? "Atualizando..." : "Atualizar"}</button></div>
            <div className="balance-card"><span>Seu código</span><strong>{profile?.referral_code || "—"}</strong><small>Compartilhe com seus amigos</small><button className="secondary-button" onClick={() => void copyReferralLink()} disabled={!profile?.referral_code}>Copiar link de indicação</button></div>
            <section className="stats-grid"><article><span>Total indicados</span><strong>{referrals.length}</strong></article><article><span>Qualificados</span><strong>{referrals.filter((r) => r.status === "QUALIFIED" || r.status === "REWARDED").length}</strong></article><article><span>Pontos liberados</span><strong>{referrals.filter((r) => r.status === "REWARDED").reduce((sum, r) => sum + r.reward_points, 0)}</strong></article></section>
            <div className="withdrawal-placeholder"><div><span>🎁</span><strong>Tem um código de amigo?</strong><p>Digite o código recebido para registrar sua indicação.</p></div><div className="referral-form"><input value={referralCodeInput} onChange={(e) => setReferralCodeInput(e.target.value.toUpperCase())} placeholder="EXEMPLO12" maxLength={20}/><button className="primary-button" onClick={() => void applyReferral()} disabled={applyingReferral}>{applyingReferral ? "Registrando..." : "Usar código"}</button></div></div>
            <div className="history-header"><div><span className="eyebrow">HISTÓRICO</span><h2>Minhas indicações</h2></div><span>{referrals.length}</span></div>
            {referrals.length === 0 ? <div className="empty-state"><span>👥</span><strong>Nenhuma indicação ainda</strong><p>Compartilhe seu código para começar.</p></div> : <div className="transaction-list">{referrals.map((r) => <article className="transaction-row" key={r.id}><div className="transaction-icon">👤</div><div className="transaction-info"><strong>{r.status === "REWARDED" ? "Recompensa liberada" : r.status === "QUALIFIED" ? "Qualificado" : "Aguardando qualificação"}</strong><small>{new Date(r.created_at).toLocaleString("pt-BR")}</small></div><div className="transaction-positive">+{r.reward_points}<small> pts</small></div></article>)}</div>}
            <button className="link-button" onClick={() => setView("home")}>← Voltar</button>
          </section>
        ) : view === "profile" ? (
          <section className="section-card activities-page">
            <div className="page-heading">
              <div><span className="eyebrow">MINHA CONTA</span><h1>Perfil</h1></div>
            </div>
            <form onSubmit={saveProfile} className="profile-form">
              <label>
                Nome
                <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Seu nome" autoComplete="name" />
              </label>
              <label>
                Usuário
                <input
                  value={profile?.username || ""}
                  onChange={(e) => setProfile((current) => current ? { ...current, username: e.target.value } : current)}
                  placeholder="Seu usuário"
                  autoComplete="username"
                />
              </label>
              <label>
                E-mail
                <input value={session.user.email || ""} readOnly />
              </label>
              <div className="profile-readonly">
                <span>Código de indicação</span>
                <strong>{profile?.referral_code || "—"}</strong>
              </div>
              <div className="profile-readonly">
                <span>Status da conta</span>
                <strong>Ativa</strong>
              </div>
              <button className="primary-button" disabled={loading}>{loading ? "Salvando..." : "Salvar alterações"}</button>
            </form>
            <button className="link-button" onClick={() => setView("home")}>← Voltar</button>
          </section>
        ) : view === "surveys" ? (
          <section className="section-card activities-page">
            <div className="page-heading">
              <div>
                <span className="eyebrow">PESQUISAS REMUNERADAS</span>
                <h1>Pesquisas disponíveis</h1>
              </div>
              <button className="secondary-button" onClick={() => void loadCpxSurveys()} disabled={loadingSurveys}>
                {loadingSurveys ? "Buscando..." : "Atualizar"}
              </button>
            </div>

            {loadingSurveys && (
              <div className="empty-state">
                <span>🔎</span>
                <strong>Buscando pesquisas para seu perfil...</strong>
                <p>Estamos consultando o provedor.</p>
              </div>
            )}

            {!loadingSurveys && surveys.length === 0 && (
              <div className="empty-state">
                <span>📝</span>
                <strong>Nenhuma pesquisa disponível agora</strong>
                <p>Tente atualizar novamente mais tarde.</p>
              </div>
            )}

            <div className="activity-list">
              {surveys.map((survey) => (
                <article className="activity-row" key={survey.external_id}>
                  <div className="activity-icon">🔎</div>
                  <div className="activity-info">
                    <span className="activity-type">CPX Research</span>
                    <h3>{survey.title}</h3>
                    <small>
                      Recompensa CPX: {survey.reward}
                      {survey.estimated_minutes ? ` • ~${survey.estimated_minutes} min` : ""}
                    </small>
                  </div>
                  <button
                    className="primary-button activity-start"
                    disabled={!survey.url}
                    onClick={() => survey.url && window.open(survey.url, "_blank", "noopener,noreferrer")}
                  >
                    Responder
                  </button>
                </article>
              ))}
            </div>

            <button className="link-button" onClick={() => setView("home")}>← Voltar</button>
          </section>
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
              {activities.map((activity) => {
                const key = `${activity.kind}-${activity.id}`;
                return (
                  <article className="activity-row" key={key}>
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
                    <button
                      className="primary-button activity-start"
                      onClick={() => void startActivity(activity)}
                      disabled={startingActivity !== null}
                    >
                      {startingActivity === key ? "Iniciando..." : "Começar"}
                    </button>
                  </article>
                );
              })}
            </div>
          </section>
        )}

        {message && <div className="status-message">{message}</div>}

        <nav className="bottom-nav">
          <button className={view === "home" ? "active" : ""} onClick={() => setView("home")}>🏠<span>Início</span></button>
          <button className={view === "activities" || view === "surveys" ? "active" : ""} onClick={() => setView("activities")}>🎯<span>Atividades</span></button>
          <button className={view === "wallet" ? "active" : ""} onClick={() => void openWallet()}>💰<span>Carteira</span></button>
          <button className={view === "referrals" ? "active" : ""} onClick={() => void openReferrals()}>👥<span>Indicações</span></button>
          <button className={view === "profile" ? "active" : ""} onClick={() => void openProfile()}>👤<span>Perfil</span></button>
        </nav>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <section className="auth-card">
        <span className="eyebrow">PITBULL PRÊMIO</span>
        <h1>{emailConfirmationSent ? "Confirme seu e-mail" : mode === "login" ? "Entrar" : "Criar conta"}</h1>
        <p className="muted">
          {emailConfirmationSent
            ? "Enviamos um link de confirmação para o seu e-mail. Confirme para ativar sua conta e continuar no Pitbull Prêmio."
            : mode === "login"
              ? "Entre para acessar sua carteira e suas atividades."
              : "Crie sua conta para começar a usar o aplicativo."}
        </p>

        {emailConfirmationSent ? (
          <div className="empty-state">
            <span>✉️</span>
            <strong>Quase tudo pronto!</strong>
            <p>Abra seu e-mail e procure a mensagem do Pitbull Prêmio. Clique em <strong>Confirmar meu e-mail</strong>. Depois, volte para o site e entre normalmente.</p>
            <button
              className="secondary-button"
              type="button"
              onClick={() => {
                setEmailConfirmationSent(false);
                setMessage("");
                setMode("login");
              }}
            >
              Voltar para o login
            </button>
          </div>
        ) : (
        <form onSubmit={submit}>
          {mode === "signup" && (
            <label>
              Nome
              <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Seu nome" autoComplete="name" />
            </label>
          )}
          <label>
            E-mail
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@email.com" autoComplete="email" required />
          </label>
          <label>
            Senha
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mínimo de 6 caracteres" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={6} required />
          </label>
          <button className="primary-button" disabled={loading}>
            {loading ? "Aguarde..." : mode === "login" ? "Entrar" : "Criar conta"}
          </button>
        </form>
        )}

        {message && <div className="status-message">{message}</div>}
        {!emailConfirmationSent && (
          <button className="link-button" onClick={() => { setMode(mode === "login" ? "signup" : "login"); setMessage(""); }}>
            {mode === "login" ? "Ainda não tenho conta" : "Já tenho uma conta"}
          </button>
        )}
      </section>
    </main>
  );
}
