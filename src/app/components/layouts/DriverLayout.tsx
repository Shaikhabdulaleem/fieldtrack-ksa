import { Outlet, Link, useLocation } from "react-router";
import { Home, Navigation, FileText, RefreshCw, Settings, ShieldCheck, MapPinOff } from "lucide-react";
import { cn } from "../ui/utils";
import { useEffect, useRef, useState } from "react";
import { sendPing } from "../../lib/api";

function useGpsPinger() {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [locationDenied, setLocationDenied] = useState(false);

  useEffect(() => {
    const ping = () => {
      navigator.geolocation?.getCurrentPosition(
        (pos) => {
          setLocationDenied(false);
          sendPing({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            speedKmh: pos.coords.speed ? pos.coords.speed * 3.6 : undefined,
            accuracyMeters: pos.coords.accuracy,
          }).catch(() => {});
        },
        (err) => {
          if (err.code === 1) setLocationDenied(true);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
      );
    };

    ping();
    intervalRef.current = setInterval(ping, 30000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  return locationDenied;
}

export function DriverLayout() {
  const locationDenied = useGpsPinger();
  const location = useLocation();

  const navigation = [
    { name: "Home", href: "/driver/home", icon: Home },
    { name: "Check-in", href: "/driver/check-in", icon: ShieldCheck },
    { name: "Navigate", href: "/driver/navigation", icon: Navigation },
    { name: "New Lead", href: "/driver/lead-form", icon: FileText },
    { name: "Sync", href: "/driver/sync", icon: RefreshCw },
    { name: "Settings", href: "/driver/settings", icon: Settings },
  ];

  return (
    <div className="flex flex-col h-screen bg-gray-50 dark:bg-gray-950">
      {locationDenied && (
        <div className="flex items-center gap-2 bg-amber-50 border-b border-amber-200 px-4 py-2 text-amber-800 text-sm">
          <MapPinOff className="w-4 h-4 shrink-0" />
          <span>Location tracking is off — enable location access to appear on the admin map.</span>
        </div>
      )}
      {/* Main Content */}
      <main className="flex-1 overflow-y-auto pb-20">
        <Outlet />
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 safe-area-inset-bottom">
        <div className="flex items-center justify-around h-16 px-2">
          {navigation.map((item) => {
            const isActive = location.pathname === item.href;
            const Icon = item.icon;
            
            return (
              <Link
                key={item.href}
                to={item.href}
                className={cn(
                  "flex flex-col items-center justify-center flex-1 h-full gap-1 transition-colors",
                  isActive
                    ? "text-blue-600 dark:text-blue-400"
                    : "text-gray-500 dark:text-gray-400"
                )}
              >
                <Icon className="w-6 h-6" />
                <span className="text-xs font-medium">{item.name}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
