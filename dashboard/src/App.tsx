import { createBrowserRouter, Navigate } from "react-router-dom";

import { ProjectLayout } from "./components/ProjectLayout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { Billing } from "./pages/Billing";
import { BillingReturn } from "./pages/BillingReturn";
import { Home } from "./pages/Home";
import { Invite } from "./pages/Invite";
import { LegacyIssue } from "./pages/LegacyIssue";
import { Login } from "./pages/Login";
import { Report } from "./pages/Report";
import { Reports } from "./pages/Reports";
import { Settings } from "./pages/Settings";
import { StandaloneTeam, Team } from "./pages/Team";

export const router = createBrowserRouter([
  { path: "/login", element: <Login /> },
  {
    element: <ProtectedRoute />,
    children: [
      // Signed in but not necessarily paid. These must stay outside anything
      // that redirects on 402, or the paywall would have no exit.
      { path: "/billing", element: <Billing /> },
      { path: "/billing/return", element: <BillingReturn /> },
      // Joining a Team never needs a plan of one's own.
      { path: "/invite/:inviteId", element: <Invite /> },
      { path: "/teams/:teamId", element: <StandaloneTeam /> },

      { path: "/", element: <Home /> },
      {
        path: "/projects/:projectId",
        element: <ProjectLayout />,
        children: [
          { index: true, element: <Reports /> },
          { path: "issues/:issueId", element: <Report /> },
          { path: "settings", element: <Settings /> },
          { path: "team", element: <Team /> },
        ],
      },
      // old deep links from before the inbox routes
      { path: "/issues/:id", element: <LegacyIssue /> },
    ],
  },
  { path: "*", element: <Navigate to="/" replace /> },
]);
