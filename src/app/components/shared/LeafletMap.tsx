'use client';

import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet';

// Fix Leaflet default icon URLs using CDN
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

type MarkerStatus = 'active' | 'idle' | 'offline';

interface MarkerData {
  id: string;
  lat: number;
  lng: number;
  title: string;
  status?: MarkerStatus;
  popup?: string;
}

interface Props {
  center: [number, number];
  zoom?: number;
  markers?: MarkerData[];
  height?: string;
  className?: string;
  onMarkerClick?: (id: string) => void;
}

const STATUS_COLORS: Record<MarkerStatus | 'default', string> = {
  active: '#22c55e',   // green-500
  idle: '#eab308',     // yellow-500
  offline: '#6b7280',  // gray-500
  default: '#3b82f6',  // blue-500
};

function getMarkerColor(status?: MarkerStatus): string {
  return STATUS_COLORS[status ?? 'default'];
}

export function LeafletMap({
  center,
  zoom = 12,
  markers = [],
  height = 'h-96',
  className,
  onMarkerClick,
}: Props) {
  return (
    <div className={`w-full ${height} ${className ?? ''}`.trim()}>
      <MapContainer
        center={center}
        zoom={zoom}
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {markers.map((marker) => (
          <CircleMarker
            key={marker.id}
            center={[marker.lat, marker.lng]}
            radius={10}
            pathOptions={{
              color: getMarkerColor(marker.status),
              fillColor: getMarkerColor(marker.status),
              fillOpacity: 0.85,
              weight: 2,
            }}
            eventHandlers={{
              click: () => onMarkerClick?.(marker.id),
            }}
          >
            <Popup>
              <div className="text-sm">
                <p className="font-semibold">{marker.title}</p>
                {marker.status && (
                  <p className="capitalize text-gray-500">{marker.status}</p>
                )}
                {marker.popup && <p className="mt-1">{marker.popup}</p>}
              </div>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  );
}
