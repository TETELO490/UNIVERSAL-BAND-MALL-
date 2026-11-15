import React, { useState, useEffect, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { ensureCameraPermission } from '../utils/nativePermissions';
import { db } from '../firebase';
import { doc, getDoc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore';
import {
  parseCustomerQrScan,
  doesTicketMatchCustomerQr,
} from '../utils/customerQr';

/**
 * Universal Band - Fixed QR Ticket Scanner Component
 * 
 * Theme: Limpopo Red (#D32F2F) and Blue (#0D47A1)
 * Background: White (#FFFFFF), Text: Black (#1A1A1A)
 * Library: html5-qrcode
 */
export default function Scanner({ onTicketVerified, onClose, mode = 'ticket' }) {
  // Scanner States
  const [isScanning, setIsScanning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [scannerError, setScannerError] = useState(null);
  const [scannedResult, setScannedResult] = useState(null);
  const [lastScannedCode, setLastScannedCode] = useState('');
  const [isTorchOn, setIsTorchOn] = useState(false);

  // DOM Container ID & Scanner Instance Ref
  const scannerContainerId = 'ub-html5-qr-reader';
  const html5QrCodeRef = useRef(null);
  const resumeTimeoutRef = useRef(null);
  const lastScannedRef = useRef({ code: '', time: 0 });

  // -------------------------------------------------------------
  // Sound Beep for Valid Scan using Web Audio API
  // -------------------------------------------------------------
  const playValidBeep = () => {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime); // A5 note
      osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.12);

      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.18);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.18);
    } catch (err) {
      console.warn('Audio playback not supported:', err);
    }
  };

  // Sound Buzzer for Invalid / Duplicate Scan
  const playInvalidBeep = () => {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(240, ctx.currentTime);
      osc.frequency.setValueAtTime(160, ctx.currentTime + 0.16);

      gain.gain.setValueAtTime(0.35, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.25);
    } catch (err) {
      console.warn('Audio playback not supported:', err);
    }
  };

  // -------------------------------------------------------------
  // Ticket Verification Logic (Real Local Cache + Firestore)
  // -------------------------------------------------------------
  const verifyTicket = async (decodedText) => {
    const raw = (decodedText || '').trim();
    const scan = parseCustomerQrScan(raw);
    if (scan.dynamicError) {
      return {
        isValid: false,
        reason: scan.dynamicError,
        message:
          scan.dynamicError === 'EXPIRED_SCREENSHOT'
            ? 'EXPIRED QR / SCREENSHOT BLOCKED'
            : scan.dynamicError === 'INVALID_SIGNATURE'
            ? 'TAMPERED / INVALID QR'
            : 'STATIC QR BLOCKED — USE LIVE PROFILE QR',
        ticketId: raw,
        name: scan.name || 'Attendee',
        rawText: raw,
      };
    }

    let ticketId = scan.ticketId || scan.bandCode || scan.customerQrId || scan.userId || raw;
    let attendeeName = scan.name || 'Attendee';
    let isAlreadyUsed = false;

    const cleanKey = (ticketId || '').trim().toLowerCase();
    if (!cleanKey && !scan.customerQrId && !scan.userId && !scan.phone) {
      return {
        isValid: false,
        reason: 'INVALID',
        message: 'EMPTY QR CODE',
        ticketId: raw,
        name: attendeeName,
        rawText: raw,
      };
    }

    // 2. Check Universal Band tickets database in localStorage
    try {
      const savedTicketsRaw = localStorage.getItem('ub_user_tickets');
      if (savedTicketsRaw) {
        const savedList = JSON.parse(savedTicketsRaw);
        if (Array.isArray(savedList)) {
          const matches = savedList.filter((t) => doesTicketMatchCustomerQr(t, scan));
          const match =
            matches.find((t) => {
              const s = (t.status || '').toLowerCase();
              const a = (t.attendanceStatus || '').toUpperCase();
              return s !== 'used' && s !== 'inside' && a !== 'INSIDE';
            }) || matches[0];

          if (match) {
            attendeeName = match.attendeeName || match.customerName || attendeeName;
            const currentStatus = (match.status || '').toLowerCase();
            const attendanceStatus = (match.attendanceStatus || '').toUpperCase();

            if (currentStatus === 'used' || currentStatus === 'inside' || attendanceStatus === 'INSIDE') {
              isAlreadyUsed = true;
            } else {
              match.status = 'inside';
              match.attendanceStatus = 'INSIDE';
              match.insideSince = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
              localStorage.setItem('ub_user_tickets', JSON.stringify(savedList));
            }

            if (isAlreadyUsed) {
              return {
                isValid: false,
                reason: 'ALREADY USED',
                message: 'INVALID / ALREADY USED',
                ticketId: match.ticketId || match.id,
                name: attendeeName,
                rawText: raw,
              };
            }

            return {
              isValid: true,
              message: `VALID - ${attendeeName}`,
              ticketId: match.ticketId || match.id,
              name: attendeeName,
              rawText: raw,
            };
          }
        }
      }
    } catch (e) {
      console.warn('Error verifying with localStorage:', e);
    }

    // 3. Verify against Firestore tickets collection (supports direct ticket ID, ticketId, bandCode, customerQrId, and userId)
    try {
      let matchedDocId = null;
      let matchedData = null;

      if (scan.ticketId && !scan.ticketId.includes('/')) {
        const directSnap = await getDoc(doc(db, 'tickets', scan.ticketId.trim()));
        if (directSnap.exists()) {
          matchedDocId = directSnap.id;
          matchedData = directSnap.data();
        }
      }
      if (!matchedData && ticketId && !ticketId.includes('/')) {
        const directSnap = await getDoc(doc(db, 'tickets', ticketId.trim()));
        if (directSnap.exists()) {
          matchedDocId = directSnap.id;
          matchedData = directSnap.data();
        }
      }
      if (!matchedData && scan.customerQrId) {
        const snapQr = await getDocs(query(collection(db, 'tickets'), where('customerQrId', '==', scan.customerQrId)));
        if (!snapQr.empty) {
          const unusedDoc =
            snapQr.docs.find((d) => {
              const dt = d.data();
              const cs = (dt.status || '').toLowerCase();
              const ca = (dt.attendanceStatus || '').toUpperCase();
              return cs !== 'used' && cs !== 'inside' && ca !== 'INSIDE';
            }) || snapQr.docs[0];
          matchedDocId = unusedDoc.id;
          matchedData = unusedDoc.data();
        }
      }
      if (!matchedData && (scan.userId || scan.customerId)) {
        const uidVal = scan.userId || scan.customerId;
        const snapUid = await getDocs(query(collection(db, 'tickets'), where('userId', '==', uidVal)));
        if (!snapUid.empty) {
          const unusedDoc =
            snapUid.docs.find((d) => {
              const dt = d.data();
              const cs = (dt.status || '').toLowerCase();
              const ca = (dt.attendanceStatus || '').toUpperCase();
              return cs !== 'used' && cs !== 'inside' && ca !== 'INSIDE';
            }) || snapUid.docs[0];
          matchedDocId = unusedDoc.id;
          matchedData = unusedDoc.data();
        }
      }
      if (!matchedData && ticketId) {
        const snapTicket = await getDocs(query(collection(db, 'tickets'), where('ticketId', '==', ticketId.trim())));
        if (!snapTicket.empty) {
          matchedDocId = snapTicket.docs[0].id;
          matchedData = snapTicket.docs[0].data();
        } else {
          const snapBand = await getDocs(query(collection(db, 'tickets'), where('bandCode', '==', ticketId.trim())));
          if (!snapBand.empty) {
            matchedDocId = snapBand.docs[0].id;
            matchedData = snapBand.docs[0].data();
          }
        }
      }

      if (matchedData) {
        attendeeName = matchedData.attendeeName || matchedData.customerName || attendeeName;
        const currentStatus = (matchedData.status || '').toLowerCase();
        const attendanceStatus = (matchedData.attendanceStatus || '').toUpperCase();

        if (currentStatus === 'used' || currentStatus === 'inside' || attendanceStatus === 'INSIDE') {
          return {
            isValid: false,
            reason: 'ALREADY USED',
            message: 'INVALID / ALREADY USED',
            ticketId: matchedData.ticketId || matchedDocId || ticketId,
            name: attendeeName,
            rawText: raw,
          };
        }

        if (matchedDocId) {
          await updateDoc(doc(db, 'tickets', matchedDocId), {
            status: 'inside',
            attendanceStatus: 'INSIDE',
            insideSince: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          }).catch(() => {});
        }

        return {
          isValid: true,
          message: `VALID - ${attendeeName}`,
          ticketId: matchedData.ticketId || matchedDocId || ticketId,
          name: attendeeName,
          rawText: raw,
        };
      }
    } catch (e) {
      console.warn('Error verifying with Firestore tickets:', e);
    }

    // No valid ticket found in local cache or Firestore
    return {
      isValid: false,
      reason: 'INVALID',
      message: 'TICKET NOT FOUND / INVALID',
      ticketId,
      name: attendeeName,
      rawText: raw,
    };
  };

  // -------------------------------------------------------------
  // Scan Success Handler
  // -------------------------------------------------------------
  const onScanSuccess = async (decodedText) => {
    // Prevent double scan of same code within 3 seconds
    const now = Date.now();
    if (
      lastScannedRef.current.code === decodedText &&
      now - lastScannedRef.current.time < 3000
    ) {
      return;
    }
    lastScannedRef.current = { code: decodedText, time: now };
    setLastScannedCode(decodedText);

    // Pause the scanner feed while evaluating and displaying result
    if (html5QrCodeRef.current) {
      try {
        if (html5QrCodeRef.current.getState() === 2) {
          html5QrCodeRef.current.pause();
        }
      } catch (err) {
        console.warn('Could not pause scanner:', err);
      }
    }

    // Clear any existing resume timeout
    if (resumeTimeoutRef.current) {
      clearTimeout(resumeTimeoutRef.current);
      resumeTimeoutRef.current = null;
    }

    if (mode === 'raw') {
      const rawResult = {
        isValid: true,
        message: 'QR CODE SCANNED',
        ticketId: decodedText,
        rawText: decodedText,
      };
      setScannedResult(rawResult);
      playValidBeep();
      if (onTicketVerified) {
        onTicketVerified(decodedText);
      }
    } else {
      // Verify Ticket
      const result = await verifyTicket(decodedText);
      setScannedResult(result);

      // Audio feedback
      if (result.isValid) {
        playValidBeep();
      } else {
        playInvalidBeep();
      }

      if (onTicketVerified) {
        onTicketVerified(result);
      }
    }

    // Automatically resume after 2 seconds
    resumeTimeoutRef.current = setTimeout(() => {
      resumeScanner();
    }, 2000);
  };

  // -------------------------------------------------------------
  // Scanner Controls
  // -------------------------------------------------------------
  const resumeScanner = () => {
    if (resumeTimeoutRef.current) {
      clearTimeout(resumeTimeoutRef.current);
      resumeTimeoutRef.current = null;
    }

    setScannedResult(null);
    setIsPaused(false);

    const scanner = html5QrCodeRef.current;
    if (scanner) {
      try {
        if (scanner.getState() === 3) { // PAUSED
          scanner.resume();
        } else if (scanner.getState() === 1) { // NOT_STARTED
          startScanner();
        }
      } catch (err) {
        console.warn('Error calling scanner.resume(), restarting camera:', err);
        startScanner();
      }
    } else {
      startScanner();
    }
  };

  const pauseScanner = () => {
    setIsPaused(true);
    if (html5QrCodeRef.current && html5QrCodeRef.current.getState() === 2) {
      html5QrCodeRef.current.pause();
    }
  };

  const toggleTorch = async () => {
    if (!html5QrCodeRef.current) return;
    try {
      const nextTorchState = !isTorchOn;
      await html5QrCodeRef.current.applyVideoConstraints({
        advanced: [{ torch: nextTorchState }],
      });
      setIsTorchOn(nextTorchState);
    } catch (err) {
      console.warn('Torch not supported on this device:', err);
    }
  };

  // -------------------------------------------------------------
  // Start Scanner
  // -------------------------------------------------------------
  const startScanner = async () => {
    setScannerError(null);
    setIsPaused(false);

    const perm = await ensureCameraPermission();
    if (!perm.granted) {
      setIsScanning(false);
      setScannerError(perm.message || 'Could not access camera. Please allow camera permissions.');
      return;
    }

    // Stop previous instance if running
    if (html5QrCodeRef.current) {
      try {
        if (html5QrCodeRef.current.isScanning) {
          await html5QrCodeRef.current.stop();
        }
        await html5QrCodeRef.current.clear();
      } catch (_) {}
    }

    try {
      const html5QrCode = new Html5Qrcode(scannerContainerId);
      html5QrCodeRef.current = html5QrCode;

      const config = {
        fps: 10,
        qrbox: { width: 220, height: 220 },
        aspectRatio: 1.0,
      };

      await html5QrCode.start(
        { facingMode: 'environment' },
        config,
        onScanSuccess,
        () => {} // Ignored frame errors
      );

      setIsScanning(true);
    } catch (err) {
      console.error('Failed to start camera:', err);
      setIsScanning(false);
      setScannerError('Could not access camera. Please allow camera permissions.');
    }
  };

  // -------------------------------------------------------------
  // Stop Scanner
  // -------------------------------------------------------------
  const stopScanner = async () => {
    if (resumeTimeoutRef.current) {
      clearTimeout(resumeTimeoutRef.current);
      resumeTimeoutRef.current = null;
    }

    if (html5QrCodeRef.current) {
      try {
        if (html5QrCodeRef.current.isScanning) {
          await html5QrCodeRef.current.stop();
        }
        await html5QrCodeRef.current.clear();
      } catch (err) {
        console.warn('Error stopping scanner:', err);
      } finally {
        try {
          const video = document.querySelector(`#${scannerContainerId} video`);
          if (video && video.srcObject) {
            const stream = video.srcObject;
            stream.getTracks().forEach((track) => track.stop());
          }
        } catch (_) {}
        html5QrCodeRef.current = null;
        setIsScanning(false);
      }
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      startScanner();
    }, 150);

    return () => {
      clearTimeout(timer);
      stopScanner();
    };
  }, []);

  return (
    <div
      style={{
        backgroundColor: '#FFFFFF',
        color: '#1A1A1A',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
      className="w-full max-w-md mx-auto p-5 rounded-3xl shadow-2xl border border-gray-200 flex flex-col items-center text-center relative"
    >
      {onClose && (
        <button
          onClick={() => {
            stopScanner();
            onClose();
          }}
          style={{ color: '#0D47A1' }}
          className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-gray-100 transition cursor-pointer font-bold text-lg leading-none"
        >
          ✕
        </button>
      )}

      <div className="mb-4">
        <h1
          style={{ color: '#0D47A1' }}
          className="text-2xl font-black tracking-tight"
        >
          Universal Band - Scanner
        </h1>
        <p className="text-xs font-semibold text-gray-500 mt-0.5">
          Limpopo Gate Pass Verification
        </p>
      </div>

      <div
        style={{
          width: '300px',
          height: '300px',
          borderRadius: '20px',
          overflow: 'hidden',
          backgroundColor: '#000000',
          position: 'relative',
        }}
        className="shadow-inner border-4 border-[#0D47A1]/20 flex items-center justify-center"
      >
        <div id={scannerContainerId} style={{ width: '100%', height: '100%' }} />

        {isScanning && !scannedResult && !isPaused && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            <div
              style={{
                width: '220px',
                height: '220px',
                border: '3px dashed #0D47A1',
                borderRadius: '16px',
              }}
              className="animate-pulse"
            />
          </div>
        )}

        {isPaused && (
            <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-white font-bold text-lg">
                Scanner Paused
            </div>
        )}

        {scannerError && (
          <div className="absolute inset-0 bg-white/95 p-4 flex flex-col items-center justify-center text-center z-10">
            <p className="text-xs font-bold text-[#D32F2F] mb-3">
              {scannerError}
            </p>
            <button
              onClick={startScanner}
              style={{ backgroundColor: '#0D47A1', color: '#FFFFFF' }}
              className="py-2 px-4 rounded-xl text-xs font-bold shadow cursor-pointer"
            >
              Retry Camera
            </button>
          </div>
        )}
      </div>

      <div className="w-[300px] min-h-[72px] mt-4 flex items-center justify-center">
        {scannedResult ? (
          <div
            style={{
              borderRadius: '16px',
              backgroundColor: scannedResult.isValid ? '#E8F5E9' : '#FFEBEE',
              borderColor: scannedResult.isValid ? '#2E7D32' : '#D32F2F',
            }}
            className="w-full p-3 border-2 shadow-sm text-center transition-all duration-200"
          >
            <h2
              style={{
                color: scannedResult.isValid ? '#2E7D32' : '#D32F2F',
              }}
              className="text-base font-black tracking-wide uppercase"
            >
              {scannedResult.message}
            </h2>
            <p className="text-[11px] font-mono text-gray-700 mt-1 truncate">
              Code: {scannedResult.ticketId || lastScannedCode}
            </p>
          </div>
        ) : (
          <div className="w-full p-3 rounded-2xl bg-gray-50 border border-gray-200 text-center">
            <p className="text-xs font-bold text-gray-500">
              {isScanning ? (isPaused ? 'Scanner Paused' : 'Point camera at attendee QR ticket') : 'Scanner stopped'}
            </p>
          </div>
        )}
      </div>

      <div className="w-full mt-4 space-y-2.5">
        <div className="flex gap-2">
            {isPaused ? (
                <button
                    onClick={resumeScanner}
                    style={{ backgroundColor: '#2E7D32', color: '#FFFFFF', borderRadius: '16px' }}
                    className="flex-1 py-3 text-xs font-black shadow-lg hover:opacity-95 active:scale-[0.98] transition cursor-pointer"
                >
                    Resume Scan
                </button>
            ) : (
                <button
                    onClick={pauseScanner}
                    style={{ backgroundColor: '#D32F2F', color: '#FFFFFF', borderRadius: '16px' }}
                    className="flex-1 py-3 text-xs font-black shadow-lg hover:opacity-95 active:scale-[0.98] transition cursor-pointer"
                >
                    Pause Scan
                </button>
            )}
            <button
                onClick={toggleTorch}
                style={{ backgroundColor: isTorchOn ? '#F57C00' : '#455A64', color: '#FFFFFF', borderRadius: '16px' }}
                className="py-3 px-6 text-xs font-black shadow-lg hover:opacity-95 active:scale-[0.98] transition cursor-pointer"
            >
                {isTorchOn ? 'Flash Off' : 'Flash On'}
            </button>
        </div>
        
        <button
          onClick={stopScanner}
          style={{
            borderColor: '#0D47A1',
            color: '#0D47A1',
            borderRadius: '16px',
            backgroundColor: 'transparent',
          }}
          className="w-full py-2.5 text-xs font-black border-2 hover:bg-blue-50 active:scale-[0.98] transition cursor-pointer"
        >
          Stop Camera
        </button>
      </div>

      <p className="text-[10px] text-gray-400 mt-3 font-medium">
        Auto-resumes in 2s • Double-scan protection active (3s)
      </p>
    </div>
  );
}
