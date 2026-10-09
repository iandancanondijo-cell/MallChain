import { useEffect, useId, useState, type FormEvent, type ReactNode } from "react";
import Particles from "./Particles";
import Ring from "./Ring";
import { authApi } from "./authApi";
import "./auth.css";

type Mode = "login" | "register";
type Errors = Record<string, string>;
type Status = { text: string; bad: boolean } | null;

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function readMode(): Mode {
  const q = window.location.hash.split("?")[1] ?? "";
  return new URLSearchParams(q).get("mode") === "register" ? "register" : "login";
}

/* ---------- small field component ---------- */
type FieldProps = {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: "text" | "email" | "password";
  placeholder?: string;
  autoComplete?: string;
  error?: string;
};

function Field({ label, value, onChange, type = "text", placeholder, autoComplete, error }: FieldProps) {
  const id = useId();
  const [show, setShow] = useState(false);
  const isPass = type === "password";

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="box">
        <input
          id={id}
          type={isPass && show ? "text" : type}
          value={value}
          placeholder={placeholder}
          autoComplete={autoComplete}
          aria-invalid={!!error}
          onChange={(e) => onChange(e.target.value)}
        />
        {isPass && (
          <button
            type="button"
            className="eye"
            aria-label={show ? "Hide password" : "Show password"}
            onClick={() => setShow((s) => !s)}
          >
            <EyeIcon off={show} />
          </button>
        )}
      </div>
      {error && (
        <p className="err" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function EyeIcon({ off }: { off: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {off ? (
        <path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4M6.6 6.6A17 17 0 0 0 2 12s3.6 7 10 7a9.7 9.7 0 0 0 4.2-1M9.9 9.9a3 3 0 0 0 4.2 4.2" />
      ) : (
        <>
          <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
          <circle cx="12" cy="12" r="3" />
        </>
      )}
    </svg>
  );
}

function GoogleButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="google" onClick={onClick}>
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
        <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8z" />
        <path fill="#34A853" d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.9-3c-1.1.7-2.5 1.2-4 1.2-3.1 0-5.7-2.1-6.6-4.9H1.4v3.1A12 12 0 0 0 12 24z" />
        <path fill="#FBBC05" d="M5.4 14.4a7.2 7.2 0 0 1 0-4.8V6.5H1.4a12 12 0 0 0 0 11z" />
        <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.4 6.5l4 3.1C6.3 6.9 8.9 4.8 12 4.8z" />
      </svg>
      Continue with Google
    </button>
  );
}

/* ---------- page ---------- */
export default function AuthPage() {
  const [mode, setModeState] = useState<Mode>(readMode);
  const [status, setStatus] = useState<Status>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);

  // sign in
  const [inEmail, setInEmail] = useState("");
  const [inPass, setInPass] = useState("");
  const [remember, setRemember] = useState(true);

  // sign up
  const [upEmail, setUpEmail] = useState("");
  const [upPass, setUpPass] = useState("");
  const [upPass2, setUpPass2] = useState("");
  const [referral, setReferral] = useState("");
  const [age, setAge] = useState(false);
  const [terms, setTerms] = useState(false);

  useEffect(() => {
    const onHash = () => {
      setModeState(readMode());
      setErrors({});
      setStatus(null);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const go = (m: Mode) => {
    window.location.hash = `/auth?mode=${m}`;
  };

  const fail = (text: string) => setStatus({ text, bad: true });
  const done = (text: string) => setStatus({ text, bad: false });

  async function onSignIn(e: FormEvent) {
    e.preventDefault();
    setStatus(null);

    const next: Errors = {};
    if (!emailRe.test(inEmail.trim())) next.email = "Enter a valid email address.";
    if (!inPass) next.password = "Enter your password.";
    setErrors(next);
    if (Object.keys(next).length) return;

    setBusy(true);
    try {
      const r = await authApi.signIn({ email: inEmail.trim(), password: inPass, remember });
      r.ok ? done("Signed in. Welcome back.") : fail(r.message ?? "Email or password is incorrect. Check them and try again.");
    } catch {
      fail("We could not reach the network. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function onSignUp(e: FormEvent) {
    e.preventDefault();
    setStatus(null);

    const next: Errors = {};
    if (!emailRe.test(upEmail.trim())) next.email = "Enter a valid email address.";
    if (upPass.length < 8) next.password = "Use at least 8 characters.";
    if (!upPass2 || upPass !== upPass2) next.confirm = "The passwords do not match.";
    if (!age || !terms) next.checks = "Confirm your age and accept the Terms and Privacy Policy to continue.";
    setErrors(next);
    if (Object.keys(next).length) return;

    setBusy(true);
    try {
      const r = await authApi.signUp({ email: upEmail.trim(), password: upPass, referral: referral.trim() });
      r.ok
        ? done("Account created. Check your email to verify it, then continue to identity verification.")
        : fail(r.message ?? "We could not create the account. Try again.");
    } catch {
      fail("We could not reach the network. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const isLogin = mode === "login";

  return (
    <div className="auth-root">
      <div className="blob a" />
      <div className="blob b" />
      <Particles />
      <Ring />
      <div className="vignette" />

      <a className="logo" href="#/">
        <i />
        Mallchain
      </a>

      <div className="tag">
        <p>An open network you can use, create on, and learn from.</p>
        <div className="pills">
          <span>
            <b style={{ background: "#FFC83D" }} />
            Buy it
          </span>
          <span>
            <b style={{ background: "#FF4A3D" }} />
            Sell it
          </span>
          <span>
            <b style={{ background: "#7d95ff" }} />
            Build it
          </span>
          <span>
            <b style={{ background: "#5CF2C0" }} />
            Study it
          </span>
        </div>
      </div>

      <main className="card">
        <div className="switch" role="tablist" aria-label="Account">
          <button type="button" role="tab" aria-selected={isLogin} onClick={() => go("login")}>
            Sign in
          </button>
          <button type="button" role="tab" aria-selected={!isLogin} onClick={() => go("register")}>
            Create account
          </button>
        </div>

        {isLogin ? (
          <form onSubmit={onSignIn} noValidate>
            <Heading a="Welcome" b="back." sub="Sign in to your commerce hub." />

            <Field
              label="Email address"
              type="email"
              value={inEmail}
              onChange={setInEmail}
              placeholder="you@example.com"
              autoComplete="email"
              error={errors.email}
            />

            <Field
              label="Password"
              type="password"
              value={inPass}
              onChange={setInPass}
              placeholder="Your password"
              autoComplete="current-password"
              error={errors.password}
            />

            <div className="row">
              <label className="chk">
                <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
                Remember me on this device
              </label>
              <a
                href="#/auth?mode=login"
                onClick={(e) => {
                  e.preventDefault();
                  authApi.forgot();
                }}
              >
                Forgot password?
              </a>
            </div>

            <button className="go" type="submit" disabled={busy}>
              {busy ? "Please wait" : "Sign in"}
            </button>

            <GoogleButton onClick={() => authApi.google()} />

            <p className="alt">
              New to Mallchain? <a href="#/auth?mode=register">Create an account</a>
            </p>
          </form>
        ) : (
          <form className="up" onSubmit={onSignUp} noValidate>
            <Heading a="Create your" b="account." sub="Start your journey on the decentralized web." />

            <div className="steps" aria-hidden="true">
              {Array.from({ length: 7 }, (_, i) => (
                <i key={i} />
              ))}
            </div>

            <p className="hint">
              Step 1 of 7. Verifying your identity takes about five minutes. You will need a valid government ID and a camera or photo of yourself.
            </p>

            <Field
              label="Email address"
              type="email"
              value={upEmail}
              onChange={setUpEmail}
              placeholder="you@example.com"
              autoComplete="email"
              error={errors.email}
            />

            <Field
              label="Password"
              type="password"
              value={upPass}
              onChange={setUpPass}
              placeholder="Min 8 characters"
              autoComplete="new-password"
              error={errors.password}
            />

            <Field
              label="Confirm password"
              type="password"
              value={upPass2}
              onChange={setUpPass2}
              placeholder="Repeat your password"
              autoComplete="new-password"
              error={errors.confirm}
            />

            <Field
              label="Referral code (optional)"
              value={referral}
              onChange={setReferral}
              placeholder="MALL-XXXXXXXX"
              autoComplete="off"
            />

            <div className="field">
              <label className="chk chkcard">
                <input type="checkbox" checked={age} onChange={(e) => setAge(e.target.checked)} />I confirm I am at least 18 years old
              </label>
              <label className="chk chkcard">
                <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} />I agree to the Terms of Service and Privacy Policy
              </label>
              {errors.checks && (
                <p className="err" role="alert">
                  {errors.checks}
                </p>
              )}
            </div>

            <button className="go" type="submit" disabled={busy}>
              {busy ? "Please wait" : "Continue"}
            </button>

            <GoogleButton onClick={() => authApi.google()} />

            <p className="alt">
              Already have an account? <a href="#/auth?mode=login">Sign in</a>
            </p>
          </form>
        )}

        {status && (
          <p className={`status${status.bad ? " bad" : ""}`} role="status">
            {status.text}
          </p>
        )}
      </main>
    </div>
  );
}

function Heading({ a, b, sub }: { a: string; b: ReactNode; sub: string }) {
  return (
    <div>
      <h1>
        {a} <em>{b}</em>
      </h1>
      <p className="sub">{sub}</p>
    </div>
  );
}
