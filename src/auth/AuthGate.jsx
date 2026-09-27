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
import { PANEL_VERSION } from "../version.js";

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
  sso_identity_conflict:
    "This email is already connected to a different SSO identity. Contact support before continuing.",
  sso_ticket_failed: "SSO could not complete this sign-in. Please try again.",
  sso_unavailable: "SSO is temporarily unavailable. Please try again shortly.",
  sso_not_configured: "SSO is not configured yet. Use your passkey or contact support.",
  sso_failed: "SSO could not complete this sign-in. Please try again or use your passkey.",
  invalid_sso_response: "SSO returned an invalid response. The sign-in was stopped.",
};

const SSO_ISSUER = (
  import.meta.env.VITE_SSO_ISSUER || "http://localhost:8081"
).replace(/\/$/, "");

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

function requestedSsoInteraction() {
  const value = new URLSearchParams(window.location.search).get("sso_interaction") || "";
  return /^[A-Za-z0-9_-]{16,255}$/.test(value) ? value : "";
}

function initialAuthenticationError() {
  const result = new URLSearchParams(window.location.search).get("auth") || "";
  return result === "sso_failed" ? messages.sso_failed : "";
}

function submitSsoTicket(interactionUid, data) {
  const completion = new URL(data.completionUri);
  const expectedIssuer = new URL(SSO_ISSUER);
  if (
    completion.origin !== expectedIssuer.origin ||
    completion.pathname !== `/interaction/${interactionUid}/complete` ||
    completion.search ||
    completion.hash ||
    !/^[A-Za-z0-9_-]{43}$/.test(data.ticket)
  ) {
    throw new Error("invalid_sso_response");
  }
  const form = document.createElement("form");
  form.method = "POST";
  form.action = completion.toString();
  const ticket = document.createElement("input");
  ticket.type = "hidden";
  ticket.name = "ticket";
  ticket.value = data.ticket;
  form.append(ticket);
  document.body.append(form);
  form.submit();
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthGate");
  return value;
}

export function AuthGate({ children }) {
  const interactionUid = requestedSsoInteraction();
  const [user, setUser] = useState(undefined);
  const [registration, setRegistration] = useState(null);
  const [startupError, setStartupError] = useState(initialAuthenticationError);
  const [continuationError, setContinuationError] = useState("");

  async function continueSso() {
    if (!interactionUid) return;
    setContinuationError("");
    try {
      const response = await panelApi.continueSso(interactionUid);
      submitSsoTicket(interactionUid, response.data);
    } catch (error) {
      setContinuationError(errorMessage(error));
    }
  }

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const response = await panelApi.me();
        if (active) {
          setUser(rememberAvailableTeam(response.data));
          await continueSso();
        }
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
        await continueSso();
      },
      async logout() {
        const response = await panelApi.logout();
        setUser(null);
        const logoutUrl = response?.data?.logoutUrl;
        if (typeof logoutUrl === "string" && logoutUrl) {
          const destination = new URL(logoutUrl);
          if (destination.origin !== new URL(SSO_ISSUER).origin) {
            throw new Error("invalid_sso_response");
          }
          window.location.assign(destination.toString());
        }
      },
    }),
    [user, interactionUid],
  );

  if (user === undefined) return <AuthLoading />;
  if (!user)
    return (
      <AuthScreen
        registration={registration}
        startupError={startupError}
        allowSso={!interactionUid}
        onAuthenticated={auth.refresh}
      />
    );
  if (interactionUid) {
    if (continuationError) {
      return <SsoContinuationError error={continuationError} onRetry={continueSso} />;
    }
    return <AuthLoading message="Completing secure sign-in…" />;
  }
  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
}

function AuthLoading({ message = "Connecting to Legacy Hosting…" }) {
  return (
    <div className="auth-page">
      <div className="auth-loading">
        <LoaderCircle className="spin" size={24} />
        <span>{message}</span>
      </div>
    </div>
  );
}

function SsoContinuationError({ error, onRetry }) {
  return (
    <div className="auth-page">
      <main className="auth-main">
        <div className="auth-card">
          <div className="auth-symbol"><LockKeyhole size={25} /></div>
          <h2>Could not complete sign-in</h2>
          <div className="auth-error" role="alert">{error}</div>
          <button className="auth-submit" onClick={onRetry}>
            Try again <ArrowRight size={17} />
          </button>
        </div>
      </main>
    </div>
  );
}

function AuthScreen({ registration, startupError, allowSso, onAuthenticated }) {
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
  const [ssoBusy, setSsoBusy] = useState(false);
  const [error, setError] = useState(startupError);

  async function loginWithSso() {
    setSsoBusy(true);
    setError("");
    try {
      const destination = new URL(window.location.href);
      destination.searchParams.delete("auth");
      const returnTo = `${destination.pathname}${destination.search}${destination.hash}`;
      const response = await panelApi.startSso(returnTo);
      const authorizationUrl = new URL(response.data.authorizationUrl);
      if (authorizationUrl.origin !== new URL(SSO_ISSUER).origin) {
        throw new Error("invalid_sso_response");
      }
      window.location.assign(authorizationUrl.toString());
    } catch (caught) {
      setError(errorMessage(caught));
      setSsoBusy(false);
    }
  }

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
        <div className="auth-foot">LH-Panel v{PANEL_VERSION}</div>
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
          {view === "login" && allowSso && !registration?.bootstrapRequired && (
            <>
              <button
                type="button"
                className="auth-submit"
                disabled={ssoBusy || busy}
                onClick={loginWithSso}
              >
                {ssoBusy ? (
                  <LoaderCircle className="spin" size={18} />
                ) : (
                  <ShieldCheck size={18} />
                )}{" "}
                Continue with Legacy Hosting SSO <ArrowRight size={17} />
              </button>
              <div className="auth-divider"><span>or use your existing passkey</span></div>
            </>
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
