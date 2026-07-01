import { createBrowserRouter } from "react-router";
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
]);
