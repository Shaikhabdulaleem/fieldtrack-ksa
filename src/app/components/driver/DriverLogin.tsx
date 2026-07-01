import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Map, Lock, User, Loader2 } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { login, getStoredUser, logout } from "../../lib/api";

export function DriverLogin() {
  const navigate = useNavigate();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const user = getStoredUser();
  if (user) {
    if (user.role === "driver") {
      navigate("/driver/home", { replace: true });
      return null;
    }
    logout();
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone.trim() || !password.trim()) {
      setError("Please enter phone number and password");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const data = await login(phone, password);
      if ((data.user.role as string) !== "driver") {
        setError("This login is for drivers only. Use the admin login.");
        return;
      }
      toast.success(`Welcome, ${data.user.fullName as string}!`);
      navigate("/driver/home", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  const handleQuickLogin = async (phoneNum: string, pass: string) => {
    setPhone(phoneNum);
    setPassword(pass);
    setLoading(true);
    setError("");
    try {
      const data = await login(phoneNum, pass);
      toast.success(`Welcome, ${data.user.fullName as string}!`);
      navigate("/driver/home", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-white rounded-2xl shadow-xl mb-4">
            <Map className="w-12 h-12 text-blue-600" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">FieldTrack Driver</h1>
          <p className="text-blue-100">Construction Lead Generation</p>
        </div>

        {/* Login Card */}
        <Card className="shadow-2xl">
          <CardHeader>
            <CardTitle className="text-center text-xl">Driver Login</CardTitle>
            <p className="text-center text-sm text-gray-500">KSA Field Operations</p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              {error && (
                <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm">
                  {error}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="phone">Phone Number</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <Input
                    id="phone"
                    type="text"
                    placeholder="+966501234567"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="pl-10 h-12 text-base"
                    disabled={loading}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10 h-12 text-base"
                    disabled={loading}
                  />
                </div>
              </div>

              <Button type="submit" className="w-full h-12 text-base" size="lg" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  "Login to Start"
                )}
              </Button>

              <div className="text-center space-y-2">
                <div className="flex items-center gap-2 justify-center text-xs text-gray-500">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                  <span>System Online</span>
                </div>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Quick Demo Login */}
        <div className="mt-6 p-4 bg-white/10 backdrop-blur-sm rounded-lg">
          <p className="text-white text-sm text-center mb-3">Quick Demo Login:</p>
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => handleQuickLogin("+966501234567", "Driver1234")}
              disabled={loading}
            >
              Ahmed (Jeddah)
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => handleQuickLogin("+966507779012", "Driver1234")}
              disabled={loading}
            >
              Yousef (Riyadh)
            </Button>
          </div>
        </div>

        {/* Admin link */}
        <div className="text-center mt-4">
          <a href="/login" className="text-blue-200 text-xs hover:underline">
            &larr; Admin Dashboard Login
          </a>
        </div>
      </div>
    </div>
  );
}
