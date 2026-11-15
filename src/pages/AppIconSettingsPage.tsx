import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { db, storage } from '../firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { ensurePhotosPermission } from '../utils/nativePermissions';
import {
  ArrowLeft,
  Upload,
  Check,
  RotateCcw,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  Image as ImageIcon,
  ShieldCheck,
  Globe,
  Loader2,
  Smartphone,
  Laptop,
  Palette,
  Layers,
  ExternalLink,
} from 'lucide-react';

/**
 * Optimized image scaler for App Icons.
 * Ensures the icon is scaled to 512x512 with safe padding,
 * outputting a crisp lightweight Data URL (~20KB - 50KB).
 */
const processIconFile = (file: File, size = 512): Promise<string> => {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      try {
        resolve(URL.createObjectURL(file));
      } catch {
        resolve('/icon.svg');
      }
    }, 2500);

    const reader = new FileReader();
    reader.onload = (e) => {
      const src = e.target?.result as string;
      if (!src) {
        clearTimeout(timer);
        resolve(URL.createObjectURL(file));
        return;
      }

      const img = new Image();
      img.onload = () => {
        clearTimeout(timer);
        try {
          const canvas = document.createElement('canvas');
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(src);
            return;
          }

          // Fill clean black background
          ctx.fillStyle = '#000000';
          ctx.fillRect(0, 0, size, size);

          // Draw image centered with high quality
          let dw = size;
          let dh = size;
          let dx = 0;
          let dy = 0;

          if (img.width > img.height) {
            dh = Math.round((img.height * size) / img.width);
            dy = Math.round((size - dh) / 2);
          } else if (img.height > img.width) {
            dw = Math.round((img.width * size) / img.height);
            dx = Math.round((size - dw) / 2);
          }

          ctx.drawImage(img, dx, dy, dw, dh);
          const dataUrl = canvas.toDataURL('image/png');
          resolve(dataUrl);
        } catch {
          resolve(src);
        }
      };

      img.onerror = () => {
        clearTimeout(timer);
        resolve(src);
      };
      img.src = src;
    };

    reader.onerror = () => {
      clearTimeout(timer);
      resolve(URL.createObjectURL(file));
    };

    reader.readAsDataURL(file);
  });
};

/**
 * Built-in Curated Luxury Icon Presets
 */
interface IconPreset {
  id: string;
  name: string;
  description: string;
  url: string;
  bg: string;
  border: string;
}

const PRESET_ICONS: IconPreset[] = [
  {
    id: 'official-luxury',
    name: 'Official Gold Pass',
    description: 'Black obsidian with thin gold border (#C9A86A) and UB monogram',
    url: '/icon.svg',
    bg: '#000000',
    border: '#C9A86A',
  },
  {
    id: 'vector-emblem',
    name: 'Vector Crest',
    description: 'Ultra-crisp gold circular crest with smart signal waves',
    url: '/universal-band-logo.svg',
    bg: '#080706',
    border: '#C9A86A',
  },
];

export const AppIconSettingsPage: React.FC = () => {
  const { customAppIconUrl, updateCustomAppIcon, customLogoUrl, currentUser, navigateTo } = useApp();

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewIconUrl, setPreviewIconUrl] = useState<string>(
    customAppIconUrl || '/universal-band-logo.jpg'
  );
  const [activePreviewDevice, setActivePreviewDevice] = useState<'mobile' | 'browser' | 'badge'>('mobile');
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Icon Studio customizer state
  const [studioMonogram, setStudioMonogram] = useState<string>('UB');
  const [studioBgColor, setStudioBgColor] = useState<string>('#000000');
  const [studioBorderColor, setStudioBorderColor] = useState<string>('#C9A86A');
  const [showStudio, setShowStudio] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync preview if customAppIconUrl updates from Firestore
  useEffect(() => {
    if (!selectedFile) {
      setPreviewIconUrl(customAppIconUrl || '/universal-band-logo.jpg');
    }
  }, [customAppIconUrl, selectedFile]);

  // Load Firestore settings on mount
  useEffect(() => {
    let isMounted = true;
    const fetchCurrentIcon = async () => {
      try {
        const snap = await getDoc(doc(db, 'settings', 'branding'));
        if (snap.exists() && isMounted) {
          const data = snap.data();
          if (data?.appIconUrl && !selectedFile) {
            setPreviewIconUrl(data.appIconUrl);
          }
        }
      } catch (err) {
        console.warn('Could not load current icon setting:', err);
      }
    };
    fetchCurrentIcon();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    setStatusMessage(null);

    // Instant local preview
    try {
      const instantUrl = URL.createObjectURL(file);
      setPreviewIconUrl(instantUrl);
    } catch {}

    // Process icon canvas
    try {
      const processed = await processIconFile(file);
      setPreviewIconUrl(processed);
      setStatusMessage({
        type: 'success',
        text: `Selected "${file.name}". Ready! Click "SAVE APP ICON FOR ALL USERS" below.`,
      });
    } catch {
      setStatusMessage({
        type: 'success',
        text: `Selected "${file.name}". Ready to save!`,
      });
    }
  };

  const handleGenerateStudioIcon = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Fill background
    ctx.fillStyle = studioBgColor;
    ctx.fillRect(0, 0, 512, 512);

    // Gold border circle
    ctx.strokeStyle = studioBorderColor;
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(256, 256, 230, 0, Math.PI * 2);
    ctx.stroke();

    // Inner fine ring
    ctx.strokeStyle = studioBorderColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(256, 256, 215, 0, Math.PI * 2);
    ctx.stroke();

    // Smart waves
    ctx.strokeStyle = studioBorderColor;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(256, 175, 40, Math.PI * 1.2, Math.PI * 1.8);
    ctx.stroke();

    // Monogram text
    ctx.fillStyle = studioBorderColor;
    ctx.font = 'bold 150px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(studioMonogram.slice(0, 3).toUpperCase(), 256, 275);

    // Subtitle
    ctx.font = 'bold 22px sans-serif';
    ctx.letterSpacing = '6px';
    ctx.fillText('UNIVERSAL BAND', 256, 390);

    const generatedUrl = canvas.toDataURL('image/png');
    setPreviewIconUrl(generatedUrl);
    setSelectedFile(null);
    setStatusMessage({
      type: 'success',
      text: 'Custom Studio icon generated! Click "SAVE APP ICON FOR ALL USERS" to apply.',
    });
  };

  const handleApplyPreset = (preset: IconPreset) => {
    setPreviewIconUrl(preset.url);
    setSelectedFile(null);
    setStatusMessage({
      type: 'success',
      text: `Selected preset: "${preset.name}". Click "SAVE APP ICON FOR ALL USERS" to apply.`,
    });
  };

  const handleSyncWithBrandLogo = () => {
    if (customLogoUrl && !customLogoUrl.includes('universal-band-logo.jpg')) {
      setPreviewIconUrl(customLogoUrl);
      setSelectedFile(null);
      setStatusMessage({
        type: 'success',
        text: 'Synced with current Brand Logo! Click "SAVE APP ICON FOR ALL USERS" to apply.',
      });
    } else {
      setPreviewIconUrl('/universal-band-logo.svg');
      setSelectedFile(null);
      setStatusMessage({
        type: 'success',
        text: 'Synced with official Universal Band emblem.',
      });
    }
  };

  const handleSaveAppIcon = async () => {
    setIsUploading(true);
    setStatusMessage(null);

    const safetyTimer = setTimeout(() => {
      setIsUploading(false);
    }, 5000);

    let finalIconUrl = previewIconUrl;

    try {
      // 1. Process selected file if needed
      if (selectedFile && (!finalIconUrl || finalIconUrl.startsWith('blob:'))) {
        try {
          finalIconUrl = await processIconFile(selectedFile);
        } catch (e) {
          console.warn('Fallback processing note:', e);
        }
      }

      // 2. Storage upload attempt with 1s timeout (non-blocking)
      if (selectedFile && storage) {
        try {
          const storagePromise = (async () => {
            const storageRef = ref(storage, 'branding/app-icon.png');
            const snap = await uploadBytes(storageRef, selectedFile, {
              contentType: selectedFile.type || 'image/png',
              customMetadata: {
                uploadedBy: currentUser?.email || 'Admin',
                type: 'app_icon',
                updatedAt: new Date().toISOString(),
              },
            });
            return await getDownloadURL(snap.ref);
          })();

          const timeoutPromise = new Promise<string>((_, reject) =>
            setTimeout(() => reject(new Error('Storage timeout')), 1000)
          );

          const storageUrl = await Promise.race([storagePromise, timeoutPromise]);
          if (storageUrl) {
            finalIconUrl = storageUrl;
          }
        } catch (storageErr) {
          console.info('Storage non-blocking note (using real-time Firestore sync):', storageErr);
        }
      }

      // 3. Save to Firestore: collection = "settings", document = "branding", field = "appIconUrl"
      await setDoc(
        doc(db, 'settings', 'branding'),
        {
          appIconUrl: finalIconUrl,
          updatedAt: new Date().toISOString(),
          updatedBy: currentUser?.email || 'Admin',
          storagePath: 'branding/app-icon.png',
        },
        { merge: true }
      );

      // 4. Update context and local storage immediately
      await updateCustomAppIcon(finalIconUrl);
      setSelectedFile(null);

      // 5. Instantly update live browser tab icon
      try {
        const iconLinks = document.querySelectorAll<HTMLLinkElement>(
          "link[rel*='icon'], link[rel='apple-touch-icon']"
        );
        iconLinks.forEach((link) => {
          link.href = finalIconUrl;
        });
      } catch {}

      setStatusMessage({
        type: 'success',
        text: 'App icon successfully saved and updated for all users in real time!',
      });
    } catch (err: any) {
      console.error('Error saving app icon:', err);
      if (finalIconUrl) {
        await updateCustomAppIcon(finalIconUrl);
      }
      setStatusMessage({
        type: 'error',
        text: `Error saving to cloud: ${err?.message || 'Network delay'}. Local icon updated.`,
      });
    } finally {
      clearTimeout(safetyTimer);
      setIsUploading(false);
    }
  };

  const handleResetToDefault = async () => {
    setIsUploading(true);
    setStatusMessage(null);
    const defaultIcon = '/icon.svg';

    const safetyTimer = setTimeout(() => {
      setIsUploading(false);
    }, 4000);

    try {
      await setDoc(
        doc(db, 'settings', 'branding'),
        {
          appIconUrl: defaultIcon,
          updatedAt: new Date().toISOString(),
          updatedBy: currentUser?.email || 'Admin',
        },
        { merge: true }
      );

      await updateCustomAppIcon(defaultIcon);
      setSelectedFile(null);
      setPreviewIconUrl(defaultIcon);

      setStatusMessage({
        type: 'success',
        text: 'App icon reset to default official Universal Band luxury gold emblem.',
      });
    } catch (err: any) {
      console.error('Error resetting icon:', err);
      await updateCustomAppIcon(defaultIcon);
      setPreviewIconUrl(defaultIcon);
      setStatusMessage({
        type: 'success',
        text: 'Reset to default icon locally.',
      });
    } finally {
      clearTimeout(safetyTimer);
      setIsUploading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white pb-24 pt-4 px-4 max-w-md mx-auto">
      {/* Top Header Navigation */}
      <div className="flex items-center justify-between mb-5">
        <button
          onClick={() => navigateTo('/')}
          className="flex items-center gap-2 text-xs font-bold text-gray-300 hover:text-white transition-colors cursor-pointer py-1.5 px-3 rounded-full bg-white/5 border border-white/10 active:scale-95"
        >
          <ArrowLeft className="w-4 h-4 text-[#C9A86A]" />
          <span>Back to App</span>
        </button>

        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#C9A86A]/10 border border-[#C9A86A]/30 text-[#C9A86A] text-[11px] font-bold">
          <Globe className="w-3.5 h-3.5 text-emerald-400" />
          <span>App Icon Sync: Active</span>
        </div>
      </div>

      {/* Main Container Card */}
      <div className="bg-[#141414] border border-[#C9A86A]/30 rounded-3xl p-6 shadow-2xl backdrop-blur-xl relative overflow-hidden">
        {/* Glow Accent */}
        <div className="absolute top-0 right-0 w-36 h-36 bg-[#C9A86A]/10 rounded-full blur-3xl pointer-events-none" />

        {/* Page Title */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#C9A86A]/15 border border-[#C9A86A]/30 text-[#C9A86A] text-xs font-black uppercase tracking-wider mb-2">
            <Smartphone className="w-3.5 h-3.5" />
            <span>App Icon Settings</span>
          </div>
          <h1 className="text-2xl font-black tracking-tight text-white">
            Change App Icon
          </h1>
          <p className="text-xs text-gray-400 mt-1 max-w-xs mx-auto">
            Customize the icon used on mobile home screens (PWA), browser tabs (favicon), and app notifications.
          </p>
        </div>

        {/* Device Context Preview Tabs */}
        <div className="flex items-center justify-center gap-1.5 p-1 bg-black/60 rounded-2xl border border-white/10 mb-5">
          <button
            type="button"
            onClick={() => setActivePreviewDevice('mobile')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-xl text-xs font-bold transition-all ${
              activePreviewDevice === 'mobile'
                ? 'bg-[#C9A86A] text-black shadow-md'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>Phone Icon</span>
          </button>
          <button
            type="button"
            onClick={() => setActivePreviewDevice('browser')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-xl text-xs font-bold transition-all ${
              activePreviewDevice === 'browser'
                ? 'bg-[#C9A86A] text-black shadow-md'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <Laptop className="w-3.5 h-3.5" />
            <span>Browser Tab</span>
          </button>
          <button
            type="button"
            onClick={() => setActivePreviewDevice('badge')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-xl text-xs font-bold transition-all ${
              activePreviewDevice === 'badge'
                ? 'bg-[#C9A86A] text-black shadow-md'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>App Badge</span>
          </button>
        </div>

        {/* Interactive Device Preview Box */}
        <div className="mb-6 p-4 rounded-2xl bg-black border border-white/10 flex flex-col items-center justify-center min-h-[170px] relative overflow-hidden">
          {activePreviewDevice === 'mobile' && (
            /* Simulated Mobile Home Screen */
            <div className="flex flex-col items-center animate-in fade-in duration-300">
              <div
                onClick={() => fileInputRef.current?.click()}
                title="Tap to change icon"
                className="w-20 h-20 rounded-[22px] overflow-hidden p-1 shadow-2xl relative cursor-pointer group hover:scale-105 transition-transform"
                style={{
                  backgroundColor: '#000000',
                  border: '1.5px solid #C9A86A',
                }}
              >
                <img
                  src={previewIconUrl || '/icon.svg'}
                  alt="App Icon Preview"
                  className="w-full h-full object-contain rounded-[18px]"
                  onError={(e) => {
                    const target = e.currentTarget;
                    if (!target.src.includes('icon.svg')) {
                      target.src = '/icon.svg';
                    }
                  }}
                />
                <div className="absolute inset-0 bg-black/50 rounded-[22px] opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-[10px] font-bold text-white">
                  Tap to Edit
                </div>
              </div>
              <span className="text-xs font-bold text-gray-200 mt-2 tracking-tight">
                Universal Band
              </span>
              <span className="text-[10px] text-gray-500 font-mono">
                PWA Home Screen (192×192 / 512×512)
              </span>
            </div>
          )}

          {activePreviewDevice === 'browser' && (
            /* Simulated Browser Tab Bar */
            <div className="w-full max-w-xs flex flex-col items-center animate-in fade-in duration-300">
              <div className="w-full bg-[#1A1A1A] rounded-t-xl px-3 py-2 border-b border-white/10 flex items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-500/80" />
                  <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/80" />
                  <div className="w-2.5 h-2.5 rounded-full bg-green-500/80" />
                </div>
                <div className="flex-1 bg-[#0A0A0A] rounded-lg px-2.5 py-1 flex items-center gap-2 border border-white/5">
                  <img
                    src={previewIconUrl || '/icon.svg'}
                    alt="Favicon"
                    className="w-4 h-4 object-contain rounded-sm"
                  />
                  <span className="text-[11px] font-medium text-gray-300 truncate">
                    UB Universal Band | Smart Pass
                  </span>
                </div>
              </div>
              <span className="text-[10px] text-gray-500 font-mono mt-3">
                Live Favicon &amp; Browser Tab Shortcut
              </span>
            </div>
          )}

          {activePreviewDevice === 'badge' && (
            /* App Badge / Splash Screen */
            <div className="flex flex-col items-center animate-in fade-in duration-300">
              <div
                className="w-24 h-24 rounded-full flex items-center justify-center p-2 shadow-2xl relative"
                style={{
                  backgroundColor: '#000000',
                  border: '2px solid #C9A86A',
                }}
              >
                <img
                  src={previewIconUrl || '/icon.svg'}
                  alt="App Badge"
                  className="w-full h-full object-contain rounded-full"
                />
              </div>
              <span className="text-[10px] text-gray-400 font-mono mt-2">
                Circle • Gold Border (#C9A86A) • Black (#000000)
              </span>
            </div>
          )}
        </div>

        {/* Status Notification */}
        {statusMessage && (
          <div
            className={`mb-5 p-3.5 rounded-2xl flex items-start gap-2.5 text-xs font-medium animate-in fade-in duration-200 ${
              statusMessage.type === 'success'
                ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-300'
                : 'bg-rose-500/15 border border-rose-500/30 text-rose-300'
            }`}
          >
            {statusMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
            )}
            <span className="leading-relaxed">{statusMessage.text}</span>
          </div>
        )}

        {/* Main Action 1: Upload Custom Icon Image */}
        <div className="mb-4">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            accept="image/*"
            className="hidden"
            id="choose-app-icon-file-input"
          />
          <button
            type="button"
            onClick={async () => {
              const perm = await ensurePhotosPermission();
              if (!perm.granted) return;
              fileInputRef.current?.click();
            }}
            disabled={isUploading}
            className="w-full py-3.5 px-4 rounded-2xl font-bold text-sm bg-white/10 hover:bg-white/15 active:bg-white/20 text-white border border-[#C9A86A]/40 hover:border-[#C9A86A] flex items-center justify-center gap-2.5 transition-all cursor-pointer shadow-lg active:scale-98 disabled:opacity-50"
          >
            <Upload className="w-4 h-4 text-[#C9A86A]" />
            <span className="tracking-wide">Choose App Icon Image</span>
          </button>
          {selectedFile ? (
            <p className="text-center text-[11px] text-[#C9A86A] mt-2 truncate font-mono">
              Selected: {selectedFile.name}
            </p>
          ) : (
            <p className="text-center text-[11px] text-gray-500 mt-2 font-mono">
              PNG, JPG, WEBP, or SVG supported (square recommended)
            </p>
          )}
        </div>

        {/* Quick Icon Tools / Presets */}
        <div className="mb-5 space-y-2.5">
          <div className="flex items-center justify-between text-xs font-bold text-gray-300 px-1">
            <span>Fast Presets &amp; Tools</span>
            <button
              type="button"
              onClick={() => setShowStudio(!showStudio)}
              className="text-[#C9A86A] hover:underline flex items-center gap-1 text-[11px]"
            >
              <Palette className="w-3.5 h-3.5" />
              <span>{showStudio ? 'Hide Studio' : 'Open Icon Studio'}</span>
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {/* Sync with Brand Logo */}
            <button
              type="button"
              onClick={handleSyncWithBrandLogo}
              className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-left transition-all cursor-pointer group active:scale-98"
            >
              <div className="flex items-center gap-2 mb-1">
                <Sparkles className="w-3.5 h-3.5 text-[#C9A86A]" />
                <span className="text-xs font-bold text-white group-hover:text-[#C9A86A]">Sync With Logo</span>
              </div>
              <p className="text-[10px] text-gray-400 line-clamp-1">
                Use your uploaded brand logo
              </p>
            </button>

            {/* Official Preset */}
            <button
              type="button"
              onClick={() => handleApplyPreset(PRESET_ICONS[0])}
              className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-left transition-all cursor-pointer group active:scale-98"
            >
              <div className="flex items-center gap-2 mb-1">
                <ShieldCheck className="w-3.5 h-3.5 text-[#C9A86A]" />
                <span className="text-xs font-bold text-white group-hover:text-[#C9A86A]">Official Pass</span>
              </div>
              <p className="text-[10px] text-gray-400 line-clamp-1">
                Gold &amp; black luxury emblem
              </p>
            </button>
          </div>

          {/* Icon Studio Drawer */}
          {showStudio && (
            <div className="p-4 rounded-2xl bg-black border border-[#C9A86A]/30 space-y-3 animate-in fade-in duration-200">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-[#C9A86A] uppercase tracking-wider">
                  Live Icon Studio
                </span>
                <span className="text-[10px] text-gray-500 font-mono">Custom Monogram</span>
              </div>

              <div>
                <label className="text-[11px] text-gray-400 block mb-1">Monogram Letters (1-3 chars):</label>
                <input
                  type="text"
                  maxLength={3}
                  value={studioMonogram}
                  onChange={(e) => setStudioMonogram(e.target.value)}
                  className="w-full bg-[#141414] border border-white/15 rounded-xl px-3 py-1.5 text-sm text-white font-bold uppercase tracking-wider"
                  placeholder="UB"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] text-gray-400 block mb-1">Background:</label>
                  <select
                    value={studioBgColor}
                    onChange={(e) => setStudioBgColor(e.target.value)}
                    className="w-full bg-[#141414] border border-white/15 rounded-xl px-2 py-1.5 text-xs text-white"
                  >
                    <option value="#000000">Pure Black (#000000)</option>
                    <option value="#111111">Obsidian (#111111)</option>
                    <option value="#0A0E17">Midnight Navy (#0A0E17)</option>
                    <option value="#061A12">Deep Emerald (#061A12)</option>
                    <option value="#1A090D">Wine Velvet (#1A090D)</option>
                  </select>
                </div>

                <div>
                  <label className="text-[11px] text-gray-400 block mb-1">Accent Border:</label>
                  <select
                    value={studioBorderColor}
                    onChange={(e) => setStudioBorderColor(e.target.value)}
                    className="w-full bg-[#141414] border border-white/15 rounded-xl px-2 py-1.5 text-xs text-white"
                  >
                    <option value="#C9A86A">Classic Gold (#C9A86A)</option>
                    <option value="#FACC15">Vibrant Yellow (#FACC15)</option>
                    <option value="#E5E7EB">Platinum Silver (#E5E7EB)</option>
                    <option value="#DFBF82">Champagne Gold (#DFBF82)</option>
                  </select>
                </div>
              </div>

              <button
                type="button"
                onClick={handleGenerateStudioIcon}
                className="w-full py-2 px-3 rounded-xl bg-[#C9A86A] hover:bg-yellow-500 text-black font-extrabold text-xs transition-all active:scale-98 cursor-pointer"
              >
                Generate &amp; Preview Studio Icon
              </button>
            </div>
          )}
        </div>

        {/* Action Buttons: Green SAVE & Red RESET */}
        <div className="space-y-3 pt-3 border-t border-white/10">
          {/* Button 1: "SAVE APP ICON FOR ALL USERS" in green */}
          <button
            type="button"
            onClick={handleSaveAppIcon}
            disabled={isUploading}
            className="w-full py-3.5 px-4 rounded-2xl font-black text-sm bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white shadow-xl shadow-emerald-950/40 flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed uppercase tracking-wide active:scale-98 border border-emerald-400/30"
          >
            {isUploading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-1 text-white" />
                <span>SAVING APP ICON...</span>
              </>
            ) : (
              <>
                <Check className="w-4 h-4 stroke-[3]" />
                <span>SAVE APP ICON FOR ALL USERS</span>
              </>
            )}
          </button>

          {/* Button 2: "RESET TO DEFAULT ICON" in red */}
          <button
            type="button"
            onClick={handleResetToDefault}
            disabled={isUploading}
            className="w-full py-3 px-4 rounded-2xl font-extrabold text-xs bg-red-600/90 hover:bg-red-600 active:bg-red-700 text-white shadow-lg shadow-red-950/30 flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-wider active:scale-98 border border-red-500/30"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>RESET TO DEFAULT ICON</span>
          </button>
        </div>
      </div>

      {/* Cross link to Brand Logo Settings */}
      <div className="mt-5 p-4 rounded-2xl bg-white/[0.03] border border-white/10 flex items-center justify-between">
        <div>
          <h3 className="text-xs font-bold text-gray-200">Looking for Header &amp; Banner Logo?</h3>
          <p className="text-[11px] text-gray-400">Change the top header logo and hero banners</p>
        </div>
        <button
          onClick={() => navigateTo('/admin/logo-settings')}
          className="flex items-center gap-1.5 py-1.5 px-3 rounded-xl bg-white/10 hover:bg-white/15 text-[#C9A86A] text-xs font-bold active:scale-95 transition-all cursor-pointer"
        >
          <span>Logo Settings</span>
          <ExternalLink className="w-3 h-3" />
        </button>
      </div>

      {/* Online Sync Details Footer */}
      <div className="mt-4 p-4 rounded-2xl bg-white/[0.03] border border-[#C9A86A]/20 text-[11px] text-gray-400 space-y-1.5 font-mono">
        <p className="font-bold text-gray-200 flex items-center gap-1.5">
          <Globe className="w-3.5 h-3.5 text-emerald-400" />
          <span>PWA &amp; Device Integration Active</span>
        </p>
        <p>• Mobile PWA: <span className="text-gray-300">manifest.json &gt; icons</span> (192×192 &amp; 512×512)</p>
        <p>• Browser: <span className="text-gray-300">link[rel=icon] &amp; link[rel=apple-touch-icon]</span></p>
        <p>• Firestore: <span className="text-gray-300">settings / branding &gt; appIconUrl</span></p>
      </div>
    </div>
  );
};
