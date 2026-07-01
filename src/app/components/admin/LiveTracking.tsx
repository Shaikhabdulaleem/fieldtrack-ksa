import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { MapContainer, TileLayer, CircleMarker, Popup, Polyline, Marker, useMap } from 'react-leaflet';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { getCities, getLiveTracking, getUsers, getDriverHistory, getTrackingAlerts, acknowledgeAlert } from '../../lib/api';
import { MapPin, Clock, TrendingUp, RefreshCw, Navigation, Loader2, Route, CalendarDays, AlertTriangle } from 'lucide-react';
import { useState, useEffect, useRef, useCallback } from 'react';

delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

interface DriverLocation {
  driver_id: string;
  full_name: string;
  city_id: string;
  location_lat: string;
  location_lng: string;
  speed_kmh: string | null;
  battery_percent: number | null;
  recorded_at: string;
}

interface Ping {
  lat: string;
  lng: string;
  recordedAt: string;
  speedKmh: string | null;
}

function FlyController({ target }: { target: { lat: number; lng: number } | null }) {
  const map = useMap();
  useEffect(() => {
    if (target) map.flyTo([target.lat, target.lng], 14, { duration: 1.4 });
  }, [target, map]);
  return null;
}

// ── Trail Viewer ──────────────────────────────────────────────────────────────
function TrailViewer({ drivers }: { drivers: Record<string, unknown>[] }) {
  const [selectedDriverId, setSelectedDriverId] = useState("");
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));
  const [trail, setTrail] = useState<Ping[]>([]);
  const [loading, setLoading] = useState(false);

  const handleLoad = async () => {
    if (!selectedDriverId) { return; }
    setLoading(true);
    try {
      const data = await getDriverHistory(selectedDriverId, selectedDate) as unknown as Ping[];
      setTrail(data ?? []);
      if (!data?.length) {
        // show info
      }
    } catch {
      setTrail([]);
    } finally {
      setLoading(false);
    }
  };

  const trailPoints: [number, number][] = trail
    .filter(p => p.lat && p.lng)
    .map(p => [Number(p.lat), Number(p.lng)]);

  const startPoint = trailPoints[0];
  const endPoint = trailPoints[trailPoints.length - 1];
  const mapCenter: [number, number] = startPoint ?? [24.7, 45.0];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Route className="w-5 h-5 text-blue-600" />
          GPS Trail History
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
          <div className="space-y-1.5">
            <Label className="text-xs">Driver</Label>
            <Select value={selectedDriverId} onValueChange={setSelectedDriverId}>
              <SelectTrigger>
                <SelectValue placeholder="Select driver" />
              </SelectTrigger>
              <SelectContent>
                {drivers.map(d => (
                  <SelectItem key={String(d.id)} value={String(d.id)}>
                    {String(d.fullName)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs flex items-center gap-1">
              <CalendarDays className="w-3.5 h-3.5" /> Date
            </Label>
            <Input
              type="date"
              value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
              max={new Date().toISOString().slice(0, 10)}
            />
          </div>
          <Button onClick={handleLoad} disabled={loading || !selectedDriverId} className="h-10">
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Route className="w-4 h-4 mr-2" />}
            {loading ? "Loading..." : "View Trail"}
          </Button>
        </div>

        {/* Trail stats */}
        {trail.length > 0 && (
          <div className="flex flex-wrap gap-3 text-sm">
            <Badge variant="outline" className="text-blue-600 border-blue-200">
              {trail.length} GPS pings
            </Badge>
            {trail[0]?.recordedAt && (
              <Badge variant="outline" className="text-gray-600">
                Start: {new Date(trail[0].recordedAt).toLocaleTimeString()}
              </Badge>
            )}
            {trail[trail.length - 1]?.recordedAt && (
              <Badge variant="outline" className="text-gray-600">
                End: {new Date(trail[trail.length - 1].recordedAt).toLocaleTimeString()}
              </Badge>
            )}
          </div>
        )}

        {trail.length === 0 && !loading && selectedDriverId && (
          <p className="text-sm text-center text-gray-400 py-4">
            No GPS data found for this driver on {selectedDate}. Click "View Trail" to load.
          </p>
        )}

        {/* Map */}
        <div className="rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700" style={{ height: 380 }}>
          <MapContainer
            key={`trail-${selectedDriverId}-${selectedDate}`}
            center={mapCenter}
            zoom={trailPoints.length > 0 ? 14 : 5}
            style={{ width: '100%', height: '100%' }}
            scrollWheelZoom
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            {/* Trail polyline */}
            {trailPoints.length > 1 && (
              <Polyline
                positions={trailPoints}
                pathOptions={{ color: '#3b82f6', weight: 4, opacity: 0.85 }}
              />
            )}

            {/* Start marker */}
            {startPoint && (
              <Marker position={startPoint}>
                <Popup>
                  <div className="text-sm">
                    <p className="font-semibold text-green-700">Day Start</p>
                    <p className="text-gray-500">{trail[0]?.recordedAt ? new Date(trail[0].recordedAt).toLocaleTimeString() : ""}</p>
                  </div>
                </Popup>
              </Marker>
            )}

            {/* End marker */}
            {endPoint && endPoint !== startPoint && (
              <Marker position={endPoint}>
                <Popup>
                  <div className="text-sm">
                    <p className="font-semibold text-red-700">Last Known Location</p>
                    <p className="text-gray-500">{trail[trail.length - 1]?.recordedAt ? new Date(trail[trail.length - 1].recordedAt).toLocaleTimeString() : ""}</p>
                  </div>
                </Popup>
              </Marker>
            )}
          </MapContainer>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Main LiveTracking ─────────────────────────────────────────────────────────
export function LiveTracking() {
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const [selectedCityId, setSelectedCityId] = useState<string>('all');
  const [flyTarget, setFlyTarget] = useState<{ lat: number; lng: number } | null>(null);
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
  const [cities, setCities] = useState<Record<string, unknown>[]>([]);
  const [drivers, setDrivers] = useState<Record<string, unknown>[]>([]);
  const [liveLocations, setLiveLocations] = useState<DriverLocation[]>([]);
  const [alerts, setAlerts] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getCities().then(setCities).catch(console.error);
    getUsers({ role: "driver" }).then(setDrivers).catch(console.error);
  }, []);

  const loadTracking = useCallback(async () => {
    try {
      const cityParam = selectedCityId !== 'all' ? selectedCityId : undefined;
      const [data] = await Promise.all([
        getLiveTracking(cityParam),
        getTrackingAlerts(cityParam).then(setAlerts).catch(() => {}),
      ]);
      setLiveLocations(data as unknown as DriverLocation[]);
      setLastUpdate(new Date());
    } catch (err) {
      console.error("Failed to load tracking:", err);
    } finally {
      setLoading(false);
    }
  }, [selectedCityId]);

  useEffect(() => {
    loadTracking();
    const interval = setInterval(loadTracking, 30000);
    return () => clearInterval(interval);
  }, [loadTracking]);

  const filteredDrivers = selectedCityId === 'all'
    ? drivers
    : drivers.filter(d => d.cityId === selectedCityId);

  const getDriverLocation = (driverId: string) =>
    liveLocations.find(l => l.driver_id === driverId);

  const isOnline = (driverId: string) => {
    const loc = getDriverLocation(driverId);
    if (!loc) return false;
    const diff = (Date.now() - new Date(loc.recorded_at).getTime()) / 60000;
    return diff < 20;
  };

  const onlineDrivers = filteredDrivers.filter(d => isOnline(String(d.id)));
  const offlineDrivers = filteredDrivers.filter(d => !isOnline(String(d.id)));

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Online</p>
                <p className="text-2xl font-bold text-green-600">{onlineDrivers.length}</p>
              </div>
              <div className="w-12 h-12 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center">
                <MapPin className="w-6 h-6 text-green-600 dark:text-green-400" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Offline</p>
                <p className="text-2xl font-bold text-gray-500">{offlineDrivers.length}</p>
              </div>
              <div className="w-12 h-12 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center">
                <Clock className="w-6 h-6 text-gray-500 dark:text-gray-400" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Total Drivers</p>
                <p className="text-2xl font-bold text-blue-600">{filteredDrivers.length}</p>
              </div>
              <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-blue-600 dark:text-blue-400" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Live Pings</p>
                <p className="text-2xl font-bold text-purple-600">{liveLocations.length}</p>
              </div>
              <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900 rounded-full flex items-center justify-center">
                <Navigation className="w-6 h-6 text-purple-600 dark:text-purple-400" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Alerts panel */}
      {alerts.length > 0 && (
        <Card className="border-red-200 dark:border-red-900">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-700 dark:text-red-400 text-base">
              <AlertTriangle className="w-5 h-5" />
              Active Alerts ({alerts.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {alerts.map((a, i) => (
              <div
                key={i}
                className={`flex items-center justify-between p-3 rounded-lg border ${
                  a.acknowledged
                    ? "bg-gray-50 border-gray-200 dark:bg-gray-800 dark:border-gray-700 opacity-60"
                    : "bg-red-50 border-red-200 dark:bg-red-950 dark:border-red-800"
                }`}
              >
                <div>
                  <p className="font-semibold text-sm text-gray-900 dark:text-white">{String(a.full_name)}</p>
                  <p className="text-xs text-gray-500">
                    {a.alert_type === "silence"
                      ? `No ping for ${Math.round(Number(a.minutes_since_ping))} min`
                      : `Deviating ~${a.deviation_meters}m from assigned area`}
                  </p>
                </div>
                {a.alert_type === "deviation" && !a.acknowledged && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs h-7 border-red-300"
                    onClick={async () => {
                      await acknowledgeAlert(String(a.driver_id));
                      const cityParam = selectedCityId !== "all" ? selectedCityId : undefined;
                      getTrackingAlerts(cityParam).then(setAlerts).catch(() => {});
                    }}
                  >
                    Acknowledge
                  </Button>
                )}
                {a.acknowledged && (
                  <Badge variant="outline" className="text-xs text-gray-400">Dismissed</Badge>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Toolbar */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse" />
                <span className="text-sm font-medium text-gray-900 dark:text-white">Live Tracking</span>
              </div>
              <span className="text-xs text-gray-500">
                Last updated: {lastUpdate.toLocaleTimeString()}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <Select value={selectedCityId} onValueChange={setSelectedCityId}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Filter by city" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Cities</SelectItem>
                  {cities.map((city) => (
                    <SelectItem key={String(city.id)} value={String(city.id)}>
                      {String(city.nameEn)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={loadTracking}>
                <RefreshCw className="w-4 h-4 mr-2" />
                Refresh
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Live Map + Driver List */}
      <div className="flex flex-col lg:flex-row gap-6" style={{ minHeight: '560px' }}>
        <div className="lg:w-1/3 flex flex-col">
          <Card className="flex-1 flex flex-col overflow-hidden">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Navigation className="w-4 h-4" />
                Drivers
                <span className="text-xs font-normal text-gray-500 ml-1">
                  ({filteredDrivers.length} total)
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 overflow-y-auto pr-2 space-y-2 pb-4" ref={listRef}>
              {loading && (
                <div className="flex items-center justify-center h-24">
                  <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
                </div>
              )}
              {filteredDrivers.map((driver) => {
                const driverId = String(driver.id);
                const loc = getDriverLocation(driverId);
                const online = isOnline(driverId);
                const isSelected = driverId === selectedDriverId;
                const color = online ? '#22c55e' : '#9ca3af';

                return (
                  <button
                    key={driverId}
                    onClick={() => {
                      setSelectedDriverId(driverId);
                      if (loc) {
                        setFlyTarget({ lat: Number(loc.location_lat), lng: Number(loc.location_lng) });
                      }
                    }}
                    className={[
                      'w-full text-left p-3 rounded-lg border transition-all duration-150 cursor-pointer',
                      isSelected
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-950 shadow-md'
                        : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:border-blue-300 hover:bg-gray-50 dark:hover:bg-gray-800',
                    ].join(' ')}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div
                          className="relative w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                          style={{ backgroundColor: color }}
                        >
                          {String(driver.fullName ?? "")
                            .split(' ')
                            .slice(0, 2)
                            .map((n: string) => n[0])
                            .join('')}
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-sm text-gray-900 dark:text-white leading-tight truncate">
                            {String(driver.fullName)}
                          </p>
                          <p className="text-xs text-gray-500 truncate">{String(driver.phone ?? "")}</p>
                        </div>
                      </div>
                      <Badge
                        variant={online ? 'default' : 'outline'}
                        className={online
                          ? 'text-xs bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 border-green-300'
                          : 'text-xs bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 border-gray-300'
                        }
                      >
                        {online ? 'Online' : 'Offline'}
                      </Badge>
                    </div>
                    {loc && (
                      <div className="flex gap-3 text-xs mt-2">
                        {loc.speed_kmh && (
                          <span className="text-gray-500">
                            Speed: <span className="font-semibold">{Number(loc.speed_kmh).toFixed(0)} km/h</span>
                          </span>
                        )}
                        {loc.battery_percent != null && (
                          <span className="text-gray-500">
                            Battery: <span className="font-semibold">{loc.battery_percent}%</span>
                          </span>
                        )}
                        <span className="text-gray-400 ml-auto">
                          {Math.round((Date.now() - new Date(loc.recorded_at).getTime()) / 60000)}m ago
                        </span>
                      </div>
                    )}
                  </button>
                );
              })}
              {filteredDrivers.length === 0 && !loading && (
                <div className="flex items-center justify-center h-32 text-gray-400 text-sm">
                  No drivers found.
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="lg:w-2/3 rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 shadow-sm" style={{ minHeight: '500px' }}>
          <MapContainer
            center={[24.7, 45.0]}
            zoom={5}
            style={{ width: '100%', height: '100%', minHeight: '500px' }}
            scrollWheelZoom={true}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <FlyController target={flyTarget} />
            {liveLocations.map((loc) => (
              <CircleMarker
                key={loc.driver_id}
                center={[Number(loc.location_lat), Number(loc.location_lng)]}
                radius={10}
                pathOptions={{
                  fillColor: '#22c55e',
                  fillOpacity: 0.9,
                  color: '#fff',
                  weight: 2,
                }}
                eventHandlers={{ click: () => setSelectedDriverId(loc.driver_id) }}
              >
                <Popup>
                  <div className="min-w-[180px]">
                    <p className="font-bold text-gray-900 text-sm mb-1">{loc.full_name}</p>
                    <p className="text-xs text-gray-500 mb-2">
                      Last ping: {new Date(loc.recorded_at).toLocaleTimeString()}
                    </p>
                    {loc.speed_kmh && <p className="text-xs">Speed: {Number(loc.speed_kmh).toFixed(0)} km/h</p>}
                    {loc.battery_percent != null && <p className="text-xs">Battery: {loc.battery_percent}%</p>}
                  </div>
                </Popup>
              </CircleMarker>
            ))}
          </MapContainer>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500">
        <span className="font-medium text-gray-700 dark:text-gray-300">Map legend:</span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-full bg-green-500" /> Online (pinged &lt; 20 min)
        </span>
        <span className="ml-auto text-gray-400">Click a driver card to fly the map to their location.</span>
      </div>

      {/* Historical Trail Viewer */}
      <TrailViewer drivers={drivers} />
    </div>
  );
}
