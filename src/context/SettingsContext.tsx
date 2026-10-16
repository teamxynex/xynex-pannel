import React, { createContext, useContext, useState, useEffect } from "react";
import axios from "axios";
import { io } from "socket.io-client";
import { buildFullThemeCss, type ResolvedFullTheme } from "../utils/themeColor";

const CUSTOM_THEME_STYLE_ID = "xynex-custom-theme-vars";
const CUSTOM_THEME_FONT_LINK_ID = "xynex-custom-theme-font";

function applyCustomThemeCss(theme: ResolvedFullTheme | null) {
  let styleEl = document.getElementById(CUSTOM_THEME_STYLE_ID) as HTMLStyleElement | null;
  if (!theme) {
    styleEl?.remove();
    document.getElementById(CUSTOM_THEME_FONT_LINK_ID)?.remove();
    return;
  }
  if (!styleEl) {
    styleEl = document.createElement("style");
    styleEl.id = CUSTOM_THEME_STYLE_ID;
    document.head.appendChild(styleEl);
  }
  styleEl.textContent = buildFullThemeCss(theme);

  // Optional Google Font stylesheet for a fully custom look
  const existingFontLink = document.getElementById(CUSTOM_THEME_FONT_LINK_ID) as HTMLLinkElement | null;
  const fontUrl = theme.font?.googleFontUrl;
  if (fontUrl && fontUrl.startsWith("https://")) {
    if (!existingFontLink || existingFontLink.href !== fontUrl) {
      existingFontLink?.remove();
      const link = document.createElement("link");
      link.id = CUSTOM_THEME_FONT_LINK_ID;
      link.rel = "stylesheet";
      link.href = fontUrl;
      document.head.appendChild(link);
    }
  } else {
    existingFontLink?.remove();
  }
}

export const SettingsContext = createContext<any>(null);

export const SettingsProvider = ({ children }: { children: React.ReactNode }) => {
  const [panelName, setPanelName] = useState<string>("XyneX Panel");
  const [panelLogo, setPanelLogo] = useState<string>("");
  const [panelBackgroundImage, setPanelBackgroundImage] = useState<string>("");
  const [panelBackgroundBlur, setPanelBackgroundBlur] = useState<number>(10);
  const [enablePlayit, setEnablePlayit] = useState<boolean>(false);
  const [nodeIp, setNodeIp] = useState<string>("");
  const [enableTutorial, setEnableTutorial] = useState<boolean>(true);
  const [enableLoginAnimation, setEnableLoginAnimation] = useState<boolean>(true);
  const [enableRegistration, setEnableRegistration] = useState<boolean>(true);
  const [theme, setTheme] = useState<string>("indigo");
  const [customTheme, setCustomTheme] = useState<ResolvedFullTheme | null>(null);
  const [navLayout, setNavLayout] = useState<string>("sidebar");
  const [announcementEnabled, setAnnouncementEnabled] = useState<boolean>(false);
  const [announcementText, setAnnouncementText] = useState<string>("");
  const [announcementColor, setAnnouncementColor] = useState<string>("theme");
  const [enableDiscordConnect, setEnableDiscordConnect] = useState<boolean>(false);
  const [enableGoogleLogin, setEnableGoogleLogin] = useState<boolean>(false);
  const [firebaseApiKey, setFirebaseApiKey] = useState<string>("");
  const [firebaseAuthDomain, setFirebaseAuthDomain] = useState<string>("");
  const [firebaseProjectId, setFirebaseProjectId] = useState<string>("");
  const [firebaseStorageBucket, setFirebaseStorageBucket] = useState<string>("");
  const [firebaseMessagingSenderId, setFirebaseMessagingSenderId] = useState<string>("");
  const [firebaseAppId, setFirebaseAppId] = useState<string>("");
  const [aiSupportEnabled, setAiSupportEnabled] = useState<boolean>(false);
  const [aiSupportName, setAiSupportName] = useState<string>("Support");
  const [aiSupportLogo, setAiSupportLogo] = useState<string>("");
  const [maintenanceMode, setMaintenanceMode] = useState<boolean>(false);
  const [maintenanceMessage, setMaintenanceMessage] = useState<string>("We're performing scheduled maintenance. Please check back shortly.");

  const fetchSettings = async () => {
    try {
      const res = await axios.get("/api/settings");
      if (res.data.panelName) setPanelName(res.data.panelName);
      if (res.data.panelLogo !== undefined) setPanelLogo(res.data.panelLogo);
      if (res.data.panelBackgroundImage !== undefined) setPanelBackgroundImage(res.data.panelBackgroundImage);
      if (res.data.panelBackgroundBlur !== undefined) setPanelBackgroundBlur(res.data.panelBackgroundBlur);
      if (res.data.enablePlayit !== undefined) setEnablePlayit(res.data.enablePlayit);
      if (res.data.nodeIp !== undefined) setNodeIp(res.data.nodeIp);
      if (res.data.enableTutorial !== undefined) setEnableTutorial(res.data.enableTutorial);
      if (res.data.enableLoginAnimation !== undefined) setEnableLoginAnimation(res.data.enableLoginAnimation);
      if (res.data.enableRegistration !== undefined) setEnableRegistration(res.data.enableRegistration);
      if (res.data.enableGoogleLogin !== undefined) setEnableGoogleLogin(res.data.enableGoogleLogin);
      if (res.data.firebaseApiKey !== undefined) setFirebaseApiKey(res.data.firebaseApiKey);
      if (res.data.firebaseAuthDomain !== undefined) setFirebaseAuthDomain(res.data.firebaseAuthDomain);
      if (res.data.firebaseProjectId !== undefined) setFirebaseProjectId(res.data.firebaseProjectId);
      if (res.data.firebaseStorageBucket !== undefined) setFirebaseStorageBucket(res.data.firebaseStorageBucket);
      if (res.data.firebaseMessagingSenderId !== undefined) setFirebaseMessagingSenderId(res.data.firebaseMessagingSenderId);
      if (res.data.firebaseAppId !== undefined) setFirebaseAppId(res.data.firebaseAppId);
      if (res.data.aiSupportEnabled !== undefined) setAiSupportEnabled(res.data.aiSupportEnabled);
      if (res.data.aiSupportName !== undefined) setAiSupportName(res.data.aiSupportName);
      if (res.data.aiSupportLogo !== undefined) setAiSupportLogo(res.data.aiSupportLogo);
      if (res.data.maintenanceMode !== undefined) setMaintenanceMode(res.data.maintenanceMode);
      if (res.data.maintenanceMessage !== undefined) setMaintenanceMessage(res.data.maintenanceMessage);
      if (res.data.customTheme) {
        try {
          const parsed = JSON.parse(res.data.customTheme);
          setCustomTheme(parsed);
        } catch (e) { /* ignore malformed stored theme */ }
      } else {
        setCustomTheme(null);
      }
      if (res.data.theme !== undefined) {
        setTheme(res.data.theme);
        document.documentElement.setAttribute("data-theme", res.data.theme || "indigo");
      } else {
        document.documentElement.setAttribute("data-theme", "indigo");
      }
      if (res.data.navLayout !== undefined) setNavLayout(res.data.navLayout);
      if (res.data.announcementEnabled !== undefined) setAnnouncementEnabled(res.data.announcementEnabled);
      if (res.data.announcementText !== undefined) setAnnouncementText(res.data.announcementText);
      if (res.data.announcementColor !== undefined) setAnnouncementColor(res.data.announcementColor);
      if (res.data.enableDiscordConnect !== undefined) setEnableDiscordConnect(res.data.enableDiscordConnect);
    } catch (e) {}
  };

  useEffect(() => {
    fetchSettings();
    const token = localStorage.getItem("token");
    if (!token) return;
    const socket = io({ auth: { token } });
    socket.on("settings_updated", () => {
      fetchSettings();
    });
    return () => {
      socket.disconnect();
    };
  }, []);

  useEffect(() => {
    if (panelName) {
      document.title = panelName;
    }
  }, [panelName]);
  
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme || "indigo");
  }, [theme]);

  useEffect(() => {
    applyCustomThemeCss(customTheme || null);
  }, [customTheme]);

  // Keep the browser tab favicon in sync with a custom panel logo (merged from Jtg panel)
  useEffect(() => {
    let link = document.querySelector("link[rel~='icon']") as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    link.href = panelLogo || "/vite.svg";
  }, [panelLogo]);

  return (
    <SettingsContext.Provider value={{ 
      panelName, setPanelName, 
      panelLogo, setPanelLogo, 
      panelBackgroundImage, setPanelBackgroundImage, 
      panelBackgroundBlur, setPanelBackgroundBlur, 
      enablePlayit, setEnablePlayit, 
      nodeIp, setNodeIp,
      maintenanceMode, setMaintenanceMode,
      maintenanceMessage, setMaintenanceMessage,
      enableTutorial, setEnableTutorial,
      enableLoginAnimation, setEnableLoginAnimation,
      enableRegistration, setEnableRegistration,
      theme, setTheme,
      customTheme, setCustomTheme,
      navLayout, setNavLayout,
      announcementEnabled, setAnnouncementEnabled,
      announcementText, setAnnouncementText,
      announcementColor, setAnnouncementColor,
      enableDiscordConnect,
      enableGoogleLogin, setEnableGoogleLogin,
      firebaseApiKey, setFirebaseApiKey,
      firebaseAuthDomain, setFirebaseAuthDomain,
      firebaseProjectId, setFirebaseProjectId,
      firebaseStorageBucket, setFirebaseStorageBucket,
      firebaseMessagingSenderId, setFirebaseMessagingSenderId,
      firebaseAppId, setFirebaseAppId,
      aiSupportEnabled, setAiSupportEnabled,
      aiSupportName, setAiSupportName,
      aiSupportLogo, setAiSupportLogo,
      fetchSettings 
    }}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => useContext(SettingsContext);
