/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useCallback, useContext, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, AlertTriangle, Info, XCircle, X } from "lucide-react";

export type NotifyType = "success" | "error" | "info" | "warning";

export interface NotifyItem {
  id: number;
  type: NotifyType;
  message: string;
}

interface NotificationContextValue {
  /** Replacement for window.alert(). Auto-detects type from the message unless one is passed explicitly. */
  notify: (message: string, type?: NotifyType) => void;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

// Same heuristic browsers effectively gave us for free with alert() — but instead of a
// blocking native dialog per call, every message lands in one shared stack.
function inferType(message: string): NotifyType {
  const m = message.toLowerCase();
  if (/(success|successfully|updated|created|saved|applied|banned|terminated|cleared|installed)/.test(m) &&
      !/(fail|error|unable|denied|invalid)/.test(m)) {
    return "success";
  }
  if (/(fail|error|unable|denied|invalid|must be at least)/.test(m)) {
    return "error";
  }
  return "info";
}

const ICONS: Record<NotifyType, React.ReactNode> = {
  success: <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />,
  error: <XCircle className="w-5 h-5 text-red-400 shrink-0" />,
  warning: <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />,
  info: <Info className="w-5 h-5 text-theme-400 shrink-0" />,
};

const ACCENTS: Record<NotifyType, string> = {
  success: "border-emerald-500/30 bg-emerald-500/10",
  error: "border-red-500/30 bg-red-500/10",
  warning: "border-amber-500/30 bg-amber-500/10",
  info: "border-theme-500/30 bg-theme-500/10",
};

const AUTO_DISMISS_MS: Record<NotifyType, number | null> = {
  success: 4500,
  info: 4500,
  warning: 6000,
  error: null, // errors stay until the user dismisses them, like alert() used to force
};

export const NotificationProvider = ({ children }: { children: React.ReactNode }) => {
  const [items, setItems] = useState<NotifyItem[]>([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const notify = useCallback((message: string, type?: NotifyType) => {
    const resolvedType = type ?? inferType(message);
    const id = ++idRef.current;
    setItems((prev) => [...prev, { id, type: resolvedType, message }]);

    const ms = AUTO_DISMISS_MS[resolvedType];
    if (ms) {
      setTimeout(() => dismiss(id), ms);
    }
  }, [dismiss]);

  const clearAll = useCallback(() => setItems([]), []);

  return (
    <NotificationContext.Provider value={{ notify }}>
      {children}

      {/* Single shared stack — every former alert() call now lands here instead of opening its own popup */}
      <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 w-[min(380px,calc(100vw-2rem))] pointer-events-none">
        <AnimatePresence>
          {items.length > 1 && (
            <motion.button
              key="clear-all"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              onClick={clearAll}
              className="self-end text-xs text-muted-foreground hover:text-foreground pointer-events-auto px-2 py-1 rounded-md hover:bg-muted transition-colors"
            >
              Clear all ({items.length})
            </motion.button>
          )}
          {items.map((item) => (
            <motion.div
              key={item.id}
              layout
              initial={{ opacity: 0, y: -12, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 40, scale: 0.97 }}
              transition={{ duration: 0.18 }}
              className={`pointer-events-auto flex items-start gap-2.5 rounded-xl border backdrop-blur-xl shadow-2xl px-4 py-3 bg-card/95 ${ACCENTS[item.type]}`}
            >
              {ICONS[item.type]}
              <p className="text-sm text-foreground-muted leading-snug flex-1 break-words">{item.message}</p>
              <button
                onClick={() => dismiss(item.id)}
                className="text-muted-foreground hover:text-foreground shrink-0 -m-1 p-1 rounded-md hover:bg-muted transition-colors"
                aria-label="Dismiss"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </NotificationContext.Provider>
  );
};

export const useNotification = () => {
  const ctx = useContext(NotificationContext);
  if (!ctx) {
    throw new Error("useNotification must be used within a NotificationProvider");
  }
  return ctx;
};
