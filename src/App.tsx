/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, Suspense, lazy } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import Layout from "./components/Layout";
import { motion, AnimatePresence } from "framer-motion";
import { SettingsProvider, useSettings } from "./context/SettingsContext";
import { NotificationProvider } from "./context/NotificationContext";
import { UploadProvider } from "./context/UploadContext";
import { GlobalBackground } from "./components/GlobalBackground";
import { SystemUpdateListener } from "./components/SystemUpdateListener";
import { TutorialOverlay } from "./components/TutorialOverlay";
import SupportWidget from "./components/SupportWidget";
import { MaintenanceScreen } from "./components/MaintenanceScreen";

// Route-level code splitting: each page only downloads when the user
// actually navigates there, instead of one giant bundle up front.
const Login = lazy(() => import("./pages/Login"));
const Register = lazy(() => import("./pages/Register"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const ServerList = lazy(() => import("./pages/ServerList"));
const CreateServer = lazy(() => import("./pages/CreateServer"));
const ServerView = lazy(() => import("./pages/ServerView"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const AdminPanel = lazy(() => import("./pages/AdminPanel"));
const ApiKeysPage = lazy(() => import("./pages/ApiKeysPage"));
const AdminServers = lazy(() => import("./pages/AdminServers"));

const PageLoader = () => (
  <div className="h-full w-full flex items-center justify-center py-24">
    <motion.div
      animate={{ scale: [1, 1.2, 1], rotate: [0, 180, 360] }}
      transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
      className="w-10 h-10 border-4 border-theme-500 border-t-transparent rounded-full"
    />
  </div>
);

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  const { maintenanceMode, maintenanceMessage, panelName, panelLogo } = useSettings();
  if (loading) return (
    <div className="h-[100dvh] w-full flex items-center justify-center bg-transparent text-foreground">
      <motion.div
        animate={{ scale: [1, 1.2, 1], rotate: [0, 180, 360] }}
        transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
        className="w-16 h-16 border-4 border-theme-500 border-t-transparent rounded-full"
      />
    </div>
  );
  if (!user) return <Navigate to="/login" />;
  if (maintenanceMode && user.role !== "admin" && user.role !== "owner") {
    return <MaintenanceScreen message={maintenanceMessage} panelName={panelName} panelLogo={panelLogo} />;
  }
  return <Layout>{children}</Layout>;
};

const AdminRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  if (loading) return (
    <div className="h-[100dvh] w-full flex items-center justify-center bg-transparent text-foreground">
      <motion.div
        animate={{ scale: [1, 1.2, 1], rotate: [0, 180, 360] }}
        transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
        className="w-16 h-16 border-4 border-theme-500 border-t-transparent rounded-full"
      />
    </div>
  );
  if (!user) return <Navigate to="/login" />;
  if (user.role !== "admin") return <Navigate to="/settings" />;
  return <Layout>{children}</Layout>;
};

const AnimatedRoutes = () => {
  const location = useLocation();
  return (
    <AnimatePresence mode="wait">
      <motion.div 
        key={location.pathname.split("/")[1]} 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        transition={{ duration: 0.3 }}
        className="h-full w-full flex flex-col"
      >
        <Routes location={location}>
          <Route path="/login" element={<Suspense fallback={<PageLoader />}><Login /></Suspense>} />
          <Route path="/register" element={<Suspense fallback={<PageLoader />}><Register /></Suspense>} />
          <Route path="/" element={<ProtectedRoute><Suspense fallback={<PageLoader />}><Dashboard /></Suspense></ProtectedRoute>} />
          <Route path="/servers" element={<ProtectedRoute><Suspense fallback={<PageLoader />}><ServerList /></Suspense></ProtectedRoute>} />
          <Route path="/servers/create" element={<ProtectedRoute><Suspense fallback={<PageLoader />}><CreateServer /></Suspense></ProtectedRoute>} />
          <Route path="/servers/:id/*" element={<ProtectedRoute><Suspense fallback={<PageLoader />}><ServerView /></Suspense></ProtectedRoute>} />
          <Route path="/settings" element={<ProtectedRoute><Suspense fallback={<PageLoader />}><SettingsPage /></Suspense></ProtectedRoute>} />
          <Route path="/admin" element={<AdminRoute><Suspense fallback={<PageLoader />}><AdminPanel /></Suspense></AdminRoute>} />
          <Route path="/api-keys" element={<ProtectedRoute><Suspense fallback={<PageLoader />}><ApiKeysPage /></Suspense></ProtectedRoute>} />
          <Route path="/admin/servers" element={<ProtectedRoute><Suspense fallback={<PageLoader />}><AdminServers /></Suspense></ProtectedRoute>} />
        </Routes>
      </motion.div>
    </AnimatePresence>
  );
};

const TutorialManager = () => {
  const { panelName, enableTutorial } = useSettings();
  const [showTutorial, setShowTutorial] = useState(false);
  const { user, loading } = useAuth();
  const location = useLocation();

  useEffect(() => {
    // If the feature is globally disabled, do not show tutorial
    if (enableTutorial === false) {
      setShowTutorial(false);
      return;
    }

    if (loading || !user || location.pathname === '/login') return;

    const isDev = process.env.NODE_ENV === 'development';
    const tutorialKey = isDev ? `tutorialShown_dev_${user.id}` : `tutorialShown_prod_${user.id}`;
    
    const tutorialShown = isDev 
      ? sessionStorage.getItem(tutorialKey) 
      : localStorage.getItem(tutorialKey);

    if (!tutorialShown) {
      setShowTutorial(true);
    }
  }, [user, loading, location.pathname, enableTutorial]);

  const handleTutorialComplete = () => {
    if (!user) return;
    const isDev = process.env.NODE_ENV === 'development';
    const tutorialKey = isDev ? `tutorialShown_dev_${user.id}` : `tutorialShown_prod_${user.id}`;
    
    if (isDev) {
      sessionStorage.setItem(tutorialKey, 'true');
    } else {
      localStorage.setItem(tutorialKey, 'true');
    }
    
    setShowTutorial(false);
  };

  if (!showTutorial) return null;

  return <TutorialOverlay onComplete={handleTutorialComplete} panelName={panelName} />;
};

export default function App() {
  return (
    <SettingsProvider>
      <NotificationProvider>
      <AuthProvider>
        <UploadProvider>
        <SystemUpdateListener />
        <GlobalBackground />
        <Router>
          <AnimatedRoutes />
          <TutorialManager />
          <SupportWidget />
        </Router>
        </UploadProvider>
      </AuthProvider>
      </NotificationProvider>
    </SettingsProvider>
  );
}
