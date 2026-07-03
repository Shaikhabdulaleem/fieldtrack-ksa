import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { MapContainer, TileLayer, Marker, Polyline, useMap } from 'react-leaflet';
import { Card, CardContent } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import {
  MapPin, Navigation, Check, X, Plus, ArrowLeft, Loader2, PlayCircle, Layers, Fuel, Target,
} from "lucide-react";
import { Link, useNavigate } from "react-router";
import { useState, useEffect, useRef, useCallback } from "react";
import { toast } from "sonner";
import { cn } from "../ui/utils";
import { getDriverToday, visitStreet, sendPing, startSurveyZone } from "../../lib/api";

delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const pulsingIcon = L.divIcon({
  className: '',
  html: `
    <div style="position:relative;width:20px;height:20px;">
      <div style="position:absolute;inset:0;background:#3b82f6;border-radius:50%;animation:ping 1.4s cubic-bezier(0,0,0.2,1) infinite;opacity:0.6;"></div>
      <div style="position:absolute;inset:2px;background:#2563eb;border-radius:50%;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.35);"></div>
    </div>
    <style>@keyframes ping{75%,100%{transform:scale(2.2);opacity:0}}</style>
  `,
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

interface StreetItem {
  id: string;
  streetId: string;
  name: string;
  nameAr: string;
  status: string;
  districtName: string;
}

function MapUpdater({ position }: { position: [number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (position) map.panTo(position, { animate: true });
  }, [position, map]);
  return null;
}

export function DriverNavigation() {
  const navigate = useNavigate();
  const [streets, setStreets] = useState<StreetItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [position, setPosition] = useState<[number, number] | null>(null);
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);
  const [trail, setTrail] = useState<[number, number][]>([]);
  const [marking, setMarking] = useState(false);
  const markingRef = useRef(false);
  const watchIdRef = useRef<number | null>(null);
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // District-Based Driver Survey Coverage Planner — today's assigned survey
  // zone context, if any. Purely additive: the flat street-by-street flow
  // below is unaffected either way.
  const [surveyZone, setSurveyZone] = useState<Record<string, unknown> | null>(null);
  const [startingZone, setStartingZone] = useState(false);

  // Load today's assigned streets
  useEffect(() => {
    getDriverToday().then(data => {
      const assignedStreets = ((data.streets as Record<string, unknown>[]) ?? [])
        .filter(s => String(s.status) !== "completed" && String(s.status) !== "skipped")
        .map(s => ({
          id: String(s.id),
          streetId: String(s.streetId),
          name: String(s.streetNameEn ?? "Unknown Street"),
          nameAr: String(s.streetNameAr ?? ""),
          status: String(s.status ?? "assigned"),
          districtName: String(s.districtName ?? ""),
        }));

      const completedStreets = ((data.streets as Record<string, unknown>[]) ?? [])
        .filter(s => String(s.status) === "completed" || String(s.status) === "skipped")
        .map(s => ({
          id: String(s.id),
          streetId: String(s.streetId),
          name: String(s.streetNameEn ?? "Unknown Street"),
          nameAr: String(s.streetNameAr ?? ""),
          status: String(s.status),
          districtName: String(s.districtName ?? ""),
        }));

      setStreets([...completedStreets, ...assignedStreets]);
      setCurrentIndex(completedStreets.length);
      setSurveyZone((data.surveyZone as Record<string, unknown> | null) ?? null);
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  const handleStartSurvey = useCallback(async () => {
    if (!surveyZone?.id) return;
    setStartingZone(true);
    try {
      await startSurveyZone(String(surveyZone.id));
      setSurveyZone(prev => prev ? { ...prev, status: "in_progress" } : prev);
      toast.success("Survey started — drive safely!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to start survey");
    } finally {
      setStartingZone(false);
    }
  }, [surveyZone]);

  // Start GPS watching + background pinging
  useEffect(() => {
    if (!navigator.geolocation) return;

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const newPos: [number, number] = [pos.coords.latitude, pos.coords.longitude];
        setPosition(newPos);
        setGpsAccuracy(Math.round(pos.coords.accuracy));
        setTrail(prev => {
          if (prev.length === 0) return [newPos];
          const last = prev[prev.length - 1];
          const dist = Math.sqrt(Math.pow(last[0] - newPos[0], 2) + Math.pow(last[1] - newPos[1], 2));
          if (dist > 0.00005) return [...prev.slice(-999), newPos];
          return prev;
        });
      },
      (err) => console.error("GPS watch error:", err),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
    );

    // Send GPS ping to server every 30 seconds
    pingIntervalRef.current = setInterval(() => {
      if (!position) return;
      sendPing({ lat: position[0], lng: position[1], accuracyMeters: gpsAccuracy ?? undefined }).catch(() => {});
    }, 30000);

    return () => {
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
    };
  }, []);

  // Send ping when position changes significantly (reuse latest position)
  const lastPingPos = useRef<[number, number] | null>(null);
  useEffect(() => {
    if (!position) return;
    if (!lastPingPos.current) {
      lastPingPos.current = position;
      sendPing({ lat: position[0], lng: position[1], accuracyMeters: gpsAccuracy ?? undefined }).catch(() => {});
      return;
    }
    const dist = Math.sqrt(
      Math.pow(lastPingPos.current[0] - position[0], 2) +
      Math.pow(lastPingPos.current[1] - position[1], 2)
    );
    if (dist > 0.0003) {
      lastPingPos.current = position;
      sendPing({ lat: position[0], lng: position[1], accuracyMeters: gpsAccuracy ?? undefined }).catch(() => {});
    }
  }, [position, gpsAccuracy]);

  const currentStreet = streets[currentIndex];

  const handleMarkVisited = useCallback(async () => {
    if (!currentStreet || marking || markingRef.current) return;
    if (gpsAccuracy !== null && gpsAccuracy > 100) {
      toast.error(`GPS signal too weak (±${gpsAccuracy}m). Move to an open area and try again.`);
      return;
    }
    if (!window.confirm(`Mark "${currentStreet.name}" as visited?`)) return;
    markingRef.current = true;
    setMarking(true);
    try {
      // GPS verification: capture current position
      const gpsLat = position?.[0];
      const gpsLng = position?.[1];

      await visitStreet(currentStreet.streetId, "completed");

      const updated = [...streets];
      updated[currentIndex] = { ...updated[currentIndex], status: "completed" };
      setStreets(updated);
      toast.success(`${currentStreet.name} marked as visited${gpsLat ? ` (GPS: ${gpsLat.toFixed(4)}, ${gpsLng?.toFixed(4)})` : ""}`);

      if (currentIndex < streets.length - 1) {
        setTimeout(() => setCurrentIndex(currentIndex + 1), 500);
      } else {
        toast.success("All streets completed for today!");
      }
    } catch (err) {
      toast.error("Failed to update street status");
    } finally {
      setMarking(false);
      markingRef.current = false;
    }
  }, [currentStreet, currentIndex, streets, position, marking]);

  const handleSkip = useCallback(async () => {
    if (!currentStreet || marking) return;
    if (!window.confirm(`Skip "${currentStreet.name}"? This cannot be undone.`)) return;
    setMarking(true);
    try {
      await visitStreet(currentStreet.streetId, "skipped", "Driver skipped");
      const updated = [...streets];
      updated[currentIndex] = { ...updated[currentIndex], status: "skipped" };
      setStreets(updated);
      toast.info(`${currentStreet.name} skipped`);
      if (currentIndex < streets.length - 1) {
        setTimeout(() => setCurrentIndex(currentIndex + 1), 500);
      }
    } catch {
      toast.error("Failed to skip street");
    } finally {
      setMarking(false);
    }
  }, [currentStreet, currentIndex, streets, marking]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (streets.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center p-4">
        <div className="text-center">
          <MapPin className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">No Streets Assigned</h2>
          <p className="text-gray-500 mb-4">You don't have any streets assigned for today.</p>
          <Button onClick={() => navigate("/driver/home")}>Back to Home</Button>
        </div>
      </div>
    );
  }

  const visitedCount = streets.filter(s => s.status === "completed").length;
  const skippedCount = streets.filter(s => s.status === "skipped").length;
  const mapCenter: [number, number] = position ?? [21.5433, 39.1728];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex flex-col">
      {/* Map with GPS trail */}
      <div className="relative h-56 w-full">
        <MapContainer
          center={mapCenter}
          zoom={16}
          attributionControl={false}
          zoomControl={false}
          style={{ height: '100%', width: '100%' }}
        >
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <MapUpdater position={position} />

          {/* GPS trail polyline */}
          {trail.length > 1 && (
            <Polyline
              positions={trail}
              pathOptions={{ color: '#3b82f6', weight: 4, opacity: 0.8 }}
            />
          )}

          {/* Driver current position */}
          {position && <Marker position={position} icon={pulsingIcon} />}
        </MapContainer>

        <div className="absolute top-4 left-4 z-[1000]">
          <Button variant="secondary" size="icon" onClick={() => navigate("/driver/home")}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </div>

        {/* GPS status indicator */}
        <div className="absolute top-4 right-4 z-[1000] bg-white dark:bg-gray-900 rounded-lg shadow-lg p-2">
          {(() => {
            const acc = gpsAccuracy;
            const dot = acc === null ? "bg-red-400" : acc < 20 ? "bg-green-400" : acc <= 50 ? "bg-yellow-400" : "bg-red-400";
            const label = acc === null ? "GPS Off" : acc < 20 ? `Good ±${acc}m` : acc <= 50 ? `Fair ±${acc}m` : `Weak ±${acc}m`;
            const color = acc === null ? "text-red-500" : acc < 20 ? "text-green-600" : acc <= 50 ? "text-yellow-600" : "text-red-500";
            return (
              <div className="flex items-center gap-1.5">
                <div className={`w-2.5 h-2.5 rounded-full ${dot} ${acc !== null ? "animate-pulse" : ""}`} />
                <span className={`text-xs font-medium ${color}`}>{label}</span>
              </div>
            );
          })()}
          {trail.length > 0 && (
            <p className="text-xs text-gray-400 mt-1">{trail.length} points tracked</p>
          )}
        </div>
      </div>

      {/* District-Based Driver Survey Coverage Planner — zone context banner */}
      {surveyZone && (
        <div className="bg-blue-600 text-white px-4 py-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Layers className="w-5 h-5 shrink-0" />
              <div>
                <p className="font-semibold text-sm">
                  {String(surveyZone.label ?? "Survey Zone")} — {String(surveyZone.districtName ?? "")}
                </p>
                <div className="flex items-center gap-3 text-xs text-blue-100 mt-0.5">
                  <span className="flex items-center gap-1"><Target className="w-3 h-3" /> {Number(surveyZone.targetKm ?? 0).toFixed(1)} km target</span>
                  {surveyZone.petrolAmount != null && (
                    <span className="flex items-center gap-1"><Fuel className="w-3 h-3" /> {Number(surveyZone.petrolAmount)} SAR</span>
                  )}
                  {surveyZone.expectedLeads != null && <span>{Number(surveyZone.expectedLeads)} expected leads</span>}
                </div>
              </div>
            </div>
            {surveyZone.status === "assigned" && (
              <Button size="sm" variant="secondary" onClick={handleStartSurvey} disabled={startingZone}>
                {startingZone ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <PlayCircle className="w-4 h-4 mr-1.5" />}
                Start Survey
              </Button>
            )}
            {surveyZone.status === "in_progress" && streets.length > 0 && streets.every(s => s.status === "completed" || s.status === "skipped") && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => navigate("/driver/survey-complete", {
                  state: {
                    zoneId: String(surveyZone.id),
                    label: String(surveyZone.label ?? ""),
                    targetKm: Number(surveyZone.targetKm ?? 0),
                    districtName: String(surveyZone.districtName ?? ""),
                  },
                })}
              >
                <Check className="w-4 h-4 mr-1.5" />
                Complete Task
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Current Street Info */}
      {currentStreet && currentIndex < streets.length && (
        <>
          <div className="bg-white dark:bg-gray-900 shadow px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MapPin className="w-5 h-5 text-red-500 fill-red-500 shrink-0" />
              <div>
                <h2 className="text-base font-bold text-gray-900 dark:text-white leading-tight">
                  {currentStreet.name}
                </h2>
                <p className="text-xs text-gray-500">{currentStreet.nameAr}</p>
                {currentStreet.districtName && (
                  <p className="text-xs text-blue-600 font-medium">{currentStreet.districtName}</p>
                )}
              </div>
            </div>
            <Badge variant="default" className="text-sm ml-2 shrink-0">
              {currentIndex + 1}/{streets.length}
            </Badge>
          </div>

          {/* Actions */}
          <div className="flex-1 p-4 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Button
                variant="outline"
                size="lg"
                className="h-20 flex-col gap-2"
                onClick={handleMarkVisited}
                disabled={marking}
              >
                {marking ? <Loader2 className="w-6 h-6 animate-spin" /> : <Check className="w-6 h-6 text-green-600" />}
                <span className="text-sm">Mark Visited</span>
              </Button>
              <Link to="/driver/lead-form" className="block">
                <Button variant="default" size="lg" className="w-full h-20 flex-col gap-2">
                  <Plus className="w-6 h-6" />
                  <span className="text-sm">Lead Found</span>
                </Button>
              </Link>
            </div>

            <Button variant="ghost" size="lg" className="w-full h-16" onClick={handleSkip} disabled={marking}>
              <X className="w-5 h-5 mr-2" />
              Skip This Street
            </Button>
          </div>
        </>
      )}

      {/* Street List */}
      <div className="p-4 pb-24">
        <Card>
          <CardContent className="pt-4">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-3">Streets to Cover</h3>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {streets.map((street, idx) => (
                <div
                  key={street.id}
                  className={cn(
                    "flex items-center justify-between p-3 rounded-lg transition-all",
                    idx === currentIndex
                      ? "bg-blue-50 dark:bg-blue-950 border-2 border-blue-500"
                      : street.status === "completed"
                      ? "bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-900"
                      : street.status === "skipped"
                      ? "bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700"
                      : "bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold",
                      idx === currentIndex ? "bg-blue-600 text-white"
                        : street.status === "completed" ? "bg-green-600 text-white"
                        : "bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400"
                    )}>
                      {street.status === "completed" ? <Check className="w-4 h-4" /> : idx + 1}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">{street.name}</p>
                      <p className="text-xs text-gray-500">{street.nameAr}</p>
                    </div>
                  </div>
                  {idx === currentIndex && <Badge variant="default" className="text-xs">Current</Badge>}
                  {street.status === "completed" && <Badge variant="outline" className="text-xs text-green-600">Visited</Badge>}
                  {street.status === "skipped" && <Badge variant="outline" className="text-xs text-gray-500">Skipped</Badge>}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mt-4">
          <div className="bg-green-50 dark:bg-green-950 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-green-600">{visitedCount}</p>
            <p className="text-xs text-gray-500">Visited</p>
          </div>
          <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-gray-600">{skippedCount}</p>
            <p className="text-xs text-gray-500">Skipped</p>
          </div>
          <div className="bg-blue-50 dark:bg-blue-950 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-blue-600">{streets.length - visitedCount - skippedCount}</p>
            <p className="text-xs text-gray-500">Remaining</p>
          </div>
        </div>
      </div>
    </div>
  );
}
