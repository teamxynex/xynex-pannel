import React, { useState, useEffect, useRef } from "react";
import { LoadingOverlay } from "../components/LoadingOverlay";
import { ClickCaptcha } from "../components/ClickCaptcha";
import { useAuth } from "../context/AuthContext";
import { useSettings } from "../context/SettingsContext";
import { useNavigate, Link } from "react-router-dom";
import gsap from "gsap";
import axios from "axios";
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import {
  User, Lock, Eye, EyeOff, ArrowRight, ArrowLeft, Loader2, AlertCircle,
  Server, TerminalSquare, FolderOpen, DatabaseBackup, ShieldCheck, TriangleAlert,
} from "lucide-react";
import "./Login.css";

const REMEMBER_KEY = "xynex-login-username";

export default function Login() {
  const [username, setUsername] = useState(() => {
    try { return localStorage.getItem(REMEMBER_KEY) || ""; } catch { return ""; }
  });
  const [remember, setRemember] = useState(() => {
    try { return !!localStorage.getItem(REMEMBER_KEY); } catch { return false; }
  });
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [capsOn, setCapsOn] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [twoFactorStep, setTwoFactorStep] = useState(false);
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [tempToken, setTempToken] = useState("");
  const [captchaChallengeId, setCaptchaChallengeId] = useState<string | null>(null);
  const [captchaKey, setCaptchaKey] = useState(0);

  const bgRef = useRef<HTMLDivElement>(null);

  const { login } = useAuth();
  const {
    panelName, panelLogo, enableLoginAnimation, enableRegistration,
    enableGoogleLogin, firebaseApiKey, firebaseAuthDomain, firebaseProjectId,
    firebaseStorageBucket, firebaseMessagingSenderId, firebaseAppId,
  } = useSettings();
  const navigate = useNavigate();

  const reduceMotion =
    typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const animate = enableLoginAnimation !== false && !reduceMotion;

  // Slow ambient drift on the wallpaper + gentle mouse parallax.
  useEffect(() => {
    if (!animate || !bgRef.current) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(
        bgRef.current,
        { scale: 1.08 },
        { scale: 1.02, duration: 14, ease: "sine.inOut", yoyo: true, repeat: -1 }
      );
    });
    return () => ctx.revert();
  }, [animate]);

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!animate || !bgRef.current) return;
    const x = (e.clientX / window.innerWidth - 0.5) * 2;
    const y = (e.clientY / window.innerHeight - 0.5) * 2;
    gsap.to(bgRef.current, { x: -x * 14, y: -y * 10, duration: 1.2, ease: "power2.out", overwrite: "auto" });
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!captchaChallengeId) {
      setError("Complete the check below before signing in.");
      return;
    }
    setIsLoading(true);
    setError("");
    try {
      const res = await axios.post("/api/auth/login", { username, password, challengeId: captchaChallengeId });
      try {
        if (remember) localStorage.setItem(REMEMBER_KEY, username);
        else localStorage.removeItem(REMEMBER_KEY);
      } catch { /* storage unavailable */ }
      if (res.data.requires2FA) {
        setTempToken(res.data.tempToken);
        setTwoFactorStep(true);
        setIsLoading(false);
        return;
      }
      login(res.data.token, res.data.user);
      navigate("/");
    } catch (err: any) {
      setError(err.response?.data?.error || "Login failed");
    } finally {
      // The captcha challenge is single-use (consumed server-side on this
      // attempt whether it succeeded or failed), so always re-arm a fresh one.
      setCaptchaChallengeId(null);
      setCaptchaKey((k) => k + 1);
      setIsLoading(false);
    }
  };

  const handleVerify2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");
    try {
      const res = await axios.post("/api/auth/2fa/verify-login", { tempToken, code: twoFactorCode });
      login(res.data.token, res.data.user);
      navigate("/");
    } catch (err: any) {
      setError(err.response?.data?.error || "Verification failed");
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    if (!firebaseApiKey || !firebaseProjectId) {
      setError("Google sign-in isn't set up yet. Ask an administrator to add the Firebase keys.");
      return;
    }
    setIsLoading(true);
    setError("");

    try {
      const fbConfig = {
        apiKey: firebaseApiKey,
        authDomain: firebaseAuthDomain,
        projectId: firebaseProjectId,
        storageBucket: firebaseStorageBucket,
        messagingSenderId: firebaseMessagingSenderId,
        appId: firebaseAppId,
      };

      const app = getApps().length === 0 ? initializeApp(fbConfig) : getApp();
      const auth = getAuth(app);
      const provider = new GoogleAuthProvider();

      const result = await signInWithPopup(auth, provider);
      const googleUser = result.user;

      if (!googleUser.email) {
        throw new Error("No email associated with this Google account");
      }

      const res = await axios.post("/api/auth/google", {
        email: googleUser.email,
        googleId: googleUser.uid,
        name: googleUser.displayName || "",
        photoURL: googleUser.photoURL || "",
      });

      login(res.data.token, res.data.user);
      navigate("/");
    } catch (err: any) {
      console.error("Google Auth Error:", err);
      if (err.code === "auth/popup-closed-by-user") {
        setError("The Google window was closed before sign-in finished.");
      } else if (err.code === "auth/unauthorized-domain") {
        setError("This domain isn't authorized in Firebase Console → Authentication → Authorized domains.");
      } else if (err.code === "auth/too-many-requests" || err.response?.status === 429 || err.message?.includes("429")) {
        setError("Too many attempts. Wait a minute and try again.");
      } else {
        setError(err.response?.data?.error || err.message || "Google sign-in failed. Check the Firebase configuration.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const isDevPort3000 = typeof window !== "undefined" && (
    window.location.port === "3000" ||
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1"
  );

  const onPasswordKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    setCapsOn(e.getModifierState?.("CapsLock") ?? false);
  };

  return (
    <div className={`xl-root${animate ? " xl-animate" : ""}`} onMouseMove={handleMouseMove}>
      <div className="xl-bg" aria-hidden="true">
        <div ref={bgRef} style={{ width: "100%", height: "100%" }}>
          <img src="/desert/wallpaperflare.com_wallpaper.jpg" alt="" />
        </div>
      </div>
      <div className="xl-shade" aria-hidden="true" />

      <section className="xl-brand">
        <div className="xl-mark">
          {panelLogo ? (
            <img src={panelLogo} alt="" className="xl-logo" />
          ) : (
            <div className="xl-logo"><Server size={22} /></div>
          )}
          <span className="xl-mark-name">{panelName}</span>
        </div>
        <h1 className="xl-headline">Your game servers, one calm place.</h1>
        <p className="xl-lede">
          Start, stop and watch your servers, edit their files and keep backups from a single dashboard.
        </p>
        <ul className="xl-points">
          <li><TerminalSquare size={16} /> Live console</li>
          <li><FolderOpen size={16} /> File manager</li>
          <li><DatabaseBackup size={16} /> Backups</li>
        </ul>
      </section>

      <main className="xl-stage">
        <div className="xl-card">
          <div className="xl-card-head">
            <h2>{twoFactorStep ? "Two-step check" : "Sign in"}</h2>
            <p>
              {twoFactorStep
                ? "Enter the 6-digit code from your authenticator app."
                : `Use your ${panelName} account to continue.`}
            </p>
          </div>

          {twoFactorStep ? (
            <form onSubmit={handleVerify2FA} className="xl-form">
              {error && (
                <div className="xl-error" role="alert">
                  <AlertCircle size={16} /> <span>{error}</span>
                </div>
              )}

              <div className="xl-field">
                <label htmlFor="xl-2fa">Authentication code</label>
                <input
                  id="xl-2fa"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  autoComplete="one-time-code"
                  required
                  autoFocus
                  placeholder="000000"
                  className="xl-input xl-code"
                  value={twoFactorCode}
                  onChange={(e) => setTwoFactorCode(e.target.value.replace(/\D/g, ""))}
                />
              </div>

              <button type="submit" className="xl-btn" disabled={isLoading || twoFactorCode.length < 6}>
                {isLoading ? <Loader2 size={18} className="xl-spin" /> : <ShieldCheck size={18} />}
                {isLoading ? "Verifying…" : "Verify and sign in"}
              </button>

              <button
                type="button"
                className="xl-link-btn"
                onClick={() => { setTwoFactorStep(false); setTwoFactorCode(""); setTempToken(""); setError(""); }}
              >
                <ArrowLeft size={14} style={{ verticalAlign: "-2px", marginRight: 4 }} />
                Back to sign in
              </button>
            </form>
          ) : (
            <form onSubmit={handleLogin} className="xl-form">
              {error && (
                <div className="xl-error" role="alert">
                  <AlertCircle size={16} /> <span>{error}</span>
                </div>
              )}

              <div className="xl-field">
                <label htmlFor="xl-user">Username</label>
                <div className="xl-control">
                  <User size={18} className="xl-lead" />
                  <input
                    id="xl-user"
                    type="text"
                    name="username"
                    autoComplete="username"
                    autoCapitalize="none"
                    spellCheck={false}
                    required
                    placeholder="Your username"
                    className="xl-input"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                  />
                </div>
              </div>

              <div className="xl-field">
                <label htmlFor="xl-pass">Password</label>
                <div className="xl-control">
                  <Lock size={18} className="xl-lead" />
                  <input
                    id="xl-pass"
                    type={showPassword ? "text" : "password"}
                    name="password"
                    autoComplete="current-password"
                    required
                    placeholder="Your password"
                    className="xl-input has-trail"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={onPasswordKey}
                    onKeyUp={onPasswordKey}
                    onBlur={() => setCapsOn(false)}
                  />
                  <button
                    type="button"
                    className="xl-trail"
                    onClick={() => setShowPassword((s) => !s)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    aria-pressed={showPassword}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                {capsOn && (
                  <div className="xl-hint" role="status">
                    <TriangleAlert size={14} /> Caps Lock is on
                  </div>
                )}
              </div>

              <div className="xl-row">
                <label className="xl-check">
                  <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
                  Remember my username
                </label>
              </div>

              <React.Fragment key={captchaKey}>
                <ClickCaptcha onSolved={(id) => setCaptchaChallengeId(id)} />
              </React.Fragment>

              <button type="submit" className="xl-btn" disabled={isLoading || !captchaChallengeId}>
                {isLoading ? <Loader2 size={18} className="xl-spin" /> : null}
                {isLoading ? "Signing in…" : "Sign in"}
                {!isLoading && <ArrowRight size={18} />}
              </button>
            </form>
          )}

          {!twoFactorStep && enableGoogleLogin && isDevPort3000 && (
            <>
              <div className="xl-divider">or</div>
              <button type="button" className="xl-btn xl-btn-ghost" onClick={handleGoogleLogin} disabled={isLoading}>
                <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                  <path fill="#EA4335" d="M12 5c1.6 0 3 .6 4.1 1.6l3.1-3.1C17.3 1.7 14.8 1 12 1 7.5 1 3.7 3.6 1.9 7.3l3.7 2.9C6.5 7.3 9 5 12 5z" />
                  <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.6h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5 3.7-8.9z" />
                  <path fill="#FBBC05" d="M5.6 14.8c-.2-.7-.4-1.5-.4-2.3s.2-1.6.4-2.3L1.9 7.3C.7 9.7 0 12.3 0 15s.7 5.3 1.9 7.7l3.7-2.9z" />
                  <path fill="#34A853" d="M12 23c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3 0-5.5-2.3-6.4-5.2L1.9 16C3.7 19.7 7.5 22.3 12 23z" />
                </svg>
                Continue with Google
              </button>
            </>
          )}

          {!twoFactorStep && enableRegistration !== false && (
            <p className="xl-foot">
              New here? <Link to="/register">Create an account</Link>
            </p>
          )}
        </div>
      </main>

      {isLoading && <LoadingOverlay message="Signing in…" />}
    </div>
  );
}
