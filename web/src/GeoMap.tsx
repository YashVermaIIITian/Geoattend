import { useEffect, useRef } from 'react';
import { Circle, CircleMarker, MapContainer, TileLayer, useMap } from 'react-leaflet';

interface P { center: { lat: number; lng: number }; radiusM: number; me?: { lat: number; lng: number; accuracyM: number } | null; inside?: boolean | null }

function Fit({ center, me }: Pick<P, 'center' | 'me'>) {
  const map = useMap(); const done = useRef(false);
  useEffect(() => {
    if (me && !done.current) { done.current = true; map.fitBounds([[center.lat, center.lng], [me.lat, me.lng]], { padding: [50, 50], maxZoom: 19 }); }
    else if (!me) map.setView([center.lat, center.lng], 18);
  }, [center.lat, center.lng, !!me]);
  return null;
}

export default function GeoMap({ center, radiusM, me, inside }: P) {
  const color = inside == null ? '#4f46e5' : inside ? '#059669' : '#dc2626';
  return (
    <MapContainer center={[center.lat, center.lng]} zoom={18} className="h-72 w-full rounded-xl sm:h-96" scrollWheelZoom={false}>
      <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <Circle center={[center.lat, center.lng]} radius={radiusM} pathOptions={{ color, fillColor: color, fillOpacity: 0.15 }} />
      <CircleMarker center={[center.lat, center.lng]} radius={6} pathOptions={{ color: '#1e1b4b', fillOpacity: 1 }} />
      {me && <>
        <Circle center={[me.lat, me.lng]} radius={me.accuracyM} pathOptions={{ color: '#2563eb', weight: 1, fillOpacity: 0.08 }} />
        <CircleMarker center={[me.lat, me.lng]} radius={8} pathOptions={{ color: '#fff', fillColor: '#2563eb', fillOpacity: 1, weight: 2 }} />
      </>}
    </MapContainer>
  );
}
