import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { isAuthorizedAdminEmail } from '../../utils/cryptoHelper';
import L from 'leaflet';
import {
  X,
  Store as StoreIcon,
  Upload,
  Trash2,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Camera,
  ChevronDown,
  Image as ImageIcon,
  Sparkles,
  MapPin,
  Navigation,
  ExternalLink,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { fileToBase64 } from '../../utils/imageUploadHelper';
import { generateStoreSignboard } from '../../utils/signboardGenerator';
import { formatGeolocationError, isBannedLocation } from '../../utils/gpsHelper';
import { ensureLocationPermission, ensurePhotosPermission } from '../../utils/nativePermissions';

const CATEGORIES = [
  'Nightclub & Lounge',
  'Resort & Pool Club',
  'Restaurant & Bar',
  'Live Music & Arena',
  'Cocktail Bar & Rooftop',
  'Festival Grounds & Events',
  'Boutique Store & Merch',
];

export const StoreManagerModal: React.FC = () => {
  const {
    currentUser,
    firebaseUser,
    activeModal,
    setActiveModal,
    editingStore,
    setEditingStore,
    addNewStore,
    updateStore,
    deleteStore,
  } = useApp();

  const isUserLoggedIn = Boolean(
    firebaseUser ||
    (currentUser?.isRegistered && currentUser?.id && currentUser?.id !== 'guest_user') ||
    localStorage.getItem('ub_admin_session') === 'true'
  );

  const isAdmin = isUserLoggedIn && (currentUser?.role === 'Admin' || isAuthorizedAdminEmail(currentUser?.email));
  const isPromoter = isUserLoggedIn && currentUser?.role === 'Promoter';

  const isVisible = activeModal === 'store-manager' || activeModal === 'add-store';

  const [name, setName] = useState('');
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [location, setLocation] = useState('Central Hub');
  const [description, setDescription] = useState('');

  // Uploaded base64 image string (pure user-uploaded image)
  const [uploadedImage, setUploadedImage] = useState<string>('');
  const [imageFileName, setImageFileName] = useState<string>('');
  const [imagePreview, setImagePreview] = useState<string>('');

  // Optional 3D Signboard overlay toggle
  const [apply3DSignboard, setApply3DSignboard] = useState<boolean>(false);
  const [signboardImage, setSignboardImage] = useState<string>('');
  const [isGeneratingSignboard, setIsGeneratingSignboard] = useState<boolean>(false);

  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Delete confirmation
  const [confirmDelete, setConfirmDelete] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Vendor Location Grabber GPS state
  const [vendorLat, setVendorLat] = useState<number>(-25.1703);
  const [vendorLng, setVendorLng] = useState<number>(29.5252);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);

  // Populate when opening modal or editing store
  useEffect(() => {
    if (editingStore) {
      setName(editingStore.name || '');
      setCategory(editingStore.category || CATEGORIES[0]);
      setLocation(editingStore.location || 'Central Hub');
      setDescription(editingStore.description || '');
      setVendorLat(editingStore.lat || -25.1703);
      setVendorLng(editingStore.lng || 29.5252);
      // Load current store image
      const currentImg = editingStore.imageUrl || '';
      setUploadedImage(currentImg);
      setImagePreview(currentImg);
      setImageFileName('Current Store Photo');
      setApply3DSignboard(false);
      setSignboardImage('');
    } else {
      setName('');
      setCategory(CATEGORIES[0]);
      setLocation('Central Hub');
      setDescription('');
      setVendorLat(-25.1703);
      setVendorLng(29.5252);
      setUploadedImage('');
      setImagePreview('');
      setImageFileName('');
      setApply3DSignboard(false);
      setSignboardImage('');
    }
    setConfirmDelete(false);
    setErrorMessage(null);
  }, [editingStore, isVisible]);

  // Leaflet map setup for Vendor Location Pin Grabber
  useEffect(() => {
    if (!isVisible) return;

    const timer = setTimeout(() => {
      if (mapContainerRef.current && !mapRef.current) {
        const startLat = editingStore?.lat || vendorLat || -25.1703;
        const startLng = editingStore?.lng || vendorLng || 29.5252;

        const map = L.map(mapContainerRef.current, {
          center: [startLat, startLng],
          zoom: 15,
        });

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '© OpenStreetMap',
        }).addTo(map);

        const shopIcon = L.divIcon({
          className: 'vendor-shop-pin',
          html: `<div style="background-color: black; color: white; width: 38px; height: 38px; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 6px 14px rgba(0,0,0,0.5); border: 3px solid white; font-size: 18px; transform: translate(-50%, -50%); cursor: grab;">🏪</div>`,
          iconSize: [38, 38],
          iconAnchor: [19, 19],
        });

        const marker = L.marker([startLat, startLng], {
          draggable: true,
          icon: shopIcon,
          title: 'Drag to exact shop location',
        }).addTo(map);

        markerRef.current = marker;
        mapRef.current = map;

        marker.on('dragend', (e) => {
          const p = e.target.getLatLng();
          setVendorLat(p.lat);
          setVendorLng(p.lng);
        });

        map.on('click', (e) => {
          marker.setLatLng(e.latlng);
          setVendorLat(e.latlng.lat);
          setVendorLng(e.latlng.lng);
        });
      }
    }, 120);

    return () => {
      clearTimeout(timer);
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markerRef.current = null;
      }
    };
  }, [isVisible, editingStore]);

  // Capture Real GPS - Stand at Shop
  const getMyLocation = async () => {
    setErrorMessage(null);
    const perm = await ensureLocationPermission();
    if (!perm.granted) {
      setErrorMessage(perm.message || 'Location permission is required to grab shop coordinates.');
      return;
    }

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setErrorMessage('GPS is not supported on this device/browser');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const latitude = pos.coords.latitude;
        const longitude = pos.coords.longitude;

        if (isBannedLocation(latitude, longitude)) {
          setErrorMessage('❌ Fake location blocked (-25.3273, 28.9422 Gemsbokspruit) - Please stand outside at your shop.');
          return;
        }

        setVendorLat(latitude);
        setVendorLng(longitude);

        if (mapRef.current && markerRef.current) {
          mapRef.current.setView([latitude, longitude], 18);
          markerRef.current.setLatLng([latitude, longitude]);
        }
      },
      (err) => {
        const friendlyMsg = formatGeolocationError(err);
        console.warn('GPS shop location notice:', friendlyMsg);
        setErrorMessage(friendlyMsg);
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
  };

  // Handle image upload from phone camera/gallery or desktop file picker
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setErrorMessage(null);

    try {
      // 1. Immediately convert to base64 Data URL (optimized for Firestore 1MB limit)
      const base64Data = await fileToBase64(file, {
        maxWidth: 1200,
        maxHeight: 1200,
        quality: 0.88,
      });

      // 2. Immediately show preview of the exact user-uploaded image
      setUploadedImage(base64Data);
      setImagePreview(base64Data);
      setImageFileName(file.name || 'uploaded_image.jpg');

      // If 3D signboard was active, regenerate with new image
      if (apply3DSignboard && name.trim()) {
        try {
          const generated = await generateStoreSignboard(base64Data, {
            storeName: name.trim().toUpperCase(),
            category,
          });
          setSignboardImage(generated);
          setImagePreview(generated);
        } catch (err) {
          console.warn('Signboard generation note:', err);
          setImagePreview(base64Data);
        }
      }
    } catch (err: any) {
      console.error('Image processing error:', err);
      setErrorMessage(err?.message || 'Failed to process image file');
    } finally {
      setIsUploading(false);
      // Reset input value so re-uploading the same file still triggers onChange
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Toggle optional 3D Signboard (White bold letters, Red background, Glowing Blue border)
  const handleToggleSignboard = async () => {
    if (!uploadedImage) {
      setErrorMessage('Please upload an image first to preview the 3D signboard');
      return;
    }

    const nextState = !apply3DSignboard;
    setApply3DSignboard(nextState);

    if (nextState) {
      setIsGeneratingSignboard(true);
      try {
        const generated = await generateStoreSignboard(uploadedImage, {
          storeName: name.trim() || 'STORE NAME',
          category,
        });
        setSignboardImage(generated);
        setImagePreview(generated);
      } catch (err) {
        console.warn('Signboard error:', err);
        setImagePreview(uploadedImage);
      } finally {
        setIsGeneratingSignboard(false);
      }
    } else {
      // Revert to pure original uploaded image
      setImagePreview(uploadedImage);
    }
  };

  const handleClose = () => {
    setActiveModal(null);
    setEditingStore(null);
    setConfirmDelete(false);
  };

  // Save Store to Firestore & State & Local Storage
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      setErrorMessage('Please enter a Store Name');
      return;
    }

    // Strict validation: Require user to upload an image
    if (!imagePreview && !uploadedImage) {
      setErrorMessage('Please upload an image from your gallery/camera before saving');
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);

    // Final image is the user's uploaded base64 (or with 3D signboard if enabled)
    const finalImage = (apply3DSignboard && signboardImage) ? signboardImage : uploadedImage;

    const googleMapsUrl = `https://www.google.com/maps?q=${vendorLat},${vendorLng}`;

    try {
      if (editingStore) {
        await updateStore(editingStore.id, {
          name: name.trim(),
          category,
          location: location.trim() || 'Central Venue',
          imageUrl: finalImage,
          originalImageUrl: uploadedImage,
          description: description.trim(),
          lat: vendorLat,
          lng: vendorLng,
          googleMapsUrl,
        });
      } else {
        await addNewStore({
          name: name.trim(),
          category,
          location: location.trim() || 'Central Venue',
          imageUrl: finalImage,
          originalImageUrl: uploadedImage,
          description: description.trim(),
          lat: vendorLat,
          lng: vendorLng,
          googleMapsUrl,
        });
      }

      confetti({
        particleCount: 50,
        spread: 60,
        origin: { y: 0.6 },
        colors: ['#FACC15', '#22C55E', '#3B82F6', '#EF4444'],
      });

      handleClose();
    } catch (err: any) {
      console.error('Error saving store:', err);
      setErrorMessage(err?.message || 'Error saving store to database');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!editingStore) return;
    setIsSaving(true);
    try {
      await deleteStore(editingStore.id);
      handleClose();
    } catch (err: any) {
      setErrorMessage('Error deleting store: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-[#121212] border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden my-auto max-h-[94vh] flex flex-col">
        {/* Modal Header */}
        <div className="p-4 border-b border-white/10 flex items-center justify-between bg-[#181818] sticky top-0 z-10">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#FACC15]/20 border border-[#FACC15]/40 text-[#FACC15] flex items-center justify-center">
              <StoreIcon className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black text-white leading-tight">
                {editingStore ? 'Edit Store' : 'Add Store'}
              </h2>
              <p className="text-[11px] text-gray-400">
                {editingStore
                  ? 'Update venue details or upload a new photo'
                  : 'Upload your venue photo from your phone or desktop'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="/vendor-location-manager.html"
              target="_blank"
              rel="noopener noreferrer"
              className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-bold text-white flex items-center gap-1.5 border border-white/20 transition-all"
              title="Open Vendor Location Manager"
            >
              <MapPin className="w-3.5 h-3.5 text-[#FACC15]" />
              <span className="hidden sm:inline">Location Manager</span>
            </a>
            <button
              type="button"
              onClick={handleClose}
              className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/15 text-gray-300 hover:text-white flex items-center justify-center transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Modal Body / Form */}
        <form onSubmit={handleSave} className="p-4 sm:p-5 overflow-y-auto space-y-4 text-xs flex-1">
          {/* Error Banner */}
          {errorMessage && (
            <div className="p-3 rounded-xl bg-red-950/70 border border-red-500/40 text-red-200 flex items-center gap-2 text-xs">
              <AlertCircle className="w-4 h-4 flex-shrink-0 text-red-400" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* 1. Store Name Input */}
          <div>
            <label className="block text-gray-300 font-bold mb-1.5 flex items-center justify-between">
              <span>STORE NAME *</span>
              <span className="text-[10px] text-gray-500">Required</span>
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Pretoria Gold Lounge, Florence Palm"
              className="w-full bg-[#1C1C1C] border border-white/15 rounded-xl px-3.5 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-[#FACC15] focus:ring-1 focus:ring-[#FACC15] text-sm font-semibold tracking-wide"
            />
          </div>

          {/* 2. Category Dropdown */}
          <div>
            <label className="block text-gray-300 font-bold mb-1.5">
              CATEGORY DROPDOWN *
            </label>
            <div className="relative">
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full bg-[#1C1C1C] border border-white/15 rounded-xl px-3.5 py-2.5 text-white appearance-none focus:outline-none focus:border-[#FACC15] focus:ring-1 focus:ring-[#FACC15] text-xs font-semibold pr-9 cursor-pointer"
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat} className="bg-[#181818] text-white">
                    {cat}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-4 h-4 text-gray-400 absolute right-3 top-3 pointer-events-none" />
            </div>
          </div>

          {/* 3. Image Upload Section (accept="image/*" with Immediate Preview) */}
          <div className="space-y-2">
            <label className="block text-gray-300 font-bold flex items-center justify-between">
              <span>STORE IMAGE UPLOAD *</span>
              <span className="text-[10px] text-emerald-400 font-semibold">
                Mobile Gallery & Camera Supported
              </span>
            </label>

            {/* Hidden native input with accept="image/*" */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="hidden"
            />

            {/* Clickable Upload Dropzone */}
            <div
              onClick={async () => {
                const perm = await ensurePhotosPermission();
                if (!perm.granted) return;
                fileInputRef.current?.click();
              }}
              className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition group ${
                imagePreview
                  ? 'border-emerald-500/40 bg-[#161616] hover:bg-[#1A1A1A]'
                  : 'border-white/20 hover:border-[#FACC15]/60 bg-[#161616] hover:bg-[#1A1A1A]'
              }`}
            >
              <div className="flex flex-col items-center justify-center gap-1.5">
                <div className="w-10 h-10 rounded-full bg-white/5 group-hover:bg-[#FACC15]/10 flex items-center justify-center transition">
                  {imagePreview ? (
                    <Camera className="w-5 h-5 text-emerald-400" />
                  ) : (
                    <Upload className="w-5 h-5 text-gray-400 group-hover:text-[#FACC15]" />
                  )}
                </div>
                <p className="text-xs font-bold text-white">
                  {imagePreview
                    ? 'Click to change photo from phone/gallery'
                    : 'Upload Image from Gallery or Camera'}
                </p>
                <p className="text-[10px] text-gray-400">
                  {imageFileName ? `Selected: ${imageFileName}` : 'Accepts JPG, PNG, WEBP, HEIC (Converted to Base64)'}
                </p>
              </div>
            </div>

            {/* Immediate Image Preview Container */}
            {imagePreview ? (
              <div className="bg-[#0A0A0A] border border-white/10 rounded-xl p-2.5 space-y-2">
                <div className="flex items-center justify-between px-1">
                  <span className="text-[11px] font-black uppercase text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Active Image Preview</span>
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="text-[10px] font-bold text-gray-300 hover:text-white underline cursor-pointer"
                    >
                      Change Photo
                    </button>
                    {uploadedImage && (
                      <button
                        type="button"
                        onClick={handleToggleSignboard}
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full border transition cursor-pointer flex items-center gap-1 ${
                          apply3DSignboard
                            ? 'bg-blue-600 text-white border-blue-400'
                            : 'bg-white/5 text-gray-400 hover:text-white border-white/10'
                        }`}
                      >
                        <Sparkles className="w-2.5 h-2.5" />
                        <span>{apply3DSignboard ? '3D Sign Active' : '+ Add 3D Sign'}</span>
                      </button>
                    )}
                  </div>
                </div>

                <div className="relative rounded-lg overflow-hidden border border-white/10 bg-black aspect-[16/10] flex items-center justify-center">
                  <img
                    src={imagePreview}
                    alt="Store Preview"
                    className="w-full h-full object-cover"
                  />

                  {/* Uploading or generating spinner overlay */}
                  {(isUploading || isGeneratingSignboard) && (
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center gap-2 text-white">
                      <RefreshCw className="w-5 h-5 animate-spin text-[#FACC15]" />
                      <span className="text-xs font-bold">
                        {isUploading ? 'Reading Photo...' : 'Rendering 3D Sign...'}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-[11px] text-gray-500 italic p-2 bg-[#161616] rounded-xl border border-white/5 flex items-center gap-1.5">
                <ImageIcon className="w-3.5 h-3.5 flex-shrink-0 text-gray-400" />
                <span>No image selected yet. Please upload a photo of your venue.</span>
              </div>
            )}
          </div>

          {/* 4. Location and Description */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-gray-300 font-bold mb-1">
                LOCATION / ADDRESS
              </label>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g. Marbi Hall, Polokwane"
                className="w-full bg-[#1C1C1C] border border-white/15 rounded-xl px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-[#FACC15] text-xs"
              />
            </div>
            <div>
              <label className="block text-gray-300 font-bold mb-1">
                WHAT THEY SELL / SHORT INFO
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. Food, Drinks, Clothes"
                className="w-full bg-[#1C1C1C] border border-white/15 rounded-xl px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-[#FACC15] text-xs"
              />
            </div>
          </div>

          {/* 5. VENDOR LOCATION GRABBER (MAP & GPS BUTTON) */}
          <div className="bg-[#181818] border border-white/10 rounded-xl p-3 space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-black text-white flex items-center gap-1.5">
                <MapPin className="w-4 h-4 text-[#FACC15]" />
                <span>📍 Grab Vendor Location (Stand at Shop)</span>
              </label>
              <span className="text-[10px] text-gray-400 font-semibold">
                Lat: {vendorLat.toFixed(4)}, Lng: {vendorLng.toFixed(4)}
              </span>
            </div>

            <button
              type="button"
              onClick={getMyLocation}
              className="w-full py-2.5 px-3 bg-black hover:bg-gray-900 active:scale-98 text-white font-black text-xs rounded-xl shadow-md border border-white/20 transition flex items-center justify-center gap-2 cursor-pointer"
            >
              <Navigation className="w-4 h-4 text-[#FACC15]" />
              <span>📍 Use My Current Location (Stand at Shop)</span>
            </button>

            {/* Interactive Leaflet Map for Shop Pin */}
            <div ref={mapContainerRef} className="w-full h-44 rounded-xl border border-white/10 overflow-hidden bg-black" />

            <div className="flex items-center justify-between text-[11px] text-gray-400 pt-1">
              <span>Drag or click map to set exact shop location.</span>
              <a
                href={`https://www.google.com/maps?q=${vendorLat},${vendorLng}`}
                target="_blank"
                rel="noreferrer"
                className="text-[#FACC15] hover:underline font-bold flex items-center gap-1"
              >
                <span>Open in Google Maps</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>

          {/* Delete Store Section (Admin Only & When Editing Existing Store) */}
          {isAdmin && editingStore && (
            <div className="pt-3 border-t border-white/10">
              {confirmDelete ? (
                <div className="p-3 bg-red-950/60 border border-red-500/40 rounded-xl space-y-2">
                  <div className="flex items-center gap-2 text-red-300 font-bold">
                    <AlertCircle className="w-4 h-4" />
                    <span>Are you sure you want to delete this store?</span>
                  </div>
                  <p className="text-[11px] text-gray-400">
                    This will permanently remove "{editingStore.name}" from your active venues.
                  </p>
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={handleDelete}
                      disabled={isSaving}
                      className="bg-red-600 hover:bg-red-700 text-white font-bold px-3 py-1.5 rounded-lg text-xs transition cursor-pointer"
                    >
                      Yes, Delete Permanently
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(false)}
                      className="bg-[#262626] hover:bg-[#333] text-gray-300 px-3 py-1.5 rounded-lg text-xs transition cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="flex items-center gap-1.5 text-red-400 hover:text-red-300 text-xs font-bold transition py-1 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete Store</span>
                </button>
              )}
            </div>
          )}

          {/* Modal Actions */}
          <div className="pt-3 border-t border-white/10 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2.5 rounded-xl text-gray-400 hover:text-white bg-[#222] hover:bg-[#2A2A2A] font-bold text-xs transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving || isUploading || (!imagePreview && !uploadedImage)}
              className="px-5 py-2.5 rounded-xl bg-[#FACC15] hover:bg-yellow-400 active:scale-95 text-black font-extrabold text-xs transition flex items-center gap-2 shadow-lg shadow-yellow-400/20 cursor-pointer disabled:opacity-50"
            >
              {isSaving ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Saving Store...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{editingStore ? 'Update Store' : 'Save & Publish Store'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
