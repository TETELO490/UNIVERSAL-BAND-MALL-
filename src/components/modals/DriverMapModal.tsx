import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { X, MapPin, Navigation } from 'lucide-react';
import { ensureLocationPermission } from '../../utils/nativePermissions';

interface DriverMapModalProps {
  isOpen: boolean;
  onClose: () => void;
  storeLat?: number;
  storeLng?: number;
  customerLat?: number;
  customerLng?: number;
  driverLat?: number;
  driverLng?: number;
  storeLabel?: string;
  customerLabel?: string;
}

export const DriverMapModal: React.FC<DriverMapModalProps> = ({
  isOpen,
  onClose,
  storeLat,
  storeLng,
  customerLat,
  customerLng,
  driverLat,
  driverLng,
  storeLabel,
  customerLabel,
}) => {
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const [liveDriverCoords, setLiveDriverCoords] = useState<{ lat: number; lng: number } | null>(
    typeof driverLat === 'number' && typeof driverLng === 'number'
      ? { lat: driverLat, lng: driverLng }
      : null
  );
  const [geoStatus, setGeoStatus] = useState<string>('');

  useEffect(() => {
    if (!isOpen) return;
    if (typeof driverLat === 'number' && typeof driverLng === 'number') {
      setLiveDriverCoords({ lat: driverLat, lng: driverLng });
      return;
    }

    let cancelled = false;
    void (async () => {
      const perm = await ensureLocationPermission();
      if (!perm.granted) {
        if (!cancelled) {
          setGeoStatus(perm.message || 'Location permission needed.');
        }
        return;
      }

      if (!cancelled && typeof navigator !== 'undefined' && 'geolocation' in navigator) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            if (!cancelled) {
              setLiveDriverCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
              setGeoStatus('');
            }
          },
          (err) => {
            if (!cancelled) {
              setGeoStatus(err.message || 'Location permission unavailable.');
            }
          },
          { enableHighAccuracy: true, timeout: 8000 }
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen, driverLat, driverLng]);

  const centerCoords: [number, number] | null = liveDriverCoords
    ? [liveDriverCoords.lat, liveDriverCoords.lng]
    : typeof storeLat === 'number' && typeof storeLng === 'number'
    ? [storeLat, storeLng]
    : typeof customerLat === 'number' && typeof customerLng === 'number'
    ? [customerLat, customerLng]
    : null;

  useEffect(() => {
    if (isOpen && mapContainerRef.current && !mapRef.current && centerCoords) {
      const map = L.map(mapContainerRef.current).setView(centerCoords, 14);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
      }).addTo(map);

      const shopIcon = L.divIcon({
        className: 'shop-marker',
        html: `<div style="background-color: #D32F2F; color: white; width: 34px; height: 34px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 16px; border: 2px solid white; box-shadow: 0 4px 10px rgba(0,0,0,0.3); transform: translate(-50%, -50%);">🏪</div>`,
        iconSize: [34, 34],
        iconAnchor: [17, 17],
      });

      const customerIcon = L.divIcon({
        className: 'customer-marker',
        html: `<div style="background-color: #10B981; color: white; width: 34px; height: 34px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 16px; border: 2px solid white; box-shadow: 0 4px 10px rgba(0,0,0,0.3); transform: translate(-50%, -50%);">🏠</div>`,
        iconSize: [34, 34],
        iconAnchor: [17, 17],
      });

      const driverIcon = L.divIcon({
        className: 'driver-marker',
        html: `<div style="background-color: #0D47A1; color: white; width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 18px; border: 3px solid white; box-shadow: 0 4px 12px rgba(13,71,161,0.5); transform: translate(-50%, -50%);">🛵</div>`,
        iconSize: [36, 36],
        iconAnchor: [18, 18],
      });

      if (typeof storeLat === 'number' && typeof storeLng === 'number') {
        L.marker([storeLat, storeLng], { icon: shopIcon }).addTo(map).bindPopup(`<b>SHOP</b><br>${storeLabel || 'Pickup Order'}`);
      }
      if (typeof customerLat === 'number' && typeof customerLng === 'number') {
        L.marker([customerLat, customerLng], { icon: customerIcon }).addTo(map).bindPopup(`<b>CUSTOMER</b><br>${customerLabel || 'Delivery Drop-off'}`);
      }
      if (liveDriverCoords) {
        L.marker([liveDriverCoords.lat, liveDriverCoords.lng], { icon: driverIcon }).addTo(map).bindPopup('<b>YOU (DRIVER)</b>');
      }

      mapRef.current = map;
    }

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [isOpen, storeLat, storeLng, customerLat, customerLng, liveDriverCoords, storeLabel, customerLabel]);

  if (!isOpen) return null;

  const storeMapsUrl =
    typeof storeLat === 'number' && typeof storeLng === 'number'
      ? `https://www.google.com/maps/dir/?api=1&destination=${storeLat},${storeLng}`
      : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(storeLabel || '')}`;

  const customerMapsUrl =
    typeof customerLat === 'number' && typeof customerLng === 'number'
      ? `https://www.google.com/maps/dir/?api=1&destination=${customerLat},${customerLng}`
      : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(customerLabel || '')}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-white text-black rounded-3xl overflow-hidden shadow-2xl flex flex-col h-[90vh]">
        <div className="bg-[#0D47A1] text-white p-4 flex items-center justify-between">
          <h2 className="font-black text-sm">Delivery Navigation</h2>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-white/20"><X className="w-5 h-5" /></button>
        </div>

        {centerCoords ? (
          <div ref={mapContainerRef} className="flex-1 w-full" />
        ) : (
          <div className="flex-1 w-full flex flex-col items-center justify-center p-6 text-center bg-gray-50 text-gray-600 text-xs space-y-2">
            <MapPin className="w-8 h-8 text-[#0D47A1]" />
            <p className="font-bold text-gray-800">Enable device GPS or open Google Maps directions below.</p>
            {geoStatus && <p className="text-[11px] text-amber-700">{geoStatus}</p>}
          </div>
        )}

        <div className="p-4 bg-gray-50 flex gap-2">
          <a
            href={storeMapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 py-3 bg-[#D32F2F] text-white font-black text-xs rounded-xl flex items-center justify-center gap-2 cursor-pointer"
          >
            <MapPin className="w-4 h-4" /> To Shop
          </a>
          <a
            href={customerMapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 py-3 bg-[#10B981] text-white font-black text-xs rounded-xl flex items-center justify-center gap-2 cursor-pointer"
          >
            <Navigation className="w-4 h-4" /> To Customer
          </a>
        </div>
      </div>
    </div>
  );
};
