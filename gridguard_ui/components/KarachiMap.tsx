'use client';
import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Substation coordinates (approximate K-Electric zones in Karachi)
const SUBSTATIONS: Record<string, [number, number]> = {
  'Bahadurabad Substation':       [24.8800, 67.0600],
  'Buffer Zone Substation':       [24.9500, 67.0400],
  'Clifton Block 8 Substation':   [24.8100, 67.0200],
  'Clifton Substation':           [24.8050, 67.0300],
  'Defence Substation':           [24.7900, 67.0600],
  'F.B Industrial Substation':    [24.9450, 67.0650],
  'Garden Substation':            [24.8650, 67.0150],
  'Gulberg Substation':           [24.9000, 67.0750],
  'Gulshan-e-Iqbal Substation':   [24.9250, 67.1050],
  'Gulshan-e-Maymar Substation':  [24.9850, 67.1300],
  'Karachi Port Substation':      [24.8200, 66.9900],
  'Korangi Creek Substation':     [24.8000, 67.1300],
  'Korangi Industrial Substation':[24.8300, 67.1150],
  'Korangi No. 2 Substation':     [24.8150, 67.1200],
  'Korangi Substation':           [24.8250, 67.1050],
  'Landhi Substation':            [24.8600, 67.1500],
  'Liaquatabad Substation':       [24.9100, 67.0450],
  'Malir Cantonment Substation':  [24.8750, 67.1700],
  'Malir Substation':             [24.8900, 67.1650],
  'Mehmoodabad Substation':       [24.8500, 67.0800],
  'North Karachi Substation':     [24.9700, 67.0600],
  'North Nazimabad Substation':   [24.9400, 67.0250],
  'Numaish Substation':           [24.8700, 67.0100],
  'Orangi Substation':            [24.9300, 66.9950],
  'PECHS Substation':             [24.8750, 67.0650],
  'SITE Substation':              [24.9050, 67.0000],
  'Saddar Substation':            [24.8550, 67.0200],
  'Shah Faisal Substation':       [24.8650, 67.1350],
  'Soldier Bazaar Substation':    [24.8800, 67.0350],
  'Tariq Road Substation':        [24.8700, 67.0500],
};

// Custom icon factory
const makeIcon = (color: string, size = 10) =>
  L.divIcon({
    className: '',
    html: `<div style="
      width:${size}px;height:${size}px;border-radius:50%;
      background:${color};
      border:2px solid rgba(255,255,255,0.4);
      box-shadow:0 0 8px ${color};
    "></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });

const faultIcon = L.divIcon({
  className: '',
  html: `<div style="
    width:18px;height:18px;border-radius:50%;
    background:#FF3B5C;
    border:2px solid #FF6070;
    box-shadow:0 0 16px #FF3B5C, 0 0 32px #FF3B5C80;
    animation: pulse 1.5s ease-in-out infinite;
  "></div>
  <style>@keyframes pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.3)}}</style>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

function MapController({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => { map.setView(center, map.getZoom(), { animate: true }); }, [center, map]);
  return null;
}

interface Props {
  faultZone: string | null;
  faultDistance?: number;
}

export default function KarachiMap({ faultZone, faultDistance }: Props) {
  const defaultCenter: [number, number] = [24.8607, 67.0011];
  const faultCoords = faultZone ? SUBSTATIONS[faultZone] : null;
  const mapCenter = faultCoords || defaultCenter;

  const nearbySubstations = faultCoords
    ? Object.entries(SUBSTATIONS)
        .filter(([name]) => name !== faultZone)
        .map(([name, coords]) => {
          const dist = Math.sqrt(
            Math.pow((coords[0] - faultCoords[0]) * 111, 2) +
            Math.pow((coords[1] - faultCoords[1]) * 111, 2)
          );
          return { name, coords, dist };
        })
        .filter(s => s.dist < 5)
        .slice(0, 5)
    : [];

  return (
    <MapContainer
      center={mapCenter}
      zoom={11}
      style={{ height: '100%', width: '100%' }}
      zoomControl={true}
      attributionControl={false}
    >
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <MapController center={mapCenter} />

      {/* All substations as small dots */}
      {Object.entries(SUBSTATIONS).map(([name, coords]) => (
        <Marker key={name} position={coords} icon={makeIcon('#2E4560', 8)}>
          <Popup>
            <div style={{ fontFamily: 'monospace', fontSize: 11, background: '#111820', color: '#E8F0F8', padding: 8, borderRadius: 4 }}>
              <strong>{name}</strong>
            </div>
          </Popup>
        </Marker>
      ))}

      {/* Nearby substations */}
      {nearbySubstations.map(({ name, coords }) => (
        <Marker key={`nearby-${name}`} position={coords} icon={makeIcon('#FFAA00', 12)}>
          <Popup>
            <div style={{ fontFamily: 'monospace', fontSize: 11, background: '#111820', color: '#E8F0F8', padding: 8, borderRadius: 4 }}>
              <div style={{ color: '#FFAA00' }}>NEARBY</div>
              <strong>{name}</strong>
              <div>{nearbySubstations.find(s => s.name === name)?.dist.toFixed(1)} km from fault</div>
            </div>
          </Popup>
        </Marker>
      ))}

      {/* Fault zone */}
      {faultCoords && (
        <>
          <Marker position={faultCoords} icon={faultIcon}>
            <Popup>
              <div style={{ fontFamily: 'monospace', fontSize: 11, background: '#111820', color: '#E8F0F8', padding: 8, borderRadius: 4 }}>
                <div style={{ color: '#FF3B5C', fontWeight: 700 }}>⚠ FAULT ZONE</div>
                <div>{faultZone}</div>
                {faultDistance && <div>Distance: {faultDistance} km</div>}
              </div>
            </Popup>
          </Marker>
          <Circle
            center={faultCoords}
            radius={(faultDistance || 5) * 300}
            pathOptions={{ color: '#FF3B5C', fillColor: '#FF3B5C', fillOpacity: 0.08, weight: 1, dashArray: '4 4' }}
          />
        </>
      )}
    </MapContainer>
  );
}
