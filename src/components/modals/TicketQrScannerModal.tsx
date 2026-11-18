import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Html5Qrcode, Html5QrcodeCameraScanConfig } from 'html5-qrcode';
import { useApp } from '../../context/AppContext';
import { Ticket, AttendanceStatus } from '../../types';
import { db } from '../../firebase';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import {
  X,
  Camera,
  RefreshCw,
  Upload,
  User,
  SwitchCamera,
  Zap,
  Info,
  Phone,
  Search,
  Download,
  LogIn,
  LogOut,
  AlertTriangle,
} from 'lucide-react';
import { TicketScanResultView } from '../TicketScanResultView';
import {
  normalizePhone,
  formatMovementTime,
  filterTicketsByPhone,
  groupTicketsByPhone,
  downloadEventTicketsLocally,
  getPendingSyncCount,
  syncPendingMovementsWithFirestore,
  getLocalCachedEventTickets,
} from '../../utils/attendanceService';
import { hasEventDateArrived } from '../../utils/dateHelper';
import { parseCustomerQrScan, doesTicketMatchCustomerQr } from '../../utils/customerQr';
import { isTicketPaid } from '../../utils/ticketStatus';
import Scanner from '../Scanner';
import { ensureCameraPermission } from '../../utils/nativePermissions';
import {
  getRoleScopedTickets,
  getUserOwnedStoreIds,
  getUserOwnedEventIds,
  isUserVerifiedAdminSession,
} from '../../utils/legacyCleanup';

interface TicketQrScannerModalProps {
  isOpen?: boolean;
  onClose?: () => void;
  onTicketScanned?: (ticket: Ticket) => void;
  defaultEventId?: string;
}

export const TicketQrScannerModal: React.FC<TicketQrScannerModalProps> = ({
  isOpen = true,
  onClose,
  onTicketScanned,
  defaultEventId,
}) => {
  const {
    tickets,
    checkInTicket,
    checkOutTicket,
    currentUser,
    setActiveModal,
    stores,
    events,
  } = useApp();

  // Mode: Camera QR Scanner vs Phone Fallback Search
  const [activeMode, setActiveMode] = useState<'camera' | 'phone_search'>('camera');

  // Unique scanner element ID regenerated per session to avoid DOM node re-use issues
  const [scannerId, setScannerId] = useState<string>(() => `qr-reader-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 7)}`);
  const scannerRef = useRef<Html5Qrcode | null>(null);

  // Mutable paused ref for rock-solid frame processing without stale closures
  const isPausedRef = useRef<boolean>(false);
  const ticketsRef = useRef<Ticket[]>(tickets);
  useEffect(() => {
    ticketsRef.current = tickets;
  }, [tickets]);

  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [autoCheckIn, setAutoCheckIn] = useState<boolean>(true);
  const [manualCodeInput, setManualCodeInput] = useState<string>('');

  // Fallback Phone Search State
  const [phoneSearchQuery, setPhoneSearchQuery] = useState<string>('');

  // Validation Result State
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [scannedPayload, setScannedPayload] = useState<string | null>(null);
  const [validationResult, setValidationResult] = useState<{
    status: 'valid' | 'already-inside' | 'exited' | 'invalid' | 'unauthorized-venue' | 'expired' | 'event-not-arrived';
    message: string;
    ticket?: Ticket;
    movementTime?: string;
  } | null>(null);

  // Offline caching & pending sync state
  const [pendingSyncCount, setPendingSyncCount] = useState<number>(() => getPendingSyncCount());
  const [offlineNotice, setOfflineNotice] = useState<string | null>(null);
  const [isSyncingOffline, setIsSyncingOffline] = useState<boolean>(false);

  const isAdmin = isUserVerifiedAdminSession(currentUser);
  const roleLower = (currentUser?.role || '').toLowerCase();
  const isPromoter =
    !isAdmin &&
    (roleLower === 'promoter' ||
      roleLower === 'event organiser' ||
      roleLower === 'organizer');
  const ownedStoreIds = useMemo(
    () => getUserOwnedStoreIds(currentUser, stores),
    [currentUser, stores]
  );
  const ownedEventIds = useMemo(
    () => getUserOwnedEventIds(currentUser, events, stores),
    [currentUser, events, stores]
  );
  const promoterStoreId = currentUser?.assignedStoreId || '';
  const promoterStoreName =
    currentUser?.assignedStoreName ||
    stores.find((s) => s.id === promoterStoreId)?.name ||
    'Your Event / Venue';

  // Strictly scope tickets to user's own events/stores unless verified Admin
  const scopedTickets = useMemo(() => {
    return getRoleScopedTickets({ tickets, currentUser, events, stores });
  }, [tickets, currentUser, events, stores]);

  // Phone Search filtered results
  const matchedPhoneTickets = useMemo(() => {
    if (!phoneSearchQuery.trim()) return [];
    return filterTicketsByPhone(scopedTickets, phoneSearchQuery.trim());
  }, [scopedTickets, phoneSearchQuery]);

  const groupedPhoneResults = useMemo(() => {
    return groupTicketsByPhone(matchedPhoneTickets);
  }, [matchedPhoneTickets]);

  // Audio feedback helper
  const playFeedbackSound = (type: 'valid' | 'error' | 'already-inside' | 'exited') => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();

      if (type === 'valid') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(784, ctx.currentTime); // G5
        osc.frequency.exponentialRampToValueAtTime(1174, ctx.currentTime + 0.12); // D6
        gain.gain.setValueAtTime(0.25, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.22);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.22);
      } else if (type === 'already-inside') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(440, ctx.currentTime); // A4
        osc.frequency.exponentialRampToValueAtTime(554, ctx.currentTime + 0.15); // C#5
        gain.gain.setValueAtTime(0.25, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.25);
      } else {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(280, ctx.currentTime);
        osc.frequency.setValueAtTime(180, ctx.currentTime + 0.12);
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.3);
      }
    } catch {
      // Audio not permitted or supported
    }

    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      if (type === 'valid') {
        navigator.vibrate([100]);
      } else if (type === 'already-inside') {
        navigator.vibrate([80, 50, 80]);
      } else {
        navigator.vibrate([150, 80, 150]);
      }
    }
  };

  // Helper to extract clean Ticket Identifier from QR text / JSON / URL
  const extractTicketId = (rawText: string): string => {
    const trimmed = rawText.trim();
    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed === 'object' && parsed !== null) {
        return (
          parsed.ticketId ||
          parsed.id ||
          parsed.bandCode ||
          parsed.code ||
          trimmed
        );
      }
    } catch {}

    try {
      if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
        const url = new URL(trimmed);
        const qTicket = url.searchParams.get('ticket') || url.searchParams.get('ticketId');
        if (qTicket) return qTicket;
        const segments = url.pathname.split('/').filter(Boolean);
        if (segments.length > 0) return segments[segments.length - 1];
      }
    } catch {}

    return trimmed;
  };

  // --------------------------------------------------------------------------
  // Process & Validate Ticket Code (Fast & Guaranteed Invalid Feedback)
  // --------------------------------------------------------------------------
  const processTicketCode = async (rawCode: string) => {
    isPausedRef.current = true;
    setIsProcessing(true);
    setScannedPayload(rawCode);

    const scan = parseCustomerQrScan(rawCode);
    if (scan.dynamicError) {
      playFeedbackSound('error');
      setValidationResult({
        status: scan.dynamicError === 'EXPIRED_SCREENSHOT' ? 'expired' : 'invalid',
        message: scan.dynamicErrorMessage,
      });
      setIsProcessing(false);
      return;
    }

    const ticketKey = scan.ticketId || scan.bandCode || scan.customerQrId || scan.userId || extractTicketId(rawCode);
    const cleanKey = ticketKey.trim().toLowerCase();

    const pickBestTicket = (list: Ticket[]): Ticket | undefined => {
      const matches = list.filter(
        (t) =>
          doesTicketMatchCustomerQr(t, scan) ||
          t.ticketId?.toLowerCase() === cleanKey ||
          t.id?.toLowerCase() === cleanKey ||
          t.bandCode?.toLowerCase() === cleanKey ||
          (t.attendeePhone && normalizePhone(t.attendeePhone) === cleanKey)
      );
      return (
        matches.find((t) => {
          const att = t.attendanceStatus || (t.status === 'used' || (t.status as string) === 'inside' ? 'INSIDE' : 'OUTSIDE');
          const exp = t.status?.toLowerCase() === 'expired' || t.status?.toLowerCase() === 'binned' || (t as any).isBinned;
          const used =
            t.status === 'used' ||
            (t.status as string) === 'inside' ||
            att === 'INSIDE' ||
            att === 'EXITED' ||
            Boolean(t.checkedAt) ||
            Boolean((t as any).checkedInAt) ||
            (Array.isArray(t.attendanceLogs) && t.attendanceLogs.length > 0);
          return isTicketPaid(t) && !used && !exp;
        }) ||
        matches.find((t) => isTicketPaid(t)) ||
        matches[0]
      );
    };

    // 1. Search locally in fresh ticketsRef
    const currentList = ticketsRef.current;
    let matched: Ticket | undefined = pickBestTicket(currentList);

    // 2. Search in local offline cached tickets
    if (!matched) {
      try {
        const offlineTickets: Ticket[] = [];
        if (defaultEventId) {
          const cached = getLocalCachedEventTickets(defaultEventId);
          if (cached) offlineTickets.push(...cached);
        } else {
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('ub_offline_event_')) {
              const raw = localStorage.getItem(key);
              if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed.tickets)) {
                  offlineTickets.push(...parsed.tickets);
                }
              }
            }
          }
        }
        matched = pickBestTicket(offlineTickets);
      } catch (err) {
        console.warn('Offline lookup error:', err);
      }
    }

    // 3. Fallback: Fast lookup in Firestore with a 1.2s timeout so it NEVER hangs
    if (!matched && navigator.onLine) {
      try {
        const firestoreLookupPromise = (async () => {
          if (ticketKey && !ticketKey.includes('/')) {
            const docRef = doc(db, 'tickets', ticketKey);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
              return { id: docSnap.id, ...docSnap.data() } as Ticket;
            }
          }
          if (scan.customerQrId) {
            const qCustQr = query(collection(db, 'tickets'), where('customerQrId', '==', scan.customerQrId));
            const snapQr = await getDocs(qCustQr);
            if (!snapQr.empty) {
              const docs = snapQr.docs.map((d) => ({ id: d.id, ...d.data() } as Ticket));
              return pickBestTicket(docs) || docs[0];
            }
          }
          if (scan.userId || scan.customerId) {
            const uidVal = scan.userId || scan.customerId || '';
            const qUid = query(collection(db, 'tickets'), where('userId', '==', uidVal));
            const snapUid = await getDocs(qUid);
            if (!snapUid.empty) {
              const docs = snapUid.docs.map((d) => ({ id: d.id, ...d.data() } as Ticket));
              return pickBestTicket(docs) || docs[0];
            }
          }
          const qTicket = query(collection(db, 'tickets'), where('ticketId', '==', ticketKey));
          const snapT = await getDocs(qTicket);
          if (!snapT.empty) {
            return { id: snapT.docs[0].id, ...snapT.docs[0].data() } as Ticket;
          }
          const qBand = query(collection(db, 'tickets'), where('bandCode', '==', ticketKey));
          const snapB = await getDocs(qBand);
          if (!snapB.empty) {
            return { id: snapB.docs[0].id, ...snapB.docs[0].data() } as Ticket;
          }
          return undefined;
        })();

        const timeoutPromise = new Promise<undefined>((resolve) =>
          setTimeout(() => resolve(undefined), 1200)
        );

        matched = await Promise.race([firestoreLookupPromise, timeoutPromise]);
      } catch (err) {
        console.warn('Firestore ticket lookup error:', err);
      }
    }

    // 4. If still NOT FOUND -> IMMEDIATELY show "TICKET NOT VALID / DECLINED"
    if (!matched) {
      playFeedbackSound('error');
      setValidationResult({
        status: 'invalid',
        message: `TICKET NOT VALID: Code "${ticketKey || rawCode}" was not found in the Universal Band system.`,
      });
      setIsProcessing(false);
      return;
    }

    // 5. Promoter / Organizer Venue & Event Authorization check
    if (!isAdmin) {
      const ownsMatchedEvent = Boolean(matched.eventId && ownedEventIds.has(matched.eventId));
      const ownsMatchedStore = Boolean(matched.storeId && ownedStoreIds.has(matched.storeId));
      if (!ownsMatchedEvent && !ownsMatchedStore) {
        playFeedbackSound('error');
        setValidationResult({
          status: 'unauthorized-venue',
          message: `UNAUTHORIZED VENUE: This ticket is for "${matched.storeName || matched.eventTitle}". You can only validate passes for ${promoterStoreName}.`,
          ticket: matched,
        });
        setIsProcessing(false);
        return;
      }
    }

    // 6. Expired / Binned check
    const isBinned =
      matched.status?.toLowerCase() === 'expired' ||
      matched.status?.toLowerCase() === 'binned' ||
      (matched as any).isBinned;

    if (isBinned) {
      playFeedbackSound('error');
      setValidationResult({
        status: 'expired',
        message: `EXPIRED PASS: Ticket ${matched.ticketId || matched.id} has expired or was moved to the recycle bin.`,
        ticket: matched,
      });
      setIsProcessing(false);
      return;
    }

    // 6.5. Payment Approval check
    if (!isTicketPaid(matched)) {
      playFeedbackSound('error');
      setValidationResult({
        status: 'invalid',
        message: `PAYMENT NOT APPROVED: Ticket ${matched.ticketId || matched.id} is waiting for payment approval and is not valid yet.`,
        ticket: matched,
      });
      setIsProcessing(false);
      return;
    }

    // 7. Event Date Arrival check
    const targetEv = events.find((e) => e.id === matched?.eventId);
    const dateToCheck = matched.eventDate || targetEv?.date;
    const arrivalCheck = hasEventDateArrived(dateToCheck);

    if (!arrivalCheck.arrived) {
      playFeedbackSound('error');
      setValidationResult({
        status: 'event-not-arrived',
        message: `EVENT DATE NOT ARRIVED: Scanning is disabled until the scheduled event date (${arrivalCheck.eventDateDisplay}).`,
        ticket: matched,
      });
      setIsProcessing(false);
      return;
    }

    // 8. Attendance Status Logic (Single-Use QR Code Enforcement)
    const currentAttendance: AttendanceStatus =
      matched.attendanceStatus ||
      (matched.status === 'used' || (matched.status as string) === 'inside' ? 'INSIDE' : 'OUTSIDE');
    const attendeeDisplayName = matched.attendeeName || matched.customerName || 'Attendee';
    const movementTime = formatMovementTime(new Date());

    const alreadyScannedOnce =
      matched.status === 'used' ||
      (matched.status as string) === 'inside' ||
      currentAttendance === 'INSIDE' ||
      currentAttendance === 'EXITED' ||
      Boolean(matched.checkedAt) ||
      Boolean((matched as any).checkedInAt) ||
      (Array.isArray(matched.attendanceLogs) && matched.attendanceLogs.length > 0);

    if (alreadyScannedOnce) {
      playFeedbackSound('error');
      setValidationResult({
        status: 'invalid',
        message: `INVALID / ALREADY USED: This QR code was already scanned once and is no longer valid.`,
        ticket: matched,
        movementTime: matched.insideSince || matched.lastMovementAt || movementTime,
      });
      setIsProcessing(false);
      return;
    }

    // Scenario C: VALID ENTRY (OUTSIDE -> INSIDE)
    playFeedbackSound('valid');

    const checkInRes = await checkInTicket(matched.ticketId || matched.id);
    const checkedTicket: Ticket = checkInRes.ticket || {
      ...matched,
      status: 'inside',
      attendanceStatus: 'INSIDE',
      insideSince: movementTime,
      lastMovementAt: movementTime,
    };

    setValidationResult({
      status: 'valid',
      message: `${attendeeDisplayName} - INSIDE THE EVENT - ${movementTime}`,
      ticket: checkedTicket,
      movementTime,
    });
    if (onTicketScanned) onTicketScanned(checkedTicket);

    setIsProcessing(false);
  };

  // --------------------------------------------------------------------------
  // Check In action handler (OUTSIDE/EXITED -> INSIDE)
  // --------------------------------------------------------------------------
  const handlePerformCheckIn = async (targetTicket: Ticket) => {
    setIsProcessing(true);
    const res = await checkInTicket(targetTicket.ticketId || targetTicket.id);
    const timeNow = formatMovementTime(new Date());
    const name = targetTicket.attendeeName || targetTicket.customerName || 'Attendee';

    if (res.success && res.ticket) {
      setValidationResult({
        status: 'valid',
        message: `${name} - INSIDE THE EVENT - ${timeNow}`,
        ticket: res.ticket,
        movementTime: timeNow,
      });
      if (onTicketScanned) onTicketScanned(res.ticket);
    } else {
      setValidationResult({
        status: 'invalid',
        message: res.message,
        ticket: targetTicket,
      });
    }
    setIsProcessing(false);
  };

  // --------------------------------------------------------------------------
  // Check Out action handler (INSIDE -> EXITED)
  // --------------------------------------------------------------------------
  const handlePerformCheckOut = async (targetTicket: Ticket) => {
    setIsProcessing(true);
    const res = await checkOutTicket(targetTicket.ticketId || targetTicket.id);
    const timeNow = formatMovementTime(new Date());
    const name = targetTicket.attendeeName || targetTicket.customerName || 'Attendee';

    if (res.success && res.ticket) {
      setValidationResult({
        status: 'exited',
        message: `${name} - EXITED at ${timeNow} - ALLOWED TO RE-ENTER`,
        ticket: res.ticket,
        movementTime: timeNow,
      });
      if (onTicketScanned) onTicketScanned(res.ticket);
    } else {
      setValidationResult({
        status: 'invalid',
        message: res.message,
        ticket: targetTicket,
      });
    }
    setIsProcessing(false);
  };

  // --------------------------------------------------------------------------
  // Stop & Cleanup Camera safely
  // --------------------------------------------------------------------------
  const stopAndCleanupCamera = async () => {
    try {
      if (scannerRef.current) {
        if (scannerRef.current.isScanning) {
          await scannerRef.current.stop();
        }
        await scannerRef.current.clear();
      }
    } catch (e) {
      // Ignore cleanup warnings
    } finally {
      // Stop all MediaStream tracks manually to guarantee camera release
      try {
        const videoElem = document.querySelector(`#${scannerId} video`) as HTMLVideoElement;
        if (videoElem && videoElem.srcObject) {
          const stream = videoElem.srcObject as MediaStream;
          stream.getTracks().forEach((track) => track.stop());
        }
      } catch {}

      scannerRef.current = null;
      setIsCameraActive(false);
    }
  };

  // --------------------------------------------------------------------------
  // Start Camera
  // --------------------------------------------------------------------------
  const startCamera = async (mode: 'environment' | 'user') => {
    setCameraError(null);

    const perm = await ensureCameraPermission();
    if (!perm.granted) {
      setIsCameraActive(false);
      setCameraError(
        perm.message ||
          'Camera access was denied. Please allow camera permissions or search attendee by phone number.'
      );
      return;
    }

    // Stop previous instance if existing
    await stopAndCleanupCamera();

    // Ensure DOM element is present before initializing Html5Qrcode
    let elem = document.getElementById(scannerId);
    if (!elem) {
      await new Promise((resolve) => setTimeout(resolve, 80));
      elem = document.getElementById(scannerId);
    }

    if (!elem) {
      console.warn(`Scanner element with id ${scannerId} not found in DOM.`);
      return;
    }

    try {
      const html5QrCode = new Html5Qrcode(scannerId);
      scannerRef.current = html5QrCode;

      const config: Html5QrcodeCameraScanConfig = {
        fps: 10,
        qrbox: (viewfinderWidth, viewfinderHeight) => {
          const edge = Math.min(viewfinderWidth, viewfinderHeight) * 0.75;
          return {
            width: Math.floor(edge),
            height: Math.floor(edge),
          };
        },
        aspectRatio: 1.0,
      };

      await html5QrCode.start(
        { facingMode: mode },
        config,
        (decodedText) => {
          // If paused (e.g. result overlay active or decoding in-progress), immediately ignore frame
          if (isPausedRef.current) return;
          processTicketCode(decodedText);
        },
        () => {}
      );

      setIsCameraActive(true);
      isPausedRef.current = false;
    } catch (err: any) {
      console.warn('Camera start error:', err);
      setIsCameraActive(false);
      const errMsg = err?.message || String(err);
      if (errMsg.includes('NotAllowedError') || errMsg.includes('Permission')) {
        setCameraError('Camera access was denied. Please allow camera permissions or search attendee by phone number.');
      } else if (errMsg.includes('NotFoundError') || errMsg.includes('DevicesNotFoundError')) {
        setCameraError('No camera found on this device. You can search by phone number or upload a QR image.');
      } else {
        setCameraError(`Camera notice: ${errMsg}. Use phone search fallback below.`);
      }
    }
  };

  // Flip Camera
  const handleToggleFacingMode = async () => {
    const nextMode = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(nextMode);
    await startCamera(nextMode);
  };

  // Upload QR Photo
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      if (!scannerRef.current) {
        scannerRef.current = new Html5Qrcode(scannerId);
      }
      const decodedText = await scannerRef.current.scanFile(file, true);
      processTicketCode(decodedText);
    } catch (err: any) {
      playFeedbackSound('error');
      setValidationResult({
        status: 'invalid',
        message: 'No readable QR code found in selected photo. Please try another image.',
      });
    } finally {
      e.target.value = '';
    }
  };

  // --------------------------------------------------------------------------
  // Scan Next Person (Reset without re-creating camera)
  // --------------------------------------------------------------------------
  const handleScanNext = useCallback(() => {
    setValidationResult(null);
    setScannedPayload(null);
    setIsProcessing(false);
    setActiveMode('camera');

    // Instantly resume scanning frames
    isPausedRef.current = false;

    // If camera somehow died, restart it
    if (!scannerRef.current || !isCameraActive) {
      startCamera(facingMode).catch(() => {});
    }
  }, [facingMode, isCameraActive]);

  // Manual code entry
  const handleManualCodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualCodeInput.trim() || isProcessing) return;
    processTicketCode(manualCodeInput.trim());
    setManualCodeInput('');
  };

  // Offline event download
  const handleDownloadOfflineData = () => {
    const targetEventId = defaultEventId || scopedTickets[0]?.eventId || 'all';
    const targetTitle =
      events.find((ev) => ev.id === targetEventId)?.title ||
      scopedTickets[0]?.eventTitle ||
      (isPromoter ? promoterStoreName : 'Universal Band Events');

    const result = downloadEventTicketsLocally(targetEventId, targetTitle, scopedTickets);
    if (result.success) {
      setOfflineNotice(`✓ Cached ${result.count} tickets & phone numbers locally! Offline gate ready.`);
    } else {
      setOfflineNotice(`Offline caching failed.`);
    }
    setTimeout(() => setOfflineNotice(null), 4000);
  };

  // Sync pending offline movements
  const handleSyncOfflineNow = async () => {
    setIsSyncingOffline(true);
    const res = await syncPendingMovementsWithFirestore();
    setIsSyncingOffline(false);
    setPendingSyncCount(getPendingSyncCount());
    if (res.success) {
      setOfflineNotice(`✓ Synced ${res.synced} offline movement timestamps to Firestore!`);
    } else {
      setOfflineNotice(`Sync notice: ${res.error || 'Failed to sync'}`);
    }
    setTimeout(() => setOfflineNotice(null), 4000);
  };

  // Clean close
  const handleClose = async () => {
    isPausedRef.current = true;
    await stopAndCleanupCamera();
    setValidationResult(null);
    if (onClose) onClose();
    else setActiveModal(null);
  };

  // --------------------------------------------------------------------------
  // Lifecycle: Initialize camera when isOpen turns true, cleanup on exit
  // --------------------------------------------------------------------------
  useEffect(() => {
    if (isOpen) {
      // Regenerate fresh scanner container ID to avoid lingering DOM conflicts
      const newScannerId = `qr-reader-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 7)}`;
      setScannerId(newScannerId);
      setValidationResult(null);
      setCameraError(null);
      isPausedRef.current = false;

      const timer = setTimeout(() => {
        if (activeMode === 'camera') {
          startCamera(facingMode);
        }
      }, 150);

      return () => {
        clearTimeout(timer);
        stopAndCleanupCamera();
      };
    } else {
      stopAndCleanupCamera();
    }
  }, [isOpen, activeMode]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-md flex flex-col items-center">
        <Scanner
          onClose={handleClose}
          onTicketVerified={(res: any) => {
            if (onTicketScanned && res?.isValid) {
              const match = tickets.find(
                (t) =>
                  (t.ticketId || t.id || t.bandCode || '').toLowerCase() ===
                  (res.ticketId || '').toLowerCase()
              );
              if (match) onTicketScanned(match);
            }
          }}
        />
      </div>
    </div>
  );
};
