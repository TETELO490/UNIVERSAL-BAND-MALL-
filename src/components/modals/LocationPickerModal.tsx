import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { X, MapPin, Check, Navigation, Compass } from 'lucide-react';
import { formatGeolocationError, isBannedLocation } from '../../utils/gpsHelper';
import { ensureLocationPermission } from '../../utils/nativePermissions';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../../firebase';

interface LocationPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectLocation: (address: string, coords?: { lat: number; lng: number }) => void;
  initialAddress?: string;
}

const DEFAULT_CENTER: [number, number] = [-23.9045, 29.4688]; // Polokwane CBD, Limpopo

export const LocationPickerModal: React.FC<LocationPickerModalProps> = ({
  isOpen,
  onClose,
  onSelectLocation,
  initialAddress,
}) => {
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);

  const [selectedCoords, setSelectedCoords] = useState<{ lat: number; lng: number }>({
    lat: DEFAULT_CENTER[0],
    lng: DEFAULT_CENTER[1],
  });
  const [addressPreview, setAddressPreview] = useState<string>('Polokwane CBD, Limpopo');
  const [isResolving, setIsResolving] = useState<boolean>(false);
  const [searchInput, setSearchInput] = useState<string>('');
  const [isSearching, setIsSearching] = useState<boolean>(false);

  const handleSearchAddress = async (queryStr: string) => {
    if (!queryStr || queryStr.trim().length < 2) return;
    setIsSearching(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(queryStr + ', Limpopo, South Africa')}&limit=1`,
        { headers: { Accept: 'application/json' } }
      );
      if (res.ok) {
        const list = await res.json();
        if (list && list[0]) {
          const lat = parseFloat(list[0].lat);
          const lon = parseFloat(list[0].lon);
          setSelectedCoords({ lat, lng: lon });
          if (mapRef.current && markerRef.current) {
            mapRef.current.setView([lat, lon], 16);
            markerRef.current.setLatLng([lat, lon]);
          }
          const cleanName = list[0].display_name.split(',').slice(0, 3).join(',').trim();
          setAddressPreview(`${cleanName} (${lat.toFixed(4)}, ${lon.toFixed(4)})`);
        }
      }
    } catch (_) {}
    setIsSearching(false);
  };

  const resolveAddressFromCoords = async (lat: number, lng: number) => {
    setIsResolving(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
        { headers: { Accept: 'application/json' } }
      );
      if (res.ok) {
        const data = await res.json();
        if (data && data.display_name) {
          const parts = data.display_name.split(',').slice(0, 3).join(',').trim();
          setAddressPreview(`${parts} (${lat.toFixed(4)}, ${lng.toFixed(4)})`);
          setIsResolving(false);
          return;
        }
      }
    } catch (_) {}

    // Fallback format
    setAddressPreview(`GPS Location (${lat.toFixed(5)}, ${lng.toFixed(5)})`);
    setIsResolving(false);
  };

  useEffect(() => {
    if (!isOpen) return;

    const timer = setTimeout(() => {
      if (mapContainerRef.current && !mapRef.current) {
        const map = L.map(mapContainerRef.current, {
          center: DEFAULT_CENTER,
          zoom: 14,
          zoomControl: true,
        });

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '© OpenStreetMap',
        }).addTo(map);

        const pinIcon = L.divIcon({
          className: 'ub-map-pin',
          html: `<div style="background-color: #D32F2F; color: white; width: 38px; height: 38px; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 6px 14px rgba(211,47,47,0.45); border: 3px solid white; font-size: 18px; transform: translate(-50%, -50%); cursor: grab;">📍</div>`,
          iconSize: [38, 38],
          iconAnchor: [19, 19],
        });

        const marker = L.marker(DEFAULT_CENTER, {
          draggable: true,
          icon: pinIcon,
        }).addTo(map);

        markerRef.current = marker;
        mapRef.current = map;

        marker.on('dragend', (e) => {
          const latlng = e.target.getLatLng();
          setSelectedCoords({ lat: latlng.lat, lng: latlng.lng });
          resolveAddressFromCoords(latlng.lat, latlng.lng);
        });

        map.on('click', (e) => {
          marker.setLatLng(e.latlng);
          setSelectedCoords({ lat: e.latlng.lat, lng: e.latlng.lng });
          resolveAddressFromCoords(e.latlng.lat, e.latlng.lng);
        });

        resolveAddressFromCoords(DEFAULT_CENTER[0], DEFAULT_CENTER[1]);
      }
    }, 100);

    return () => {
      clearTimeout(timer);
      if (watchIdRef.current !== null && typeof navigator !== 'undefined' && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markerRef.current = null;
      }
    };
  }, [isOpen]);

  const watchIdRef = useRef<number | null>(null);

  const handleLocateMe = async () => {
    setIsResolving(true);
    const perm = await ensureLocationPermission();
    if (!perm.granted) {
      setAddressPreview(perm.message || '📍 Allow PRECISE location + Turn on Location');
      setIsResolving(false);
      return;
    }

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setAddressPreview("GPS is not supported on this device/browser");
      setIsResolving(false);
      return;
    }

    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }

    setAddressPreview("Searching REAL house... go outside, wait 20 sec...");

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        const acc = position.coords.accuracy;

        console.log("Accuracy:", position.coords.accuracy + "m");

        // BLOCK fake Gemsbokspruit location -25.3273, 28.9422
        if (isBannedLocation(lat, lng)) {
          setAddressPreview("❌ Fake location blocked - Go OUTSIDE for real GPS");
          if (watchIdRef.current !== null) {
            navigator.geolocation.clearWatch(watchIdRef.current);
            watchIdRef.current = null;
          }
          setIsResolving(false);
          return;
        }

        // Only save when accuracy < 25m = your real house
        if (acc >= 25) {
          // FAR - reject it, keep watching
          setAddressPreview(`Still NEAR ${Math.round(acc)}m - Go outside Boss, wait... (Need < 25m)`);
          return;
        }

        // REAL - accept it
        console.log("EXACT FREE:", lat, lng);
        setSelectedCoords({ lat, lng });
        if (mapRef.current && markerRef.current) {
          mapRef.current.setView([lat, lng], 18); // Zoom to house level
          markerRef.current.setLatLng([lat, lng]);
        }

        (window as any).currentDeliveryLat = lat;
        (window as any).currentDeliveryLng = lng;

        setAddressPreview(`✅ EXACT FREE HOUSE ${Math.round(acc)}m`);
        resolveAddressFromCoords(lat, lng);

        // Save lat,lng to Firebase here
        try {
          setDoc(doc(db, 'customer_locations', 'latest'), {
            lat,
            lng,
            accuracy: acc,
            source: 'exact_free_gps',
            updatedAt: Date.now()
          }, { merge: true });
        } catch (_) {}

        if (watchIdRef.current !== null) {
          navigator.geolocation.clearWatch(watchIdRef.current);
          watchIdRef.current = null;
        }
      },
      (error) => {
        const friendlyMsg = formatGeolocationError(error);
        console.warn("Geolocation notice:", friendlyMsg);
        setAddressPreview("📍 Allow PRECISE location + Turn on Location + Go outside");
        setIsResolving(false);
        if (watchIdRef.current !== null) {
          navigator.geolocation.clearWatch(watchIdRef.current);
          watchIdRef.current = null;
        }
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 30000
      }
    );
  };

  const handleQuickPreset = (lat: number, lng: number, name: string) => {
    setSelectedCoords({ lat, lng });
    setAddressPreview(`${name} (${lat.toFixed(4)}, ${lng.toFixed(4)})`);
    if (mapRef.current && markerRef.current) {
      mapRef.current.setView([lat, lng], 15);
      markerRef.current.setLatLng([lat, lng]);
    }
  };

  const handleConfirm = () => {
    onSelectLocation(addressPreview, selectedCoords);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/80 backdrop-blur-sm p-3 animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-white text-gray-900 rounded-3xl overflow-hidden shadow-2xl flex flex-col h-[85vh] border border-gray-200 relative">
        {/* Header */}
        <div className="bg-[#0D47A1] text-white p-3.5 flex items-center justify-between shrink-0 shadow-md">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center">
              <Compass className="w-4 h-4 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-black tracking-tight leading-tight">Pick Delivery Location</h3>
              <p className="text-[10px] text-blue-100">Tap anywhere on map or drag pin</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center cursor-pointer transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Address Search Input Box & Real GPS Button */}
        <div className="p-2.5 bg-gray-100 border-b border-gray-200 space-y-2 shrink-0">
          <div className="relative">
            <input
              id="addressInput"
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSearchAddress(searchInput);
                }
              }}
              placeholder="Enter or search street address..."
              className="w-full bg-white border-2 border-gray-300 focus:border-[#0D47A1] rounded-xl px-3.5 py-2 text-xs font-bold text-gray-900 focus:outline-none shadow-xs"
            />
            <button
              type="button"
              onClick={() => handleSearchAddress(searchInput)}
              disabled={isSearching}
              className="absolute right-1.5 top-1.5 bottom-1.5 px-3 bg-[#0D47A1] hover:bg-blue-900 text-white rounded-lg text-[10px] font-black cursor-pointer transition disabled:opacity-50"
            >
              {isSearching ? 'Searching...' : 'Search'}
            </button>
          </div>

          <button
            type="button"
            onClick={handleLocateMe}
            className="w-full py-2.5 px-3 bg-black hover:bg-gray-900 active:scale-98 text-white font-black text-xs rounded-xl shadow-md transition flex items-center justify-center gap-2 cursor-pointer border border-gray-800"
          >
            <Navigation className="w-4 h-4 text-emerald-400" />
            <span>📍 Use My Current Location (REAL GPS)</span>
          </button>
        </div>

        {/* Quick Area Presets */}
        <div className="bg-gray-50 border-b border-gray-200 p-2 overflow-x-auto no-scrollbar flex items-center gap-1.5 shrink-0 text-xs">
          <button
            type="button"
            onClick={() => handleQuickPreset(-23.9045, 29.4688, 'Polokwane CBD')}
            className="px-2.5 py-1 rounded-lg bg-white border border-gray-200 hover:bg-blue-50 text-[11px] font-bold shrink-0 cursor-pointer text-[#0D47A1]"
          >
            🏢 Polokwane CBD
          </button>
          <button
            type="button"
            onClick={() => handleQuickPreset(-23.8569, 29.3905, 'Seshego')}
            className="px-2.5 py-1 rounded-lg bg-white border border-gray-200 hover:bg-blue-50 text-[11px] font-bold shrink-0 cursor-pointer text-[#0D47A1]"
          >
            🏘️ Seshego
          </button>
          <button
            type="button"
            onClick={() => handleQuickPreset(-23.8967, 29.7289, 'Mankweng')}
            className="px-2.5 py-1 rounded-lg bg-white border border-gray-200 hover:bg-blue-50 text-[11px] font-bold shrink-0 cursor-pointer text-[#0D47A1]"
          >
            🎓 Mankweng
          </button>
          <button
            type="button"
            onClick={() => handleQuickPreset(-23.9161, 29.482, 'Flora Park')}
            className="px-2.5 py-1 rounded-lg bg-white border border-gray-200 hover:bg-blue-50 text-[11px] font-bold shrink-0 cursor-pointer text-[#0D47A1]"
          >
            🏡 Flora Park
          </button>
          <button
            type="button"
            onClick={() => handleQuickPreset(-23.8825, 29.4975, 'Mall of the North')}
            className="px-2.5 py-1 rounded-lg bg-white border border-gray-200 hover:bg-blue-50 text-[11px] font-bold shrink-0 cursor-pointer text-[#0D47A1]"
          >
            🛍️ Mall of the North
          </button>
        </div>

        {/* Leaflet Map Canvas */}
        <div ref={mapContainerRef} className="flex-1 w-full bg-gray-100 relative" />

        {/* Selected Location Card & Confirm */}
        <div className="p-3.5 bg-white border-t border-gray-200 shrink-0 space-y-2.5">
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-2.5 flex items-start gap-2">
            <MapPin className="w-4 h-4 text-[#D32F2F] shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <span className="text-[10px] font-bold uppercase text-gray-500 tracking-wider block">
                Selected Drop-off Location
              </span>
              <p className="text-xs font-black text-gray-900 truncate">
                {isResolving ? 'Resolving street name...' : addressPreview}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleConfirm}
            className="w-full py-3 bg-[#D32F2F] hover:bg-red-700 active:scale-98 text-white font-black text-xs rounded-xl shadow-md transition flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Check className="w-4 h-4" />
            <span>Confirm Delivery Location</span>
          </button>
        </div>
      </div>
    </div>
  );
};
