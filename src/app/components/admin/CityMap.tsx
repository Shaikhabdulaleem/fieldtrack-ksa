import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png';
import iconUrl from 'leaflet/dist/images/marker-icon.png';
import shadowUrl from 'leaflet/dist/images/marker-shadow.png';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({ iconRetinaUrl, iconUrl, shadowUrl });

import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet';
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { getCities, getCityZones, getZoneDistricts, getUsers, getLiveTracking } from "../../lib/api";
import { Navigation, Users, Activity, Building2, ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { useState, useEffect } from "react";
import { cn } from "../ui/utils";

export function CityMap() {
  const [cities, setCities] = useState<Record<string, unknown>[]>([]);
  const [selectedCityId, setSelectedCityId] = useState<string>("");
  const [drivers, setDrivers] = useState<Record<string, unknown>[]>([]);
  const [liveLocations, setLiveLocations] = useState<Record<string, unknown>[]>([]);
  const [zones, setZones] = useState<Record<string, unknown>[]>([]);
  const [selectedDriver, setSelectedDriver] = useState<string | null>(null);
  const [expandedZones, setExpandedZones] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getCities().then(c => {
      setCities(c);
      if (c.length > 0) setSelectedCityId(String(c[0].id));
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedCityId) return;
    Promise.all([
      getUsers({ role: "driver", city_id: selectedCityId }),
      getLiveTracking(selectedCityId),
      getCityZones(selectedCityId),
    ]).then(([d, l, z]) => {
      setDrivers(d);
      setLiveLocations(l);
      setZones(z);
    }).catch(console.error);
  }, [selectedCityId]);

  const selectedCity = cities.find(c => String(c.id) === selectedCityId);
  const centerLat = Number(selectedCity?.centerLat ?? 24.7);
  const centerLng = Number(selectedCity?.centerLng ?? 45.0);

  function toggleZone(zoneId: string) {
    setExpandedZones(prev => {
      const next = new Set(prev);
      next.has(zoneId) ? next.delete(zoneId) : next.add(zoneId);
      return next;
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
      <Card className="lg:col-span-3">
        <CardHeader>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <CardTitle>{String(selectedCity?.nameEn ?? "City")} Coverage Map</CardTitle>
              <p className="text-sm text-gray-500 mt-1">
                Multi-city KSA coverage view
              </p>
            </div>
            <Select
              value={selectedCityId}
              onValueChange={(value) => {
                setSelectedCityId(value);
                setSelectedDriver(null);
                setExpandedZones(new Set());
              }}
            >
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {cities.map((city) => (
                  <SelectItem key={String(city.id)} value={String(city.id)}>{String(city.nameEn)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 mb-3 flex-wrap">
            <div className="flex items-center gap-2 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg px-3 py-2">
              <Building2 className="w-4 h-4 text-blue-600" />
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-white">{String(selectedCity?.nameEn ?? "")}</p>
                <p className="text-xs text-gray-500">{String(selectedCity?.regionEn ?? "")} &bull; {drivers.length} drivers</p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded-full bg-green-500 inline-block" />
                <span className="text-gray-600 dark:text-gray-400">Online ({liveLocations.length})</span>
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded-full bg-gray-400 inline-block" />
                <span className="text-gray-600 dark:text-gray-400">Total ({drivers.length})</span>
              </span>
            </div>
          </div>

          <div className="rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
            <MapContainer
              key={selectedCityId}
              center={[centerLat, centerLng]}
              zoom={12}
              style={{ height: '500px', width: '100%' }}
              scrollWheelZoom={true}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              {liveLocations.map((loc) => (
                <CircleMarker
                  key={String(loc.driver_id)}
                  center={[Number(loc.location_lat), Number(loc.location_lng)]}
                  radius={10}
                  pathOptions={{ fillColor: '#22c55e', fillOpacity: 0.9, color: '#fff', weight: 2 }}
                  eventHandlers={{ click: () => setSelectedDriver(String(loc.driver_id)) }}
                >
                  <Popup>
                    <div className="min-w-[160px]">
                      <p className="font-bold text-sm">{String(loc.full_name)}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        Last ping: {new Date(String(loc.recorded_at)).toLocaleTimeString()}
                      </p>
                    </div>
                  </Popup>
                </CircleMarker>
              ))}
            </MapContainer>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <Card className="overflow-y-auto max-h-[360px]">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="w-5 h-5" />
              Drivers ({drivers.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pt-0">
            {drivers.map((driver) => (
              <div
                key={String(driver.id)}
                className={cn(
                  'p-3 rounded-lg border cursor-pointer transition-all',
                  selectedDriver === String(driver.id)
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-950'
                    : 'border-gray-200 dark:border-gray-800 hover:border-gray-300'
                )}
                onClick={() => setSelectedDriver(prev => prev === String(driver.id) ? null : String(driver.id))}
              >
                <div className="flex items-center justify-between mb-1">
                  <p className="font-semibold text-sm text-gray-900 dark:text-white">{String(driver.fullName)}</p>
                  <Badge variant={driver.isActive ? 'default' : 'secondary'} className="text-xs">
                    {driver.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
                <p className="text-xs text-gray-500">{String(driver.phone ?? "")}</p>
              </div>
            ))}
            {drivers.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-4">No drivers in this city</p>
            )}
          </CardContent>
        </Card>

        <Card className="overflow-y-auto max-h-[360px]">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Zones &amp; Districts</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pt-0">
            {zones.map((zone) => {
              const isExpanded = expandedZones.has(String(zone.id));
              return (
                <div key={String(zone.id)} className="border border-gray-200 dark:border-gray-800 rounded-lg overflow-hidden">
                  <button
                    className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-900 hover:bg-gray-100 dark:hover:bg-gray-800 text-left"
                    onClick={() => toggleZone(String(zone.id))}
                  >
                    <div>
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">{String(zone.nameEn)}</p>
                      <p className="text-xs text-gray-500">
                        {Number(zone.coverage ?? 0)}% &bull; {Number(zone.completedStreets ?? 0)}/{Number(zone.streetCount ?? 0)} streets
                      </p>
                    </div>
                    {isExpanded ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                  </button>
                  <div className="px-3 py-1 bg-gray-50 dark:bg-gray-900">
                    <div className="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full">
                      <div className="h-1.5 bg-blue-500 rounded-full" style={{ width: `${Number(zone.coverage ?? 0)}%` }} />
                    </div>
                  </div>
                </div>
              );
            })}
            {zones.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-4">No zones loaded</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
