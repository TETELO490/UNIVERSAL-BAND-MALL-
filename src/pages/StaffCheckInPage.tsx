import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { db } from '../firebase';
import {
  collection,
  query,
  where,
  onSnapshot,
  getDocs,
  getDoc,
  doc,
  updateDoc,
  addDoc,
  serverTimestamp,
} from 'firebase/firestore';
import {
  Radio,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Volume2,
  Smartphone,
  ShieldCheck,
  User,
  Calendar,
  MapPin,
  Clock,
  ArrowLeft,
  ChevronDown,
  Sparkles,
  Search,
  Zap,
  Ticket as TicketIcon,
  Utensils,
  Camera,
  Beer,
} from 'lucide-react';
import { playTapBeep, playSuccessChime, playErrorBuzzer } from '../utils/audio';
import { TicketQrScannerModal } from '../components/modals/TicketQrScannerModal';
import { VendorPosScannerModal } from '../components/modals/VendorPosScannerModal';
import { TicketScanResultView } from '../components/TicketScanResultView';
import { hasEventDateArrived } from '../utils/dateHelper';
import {
  parseCustomerQrScan,
  doesTicketMatchCustomerQr,
  doesReservationMatchCustomerQr,
} from '../utils/customerQr';

type OverlayState =
  | {
      type: 'VALID';
      customerName: string;
      customerPhoto?: string;
      customerId: string;
      ticketCode?: string;
      foodReservedNotice?: string;
    }
  | {
      type: 'EVENT_NOT_ARRIVED';
      customerName?: string;
      customerPhoto?: string;
      customerId: string;
      eventDate?: string;
    }
  | {
      type: 'ALREADY_USED';
      customerName: string;
      customerPhoto?: string;
      customerId: string;
      enteredAt: string;
    }
  | {
      type: 'NO_TICKET';
      customerName?: string;
      customerPhoto?: string;
      customerId: string;
    }
  | {
      type: 'FOOD_RELEASE';
      customerName: string;
      customerPhoto?: string;
      customerId: string;
      items: any[];
      storeName: string;
      hasBurger?: boolean;
      hasDrink?: boolean;
    }
  | {
      type: 'NO_FOOD_RESERVATION';
      customerName?: string;
      customerPhoto?: string;
      customerId: string;
    }
  | {
      type: 'FOOD_ALREADY_COLLECTED';
      customerName: string;
      customerPhoto?: string;
      customerId: string;
      items: any[];
    }
  | {
      type: 'DYNAMIC_QR_INVALID';
      customerName?: string;
      customerId: string;
      subtitle: string;
      reason: string;
    }
  | null;

export const StaffCheckInPage: React.FC = () => {
  const { events, stores, currentUser, navigateTo } = useApp();

  // State
  const [operatingMode, setOperatingMode] = useState<'gate' | 'bar_food'>('bar_food');
  const [selectedEventId, setSelectedEventId] = useState<string>('');
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [nfcSupported, setNfcSupported] = useState<boolean>(true);
  const [nfcError, setNfcError] = useState<string | null>(null);
  const [manualIdInput, setManualIdInput] = useState<string>('');
  const [isQrScannerOpen, setIsQrScannerOpen] = useState<boolean>(false);
  const [isVendorPosOpen, setIsVendorPosOpen] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [overlay, setOverlay] = useState<OverlayState>(null);
  const [liveTickets, setLiveTickets] = useState<any[]>([]);
  const [liveReservations, setLiveReservations] = useState<any[]>([]);
  const [recentLogs, setRecentLogs] = useState<any[]>([]);

  const ndefControllerRef = useRef<AbortController | null>(null);
  const wakeLockRef = useRef<any>(null);
  const overlayTimerRef = useRef<any>(null);

  const isStaffOrAdmin =
    currentUser.role === 'Admin' ||
    currentUser.role === 'Promoter' ||
    currentUser.role === 'Staff' ||
    (currentUser as any).isStaff === true;

  // Check NDEFReader support on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const hasNdef = 'NDEFReader' in window;
      setNfcSupported(hasNdef);
      if (!hasNdef) {
        setNfcError('Use Android Chrome with NFC ON');
      }
    }
  }, []);

  // Today's date string e.g. "Sat, 03 Oct" or "2026-10-02"
  const todayStr = useMemo(() => {
    const d = new Date();
    return d.toDateString();
  }, []);

  // Filter & prioritize events for today
  const sortedEvents = useMemo(() => {
    if (!events || events.length === 0) return [];
    return [...events].sort((a, b) => {
      // Prioritize today's events
      const aIsToday = a.date?.toLowerCase().includes('today') || a.date?.includes(todayStr);
      const bIsToday = b.date?.toLowerCase().includes('today') || b.date?.includes(todayStr);
      if (aIsToday && !bIsToday) return -1;
      if (!aIsToday && bIsToday) return 1;
      return 0;
    });
  }, [events, todayStr]);

  // Set default selected event
  useEffect(() => {
    if (sortedEvents.length > 0 && !selectedEventId) {
      setSelectedEventId(sortedEvents[0].id);
    }
  }, [sortedEvents, selectedEventId]);

  const selectedEvent = useMemo(() => {
    return events.find((e) => e.id === selectedEventId) || sortedEvents[0];
  }, [events, selectedEventId, sortedEvents]);

  // Real-time listener for tickets of the selected event (Live Counter)
  useEffect(() => {
    if (!selectedEventId) return;

    const q = query(collection(db, 'tickets'), where('eventId', '==', selectedEventId));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list: any[] = [];
        snapshot.forEach((d) => list.push({ id: d.id, ...d.data() }));
        setLiveTickets(list);
      },
      (err) => {
        console.warn('Error fetching event tickets:', err);
      }
    );

    // Also listen to recent check-in logs
    const logQ = query(collection(db, 'checkInLogs'), where('eventId', '==', selectedEventId));
    const unsubLogs = onSnapshot(
      logQ,
      (snapshot) => {
        const list: any[] = [];
        snapshot.forEach((d) => list.push({ id: d.id, ...d.data() }));
        // Sort descending
        list.sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
        setRecentLogs(list.slice(0, 5));
      },
      (err) => {
        console.warn('Error fetching logs:', err);
      }
    );

    return () => {
      unsubscribe();
      unsubLogs();
    };
  }, [selectedEventId]);

  // Real-time listener for food & drinks reservations across stores
  useEffect(() => {
    const unsubRes = onSnapshot(collection(db, 'reservations'), (snap) => {
      const list: any[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
      setLiveReservations(list);
    }, (err) => {
      console.warn('Notice: Staff live reservations listener fallback:', err);
    });
    return () => unsubRes();
  }, []);

  // Live counter calculation
  const totalCapacity = selectedEvent?.ticketsAvailable || (liveTickets.length > 0 ? liveTickets.length : 200);
  const checkedInCount = useMemo(() => {
    return liveTickets.filter(
      (t) => t.status === 'USED' || t.status === 'used' || Boolean(t.checkedInAt)
    ).length;
  }, [liveTickets]);

  // Screen Wake Lock API
  const acquireWakeLock = async () => {
    try {
      if ('wakeLock' in navigator) {
        wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
      }
    } catch (err) {
      console.warn('Wake Lock request error:', err);
    }
  };

  const releaseWakeLock = async () => {
    try {
      if (wakeLockRef.current) {
        await wakeLockRef.current.release();
        wakeLockRef.current = null;
      }
    } catch (err) {
      console.warn('Wake Lock release error:', err);
    }
  };

  // -------------------------------------------------------------
  // VALIDATION FLOW (<1 sec)
  // -------------------------------------------------------------
  const validateAndCheckIn = async (rawCustomerId: string, method: 'NFC' | 'MANUAL') => {
    if (!rawCustomerId || !selectedEventId || isProcessing) return;

    setIsProcessing(true);

    // 1. Tag Tapped: Vibrate 100ms, play beep sound immediately
    try {
      if (navigator.vibrate) navigator.vibrate(100);
    } catch (e) {}
    playTapBeep();

    const cleanCustomerId = rawCustomerId.trim();

    try {
      // Parse scanned payload (supports live Dynamic Profile ONE QR, phone, or band/ticket ID)
      const scan = parseCustomerQrScan(cleanCustomerId);
      if (scan.dynamicError) {
        playErrorBuzzer();
        try {
          if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
        } catch (e) {}
        triggerOverlay(
          {
            type: 'DYNAMIC_QR_INVALID',
            customerName: scan.name || 'Blocked QR',
            customerId: cleanCustomerId.slice(0, 24),
            subtitle:
              scan.dynamicError === 'EXPIRED_SCREENSHOT'
                ? 'Screenshot / Expired QR'
                : scan.dynamicError === 'INVALID_SIGNATURE'
                ? 'Invalid QR Signature'
                : 'Static QR Blocked',
            reason: scan.dynamicErrorMessage,
          },
          5000
        );
        setIsProcessing(false);
        return;
      }
      const isDirectFoodReleaseQr = scan.raw.startsWith('{') && scan.raw.includes('ub_food_release');
      const targetReservationId = scan.reservationId || '';
      const resolvedCustomerId =
        scan.userId || scan.customerId || scan.customerQrId || scan.phone || cleanCustomerId;

      // 2. Query customer details from Firestore
      let customerName = scan.name || 'Customer ' + resolvedCustomerId.slice(-4);
      let customerPhoto = 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80';

      // Check users collection first
      try {
        const userDoc = await getDoc(doc(db, 'users', resolvedCustomerId));
        if (userDoc.exists()) {
          const udata = userDoc.data();
          customerName = udata.fullName || udata.name || customerName;
          customerPhoto = udata.photo || customerPhoto;
        } else {
          const custDoc = await getDoc(doc(db, 'customers', resolvedCustomerId));
          if (custDoc.exists()) {
            const cdata = custDoc.data();
            customerName = cdata.fullName || cdata.name || customerName;
            customerPhoto = cdata.photo || customerPhoto;
          }
        }
      } catch (err) {
        console.warn('Customer lookup warning:', err);
      }

      // -------------------------------------------------------------
      // BAR & FOOD COUNTER RELEASE FLOW (NFC Wristband / Profile ONE QR)
      // -------------------------------------------------------------
      if (operatingMode === 'bar_food' || isDirectFoodReleaseQr) {
        const cleanLower = cleanCustomerId.toLowerCase();
        const resolvedLower = resolvedCustomerId.toLowerCase();
        const knownIds = new Set<string>([cleanLower, resolvedLower]);

        if (scan.customerQrId) knownIds.add(scan.customerQrId.toLowerCase());
        if (scan.userId) knownIds.add(scan.userId.toLowerCase());
        if (scan.customerId) knownIds.add(scan.customerId.toLowerCase());

        // Cross-reference live tickets for linked customer ID numbers, customerQrIds, or band codes
        liveTickets.forEach((t) => {
          if (doesTicketMatchCustomerQr(t, scan)) {
            [t.customerIdNumber, t.userId, t.customerQrId, t.bandCode, t.id]
              .filter(Boolean)
              .forEach((id: string) => knownIds.add(id.toLowerCase()));
          }
        });

        // Look up all reservations matching this Customer ONE QR or NFC ID
        const matchingReservations = liveReservations.filter((r) => {
          if (targetReservationId && r.id === targetReservationId) return true;
          if (doesReservationMatchCustomerQr(r, scan)) return true;
          const rCust = (r.customerId || '').toLowerCase();
          const rWall = (r.walletId || '').toLowerCase();
          const rBen = (r.beneficiaryId || '').toLowerCase();
          const rId = (r.id || '').toLowerCase();
          const rNum = (r.customerIdNumber || '').toLowerCase();
          const rCode = (r.collectionCode || '').toLowerCase();
          const rQr = (r.customerQrId || '').toLowerCase();

          return (
            knownIds.has(rCust) ||
            knownIds.has(rWall) ||
            knownIds.has(rBen) ||
            knownIds.has(rId) ||
            knownIds.has(rNum) ||
            knownIds.has(rCode) ||
            (rQr && knownIds.has(rQr))
          );
        });

        const pendingItems = matchingReservations.filter(
          (r) => r.status === 'paid' || r.status === 'reserved' || r.status === 'reserved_for_event'
        );
        const collectedItems = matchingReservations.filter(
          (r) => r.status === 'collected' || r.status === 'released'
        );

        if (pendingItems.length > 0) {
          playSuccessChime();
          try {
            if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
          } catch (e) {}

          const hasBurger = pendingItems.some((i) => (i.itemName || '').toLowerCase().includes('burger'));
          const hasDrink = pendingItems.some((i) => (i.category === 'drink' || i.isAlcohol || i.subCategory === 'alcohol' || i.subCategory === 'soft'));

          triggerOverlay(
            {
              type: 'FOOD_RELEASE',
              customerId: resolvedCustomerId,
              customerName: pendingItems[0]?.customerName || customerName,
              customerPhoto: pendingItems[0]?.customerPhoto || customerPhoto,
              items: pendingItems,
              storeName: pendingItems[0]?.storeName || selectedEvent?.location || 'Bar Counter',
              hasBurger,
              hasDrink,
            },
            18000
          );
        } else if (collectedItems.length > 0) {
          playErrorBuzzer();
          try {
            if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
          } catch (e) {}

          triggerOverlay(
            {
              type: 'FOOD_ALREADY_COLLECTED',
              customerId: resolvedCustomerId,
              customerName,
              customerPhoto,
              items: collectedItems,
            },
            4000
          );
        } else {
          playErrorBuzzer();
          try {
            if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
          } catch (e) {}

          triggerOverlay(
            {
              type: 'NO_FOOD_RESERVATION',
              customerId: resolvedCustomerId,
              customerName,
              customerPhoto,
            },
            4000
          );
        }
        setIsProcessing(false);
        return;
      }

      // 3. Query ticket for this event (using Customer ONE QR / NFC ID)
      const pickUnusedFirst = (list: any[]) => {
        const matches = list.filter((t) => doesTicketMatchCustomerQr(t, scan));
        return (
          matches.find((t) => {
            const att = t.attendanceStatus || (t.status === 'used' ? 'INSIDE' : 'OUTSIDE');
            return att !== 'INSIDE' && t.status?.toLowerCase() !== 'expired';
          }) || matches[0]
        );
      };

      let matchedTicket: any = pickUnusedFirst(liveTickets) || null;

      // If not in memory for current event, query Firestore for this event
      if (!matchedTicket) {
        const ticketsRef = collection(db, 'tickets');
        const qTickets = query(ticketsRef, where('eventId', '==', selectedEventId));
        const ticketSnap = await getDocs(qTickets);
        const docs = ticketSnap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
        matchedTicket = pickUnusedFirst(docs) || null;
      }

      // If still not matched, check all events
      if (!matchedTicket) {
        const ticketsRef = collection(db, 'tickets');
        const allTicketSnap = await getDocs(ticketsRef);
        const docs = allTicketSnap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
        matchedTicket = pickUnusedFirst(docs) || null;

        // If matched to an event, auto-select that event
        if (matchedTicket?.eventId && matchedTicket.eventId !== selectedEventId) {
          setSelectedEventId(matchedTicket.eventId);
        }
      }

      // 4. RESULTS EVALUATION
      if (!matchedTicket) {
        // CASE A: NO TICKET FOR THIS EVENT
        playErrorBuzzer();
        try {
          if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
        } catch (e) {}

        // Log attempt
        await addDoc(collection(db, 'checkInLogs'), {
          customerId: cleanCustomerId,
          customerName,
          eventId: selectedEventId,
          eventTitle: selectedEvent?.title || 'Unknown Event',
          status: 'NO_TICKET',
          method,
          staffId: currentUser.id,
          staffName: currentUser.name,
          timestamp: serverTimestamp(),
          createdAt: new Date().toISOString(),
        });

        triggerOverlay({
          type: 'NO_TICKET',
          customerId: cleanCustomerId,
          customerName,
          customerPhoto,
        });
      } else if (!hasEventDateArrived(matchedTicket.eventDate || selectedEvent?.date).arrived) {
        // CASE: EVENT DATE HAS NOT YET ARRIVED
        playErrorBuzzer();
        try {
          if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
        } catch (e) {}

        const arrivalInfo = hasEventDateArrived(matchedTicket.eventDate || selectedEvent?.date);

        // Log attempt
        await addDoc(collection(db, 'checkInLogs'), {
          customerId: cleanCustomerId,
          customerName: matchedTicket.customerName || customerName,
          eventId: selectedEventId,
          eventTitle: selectedEvent?.title || 'Unknown Event',
          status: 'EVENT_NOT_ARRIVED',
          method,
          staffId: currentUser.id,
          staffName: currentUser.name,
          timestamp: serverTimestamp(),
          createdAt: new Date().toISOString(),
        });

        triggerOverlay({
          type: 'EVENT_NOT_ARRIVED',
          customerId: cleanCustomerId,
          customerName: matchedTicket.customerName || customerName,
          customerPhoto: matchedTicket.customerPhoto || customerPhoto,
          eventDate: arrivalInfo.eventDateDisplay,
        });
      } else if (
        matchedTicket.status === 'USED' ||
        matchedTicket.status === 'used' ||
        (matchedTicket.status as string) === 'inside' ||
        matchedTicket.attendanceStatus === 'INSIDE' ||
        Boolean(matchedTicket.checkedInAt)
      ) {
        // CASE B: ALREADY USED
        playErrorBuzzer();
        try {
          if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
        } catch (e) {}

        const entryTime = matchedTicket.checkedInAt
          ? typeof matchedTicket.checkedInAt === 'string'
            ? matchedTicket.checkedInAt
            : new Date(matchedTicket.checkedInAt.seconds * 1000).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })
          : 'earlier today';

        // Log attempt
        await addDoc(collection(db, 'checkInLogs'), {
          customerId: cleanCustomerId,
          customerName: matchedTicket.customerName || customerName,
          eventId: selectedEventId,
          eventTitle: selectedEvent?.title || 'Unknown Event',
          status: 'ALREADY_USED',
          method,
          staffId: currentUser.id,
          staffName: currentUser.name,
          timestamp: serverTimestamp(),
          createdAt: new Date().toISOString(),
        });

        triggerOverlay({
          type: 'ALREADY_USED',
          customerId: cleanCustomerId,
          customerName: matchedTicket.customerName || customerName,
          customerPhoto: matchedTicket.customerPhoto || customerPhoto,
          enteredAt: entryTime,
        });
      } else {
        // CASE C: VALID TICKET - WELCOME!
        playSuccessChime();
        try {
          if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
        } catch (e) {}

        // Update ticket in Firestore - Save status as 'inside'
        const nowIso = new Date().toISOString();
        const timeFormatted = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
        const ticketRef = doc(db, 'tickets', matchedTicket.id);
        await updateDoc(ticketRef, {
          status: 'inside',
          attendanceStatus: 'INSIDE',
          insideSince: timeFormatted,
          lastMovementAt: timeFormatted,
          checkedInAt: nowIso,
          checkedInBy: currentUser.id,
          checkedInStaffName: currentUser.name,
        });

        // Log attempt
        await addDoc(collection(db, 'checkInLogs'), {
          customerId: cleanCustomerId,
          customerName: matchedTicket.customerName || customerName,
          eventId: selectedEventId,
          eventTitle: selectedEvent?.title || 'Unknown Event',
          ticketId: matchedTicket.id,
          status: 'VALID',
          method,
          staffId: currentUser.id,
          staffName: currentUser.name,
          timestamp: serverTimestamp(),
          createdAt: nowIso,
        });

        // Check if customer also has food/drinks reserved
        const customerFoodItems = liveReservations.filter(
          (r) =>
            (r.customerId === cleanCustomerId || r.walletId === cleanCustomerId) &&
            (r.status === 'paid' || r.status === 'reserved')
        );
        const foodNotice =
          customerFoodItems.length > 0
            ? customerFoodItems.map((i) => `${i.itemName} (×${i.quantity || 1})`).join(', ')
            : undefined;

        triggerOverlay({
          type: 'VALID',
          customerId: cleanCustomerId,
          customerName: matchedTicket.customerName || customerName,
          customerPhoto: matchedTicket.customerPhoto || customerPhoto,
          ticketCode: matchedTicket.bandCode || matchedTicket.qrCode || matchedTicket.id,
          foodReservedNotice: foodNotice,
        });
      }
    } catch (err: any) {
      console.error('Validation error:', err);
      playErrorBuzzer();
      triggerOverlay({
        type: 'NO_TICKET',
        customerId: cleanCustomerId,
        customerName: 'Error validating tag',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // Helper to trigger full screen overlay and auto-resume
  const triggerOverlay = (state: OverlayState, durationMs: number = 3000) => {
    if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
    setOverlay(state);

    if (durationMs > 0) {
      overlayTimerRef.current = setTimeout(() => {
        setOverlay(null);
      }, durationMs);
    }
  };

  const handleConfirmFoodRelease = async (items: any[]) => {
    try {
      for (const item of items) {
        await updateDoc(doc(db, 'reservations', item.id), {
          status: 'collected',
          collectedAt: new Date().toISOString(),
          collectedBy: currentUser.name || 'Bar Counter Staff',
        });
      }
      playSuccessChime();
      try {
        if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
      } catch (e) {}
      setOverlay(null);
    } catch (err) {
      console.warn('Food release update error:', err);
    }
  };

  // -------------------------------------------------------------
  // START & STOP TAP SCANNING
  // -------------------------------------------------------------
  const startScanning = async () => {
    if (!('NDEFReader' in window)) {
      setNfcError('Use Android Chrome with NFC ON');
      return;
    }

    try {
      setNfcError(null);
      const controller = new AbortController();
      ndefControllerRef.current = controller;

      const ndef = new (window as any).NDEFReader();
      await ndef.scan({ signal: controller.signal });
      setIsScanning(true);
      await acquireWakeLock();

      ndef.onreading = async (event: any) => {
        let detectedId = '';

        // 1. Check records
        if (event.message?.records && event.message.records.length > 0) {
          for (const record of event.message.records) {
            try {
              const decoder = new TextDecoder();
              const text = decoder.decode(record.data);
              // Support URL format: https://myapp.com/customer/ID
              if (text.includes('/customer/')) {
                const parts = text.split('/customer/');
                detectedId = parts[parts.length - 1].replace(/[^a-zA-Z0-9_-]/g, '').trim();
              } else {
                detectedId = text.trim();
              }
              if (detectedId) break;
            } catch (e) {
              console.warn('Record decode error:', e);
            }
          }
        }

        // 2. Fallback to serialNumber
        if (!detectedId && event.serialNumber) {
          detectedId = event.serialNumber;
        }

        if (detectedId) {
          await validateAndCheckIn(detectedId, 'NFC');
        }
      };

      ndef.onreadingerror = () => {
        playErrorBuzzer();
        console.warn('NFC read error on tag');
      };
    } catch (err: any) {
      console.error('NFC Scan Start Error:', err);
      setIsScanning(false);
      setNfcError(err.message || 'Could not start NFC scan. Make sure NFC is enabled.');
      await releaseWakeLock();
    }
  };

  const stopScanning = async () => {
    if (ndefControllerRef.current) {
      ndefControllerRef.current.abort();
      ndefControllerRef.current = null;
    }
    setIsScanning(false);
    await releaseWakeLock();
  };

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (ndefControllerRef.current) {
        ndefControllerRef.current.abort();
      }
      releaseWakeLock();
      if (overlayTimerRef.current) {
        clearTimeout(overlayTimerRef.current);
      }
    };
  }, []);

  // Handle Manual ID Check-In
  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualIdInput.trim()) return;
    validateAndCheckIn(manualIdInput.trim(), 'MANUAL');
    setManualIdInput('');
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white pb-28 pt-4 px-4 max-w-md mx-auto relative select-none">
      {/* Top Header */}
      <div className="flex items-center justify-between mb-4">
        <button
          type="button"
          onClick={() => navigateTo('/')}
          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white font-bold transition cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Home</span>
        </button>

        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400 bg-emerald-950/60 border border-emerald-500/40 px-2.5 py-0.5 rounded-full flex items-center gap-1">
            <Radio className="w-3 h-3 text-emerald-400 animate-pulse" />
            <span>DOOR GATEWAY</span>
          </span>
        </div>
      </div>

      {/* Operating Mode Selector: Gate vs Bar & Food Counter */}
      <div className="grid grid-cols-2 gap-2 p-1.5 bg-[#151515] rounded-2xl border border-white/10 mb-4 shadow-inner">
        <button
          type="button"
          onClick={() => setOperatingMode('gate')}
          className={`py-3 px-3 rounded-xl font-black text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
            operatingMode === 'gate'
              ? 'bg-[#FACC15] text-black shadow-md shadow-yellow-400/20'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          <TicketIcon className="w-4 h-4" />
          <span>Door Gate (Passes)</span>
        </button>

        <button
          type="button"
          onClick={() => setOperatingMode('bar_food')}
          className={`py-3 px-3 rounded-xl font-black text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
            operatingMode === 'bar_food'
              ? 'bg-[#FACC15] text-black shadow-md shadow-yellow-400/20'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          <Utensils className="w-4 h-4" />
          <span>Bar & Food Counter (NFC)</span>
        </button>
      </div>

      {/* Page Title */}
      <div className="mb-4">
        <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
          {operatingMode === 'bar_food' ? (
            <>
              <Utensils className="w-6 h-6 text-[#FACC15]" />
              <span>Bar & Food Release Counter</span>
            </>
          ) : (
            <>
              <Smartphone className="w-6 h-6 text-[#FACC15]" />
              <span>Event Check-In Door</span>
            </>
          )}
        </h1>
        <p className="text-xs text-gray-400 mt-0.5">
          {operatingMode === 'bar_food'
            ? 'TAP WRISTBAND TO RELEASE • System checks profile for burger & drink pre-orders'
            : 'TAP TO ENTER • Ultra-fast NFC wristband & phone gate verification'}
        </p>
      </div>

      {/* Role Notice if role is Customer */}
      {!isStaffOrAdmin && (
        <div className="mb-4 p-3 bg-amber-500/10 border border-amber-500/40 rounded-2xl flex items-center justify-between gap-2">
          <div className="text-xs text-amber-300">
            <span className="font-bold block">Staff / Admin Access Only</span>
            <span className="text-[10px] text-gray-400">Sign in with an approved Staff or Admin account for door controls</span>
          </div>
        </div>
      )}

      {/* 1. SELECT TODAY'S EVENT & LIVE COUNTER */}
      <div className="bg-[#151515] border border-white/10 rounded-3xl p-4 shadow-xl mb-4 space-y-3">
        <div>
          <label className="block text-[11px] font-black uppercase tracking-wider text-gray-400 mb-1.5 flex items-center justify-between">
            <span>Select Today's Event</span>
            <span className="text-[10px] text-[#FACC15] font-bold">Live Synced</span>
          </label>
          <div className="relative">
            <select
              value={selectedEventId}
              onChange={(e) => setSelectedEventId(e.target.value)}
              className="w-full bg-[#1F1F1F] border border-white/15 rounded-2xl px-3.5 py-3 text-xs font-bold text-white focus:outline-none focus:border-[#FACC15] appearance-none pr-10 transition cursor-pointer"
            >
              {sortedEvents.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.title} @ {ev.location || 'Florence Palm'} ({ev.date})
                </option>
              ))}
            </select>
            <ChevronDown className="w-4 h-4 text-gray-400 absolute right-3.5 top-3.5 pointer-events-none" />
          </div>
        </div>

        {/* Live Counter: "Checked in: 45 / 200" */}
        <div className="bg-black/50 border border-white/5 rounded-2xl p-3 flex items-center justify-between">
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-gray-400 block">
              GATE ATTENDANCE
            </span>
            <div className="text-xl font-black text-white mt-0.5 tracking-tight flex items-baseline gap-1">
              <span className="text-emerald-400 font-mono">{checkedInCount}</span>
              <span className="text-gray-500 font-mono text-sm">/ {totalCapacity}</span>
              <span className="text-[11px] font-semibold text-gray-400 ml-1">Checked In</span>
            </div>
          </div>

          {/* Mini Progress Ring / Badge */}
          <div className="text-right">
            <span className="text-[10px] font-black text-emerald-400 bg-emerald-950/70 border border-emerald-500/40 px-2 py-0.5 rounded-full inline-block">
              {totalCapacity > 0 ? Math.round((checkedInCount / totalCapacity) * 100) : 0}% Entered
            </span>
            <span className="text-[10px] text-gray-500 block mt-1">
              {Math.max(0, totalCapacity - checkedInCount)} remaining
            </span>
          </div>
        </div>
      </div>

      {/* 2. QR Code Camera Scanner & NFC Tap Check-in Buttons */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mb-4">
        <button
          type="button"
          onClick={() => setIsQrScannerOpen(true)}
          className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-[#FACC15] via-yellow-400 to-amber-500 hover:brightness-105 active:scale-98 text-black font-black text-sm tracking-wide shadow-xl shadow-yellow-400/20 transition-all flex items-center justify-center gap-2 cursor-pointer"
        >
          <Camera className="w-5 h-5 stroke-[2.5]" />
          <span>SCAN TICKET QR CODE</span>
        </button>

        <button
          type="button"
          onClick={() => setIsVendorPosOpen(true)}
          className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600 hover:brightness-105 active:scale-98 text-black font-black text-sm tracking-wide shadow-xl shadow-emerald-500/20 transition-all flex items-center justify-center gap-2 cursor-pointer"
        >
          <Beer className="w-5 h-5 stroke-[2.5]" />
          <span>VENDOR POS TERMINAL</span>
        </button>

        {!isScanning ? (
          <button
            type="button"
            onClick={startScanning}
            disabled={!selectedEventId}
            className="w-full py-3.5 px-4 rounded-2xl bg-zinc-800 hover:bg-zinc-700 text-white font-black text-sm tracking-wide border border-white/10 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 sm:col-span-2"
          >
            <Radio className="w-5 h-5 stroke-[2.5] text-[#FACC15]" />
            <span>START NFC TAP CHECK-IN</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={stopScanning}
            className="w-full py-3.5 px-4 rounded-2xl bg-rose-600 hover:bg-rose-500 active:scale-98 text-white font-black text-sm tracking-wide shadow-xl shadow-rose-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer animate-pulse sm:col-span-2"
          >
            <XCircle className="w-6 h-6 stroke-[2.5]" />
            <span>STOP NFC SCANNING</span>
          </button>
        )}
      </div>

      {/* NFC Error Notice if Android Chrome NFC is not active */}
      {nfcError && (
        <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/30 rounded-2xl flex items-center gap-2.5 text-xs text-rose-300">
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          <div className="flex-1">
            <span className="font-bold block">NFC Hardware Note</span>
            <span className="text-[11px] text-gray-300">{nfcError}</span>
          </div>
        </div>
      )}

      {/* 3. STATUS AREA BELOW BUTTON: PULSING NFC ANIMATION */}
      <div className="bg-[#151515] border border-white/10 rounded-3xl p-6 shadow-xl mb-4 text-center">
        {isScanning ? (
          <div className="space-y-4 py-2">
            {/* Concentric Pulsing Radar Animation */}
            <div className="relative w-28 h-28 mx-auto flex items-center justify-center">
              <div className="absolute inset-0 rounded-full bg-emerald-500/20 animate-ping opacity-75" />
              <div className="absolute inset-2 rounded-full bg-emerald-500/30 animate-pulse" />
              <div className="w-16 h-16 rounded-full bg-emerald-500 flex items-center justify-center text-black font-black shadow-lg shadow-emerald-500/50 relative z-10">
                <Radio className="w-8 h-8 stroke-[2.5] animate-spin" style={{ animationDuration: '6s' }} />
              </div>
            </div>

            <div>
              <h3 className="text-base font-black text-emerald-400">
                Ready to tap...
              </h3>
              <p className="text-xs text-gray-300 mt-1 max-w-xs mx-auto">
                Hold customer's NFC tag, wristband, or phone back-to-back near this phone
              </p>
            </div>

            <div className="inline-flex items-center gap-1.5 text-[10px] text-gray-400 bg-white/5 px-3 py-1 rounded-full border border-white/10">
              <Volume2 className="w-3.5 h-3.5 text-[#FACC15]" />
              <span>Sound & Vibrate Enabled • Screen Awake</span>
            </div>
          </div>
        ) : (
          <div className="space-y-2 py-4">
            <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 mx-auto flex items-center justify-center text-gray-500">
              <Radio className="w-7 h-7 stroke-[2]" />
            </div>
            <h3 className="text-sm font-bold text-gray-300">Scanner is Inactive</h3>
            <p className="text-xs text-gray-500 max-w-xs mx-auto">
              Tap <strong className="text-emerald-400">START TAP CHECK-IN</strong> above to start validating gate passes instantly.
            </p>
          </div>
        )}
      </div>

      {/* 5. MANUAL ID ENTRY FALLBACK INPUT */}
      <div className="bg-[#151515] border border-white/10 rounded-3xl p-4 shadow-xl mb-4">
        <span className="text-[10px] font-black uppercase tracking-wider text-gray-400 block mb-2">
          Manual Fallback Entry
        </span>

        <form onSubmit={handleManualSubmit} className="flex gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              placeholder="Or enter Customer ID manually"
              value={manualIdInput}
              onChange={(e) => setManualIdInput(e.target.value)}
              className="w-full bg-[#1C1C1C] border border-white/10 rounded-xl pl-9 pr-3 py-2.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-[#FACC15] font-mono"
            />
            <Search className="w-4 h-4 text-gray-500 absolute left-3 top-3 pointer-events-none" />
          </div>

          <button
            type="button"
            onClick={() => setIsQrScannerOpen(true)}
            className="px-3 py-2.5 bg-white/10 hover:bg-[#FACC15] hover:text-black text-[#FACC15] rounded-xl transition cursor-pointer flex items-center justify-center border border-white/10"
            title="Scan Ticket QR with Camera"
          >
            <Camera className="w-4 h-4 stroke-[2.5]" />
          </button>

          <button
            type="submit"
            disabled={!manualIdInput.trim() || isProcessing}
            className="px-4 py-2.5 rounded-xl bg-[#FACC15] hover:bg-yellow-400 active:scale-95 text-black font-extrabold text-xs transition cursor-pointer disabled:opacity-50"
          >
            Check In
          </button>
        </form>
      </div>

      {/* Recent Door Check-In Activity */}
      {recentLogs.length > 0 && (
        <div className="space-y-2">
          <span className="text-[10px] font-black uppercase tracking-wider text-gray-400 block px-1">
            Recent Door Scans
          </span>
          <div className="space-y-1.5">
            {recentLogs.map((log) => (
              <div
                key={log.id}
                className="bg-[#141414] border border-white/5 rounded-xl p-2.5 flex items-center justify-between text-xs"
              >
                <div className="flex items-center gap-2">
                  {log.status === 'VALID' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  ) : log.status === 'ALREADY_USED' ? (
                    <Clock className="w-4 h-4 text-amber-400 shrink-0" />
                  ) : (
                    <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  )}
                  <div>
                    <span className="font-bold text-white block">{log.customerName}</span>
                    <span className="text-[10px] text-gray-500 font-mono">
                      ID: {log.customerId} • {log.method}
                    </span>
                  </div>
                </div>

                <span
                  className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${
                    log.status === 'VALID'
                      ? 'bg-emerald-950 text-emerald-400 border border-emerald-500/30'
                      : log.status === 'ALREADY_USED'
                      ? 'bg-amber-950 text-amber-400 border border-amber-500/30'
                      : 'bg-rose-950 text-rose-400 border border-rose-500/30'
                  }`}
                >
                  {log.status.replace('_', ' ')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 4. FULL-SCREEN RESULTS OVERLAY (<1 sec feedback, 5-sec timer) */}
      {/* ------------------------------------------------------------- */}
      {overlay && overlay.type === 'VALID' && (
        <TicketScanResultView
          isFullScreen={true}
          status="approved"
          title="ENTERED ✓"
          subtitle="inside"
          attendeeName={overlay.customerName}
          ticketCode={overlay.ticketCode || overlay.customerId}
          eventTitle={selectedEvent?.title}
          onScanNext={() => setOverlay(null)}
          autoCloseSeconds={5}
        >
          {overlay.foodReservedNotice && (
            <div className="bg-black/60 border border-white/10 rounded-2xl p-3 text-xs text-yellow-300 font-bold text-left flex items-start gap-2 shadow-lg">
              <Utensils className="w-4 h-4 shrink-0 mt-0.5 text-yellow-400" />
              <div>
                <span className="block text-white font-extrabold text-[11px] uppercase tracking-wider">
                  Food / Drink Reserved:
                </span>
                <span className="text-gray-300 text-xs">
                  {overlay.foodReservedNotice} ready for collection at the bar counter!
                </span>
              </div>
            </div>
          )}
        </TicketScanResultView>
      )}

      {/* DECLINED TICKET RESULTS OVERLAY (Clean monochrome, animated sign of decline, 5s countdown, skip button) */}
      {overlay &&
        (overlay.type === 'EVENT_NOT_ARRIVED' ||
          overlay.type === 'ALREADY_USED' ||
          overlay.type === 'NO_TICKET' ||
          overlay.type === 'NO_FOOD_RESERVATION' ||
          overlay.type === 'FOOD_ALREADY_COLLECTED' ||
          overlay.type === 'DYNAMIC_QR_INVALID') && (
          <TicketScanResultView
            isFullScreen={true}
            status="declined"
            title="DECLINED ✕"
            subtitle={
              overlay.type === 'EVENT_NOT_ARRIVED'
                ? 'Event Date Not Arrived'
                : overlay.type === 'ALREADY_USED'
                ? 'Already Entered'
                : overlay.type === 'NO_TICKET'
                ? 'No Valid Pass Found'
                : overlay.type === 'FOOD_ALREADY_COLLECTED'
                ? 'Already Collected'
                : overlay.type === 'DYNAMIC_QR_INVALID'
                ? overlay.subtitle
                : 'No Reservation'
            }
            reason={
              overlay.type === 'EVENT_NOT_ARRIVED'
                ? `The date for this event has not yet arrived (${overlay.eventDate || 'Scheduled in future'}). Scanning is disabled until the event date.`
                : overlay.type === 'ALREADY_USED'
                ? `Checked in at ${overlay.enteredAt || 'earlier'}. Pass cannot be reused.`
                : overlay.type === 'NO_TICKET'
                ? 'No active ticket or pass found for this event in Universal Band system.'
                : overlay.type === 'FOOD_ALREADY_COLLECTED'
                ? `Reserved items for ${overlay.customerName} were already released earlier.`
                : overlay.type === 'DYNAMIC_QR_INVALID'
                ? overlay.reason
                : `No burger or drink reservations found on this profile.`
            }
            attendeeName={overlay.customerName}
            ticketCode={overlay.customerId}
            eventTitle={selectedEvent?.title}
            onScanNext={() => setOverlay(null)}
            autoCloseSeconds={5}
          />
        )}

      {/* FOOD RELEASE CONFIRMATION OVERLAY (BAR COUNTER WRISTBAND TAP) */}
      {overlay && overlay.type === 'FOOD_RELEASE' && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center p-6 text-center bg-[#0A0B0E]/95 backdrop-blur-xl animate-in fade-in duration-200">
          <div className="w-full max-w-sm mx-auto space-y-4">
            <div className="bg-emerald-950/80 border border-emerald-500/30 px-6 py-4 rounded-2xl">
              <h3 className="text-xl font-black uppercase tracking-wider text-emerald-400 flex items-center justify-center gap-2">
                <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                <span>FOOD &amp; DRINKS VERIFIED</span>
              </h3>
              <p className="text-xs font-semibold text-emerald-200/80 mt-1">
                {overlay.customerName} • ID: {overlay.customerId}
              </p>
            </div>

            {/* Reserved Food & Drinks items list */}
            <div className="bg-[#111216] rounded-2xl p-4 border border-white/10 text-left space-y-2.5 max-h-56 overflow-y-auto shadow-inner">
              <span className="text-[10px] font-black uppercase tracking-wider text-[#FACC15] block">
                RESERVED ON {overlay.customerName.toUpperCase()}&apos;S PROFILE:
              </span>
              {overlay.items.map((it: any) => (
                <div
                  key={it.id}
                  className="flex items-center justify-between bg-white/5 p-2.5 rounded-xl border border-white/10"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-2xl">
                      {it.category === 'drink' || it.isAlcohol ? '🍹' : '🍔'}
                    </span>
                    <div>
                      <span className="text-xs font-black text-white block leading-tight">
                        {it.itemName}
                      </span>
                      <span className="text-[10px] text-gray-400">
                        Qty: <strong className="text-white font-mono">{it.quantity || 1}</strong> •
                        Paid: R{Number(it.total || it.price || 0).toFixed(0)}
                      </span>
                    </div>
                  </div>
                  <span className="text-[9px] font-black uppercase text-emerald-400 bg-emerald-950 px-2 py-0.5 rounded-full border border-emerald-500/40">
                    PAID ✓
                  </span>
                </div>
              ))}
            </div>

            {/* Release Handover Action Button */}
            <button
              type="button"
              onClick={() => handleConfirmFoodRelease(overlay.items)}
              className="w-full py-4 bg-[#FACC15] hover:bg-yellow-400 active:scale-95 text-black font-black text-xs sm:text-sm rounded-2xl shadow-2xl transition cursor-pointer flex items-center justify-center gap-2"
            >
              <CheckCircle2 className="w-5 h-5 stroke-[2.5]" />
              <span>
                {overlay.hasBurger
                  ? 'THE BAR RELEASES THE BURGER (CONFIRM)'
                  : overlay.hasDrink
                  ? 'THE BAR RELEASES THE DRINKS (CONFIRM)'
                  : 'THE BAR RELEASES ITEMS (CONFIRM)'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setOverlay(null)}
              className="w-full py-3 bg-white/10 hover:bg-white/15 text-gray-300 font-bold text-xs rounded-xl transition cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Camera QR Code Ticket Scanner */}
      <TicketQrScannerModal
        isOpen={isQrScannerOpen}
        onClose={() => setIsQrScannerOpen(false)}
        onTicketScanned={(t) => {
          setRecentLogs((prev) => [
            {
              id: `log-${Date.now()}`,
              customerName: t.customerName,
              customerId: t.customerIdNumber || t.ticketId || t.id,
              status: 'VALID',
              method: 'QR CAMERA',
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            },
            ...prev.slice(0, 9),
          ]);
        }}
      />

      {/* Vendor POS Scanner Terminal Modal */}
      <VendorPosScannerModal
        isOpen={isVendorPosOpen}
        onClose={() => setIsVendorPosOpen(false)}
      />
    </div>
  );
};
