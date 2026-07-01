import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { MapContainer, TileLayer, Polyline, CircleMarker, Popup, useMap } from 'react-leaflet';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Badge } from '../ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Input } from '../ui/input';
import { getDistrictActivity } from '../../lib/api';
import { CheckCircle2, Circle, MapPin, Camera, Loader2, Navigation, Clock } from 'lucide-react';
import { useState, useEffect } from 'react';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

interface AssignedDriver {
  driverId: string;
  driverName: string;
  count: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  districtId: string;
  districtName: string;
  assignedDrivers: AssignedDriver[];
}

interface ActivityData {
  pings: { lat: string; lng: string; recordedAt: string; speedKmh: string | null }[];
  leads: { id: string; site_name: string; phase: string; location_lat: string; location_lng: string; status: string; created_at: string; photos: { storageUrl: string; photoType: string }[] }[];
  streets: { id: string; nameEn: string; nameAr: string; status: string }[];
}

function MapBoundsUpdater({ positions }: { positions: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (positions.length > 0) {
      const bounds = L.latLngBounds(positions.map(p => L.latLng(p[0], p[1])));
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
    }
  }, [positions, map]);
  return null;
}

function phaseLabel(phase: string) {
  switch (phase) {
    case 'just_digging_started': return 'Digging Started';
    case 'foundation_phase': return 'Foundation';
    case 'first_floor_starting': return 'First Floor';
    default: return 'Other';
  }
}

export function DistrictActivityMap({ open, onOpenChange, districtId, districtName, assignedDrivers }: Props) {
  const [selectedDriverId, setSelectedDriverId] = useState(assignedDrivers[0]?.driverId ?? '');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [data, setData] = useState<ActivityData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !selectedDriverId || !districtId) return;
    setLoading(true);
    getDistrictActivity({ district_id: districtId, driver_id: selectedDriverId, date })
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [open, districtId, selectedDriverId, date]);

  useEffect(() => {
    if (open && assignedDrivers.length > 0 && !selectedDriverId) {
      setSelectedDriverId(assignedDrivers[0].driverId);
    }
  }, [open, assignedDrivers, selectedDriverId]);

  const trailPoints: [number, number][] = data?.pings.map(p => [Number(p.lat), Number(p.lng)]) ?? [];
  const leadPoints: [number, number][] = data?.leads.map(l => [Number(l.location_lat), Number(l.location_lng)]) ?? [];
  const allPoints = [...trailPoints, ...leadPoints];

  const completedStreets = data?.streets.filter(s => s.status === 'completed').length ?? 0;
  const totalStreets = data?.streets.length ?? 0;
  const selectedDriverName = assignedDrivers.find(d => d.driverId === selectedDriverId)?.driverName ?? '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl h-[85vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="w-5 h-5 text-blue-500" />
            {districtName} — Driver Activity
          </DialogTitle>
          <div className="flex items-center gap-3 mt-2">
            {assignedDrivers.length > 1 ? (
              <Select value={selectedDriverId} onValueChange={setSelectedDriverId}>
                <SelectTrigger className="w-48 h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {assignedDrivers.map(d => (
                    <SelectItem key={d.driverId} value={d.driverId}>
                      {d.driverName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Badge variant="secondary" className="text-sm">
                {selectedDriverName}
              </Badge>
            )}
            <Input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="w-40 h-8 text-sm"
            />
          </div>
        </DialogHeader>

        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar */}
          <div className="w-80 border-r border-gray-200 dark:border-gray-700 flex flex-col overflow-hidden">
            {/* Stats */}
            <div className="p-4 border-b border-gray-200 dark:border-gray-700 space-y-2">
              <div className="grid grid-cols-3 gap-2">
                <div className="text-center p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                  <p className="text-lg font-bold text-blue-600">{data?.pings.length ?? 0}</p>
                  <p className="text-xs text-gray-500">GPS Pings</p>
                </div>
                <div className="text-center p-2 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
                  <p className="text-lg font-bold text-orange-600">{data?.leads.length ?? 0}</p>
                  <p className="text-xs text-gray-500">Leads</p>
                </div>
                <div className="text-center p-2 bg-green-50 dark:bg-green-900/20 rounded-lg">
                  <p className="text-lg font-bold text-green-600">{completedStreets}/{totalStreets}</p>
                  <p className="text-xs text-gray-500">Streets</p>
                </div>
              </div>
            </div>

            {/* Street checklist */}
            <div className="flex-1 overflow-y-auto p-4">
              <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Street Coverage</h4>
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
                </div>
              ) : (
                <div className="space-y-1">
                  {data?.streets.map(street => (
                    <div key={street.id} className="flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800">
                      {street.status === 'completed' ? (
                        <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                      ) : street.status === 'in_progress' ? (
                        <Clock className="w-4 h-4 text-yellow-500 shrink-0" />
                      ) : (
                        <Circle className="w-4 h-4 text-gray-300 shrink-0" />
                      )}
                      <span className="text-sm text-gray-700 dark:text-gray-300 truncate">
                        {street.nameEn || street.nameAr || 'Unnamed'}
                      </span>
                    </div>
                  ))}
                  {data?.streets.length === 0 && (
                    <p className="text-sm text-gray-400 text-center py-4">No streets in this district</p>
                  )}
                </div>
              )}
            </div>

            {/* Legend */}
            <div className="p-4 border-t border-gray-200 dark:border-gray-700 space-y-1.5 text-xs text-gray-500">
              <div className="flex items-center gap-2">
                <div className="w-6 h-0.5 bg-blue-500 rounded" />
                <span>Driver GPS trail</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-orange-500" />
                <span>Lead captured</span>
              </div>
            </div>
          </div>

          {/* Map */}
          <div className="flex-1 relative">
            {loading && (
              <div className="absolute inset-0 bg-white/60 dark:bg-gray-900/60 z-[1000] flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
              </div>
            )}
            <MapContainer
              center={[24.7, 46.7]}
              zoom={13}
              style={{ width: '100%', height: '100%' }}
              scrollWheelZoom
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />

              {allPoints.length > 0 && <MapBoundsUpdater positions={allPoints} />}

              {trailPoints.length > 1 && (
                <Polyline
                  positions={trailPoints}
                  pathOptions={{ color: '#3b82f6', weight: 4, opacity: 0.8 }}
                />
              )}

              {trailPoints.length > 0 && (
                <>
                  <CircleMarker
                    center={trailPoints[0]}
                    radius={6}
                    pathOptions={{ color: '#16a34a', fillColor: '#22c55e', fillOpacity: 1, weight: 2 }}
                  >
                    <Popup><span className="text-xs font-semibold">Start</span></Popup>
                  </CircleMarker>
                  <CircleMarker
                    center={trailPoints[trailPoints.length - 1]}
                    radius={6}
                    pathOptions={{ color: '#dc2626', fillColor: '#ef4444', fillOpacity: 1, weight: 2 }}
                  >
                    <Popup><span className="text-xs font-semibold">Current / End</span></Popup>
                  </CircleMarker>
                </>
              )}

              {data?.leads.map(lead => (
                <CircleMarker
                  key={lead.id}
                  center={[Number(lead.location_lat), Number(lead.location_lng)]}
                  radius={8}
                  pathOptions={{ color: '#ea580c', fillColor: '#f97316', fillOpacity: 0.9, weight: 2 }}
                >
                  <Popup>
                    <div className="min-w-[200px] max-w-[280px]">
                      <p className="font-bold text-sm text-gray-900 mb-1">
                        {lead.site_name || 'Construction Site'}
                      </p>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded">
                          {phaseLabel(lead.phase)}
                        </span>
                        <span className="text-xs text-gray-500">
                          {new Date(lead.created_at).toLocaleTimeString()}
                        </span>
                      </div>
                      {lead.photos.length > 0 && (
                        <div className="flex gap-1 flex-wrap mt-2">
                          {lead.photos.slice(0, 4).map((photo, i) => (
                            <img
                              key={i}
                              src={photo.storageUrl}
                              alt={photo.photoType}
                              className="w-14 h-14 object-cover rounded border border-gray-200"
                              onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                            />
                          ))}
                          {lead.photos.length > 4 && (
                            <div className="w-14 h-14 bg-gray-100 rounded border border-gray-200 flex items-center justify-center">
                              <span className="text-xs text-gray-500">+{lead.photos.length - 4}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </Popup>
                </CircleMarker>
              ))}
            </MapContainer>

            {!loading && data && trailPoints.length === 0 && data.leads.length === 0 && (
              <div className="absolute inset-0 z-[500] flex items-center justify-center pointer-events-none">
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg px-6 py-4 text-center pointer-events-auto">
                  <Navigation className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                  <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">No activity data</p>
                  <p className="text-xs text-gray-500 mt-1">No GPS pings or leads found for this date</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
