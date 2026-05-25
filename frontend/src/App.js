import { useEffect } from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, useLocation, Navigate } from "react-router-dom";
import { AuthProvider } from "@/context/AuthContext";
import RouteLoader from "@/components/RouteLoader";
import ProtectedRoute from "@/components/ProtectedRoute";
import { Toaster } from "sonner";
import { initModalScrollAnchor } from "@/lib/modalScrollAnchor";

import Landing from "@/pages/Landing";
import Services from "@/pages/Services";
import ServiceDetail from "@/pages/ServiceDetail";
import About from "@/pages/About";
import Contact from "@/pages/Contact";
import PrivacyPolicy from "@/pages/PrivacyPolicy";
import TermsOfService from "@/pages/TermsOfService";
import Portfolio from "@/pages/Portfolio";
import ProjectDemo from "@/pages/ProjectDemo";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import PortalLayout from "@/pages/portal/PortalLayout";
import AppShell from "@/components/AppShell";
import Launchpad from "@/pages/portal/Launchpad";
import Dashboard from "@/pages/portal/Dashboard";
import Leads from "@/pages/portal/Leads";
import Tasks from "@/pages/portal/Tasks";
import Team from "@/pages/portal/Team";
import Projects from "@/pages/portal/Projects";
import Documents from "@/pages/portal/Documents";
import Chat from "@/pages/portal/Chat";
import AIAssist from "@/pages/portal/AIAssist";
import Manager from "@/pages/portal/Manager";
import Badges from "@/pages/portal/Badges";
import Issues from "@/pages/portal/Issues";
import SettingsPage from "@/pages/portal/Settings";
import Finance from "@/pages/portal/Finance";
import Presence from "@/pages/portal/Presence";
import EmailCampaigns from "@/pages/portal/EmailCampaigns";
import EmailTemplates from "@/pages/portal/EmailTemplates";
import ProjectDetail from "@/pages/portal/ProjectDetail";
import TaskDetail from "@/pages/portal/TaskDetail";
import DocVerification from "@/pages/portal/DocVerification";
import HRModule from "@/pages/portal/HRModule";
import Profile from "@/pages/portal/Profile";
import NotifPermissions from "@/pages/portal/NotifPermissions";
import AISettings from "@/pages/portal/AISettings";
import Calendly from "@/pages/portal/Calendly";
import WebsiteConfig from "@/pages/portal/WebsiteConfig";
import BlogEditor from "@/pages/portal/BlogEditor";
import LinkedInQueue from "@/pages/portal/LinkedInQueue";
import PublicBooking from "@/pages/PublicBooking";
import InvoicePayResult from "@/pages/InvoicePayResult";
import XinoEstimator from "@/components/XinoEstimator";
import Blog from "@/pages/Blog";
import BlogPost from "@/pages/BlogPost";
import LocationLanding, { LOCATION_PAGES } from "@/pages/LocationLanding";
import { ForgotPassword, ResetPassword } from "@/pages/auth/PasswordReset";
import InternDashboard from "@/pages/intern/InternDashboard";
import InternTasks from "@/pages/intern/InternTasks";
import InternDocuments from "@/pages/intern/InternDocuments";
import InternBadges from "@/pages/intern/InternBadges";
import InternProfile from "@/pages/intern/InternProfile";

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [pathname]);
  return null;
}

/**
 * XinoLayer — mounts the Xino AI estimator popup on every PUBLIC website page.
 * Hidden on portal/auth/internal routes (the portal has its own /app/ai page).
 */
function XinoLayer() {
  const { pathname } = useLocation();
  const EXCLUDE_PREFIXES = ["/app", "/m/", "/intern", "/login", "/register",
                            "/forgot-password", "/reset-password", "/invoice/",
                            "/blog"];
  if (EXCLUDE_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/") || pathname.startsWith(p))) return null;
  const autoOpen = pathname === "/";
  return <XinoEstimator autoOpen={autoOpen} showFloating />;
}

function PortalRoutes() {
  return (
    <>
      <Route index element={<Dashboard />} />
      <Route path="dashboard" element={<Dashboard />} />
      <Route path="projects" element={<Projects />} />
      <Route path="tasks" element={<Tasks />} />
      <Route path="leads" element={<Leads />} />
      <Route path="team" element={<Team />} />
      {/* Legacy routes redirect into the unified Team page */}
      <Route path="interns" element={<Navigate to="/app/team?tab=interns" replace />} />
      <Route path="access-control" element={<Navigate to="/app/team?tab=matrix" replace />} />
      <Route path="documents" element={<Documents />} />
      <Route path="chat" element={<Chat />} />
      <Route path="ai" element={<AIAssist />} />
    </>
  );
}

export default function App() {
  useEffect(() => {
    initModalScrollAnchor();
  }, []);
  return (
    <div className="App">
      <BrowserRouter>
        <AuthProvider>
          <ScrollToTop />
          <XinoLayer />
          <Toaster
            position="top-center"
            theme="light"
            richColors
            duration={3500}
            visibleToasts={5}
            expand
            closeButton
            toastOptions={{
              classNames: {
                toast: "pjx-banner-toast",
              },
              style: {
                minWidth: "320px",
                maxWidth: "min(90vw, 720px)",
                fontWeight: 600,
                fontSize: "14px",
                borderRadius: "14px",
                boxShadow: "0 14px 40px -8px rgba(15,32,66,0.25)",
              },
            }}
          />
          <RouteLoader>
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/services" element={<Services />} />
              <Route path="/services/:slug" element={<ServiceDetail />} />
              <Route path="/portfolio" element={<Portfolio />} />
              <Route path="/portfolio/:slug" element={<ProjectDemo />} />
              <Route path="/about" element={<About />} />
              <Route path="/contact" element={<Contact />} />
              <Route path="/blog" element={<Blog />} />
              <Route path="/blog/:slug" element={<BlogPost />} />
              {Object.keys(LOCATION_PAGES).map((slug) => (
                <Route key={slug} path={`/${slug}`} element={<LocationLanding slug={slug} />} />
              ))}
              <Route path="/privacy" element={<PrivacyPolicy />} />
              <Route path="/terms" element={<TermsOfService />} />
              <Route path="/login" element={<Login />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/book/:slug" element={<PublicBooking />} />
              <Route path="/invoice/:id/paid" element={<InvoicePayResult />} />
              <Route path="/register" element={<Register />} />
              {/* Mobile portal aliases (PWA → Play Store) */}
              <Route path="/m/login" element={<Login />} />
              <Route path="/m/register" element={<Register />} />
              {/* Internal portals — Web URL */}
              <Route
                path="/app"
                element={
                  <ProtectedRoute>
                    <AppShell />
                  </ProtectedRoute>
                }
              >
                <Route index element={<Launchpad />} />
                <Route path="dashboard" element={<Dashboard />} />
                <Route path="manager" element={<Manager />} />
                <Route path="badges" element={<Badges />} />
                <Route path="issues" element={<Issues />} />
                <Route path="projects" element={<Projects />} />
                <Route path="tasks" element={<Tasks />} />
                <Route path="leads" element={<Leads />} />
                <Route path="team" element={<Team />} />
                <Route path="interns" element={<Navigate to="/app/team?tab=interns" replace />} />
                <Route path="documents" element={<Documents />} />
                <Route path="chat" element={<Chat />} />
                <Route path="ai" element={<AIAssist />} />
                <Route path="settings" element={<SettingsPage />} />
                <Route path="finance" element={<Finance />} />
                <Route path="presence" element={<Presence />} />
                <Route path="email-campaigns" element={<EmailCampaigns />} />
                <Route path="email-templates" element={<EmailTemplates />} />
                <Route path="access-control" element={<Navigate to="/app/team?tab=matrix" replace />} />
                <Route path="projects/:id" element={<ProjectDetail />} />
                <Route path="doc-verification" element={<DocVerification />} />
                <Route path="hr" element={<HRModule />} />
                <Route path="profile" element={<Profile />} />
                <Route path="notifications-permissions" element={<NotifPermissions />} />
                <Route path="tasks/:id" element={<TaskDetail />} />
                <Route path="ai-settings" element={<AISettings />} />
                <Route path="org-chart" element={<Navigate to="/app/team" replace />} />
                <Route path="calendly" element={<Calendly />} />
                <Route path="website-config" element={<WebsiteConfig />} />
                <Route path="blog" element={<BlogEditor />} />
                <Route path="linkedin" element={<LinkedInQueue />} />
              </Route>
              {/* Internal portals — Mobile URL (PWA installable) */}
              <Route
                path="/m"
                element={
                  <ProtectedRoute>
                    <AppShell />
                  </ProtectedRoute>
                }
              >
                <Route index element={<Launchpad />} />
                <Route path="dashboard" element={<Dashboard />} />
                <Route path="manager" element={<Manager />} />
                <Route path="badges" element={<Badges />} />
                <Route path="issues" element={<Issues />} />
                <Route path="projects" element={<Projects />} />
                <Route path="tasks" element={<Tasks />} />
                <Route path="leads" element={<Leads />} />
                <Route path="team" element={<Team />} />
                <Route path="interns" element={<Navigate to="/m/team?tab=interns" replace />} />
                <Route path="documents" element={<Documents />} />
                <Route path="chat" element={<Chat />} />
                <Route path="ai" element={<AIAssist />} />
                <Route path="settings" element={<SettingsPage />} />
                <Route path="finance" element={<Finance />} />
                <Route path="presence" element={<Presence />} />
                <Route path="email-campaigns" element={<EmailCampaigns />} />
                <Route path="email-templates" element={<EmailTemplates />} />
                <Route path="access-control" element={<Navigate to="/m/team?tab=matrix" replace />} />
                <Route path="projects/:id" element={<ProjectDetail />} />
                <Route path="doc-verification" element={<DocVerification />} />
                <Route path="hr" element={<HRModule />} />
                <Route path="profile" element={<Profile />} />
                <Route path="notifications-permissions" element={<NotifPermissions />} />
                <Route path="tasks/:id" element={<TaskDetail />} />
                <Route path="ai-settings" element={<AISettings />} />
                <Route path="org-chart" element={<Navigate to="/m/team" replace />} />
                <Route path="calendly" element={<Calendly />} />
                <Route path="website-config" element={<WebsiteConfig />} />
                <Route path="blog" element={<BlogEditor />} />
                <Route path="linkedin" element={<LinkedInQueue />} />
              </Route>
              {/* Intern Portal — same mobile-app shell + launchpad */}
              <Route
                path="/intern"
                element={
                  <ProtectedRoute internOnly>
                    <AppShell />
                  </ProtectedRoute>
                }
              >
                <Route index element={<Launchpad variant="intern" />} />
                <Route path="dashboard" element={<InternDashboard />} />
                <Route path="tasks" element={<InternTasks />} />
                <Route path="tasks/:id" element={<TaskDetail backTo="/intern/tasks" />} />
                <Route path="documents" element={<InternDocuments />} />
                <Route path="badges" element={<InternBadges />} />
                <Route path="profile" element={<InternProfile />} />
                <Route path="chat" element={<Chat />} />
                <Route path="ai" element={<AIAssist />} />
              </Route>
            </Routes>
          </RouteLoader>
        </AuthProvider>
      </BrowserRouter>
    </div>
  );
}
