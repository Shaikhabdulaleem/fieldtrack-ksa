import { Outlet, Link, useLocation } from "react-router";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { 
  LayoutDashboard, 
  Map, 
  Users, 
  Radio, 
  Database, 
  FileBarChart, 
  Route,
  ShieldCheck,
  Building2,
  Settings, 
  Bell,
  Menu,
  Moon,
  Sun,
  LogOut
} from "lucide-react";
import { useTheme } from "next-themes";
import { useState } from "react";
import { cn } from "../ui/utils";
import { getCities, getDashboardStats, getStoredUser, logout as apiLogout } from "../../lib/api";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { useEffect } from "react";

export function AdminLayout() {
  const location = useLocation();
  const { theme, setTheme } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [cities, setCities] = useState<Record<string, unknown>[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const storedUser = getStoredUser();

  useEffect(() => {
    getCities().then(setCities).catch(console.error);
    getDashboardStats().then(s => setPendingCount(Number(s.pending_leads ?? 0))).catch(console.error);
  }, []);

  const totalNotifications = pendingCount;

  const userInitials = (storedUser?.fullName ?? "AD").split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase();

  const navigation = [
    { name: "Dashboard", nameAr: "لوحة التحكم", href: "/", icon: LayoutDashboard },
    { name: "Cities & Map", nameAr: "المدن والخريطة", href: "/city-map", icon: Map },
    { name: "Drivers", nameAr: "السائقين", href: "/drivers", icon: Users },
    { name: "Assignments", nameAr: "المهام", href: "/assignments", icon: Route },
    { name: "Live Tracking", nameAr: "التتبع المباشر", href: "/tracking", icon: Radio },
    { name: "Leads Database", nameAr: "قاعدة العملاء", href: "/leads", icon: Database, badge: pendingCount },
    { name: "Reports", nameAr: "التقارير", href: "/reports", icon: FileBarChart },
    { name: "Quality Control", nameAr: "مراقبة الجودة", href: "/quality-control", icon: ShieldCheck },
    { name: "Client Portal", nameAr: "بوابة العملاء", href: "/client-portal", icon: Building2 },
    { name: "Settings", nameAr: "الإعدادات", href: "/settings", icon: Settings },
  ];

  const notifications = pendingCount > 0
    ? [{ id: "pending", type: "lead", message: `${pendingCount} leads pending review`, time: "Now" }]
    : [];

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-950">
      {/* Sidebar */}
      <aside
        className={cn(
          "bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 transition-all duration-300",
          sidebarOpen ? "w-64" : "w-20"
        )}
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="p-4 border-b border-gray-200 dark:border-gray-800">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
                <Map className="w-6 h-6 text-white" />
              </div>
              {sidebarOpen && (
                <div>
                  <h1 className="font-bold text-gray-900 dark:text-white">FieldTrack</h1>
                  <p className="text-xs text-gray-500">KSA Field Leads</p>
                </div>
              )}
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
            {navigation.map((item) => {
              const isActive = location.pathname === item.href;
              const Icon = item.icon;
              
              return (
                <Link key={item.href} to={item.href}>
                  <Button
                    variant={isActive ? "default" : "ghost"}
                    className={cn(
                      "w-full justify-start",
                      !sidebarOpen && "justify-center"
                    )}
                  >
                    <Icon className={cn("w-5 h-5", sidebarOpen && "mr-3")} />
                    {sidebarOpen && <span>{item.name}</span>}
                    {sidebarOpen && item.badge !== undefined && item.badge > 0 && (
                      <Badge className="ml-auto" variant="destructive">
                        {item.badge}
                      </Badge>
                    )}
                  </Button>
                </Link>
              );
            })}
          </nav>

          {/* User */}
          <div className="p-4 border-t border-gray-200 dark:border-gray-800">
            {sidebarOpen ? (
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center">
                  <span className="text-sm font-semibold text-blue-600 dark:text-blue-400">{userInitials}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{storedUser?.fullName ?? "Admin"}</p>
                  <p className="text-xs text-gray-500 truncate">{storedUser?.email ?? ""}</p>
                </div>
              </div>
            ) : (
              <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center mx-auto">
                <span className="text-sm font-semibold text-blue-600 dark:text-blue-400">AD</span>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSidebarOpen(!sidebarOpen)}
              >
                <Menu className="w-5 h-5" />
              </Button>
              <div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                  {navigation.find((item) => item.href === location.pathname)?.name || "Dashboard"}
                </h2>
                <p className="text-sm text-gray-500">Saudi multi-city construction lead operations</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Select defaultValue="all">
                <SelectTrigger className="hidden md:flex w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All KSA Cities</SelectItem>
                  {cities.map((city) => (
                    <SelectItem key={String(city.id)} value={String(city.id)}>{String(city.nameEn)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {/* Notifications */}
              <div className="relative">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setNotificationsOpen(!notificationsOpen)}
                >
                  <Bell className="w-5 h-5" />
                  {totalNotifications > 0 && (
                    <span className="absolute top-0 right-0 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                      {totalNotifications}
                    </span>
                  )}
                </Button>

                {notificationsOpen && (
                  <div className="absolute right-0 mt-2 w-80 bg-white dark:bg-gray-900 rounded-lg shadow-lg border border-gray-200 dark:border-gray-800 z-50">
                    <div className="p-4 border-b border-gray-200 dark:border-gray-800">
                      <h3 className="font-semibold text-gray-900 dark:text-white">Notifications</h3>
                    </div>
                    <div className="max-h-96 overflow-y-auto">
                      {notifications.map((notification) => (
                        <div
                          key={notification.id}
                          className="p-4 border-b border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800"
                        >
                          <p className="text-sm text-gray-900 dark:text-white">{notification.message}</p>
                          <p className="text-xs text-gray-500 mt-1">{notification.time}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Theme Toggle */}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              >
                {theme === "dark" ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
              </Button>

              {/* Logout */}
              <Button variant="ghost" size="icon" onClick={() => { apiLogout(); window.location.href = "/login"; }}>
                <LogOut className="w-5 h-5" />
              </Button>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
