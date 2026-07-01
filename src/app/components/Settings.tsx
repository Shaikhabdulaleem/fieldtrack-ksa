import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Switch } from "./ui/switch";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { useTheme } from "next-themes";
import { 
  Moon, 
  Sun, 
  Globe, 
  Bell, 
  MapPin, 
  Volume2,
  Smartphone,
  Save
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export function Settings() {
  const { theme, setTheme } = useTheme();
  const [language, setLanguage] = useState("en");
  const [notifications, setNotifications] = useState(true);
  const [gpsTracking, setGpsTracking] = useState(true);
  const [sounds, setSounds] = useState(true);
  const [offlineMode, setOfflineMode] = useState(false);

  const handleSave = () => {
    toast.success("Settings saved successfully!");
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Settings</h2>
        <p className="text-gray-500 mt-1">Manage your application preferences</p>
      </div>

      {/* Appearance */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sun className="w-5 h-5 text-yellow-600" />
            Appearance
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Theme</Label>
              <p className="text-sm text-gray-500">Choose your preferred theme</p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant={theme === "light" ? "default" : "outline"}
                size="sm"
                onClick={() => setTheme("light")}
              >
                <Sun className="w-4 h-4 mr-2" />
                Light
              </Button>
              <Button
                variant={theme === "dark" ? "default" : "outline"}
                size="sm"
                onClick={() => setTheme("dark")}
              >
                <Moon className="w-4 h-4 mr-2" />
                Dark
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Language & Region */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="w-5 h-5 text-blue-600" />
            Language & Region
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Display Language</Label>
              <p className="text-sm text-gray-500">Choose your preferred language</p>
            </div>
            <Select value={language} onValueChange={setLanguage}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="ar">العربية (Arabic)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-gray-200 dark:border-gray-800">
            <div>
              <Label>Text Direction</Label>
              <p className="text-sm text-gray-500">Enable right-to-left layout</p>
            </div>
            <Switch
              checked={language === "ar"}
              onCheckedChange={(checked) => setLanguage(checked ? "ar" : "en")}
            />
          </div>
        </CardContent>
      </Card>

      {/* Notifications */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-purple-600" />
            Notifications
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Push Notifications</Label>
              <p className="text-sm text-gray-500">Receive notifications for new assignments</p>
            </div>
            <Switch checked={notifications} onCheckedChange={setNotifications} />
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-gray-200 dark:border-gray-800">
            <div>
              <Label>Sound Alerts</Label>
              <p className="text-sm text-gray-500">Play sound for notifications</p>
            </div>
            <Switch checked={sounds} onCheckedChange={setSounds} />
          </div>
        </CardContent>
      </Card>

      {/* Location & GPS */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="w-5 h-5 text-red-600" />
            Location & GPS
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>GPS Tracking</Label>
              <p className="text-sm text-gray-500">Allow location tracking during work hours</p>
            </div>
            <Switch checked={gpsTracking} onCheckedChange={setGpsTracking} />
          </div>

          <div className="p-3 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-900 rounded-lg">
            <p className="text-sm text-blue-900 dark:text-blue-100">
              GPS tracking helps improve route planning and ensures accurate lead locations. Your location
              is only tracked during active work hours.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Data & Sync */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Smartphone className="w-5 h-5 text-green-600" />
            Data & Sync
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Offline Mode</Label>
              <p className="text-sm text-gray-500">Save data locally when offline</p>
            </div>
            <Switch checked={offlineMode} onCheckedChange={setOfflineMode} />
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-gray-200 dark:border-gray-800">
            <div>
              <Label>Auto Sync</Label>
              <p className="text-sm text-gray-500">Automatically sync when online</p>
            </div>
            <Switch checked={true} />
          </div>

          <div className="pt-4 border-t border-gray-200 dark:border-gray-800">
            <Button variant="outline" className="w-full">
              Clear Local Data
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* About */}
      <Card>
        <CardHeader>
          <CardTitle>About</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600 dark:text-gray-400">Version</span>
            <span className="font-medium text-gray-900 dark:text-white">1.0.0</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600 dark:text-gray-400">Build</span>
            <span className="font-medium text-gray-900 dark:text-white">2026.06.28</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600 dark:text-gray-400">License</span>
            <span className="font-medium text-gray-900 dark:text-white">Commercial</span>
          </div>
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="sticky bottom-0 bg-gray-50 dark:bg-gray-950 pt-4 pb-6">
        <Button onClick={handleSave} className="w-full h-12" size="lg">
          <Save className="w-5 h-5 mr-2" />
          Save Settings
        </Button>
      </div>
    </div>
  );
}
