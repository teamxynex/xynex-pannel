import React, { useEffect, useState } from "react";
import axios from "axios";
import { RefreshCw, Check } from "lucide-react";

type Option = { id: string; emoji: string };

export function ClickCaptcha({ onSolved }: { onSolved: (challengeId: string) => void }) {
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [target, setTarget] = useState<string>("");
  const [options, setOptions] = useState<Option[]>([]);
  const [solved, setSolved] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  const fetchChallenge = async () => {
    setIsLoading(true);
    setError("");
    setSolved(false);
    setSelectedId(null);
    try {
      const res = await axios.post("/api/auth/captcha");
      setChallengeId(res.data.challengeId);
      setTarget(res.data.target);
      setOptions(res.data.options);
    } catch (err: any) {
      setError("Couldn't load captcha. Try refreshing.");
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
      setError(err.response?.data?.error || "Not quite - try the new one.");
      fetchChallenge();
    }
  };

  return (
    <div style={{ marginTop: "0.75rem" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "0.6rem",
        }}
      >
        <span style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.75)" }}>
          {solved ? (
            <span style={{ display: "flex", alignItems: "center", gap: "0.35rem", color: "#4ade80" }}>
              <Check size={14} /> Verified
            </span>
          ) : (
            <>Click the matching icon: <span style={{ fontSize: "1.1rem" }}>{target}</span></>
          )}
        </span>
        {!solved && (
          <button
            type="button"
            onClick={fetchChallenge}
            title="Get a new captcha"
            style={{ background: "none", border: "none", color: "rgba(255,255,255,0.6)", cursor: "pointer", padding: "0.15rem" }}
          >
            <RefreshCw size={14} />
          </button>
        )}
      </div>

      {error && (
        <div style={{ fontSize: "0.75rem", color: "#fca5a5", marginBottom: "0.5rem" }}>{error}</div>
      )}

      {!solved && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: "0.5rem",
            opacity: isLoading ? 0.5 : 1,
            pointerEvents: isLoading ? "none" : "auto",
          }}
        >
          {options.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => handleClick(opt)}
              disabled={isLoading}
              style={{
                fontSize: "1.4rem",
                padding: "0.6rem 0",
                borderRadius: "0.6rem",
                border: selectedId === opt.id ? "1px solid rgba(255,255,255,0.5)" : "1px solid rgba(255,255,255,0.15)",
                background: "rgba(255,255,255,0.08)",
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.18)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.08)")}
            >
              {opt.emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
