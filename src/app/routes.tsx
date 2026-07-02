import { createBrowserRouter, useRouteError } from "react-router";
import { AdminLayout } from "./components/layouts/AdminLayout";
import { DriverLayout } from "./components/layouts/DriverLayout";
import { AdminLogin } from "./components/admin/AdminLogin";
import { AdminDashboard } from "./components/admin/AdminDashboard";
import { CityMap } from "./components/admin/CityMap";
import { AssignmentManager } from "./components/admin/AssignmentManager";
import { LiveTracking } from "./components/admin/LiveTracking";
import { LeadsDatabase } from "./components/admin/LeadsDatabase";
import { LeadDetail } from "./components/admin/LeadDetail";
import { Reports } from "./components/admin/Reports";
import { DriversPage } from "./components/admin/DriversPage";
import { CityPlanning } from "./components/admin/CityPlanning";
import { RoutePlanner } from "./components/admin/RoutePlanner";
import { QualityControl } from "./components/admin/QualityControl";
import { ClientPortal } from "./components/admin/ClientPortal";
import { DriverLogin } from "./components/driver/DriverLogin";
import { DriverHome } from "./components/driver/DriverHome";
import { DriverCheckIn } from "./components/driver/DriverCheckIn";
import { DriverNavigation } from "./components/driver/DriverNavigation";
import { LeadForm } from "./components/driver/LeadForm";
import { OfflineSync } from "./components/driver/OfflineSync";
import { Settings } from "./components/Settings";
import { ProtectedRoute } from "./components/shared/ProtectedRoute";

function NotFoundPage() {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", gap: "12px", fontFamily: "sans-serif" }}>
      <div style={{ fontSize: "64px", fontWeight: 700, color: "#2563eb" }}>404</div>
      <div style={{ fontSize: "20px", fontWeight: 600, color: "#1e293b" }}>Page not found</div>
      <div style={{ color: "#64748b" }}>The page you're looking for doesn't exist.</div>
      <a href="/" style={{ marginTop: "8px", color: "#2563eb", textDecoration: "underline" }}>Go to Dashboard</a>
    </div>
  );
}

function RouteErrorPage() {
  const error = useRouteError() as { status?: number; statusText?: string; message?: string } | null;
  const is404 = error?.status === 404;
  if (is404) return <NotFoundPage />;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", gap: "12px", fontFamily: "sans-serif" }}>
      <div style={{ fontSize: "48px", fontWeight: 700, color: "#dc2626" }}>Oops!</div>
      <div style={{ fontSize: "18px", fontWeight: 600, color: "#1e293b" }}>Something went wrong</div>
      <div style={{ color: "#64748b" }}>{error?.statusText ?? error?.message ?? "An unexpected error occurred."}</div>
      <a href="/" style={{ marginTop: "8px", color: "#2563eb", textDecoration: "underline" }}>Go to Dashboard</a>
    </div>
  );
}

function AdminGuard({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute roles={["super_admin", "city_manager"]} loginPath="/login">
      {children}
    </ProtectedRoute>
  );
}

function DriverGuard({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute roles={["driver"]} loginPath="/driver">
      {children}
    </ProtectedRoute>
  );
}

export const router = createBrowserRouter([
  {
    path: "/login",
    Component: AdminLogin,
  },
  {
    path: "/",
    errorElement: <RouteErrorPage />,
    element: (
      <AdminGuard>
        <AdminLayout />
      </AdminGuard>
    ),
    children: [
      { index: true, Component: AdminDashboard },
      { path: "city/:id", Component: CityPlanning },
      { path: "city-map", Component: CityMap },
      { path: "drivers", Component: DriversPage },
      { path: "assignments", Component: AssignmentManager },
      { path: "tracking", Component: LiveTracking },
      { path: "leads", Component: LeadsDatabase },
      { path: "leads/:id", Component: LeadDetail },
      { path: "reports", Component: Reports },
      { path: "route-planner", Component: RoutePlanner },
      { path: "quality-control", Component: QualityControl },
      { path: "client-portal", Component: ClientPortal },
      { path: "settings", Component: Settings },
    ],
  },
  {
    path: "/driver",
    errorElement: <RouteErrorPage />,
    children: [
      { index: true, Component: DriverLogin },
      {
        path: "",
        element: (
          <DriverGuard>
            <DriverLayout />
          </DriverGuard>
        ),
        children: [
          { path: "home", Component: DriverHome },
          { path: "check-in", Component: DriverCheckIn },
          { path: "navigation", Component: DriverNavigation },
          { path: "lead-form", Component: LeadForm },
          { path: "sync", Component: OfflineSync },
          { path: "settings", Component: Settings },
        ],
      },
    ],
  },
  {
    path: "*",
    element: <NotFoundPage />,
  },
]);
