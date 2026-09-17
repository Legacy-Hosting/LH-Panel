import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  startAuthentication,
  startRegistration,
} from "@simplewebauthn/browser";
import {
  ArrowRight,
  Fingerprint,
  LoaderCircle,
  LockKeyhole,
  Mail,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { panelApi } from "../api/client.js";

const AuthContext = createContext(null);

const messages = {
  account_exists: "An account already exists for this email address.",
  account_not_found: "No active account was found for this email address.",
  bootstrap_token_required:
    "The initial administrator token is missing or incorrect.",
  invitation_required: "Registration requires an invitation.",
  invalid_invitation: "This invitation is invalid or has expired.",
  registration_closed: "Registration is currently closed.",
  invalid_or_expired_challenge:
    "The passkey request expired. Please try again.",
  passkey_verification_failed: "The passkey could not be verified.",
  unknown_passkey: "This passkey is not connected to an account.",
};

function errorMessage(error) {
  if (error?.name === "NotAllowedError")
    return "Windows Hello or the passkey prompt was cancelled.";
  return (
    messages[error?.message] ||
    error?.message ||
    "Something went wrong. Please try again."
  );
}

function rememberAvailableTeam(user) {
  const selected = window.localStorage.getItem("lh_active_team");
  if (!user.teams?.some((team) => team.id === selected) && user.teams?.[0]) {
    panelApi.selectTeam(user.teams[0].id);
  }
  return user;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthGate");
  return value;
}

export function AuthGate({ children }) {
  const [user, setUser] = useState(undefined);
  const [registration, setRegistration] = useState(null);
  const [startupError, setStartupError] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const response = await panelApi.me();
        if (active) setUser(rememberAvailableTeam(response.data));
      } catch (error) {
        if (!active) return;
        if (error.status !== 401) setStartupError(errorMessage(error));
        try {
          const response = await panelApi.registrationStatus();
          if (active) setRegistration(response.data);
        } catch (statusError) {
          if (active) setStartupError(errorMessage(statusError));
        }
        if (active) setUser(null);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, []);

  const auth = useMemo(
    () => ({
      user,
      async refresh() {
        const response = await panelApi.me();
        setUser(rememberAvailableTeam(response.data));
      },
      async logout() {
        await panelApi.logout();
        setUser(null);
      },
    }),
    [user],
  );

  if (user === undefined) return <AuthLoading />;
  if (!user)
    return (
      <AuthScreen
        registration={registration}
        startupError={startupError}
        onAuthenticated={auth.refresh}
      />
    );
  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
}

function AuthLoading() {
  return (
    <div className="auth-page">
      <div className="auth-loading">
        <LoaderCircle className="spin" size={24} />
        <span>Connecting to Legacy Hosting…</span>
      </div>
    </div>
  );
}

function AuthScreen({ registration, startupError, onAuthenticated }) {
  const invitationToken =
    new URLSearchParams(window.location.search).get("invite") || "";
  const canRegister = Boolean(
    registration?.bootstrapRequired ||
      registration?.mode === "open" ||
      invitationToken,
  );
  const [view, setView] = useState(
    registration?.bootstrapRequired ? "register" : "login",
  );
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [bootstrapToken, setBootstrapToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(startupError);

  async function login(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const begin = await panelApi.authenticationOptions(
        email ? { email } : {},
      );
      const response = await startAuthentication({
        optionsJSON: begin.data.options,
      });
      await panelApi.verifyAuthentication({
        challengeId: begin.data.challengeId,
        response,
      });
      if (invitationToken) {
        const accepted = await panelApi.acceptInvitation(invitationToken);
        panelApi.selectTeam(accepted.data.teamId);
      }
      await onAuthenticated();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function register(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const begin = await panelApi.registrationOptions({
        email,
        displayName,
        invitationToken: invitationToken || undefined,
        bootstrapToken: bootstrapToken || undefined,
      });
      const response = await startRegistration({
        optionsJSON: begin.data.options,
      });
      await panelApi.verifyRegistration({
        challengeId: begin.data.challengeId,
        response,
        deviceName: "Windows Hello / passkey",
      });
      await onAuthenticated();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <section className="auth-intro">
        <div className="auth-brand">
          <div className="mark">L</div>
          <div>
            <strong>Legacy Hosting</strong>
            <span>Control panel</span>
          </div>
        </div>
        <div className="auth-copy">
          <div className="auth-kicker">
            <ShieldCheck size={15} /> Secure infrastructure access
          </div>
          <h1>Manage every application from one place.</h1>
          <p>
            Deploy from GitHub, control Cloudflare DNS and monitor your PM2
            nodes with passwordless security.
          </p>
        </div>
        <div className="auth-foot">LH-Panel v1.0.0</div>
      </section>
      <main className="auth-main">
        <div className="auth-card">
          <div className="auth-symbol">
            <Fingerprint size={25} />
          </div>
          <h2>
            {view === "login"
              ? "Welcome back"
              : registration?.bootstrapRequired
                ? "Create the administrator"
                : "Create your account"}
          </h2>
          <p className="auth-subtitle">
            {view === "login"
              ? "Sign in securely with Windows Hello or another passkey."
              : "Your device will create a passwordless passkey for this account."}
          </p>
          {error && (
            <div className="auth-error" role="alert">
              {error}
            </div>
          )}
          {view === "login" ? (
            <form onSubmit={login}>
              <label>
                <span>
                  Email <small>Optional with a discoverable passkey</small>
                </span>
                <div className="auth-input">
                  <Mail size={16} />
                  <input
                    type="email"
                    autoComplete="username webauthn"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="you@example.com"
                  />
                </div>
              </label>
              <button className="auth-submit" disabled={busy}>
                {busy ? (
                  <LoaderCircle className="spin" size={18} />
                ) : (
                  <Fingerprint size={18} />
                )}{" "}
                Continue with passkey <ArrowRight size={17} />
              </button>
            </form>
          ) : (
            <form onSubmit={register}>
              <label>
                <span>Name</span>
                <div className="auth-input">
                  <UserRound size={16} />
                  <input
                    required
                    minLength="2"
                    autoComplete="name"
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    placeholder="Your name"
                  />
                </div>
              </label>
              <label>
                <span>Email</span>
                <div className="auth-input">
                  <Mail size={16} />
                  <input
                    required
                    type="email"
                    autoComplete="username"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="you@example.com"
                  />
                </div>
              </label>
              {registration?.bootstrapRequired && (
                <label>
                  <span>Initial administrator token</span>
                  <div className="auth-input">
                    <LockKeyhole size={16} />
                    <input
                      required
                      type="password"
                      autoComplete="off"
                      value={bootstrapToken}
                      onChange={(event) =>
                        setBootstrapToken(event.target.value)
                      }
                      placeholder="Configured in the API environment"
                    />
                  </div>
                </label>
              )}
              <button className="auth-submit" disabled={busy}>
                {busy ? (
                  <LoaderCircle className="spin" size={18} />
                ) : (
                  <Fingerprint size={18} />
                )}{" "}
                Create passkey <ArrowRight size={17} />
              </button>
            </form>
          )}
          <div className="auth-switch">
            {view === "login" ? (
              <>
                {canRegister ? (
                  <>
                    New to Legacy Hosting?{" "}
                    <button
                      onClick={() => {
                        setView("register");
                        setError("");
                      }}
                    >
                      Create account
                    </button>
                  </>
                ) : (
                  <span>
                    Registration is{" "}
                    {registration?.mode === "invite_only"
                      ? "invitation only"
                      : "closed"}
                    .
                  </span>
                )}
              </>
            ) : (
              <>
                Already have an account?{" "}
                <button
                  onClick={() => {
                    setView("login");
                    setError("");
                  }}
                >
                  Sign in
                </button>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
