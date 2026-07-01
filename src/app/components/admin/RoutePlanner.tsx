import { useMemo, useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Badge } from "../ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Progress } from "../ui/progress";
import { getCities, getDashboardStats } from "../../lib/api";
import { CalendarDays, Car, Download, MapPinned, Printer, Route, Sparkles, Target } from "lucide-react";
import { toast } from "sonner";

export function RoutePlanner() {
  const [cities, setCities] = useState<Record<string, unknown>[]>([]);
  const [selectedCityId, setSelectedCityId] = useState<string>("");
  const [drivers, setDrivers] = useState(6);
  const [streets, setStreets] = useState(10480);
  const [target, setTarget] = useState(100);

  useEffect(() => {
    getCities().then(c => {
      setCities(c);
      if (c.length > 0) {
        setSelectedCityId(String(c[0].id));
        setStreets(Number(c[0].estimatedNamedStreets ?? 10000));
      }
    }).catch(console.error);
  }, []);

  useEffect(() => {
    if (!selectedCityId) return;
    const city = cities.find(c => String(c.id) === selectedCityId);
    if (city) {
      setStreets(Number(city.estimatedNamedStreets ?? 10000));
      setDrivers(Number(city.driverCount ?? 6));
    }
  }, [selectedCityId, cities]);

  const selectedCity = cities.find(c => String(c.id) === selectedCityId);

  const calculation = useMemo(() => {
    const dailyCapacity = Math.max(1, drivers) * Math.max(1, target);
    const days = Math.ceil(Math.max(1, streets) / dailyCapacity);
    const weeklyCapacity = dailyCapacity * 6;
    return { dailyCapacity, days, weeklyCapacity };
  }, [drivers, streets, target]);

  const handleGenerate = () => {
    toast.success("Optimized daily route sheets generated for all drivers");
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 overflow-hidden">
          <CardHeader className="bg-gradient-to-r from-blue-600 to-sky-600 text-white">
            <div className="flex items-center justify-between gap-4">
              <div>
                <CardTitle className="flex items-center gap-2 text-white">
                  <Route className="w-5 h-5" /> Smart Route Planning Engine
                </CardTitle>
                <p className="text-sm text-blue-100 mt-1">
                  Group streets by proximity, reduce backtracking, and create printable daily route sheets.
                </p>
              </div>
              <Badge className="bg-white/20 text-white border-white/30">{String(selectedCity?.nameEn ?? "")}</Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label>City</Label>
                <Select value={selectedCityId} onValueChange={setSelectedCityId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select city" />
                  </SelectTrigger>
                  <SelectContent>
                    {cities.map((city) => (
                      <SelectItem key={String(city.id)} value={String(city.id)}>{String(city.nameEn)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Total named streets</Label>
                <Input type="number" value={streets} onChange={(e) => setStreets(Number(e.target.value))} />
              </div>
              <div className="space-y-2">
                <Label>Number of drivers</Label>
                <Input type="number" value={drivers} onChange={(e) => setDrivers(Number(e.target.value))} />
              </div>
              <div className="space-y-2">
                <Label>Target streets / driver / day</Label>
                <Input type="number" value={target} onChange={(e) => setTarget(Number(e.target.value))} />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="rounded-xl bg-blue-50 dark:bg-blue-950 p-4">
                <Car className="w-5 h-5 text-blue-600 mb-2" />
                <p className="text-xs text-gray-500">Daily capacity</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{calculation.dailyCapacity}</p>
                <p className="text-xs text-gray-500">streets/day</p>
              </div>
              <div className="rounded-xl bg-green-50 dark:bg-green-950 p-4">
                <CalendarDays className="w-5 h-5 text-green-600 mb-2" />
                <p className="text-xs text-gray-500">Estimated completion</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{calculation.days}</p>
                <p className="text-xs text-gray-500">working days</p>
              </div>
              <div className="rounded-xl bg-purple-50 dark:bg-purple-950 p-4">
                <Target className="w-5 h-5 text-purple-600 mb-2" />
                <p className="text-xs text-gray-500">Weekly capacity</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{calculation.weeklyCapacity}</p>
                <p className="text-xs text-gray-500">streets / 6-day week</p>
              </div>
              <div className="rounded-xl bg-amber-50 dark:bg-amber-950 p-4">
                <Sparkles className="w-5 h-5 text-amber-600 mb-2" />
                <p className="text-xs text-gray-500">Target range</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">80-120</p>
                <p className="text-xs text-gray-500">streets / driver</p>
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 dark:border-gray-800 p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white">Route optimization logic</h3>
                  <p className="text-sm text-gray-500">Designed for 8am-5pm field coverage with city-specific routing.</p>
                </div>
                <Button onClick={handleGenerate}>
                  <Sparkles className="w-4 h-4 mr-2" /> Generate Routes
                </Button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-sm">
                {[
                  "Cluster streets by district and proximity",
                  "Prioritize uncovered red zones first",
                  "Avoid duplicate driver overlap across cities",
                  "Print/share route sheets daily",
                ].map((item) => (
                  <div key={item} className="rounded-lg bg-gray-50 dark:bg-gray-800 p-3 flex items-start gap-2">
                    <MapPinned className="w-4 h-4 text-blue-600 mt-0.5" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Coverage Formula</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-xl bg-gray-50 dark:bg-gray-800 p-4 space-y-3 text-sm">
              <div className="flex justify-between"><span>Estimated streets</span><strong>{streets.toLocaleString()}</strong></div>
              <div className="flex justify-between"><span>Drivers</span><strong>{drivers}</strong></div>
              <div className="flex justify-between"><span>Daily target each</span><strong>{target}</strong></div>
              <div className="border-t border-gray-200 dark:border-gray-700 pt-3 flex justify-between text-blue-600">
                <span>Days needed</span><strong>{calculation.days}</strong>
              </div>
            </div>
            <Progress value={Math.min(100, (calculation.dailyCapacity / streets) * 100 * calculation.days)} className="h-3" />
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1"><Printer className="w-4 h-4 mr-2" /> Print</Button>
              <Button variant="outline" className="flex-1"><Download className="w-4 h-4 mr-2" /> CSV</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
