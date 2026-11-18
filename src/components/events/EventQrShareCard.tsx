import React, { useRef, useState } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { QrCode, Download, Copy, Check, ExternalLink, Share2 } from 'lucide-react';
import { EventItem } from '../../types';
import { useApp } from '../../context/AppContext';
import {
  getEventShareUrl,
  getEventRoutePath,
  copyTextToClipboard,
  downloadEventQrPng,
  shareEventQrPng,
} from '../../utils/eventLinkHelper';

interface EventQrShareCardProps {
  event: EventItem;
  compact?: boolean;
}

export const EventQrShareCard: React.FC<EventQrShareCardProps> = ({ event, compact = false }) => {
  const { events, navigateTo, appBaseUrl } = useApp();
  const qrCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [copied, setCopied] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Reference appBaseUrl so this card re-renders immediately when Admin updates Domain / Base URL
  void appBaseUrl;
  const eventUrl = getEventShareUrl(event, events);
  const routePath = getEventRoutePath(event, events);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3500);
  };

  const handleCopyLink = async () => {
    const ok = await copyTextToClipboard(eventUrl);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const handleDownloadPng = () => {
    const ok = downloadEventQrPng(qrCanvasRef.current, event, eventUrl, events);
    if (ok) {
      setDownloaded(true);
      showToast('QR Downloaded to Phone');
      setTimeout(() => setDownloaded(false), 3000);
    }
  };

  const handleShareQr = async () => {
    const res = await shareEventQrPng(qrCanvasRef.current, event, eventUrl, events);
    if (res.shared) {
      showToast('QR Shared!');
    } else if (res.fallbackCopied) {
      showToast('Link copied — paste into WhatsApp or Facebook');
    }
  };

  return (
    <div className="bg-black/60 border border-[#FACC15]/30 rounded-2xl p-3 space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-black uppercase tracking-wider text-[#FACC15] flex items-center gap-1.5">
          <QrCode className="w-3.5 h-3.5" />
          <span>Auto Event QR &amp; Direct Web Link</span>
        </span>
        <button
          type="button"
          onClick={() => navigateTo(routePath)}
          className="text-[10px] font-bold text-gray-300 hover:text-[#FACC15] flex items-center gap-1 cursor-pointer transition"
          title="Open Direct Event Page"
        >
          <span>Open Page</span>
          <ExternalLink className="w-3 h-3" />
        </button>
      </div>

      {toastMsg && (
        <div className="bg-emerald-500/20 border border-emerald-400/50 text-emerald-200 text-[11px] font-bold px-3 py-2 rounded-xl flex items-center gap-1.5">
          <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span>{toastMsg}</span>
        </div>
      )}

      <div className={`flex ${compact ? 'items-center gap-3' : 'flex-col sm:flex-row items-center gap-3'}`}>
        {/* Live QR Code rendered directly from unique event URL */}
        <div className="bg-white p-2 rounded-xl shadow-md shrink-0 border-2 border-[#FACC15]/50">
          <QRCodeCanvas
            ref={qrCanvasRef}
            value={eventUrl}
            size={560}
            level="H"
            includeMargin={true}
            bgColor="#FFFFFF"
            fgColor="#000000"
            style={{ width: compact ? 96 : 116, height: compact ? 96 : 116 }}
          />
        </div>

        {/* Event Link & Actions */}
        <div className="flex-1 min-w-0 w-full space-y-2">
          <div className="bg-[#141414] border border-white/10 rounded-xl px-2.5 py-2">
            <span className="text-[9px] font-bold text-gray-400 uppercase block mb-0.5">
              Unique Event Link (UNIVERSAL BAND MALL)
            </span>
            <p className="text-[11px] font-mono font-bold text-[#FACC15] break-all leading-snug select-all">
              {eventUrl}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
            <button
              type="button"
              onClick={handleDownloadPng}
              className="w-full py-2 px-2.5 rounded-xl bg-[#FACC15] hover:bg-yellow-400 active:scale-95 text-black font-black text-[11px] flex items-center justify-center gap-1.5 transition cursor-pointer shadow"
            >
              {downloaded ? <Check className="w-3.5 h-3.5 stroke-[3]" /> : <Download className="w-3.5 h-3.5 stroke-[2.5]" />}
              <span>{downloaded ? 'QR Downloaded!' : 'Download QR Code'}</span>
            </button>

            <button
              type="button"
              onClick={handleShareQr}
              className="w-full py-2 px-2.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 active:scale-95 text-emerald-300 font-bold text-[11px] flex items-center justify-center gap-1.5 transition cursor-pointer border border-emerald-500/40"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>Share QR</span>
            </button>

            <button
              type="button"
              onClick={handleCopyLink}
              className="w-full py-2 px-2.5 rounded-xl bg-white/10 hover:bg-white/20 active:scale-95 text-white font-bold text-[11px] flex items-center justify-center gap-1.5 transition cursor-pointer border border-white/15"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400 stroke-[3]" /> : <Copy className="w-3.5 h-3.5 text-[#FACC15]" />}
              <span>{copied ? 'Link Copied!' : 'Copy Link'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EventQrShareCard;
