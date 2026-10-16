import React, { useEffect, useState } from "react";
import axios from "axios";
import { RefreshCw, ShieldCheck } from "lucide-react";

type Option = { id: string; emoji: string };

export function ClickCaptcha({ onSolved }: { onSolved: (challengeId: string) => void }) {
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [target, setTarget] = useState<string>("");
  const [options, setOptions] = useState<Option[]>([]);
  const [solved, setSolved] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  const fetchChallenge = async (keepError = false) => {
    setIsLoading(true);
    if (!keepError) setError("");
    setSolved(false);
    setSelectedId(null);
    try {
      const res = await axios.post("/api/auth/captcha");
      setChallengeId(res.data.challengeId);
      setTarget(res.data.target);
      setOptions(res.data.options);
    } catch (err: any) {
      setError("Couldn't load the check. Press refresh to try again.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchChallenge();
  }, []);

  const handleClick = async (option: Option) => {
    if (solved || !challengeId) return;
    setSelectedId(option.id);
    try {
      await axios.post("/api/auth/captcha/verify", { challengeId, optionId: option.id });
      setSolved(true);
      setError("");
      onSolved(challengeId);
    } catch (err: any) {
      setError(err.response?.data?.error || "Wrong icon. Here's a new one.");
      fetchChallenge(true);
    }
  };

  return (
    <div className="xl-captcha">
      <div className="xl-captcha-head" aria-live="polite">
        {solved ? (
          <span className="xl-captcha-ok">
            <ShieldCheck size={16} /> You're verified
          </span>
        ) : (
          <span>
            Select this icon:
            <span className="xl-captcha-target" aria-label="target icon">{target}</span>
          </span>
        )}
        {!solved && (
          <button
            type="button"
            className="xl-icon-btn"
            onClick={() => fetchChallenge()}
            title="Get a new check"
            aria-label="Get a new check"
          >
            <RefreshCw size={15} />
          </button>
        )}
      </div>

      {error && <div className="xl-captcha-msg" role="alert">{error}</div>}

      {!solved && (
        <div className={`xl-captcha-grid${isLoading ? " is-loading" : ""}`}>
          {options.map((opt) => (
            <button
              key={opt.id}
              type="button"
              className={`xl-captcha-opt${selectedId === opt.id ? " is-picked" : ""}`}
              onClick={() => handleClick(opt)}
              disabled={isLoading}
            >
              {opt.emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
