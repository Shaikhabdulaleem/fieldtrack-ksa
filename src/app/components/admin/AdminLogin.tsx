import { useState } from "react";
import { useNavigate } from "react-router";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { login, getStoredUser, logout } from "../../lib/api";
import { Map, Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "sonner";

export function AdminLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // If already logged in as admin/manager, redirect
  const user = getStoredUser();
  if (user) {
    if (user.role === "super_admin" || user.role === "city_manager") {
      navigate("/", { replace: true });
      return null;
    }
    logout();
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError("Please fill in all fields");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const data = await login(email, password);
      const role = data.user.role as string;
      if (role !== "super_admin" && role !== "city_manager") {
        setError("Access denied. Admin or Manager account required.");
        return;
      }
      toast.success(`Welcome back, ${data.user.fullName as string}!`);
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  const handleQuickLogin = async (loginId: string, pass: string) => {
    setEmail(loginId);
    setPassword(pass);
    setLoading(true);
    setError("");
    try {
      const data = await login(loginId, pass);
      toast.success(`Welcome back, ${data.user.fullName as string}!`);
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-2xl shadow-lg shadow-blue-600/30 mb-4">
            <Map className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white">FieldTrack KSA</h1>
          <p className="text-blue-300 mt-2">Admin Dashboard Login</p>
        </div>

        {/* Login Card */}
        <Card className="border-0 shadow-2xl bg-white/95 dark:bg-gray-900/95 backdrop-blur">
          <CardHeader className="pb-4">
            <CardTitle className="text-center text-gray-900 dark:text-white">Sign in to your account</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm">
                  {error}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <Input
                  id="email"
                  type="text"
                  placeholder="admin@fieldtrack.sa"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="username"
                  disabled={loading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    disabled={loading}
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <Button type="submit" className="w-full h-11 text-base" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  "Sign In"
                )}
              </Button>
            </form>

            {/* Quick Demo Login */}
            <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
              <p className="text-xs text-gray-500 text-center mb-3">Quick demo access</p>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleQuickLogin("admin@fieldtrack.sa", "Admin1234")}
                  disabled={loading}
                  className="text-xs"
                >
                  Super Admin
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleQuickLogin("manager.jeddah@fieldtrack.sa", "Manager1234")}
                  disabled={loading}
                  className="text-xs"
                >
                  Jeddah Manager
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="text-center mt-6">
          <p className="text-blue-400/60 text-xs">
            FieldTrack KSA &copy; 2026 &mdash; Multi-City Construction Lead Generation
          </p>
          <a href="/driver" className="text-blue-400 text-xs hover:underline mt-1 inline-block">
            Driver Login &rarr;
          </a>
        </div>
      </div>
    </div>
  );
}
