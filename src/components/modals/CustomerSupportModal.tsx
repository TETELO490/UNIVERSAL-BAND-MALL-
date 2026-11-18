import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import {
  X,
  Send,
  Camera,
  Image as ImageIcon,
  Headphones,
  CheckCircle2,
  Clock,
  AlertCircle,
  HelpCircle,
  Ticket as TicketIcon,
  ChevronDown,
  Sparkles,
  ExternalLink,
  Mic,
  Square,
  Phone,
  MessageCircle,
} from 'lucide-react';
import { fileToBase64 } from '../../utils/imageUploadHelper';
import { isTicketWaitingPayment, isTicketPaid } from '../../utils/ticketStatus';
import { doesUserPersonallyOwnTicket, isLegacyTestTicket } from '../../utils/legacyCleanup';
import {
  ensureCameraPermission,
  ensureMicrophonePermission,
  ensurePhotosPermission,
} from '../../utils/nativePermissions';
import { SupportMessage, SupportTicketAttachment, Ticket } from '../../types';

export const CustomerSupportModal: React.FC = () => {
  const {
    currentUser,
    tickets,
    activeCustomerChat,
    sendCustomerSupportMessage,
    markChatAsReadByCustomer,
    isSupportModalOpen,
    setIsSupportModalOpen,
    setSelectedTicket,
    setActiveModal,
    navigateTo,
  } = useApp();

  const [messageInput, setMessageInput] = useState<string>('');
  const [selectedProofImage, setSelectedProofImage] = useState<string | null>(null);
  const [selectedTicketForProof, setSelectedTicketForProof] = useState<Ticket | null>(null);
  const [showTicketSelector, setShowTicketSelector] = useState<boolean>(false);
  const [isSending, setIsSending] = useState<boolean>(false);
  const [fullScreenImage, setFullScreenImage] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [selectedAudioUrl, setSelectedAudioUrl] = useState<string | null>(null);
  const [isRecordingAudio, setIsRecordingAudio] = useState<boolean>(false);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Tickets belonging to current user that are waiting for payment
  const waitingTickets = tickets.filter((t) => {
    if (isLegacyTestTicket(t)) return false;
    const isGuest = !currentUser?.id || currentUser.id === 'guest_user';
    const isOwner = isGuest
      ? t.userId === 'guest_user' || t.user_id === 'guest_user'
      : doesUserPersonallyOwnTicket(t, currentUser);
    return isOwner && isTicketWaitingPayment(t);
  });

  const chatMessages: SupportMessage[] = activeCustomerChat?.messages || [];

  // Scroll to bottom whenever messages update or modal opens
  useEffect(() => {
    if (isSupportModalOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      if (activeCustomerChat?.id) {
        void markChatAsReadByCustomer(activeCustomerChat.id);
      }
    }
  }, [isSupportModalOpen, chatMessages.length]);

  if (!isSupportModalOpen) return null;

  const handleClose = () => {
    setIsSupportModalOpen(false);
  };

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setUploadError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const base64 = await fileToBase64(file, {
        maxWidth: 1080,
        maxHeight: 1080,
        quality: 0.82,
        maxBytes: 380 * 1024, // Keep under 380KB to fit easily in Firestore doc
      });
      setSelectedProofImage(base64);
    } catch (err: any) {
      setUploadError(err?.message || 'Could not process photo. Please choose a smaller image.');
    } finally {
      if (galleryInputRef.current) {
        galleryInputRef.current.value = '';
      }
      if (cameraInputRef.current) {
        cameraInputRef.current.value = '';
      }
    }
  };

  const handleQuickButtonClick = (type: string) => {
    setUploadError(null);
    switch (type) {
      case 'TICKET_NOT_APPROVED':
        setMessageInput('My ticket was not approved but I have paid via PayShap. Here is my proof:');
        setShowTicketSelector(true);
        if (waitingTickets.length > 0 && !selectedTicketForProof) {
          setSelectedTicketForProof(waitingTickets[0]);
        }
        break;
      case 'TICKET_PROBLEM':
        setMessageInput('Hi, I have an issue with my ticket: ');
        setShowTicketSelector(waitingTickets.length > 0);
        break;
      case 'PAYMENT_PROBLEM':
        setMessageInput('Hi, I made a PayShap payment but it is not reflecting: ');
        break;
      case 'TOPUP_PROBLEM':
        setMessageInput('Hi, my wallet top-up with PayShap is not showing in my balance: ');
        break;
      case 'OTHER':
        setMessageInput('Hi Universal Band team, I need assistance with: ');
        break;
      default:
        break;
    }
  };

  const stopVoiceRecordingCleanup = () => {
    try {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
      }
    } catch {}
    mediaRecorderRef.current = null;
    setIsRecordingAudio(false);
  };

  useEffect(() => {
    if (!isSupportModalOpen) {
      stopVoiceRecordingCleanup();
    }
  }, [isSupportModalOpen]);

  const handleOpenGallery = async () => {
    setUploadError(null);
    const perm = await ensurePhotosPermission();
    if (!perm.granted) return;
    galleryInputRef.current?.click();
  };

  const handleOpenCamera = async () => {
    setUploadError(null);
    const perm = await ensureCameraPermission();
    if (!perm.granted) return;
    cameraInputRef.current?.click();
  };

  const handleToggleVoiceRecord = async () => {
    setUploadError(null);
    if (isRecordingAudio && mediaRecorderRef.current) {
      try {
        mediaRecorderRef.current.stop();
      } catch {
        stopVoiceRecordingCleanup();
      }
      return;
    }

    const perm = await ensureMicrophonePermission();
    if (!perm.granted) {
      return;
    }

    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices ||
      !navigator.mediaDevices.getUserMedia ||
      typeof MediaRecorder === 'undefined'
    ) {
      setUploadError('Audio recording is not supported on this device.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      audioChunksRef.current = [];

      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const mimeType = recorder.mimeType || 'audio/webm';
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        stopVoiceRecordingCleanup();
        if (blob.size > 0 && blob.size < 450 * 1024) {
          const reader = new FileReader();
          reader.onloadend = () => {
            if (typeof reader.result === 'string') {
              setSelectedAudioUrl(reader.result);
            }
          };
          reader.readAsDataURL(blob);
        } else if (blob.size >= 450 * 1024) {
          setUploadError('Voice note too long (keep under 30 seconds).');
        }
      };

      recorder.start();
      setIsRecordingAudio(true);
    } catch {
      stopVoiceRecordingCleanup();
      setUploadError('Microphone permission denied or unavailable.');
    }
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const text = messageInput.trim();
    if (!text && !selectedProofImage && !selectedAudioUrl) return;

    setIsSending(true);
    setUploadError(null);

    let ticketAttachment: SupportTicketAttachment | undefined = undefined;
    if (selectedTicketForProof) {
      ticketAttachment = {
        ticketId: selectedTicketForProof.id,
        ticketBandCode: selectedTicketForProof.bandCode || selectedTicketForProof.ticketId,
        eventName: selectedTicketForProof.eventTitle || selectedTicketForProof.eventName || 'Event',
        ticketTier: selectedTicketForProof.ticketTier || selectedTicketForProof.tierName || 'General',
        price: selectedTicketForProof.price || '',
        payshapReference: selectedTicketForProof.payshapReference || '',
        purchaseDate: selectedTicketForProof.purchaseDate || selectedTicketForProof.createdAt || '',
        customerName:
          selectedTicketForProof.customerName ||
          selectedTicketForProof.attendeeName ||
          currentUser.fullName ||
          currentUser.name,
        customerPhone:
          selectedTicketForProof.customerPhone ||
          selectedTicketForProof.attendeePhone ||
          currentUser.phone,
        status: selectedTicketForProof.paymentStatus || 'WAITING FOR PAYMENT',
      };
    }

    try {
      await sendCustomerSupportMessage({
        text:
          text ||
          (selectedProofImage
            ? 'Attached payment screenshot / receipt for verification.'
            : selectedAudioUrl
            ? 'Sent a voice note.'
            : ''),
        imageUrl: selectedProofImage || undefined,
        audioUrl: selectedAudioUrl || undefined,
        ticketAttachment,
      });

      setMessageInput('');
      setSelectedProofImage(null);
      setSelectedAudioUrl(null);
      setSelectedTicketForProof(null);
      setShowTicketSelector(false);
    } catch {
      setUploadError('Failed to send message. Please check connection and try again.');
    } finally {
      setIsSending(false);
    }
  };

  const formatMessageTime = (isoString?: string) => {
    if (!isoString) return '';
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-[#121214] border border-white/10 rounded-3xl w-full max-w-lg h-[92vh] max-h-[820px] flex flex-col shadow-2xl overflow-hidden relative">
        {/* WhatsApp-Style Header */}
        <div className="bg-[#18181B] px-4 py-3.5 border-b border-white/10 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="relative">
              <div className="w-11 h-11 rounded-full bg-emerald-600/30 border border-emerald-500/50 flex items-center justify-center text-emerald-400">
                <Headphones className="w-5 h-5 stroke-[2.3]" />
              </div>
              <span className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-emerald-500 border-2 border-[#18181B] rounded-full" />
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-black text-white truncate">Universal Band Support</h3>
                <span className="text-[10px] bg-emerald-500/20 text-emerald-300 font-bold px-2 py-0.5 rounded-full border border-emerald-500/30">
                  Live
                </span>
              </div>
              <p className="text-[11px] text-gray-400 truncate flex items-center gap-1.5 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping inline-block" />
                <span>Admin will reply soon · Typically replies in minutes</span>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleClose}
            className="w-9 h-9 rounded-full bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white flex items-center justify-center transition cursor-pointer"
            aria-label="Close Support Chat"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* WhatsApp & Call Support Direct Buttons */}
        <div className="bg-[#151518] px-4 py-2.5 border-b border-white/10 flex items-center gap-2.5 shrink-0">
          <a
            href="https://wa.me/27763046653?text=Hi%20Universal%20Band%20Support,%20I%20need%20assistance."
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 py-2 px-3 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/50 text-emerald-300 font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer shadow-sm"
          >
            <MessageCircle className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>Chat on WhatsApp</span>
            <ExternalLink className="w-3 h-3 opacity-70 shrink-0" />
          </a>

          <a
            href="tel:0763046653"
            className="flex-1 py-2 px-3 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/50 text-blue-300 font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer shadow-sm"
          >
            <Phone className="w-4 h-4 text-blue-400 shrink-0" />
            <span>Call Support (076 304 6653)</span>
          </a>
        </div>

        {/* Common Questions / FAQs */}
        <div className="bg-[#131316] px-3.5 py-2 border-b border-white/5 shrink-0">
          <div className="text-[11px] font-bold text-gray-400 mb-1.5 flex items-center gap-1.5">
            <HelpCircle className="w-3.5 h-3.5 text-amber-400" />
            <span>Common Questions (tap to ask):</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {[
              'How do I top up?',
              'How do I get my ticket?',
              'My payment is not showing',
            ].map((faq) => (
              <button
                key={faq}
                type="button"
                onClick={() => {
                  setMessageInput(faq);
                }}
                className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white text-[11px] font-medium transition cursor-pointer"
              >
                {faq}
              </button>
            ))}
          </div>
        </div>

        {/* Quick Action Buttons */}
        <div className="bg-[#151518] px-3 py-2 border-b border-white/5 overflow-x-auto no-scrollbar shrink-0">
          <div className="flex items-center gap-2 min-w-max">
            <button
              type="button"
              onClick={() => handleQuickButtonClick('TICKET_NOT_APPROVED')}
              className="px-3 py-1.5 rounded-full bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-sm"
            >
              <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
              <span>My Ticket Was Not Approved But I Paid</span>
            </button>

            <button
              type="button"
              onClick={() => handleQuickButtonClick('TICKET_PROBLEM')}
              className="px-3 py-1.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 text-xs font-semibold transition cursor-pointer"
            >
              Ticket Problem
            </button>

            <button
              type="button"
              onClick={() => handleQuickButtonClick('PAYMENT_PROBLEM')}
              className="px-3 py-1.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 text-xs font-semibold transition cursor-pointer"
            >
              Payment Problem
            </button>

            <button
              type="button"
              onClick={() => handleQuickButtonClick('TOPUP_PROBLEM')}
              className="px-3 py-1.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 text-xs font-semibold transition cursor-pointer"
            >
              Top-Up Problem
            </button>

            <button
              type="button"
              onClick={() => handleQuickButtonClick('OTHER')}
              className="px-3 py-1.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 text-xs font-semibold transition cursor-pointer"
            >
              Other
            </button>
          </div>
        </div>

        {/* Pending Ticket Attachment Selector (if user clicked 'My Ticket Was Not Approved' or manually toggled) */}
        {showTicketSelector && (
          <div className="bg-[#1C1C20] p-3 border-b border-white/10 text-xs shrink-0 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-[#FACC15] flex items-center gap-1.5">
                <TicketIcon className="w-3.5 h-3.5" />
                <span>Select Pending Ticket with Issue:</span>
              </span>
              <button
                type="button"
                onClick={() => setShowTicketSelector(false)}
                className="text-[11px] text-gray-400 hover:text-white"
              >
                Hide
              </button>
            </div>

            {waitingTickets.length === 0 ? (
              <p className="text-[11px] text-gray-400 italic">
                You have no tickets currently marked WAITING FOR PAYMENT. If you bought under another name/phone, describe it in your message.
              </p>
            ) : (
              <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                {waitingTickets.map((t) => {
                  const isSelected = selectedTicketForProof?.id === t.id;
                  return (
                    <div
                      key={t.id}
                      onClick={() => setSelectedTicketForProof(isSelected ? null : t)}
                      className={`p-2.5 rounded-xl border text-left cursor-pointer transition flex items-center justify-between ${
                        isSelected
                          ? 'bg-amber-950/60 border-amber-500/70 text-white'
                          : 'bg-black/40 border-white/10 text-gray-300 hover:border-white/20'
                      }`}
                    >
                      <div className="min-w-0 pr-2">
                        <div className="font-black text-xs text-white truncate">
                          {t.eventTitle || t.eventName} · {t.ticketTier || 'General'}
                        </div>
                        <div className="text-[11px] text-gray-400 truncate mt-0.5">
                          Ref: <span className="font-mono text-[#FACC15]">{t.payshapReference || t.bandCode}</span> · {t.price}
                        </div>
                      </div>

                      <div className="shrink-0 text-right">
                        <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40">
                          Waiting Payment
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Chat Message Stream (WhatsApp Style) */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#0B0B0D]">
          {/* Welcome / System Info Banner */}
          <div className="text-center my-2">
            <span className="inline-block bg-white/5 border border-white/10 px-3 py-1 rounded-full text-[11px] text-gray-400 font-medium">
              🔒 End-to-end admin encrypted support session
            </span>
          </div>

          {/* Initial greeting from Universal Band Support */}
          <div className="flex items-start gap-2.5 max-w-[85%]">
            <div className="w-7 h-7 rounded-full bg-emerald-600/30 border border-emerald-500/40 text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
              <Headphones className="w-3.5 h-3.5" />
            </div>
            <div className="bg-[#1C1C20] border border-white/10 text-white text-xs rounded-2xl rounded-tl-sm p-3 shadow-md space-y-1">
              <div className="font-bold text-emerald-400 text-[11px]">Universal Band Support</div>
              <p className="leading-relaxed">
                Welcome to Universal Band Customer Support! How can we assist you with your tickets, PayShap payments, or wallet top-up today?
              </p>
              <p className="text-[10px] text-gray-400 leading-relaxed pt-1">
                💡 <span className="text-amber-300 font-semibold">Did you pay but your ticket still shows WAITING FOR PAYMENT?</span> Tap the quick button above and attach a screenshot of your bank SMS or receipt. Admin will verify and activate your QR code manually!
              </p>
              <div className="text-[10px] text-gray-500 text-right">Instant auto-reply</div>
            </div>
          </div>

          {/* Chat Messages */}
          {chatMessages.map((msg) => {
            const isCustomer = msg.senderRole === 'customer';

            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isCustomer ? 'items-end' : 'items-start'} my-1.5`}
              >
                <div
                  className={`max-w-[85%] p-3 rounded-2xl shadow-md space-y-2 ${
                    isCustomer
                      ? 'bg-emerald-700 text-white rounded-tr-xs'
                      : 'bg-[#1E1E24] border border-white/10 text-white rounded-tl-xs'
                  }`}
                >
                  {/* Sender Label */}
                  <div className="flex items-center justify-between text-[10px] font-bold opacity-80 gap-3">
                    <span>{isCustomer ? 'You' : 'Admin (Universal Band)'}</span>
                    <span>{formatMessageTime(msg.timestamp)}</span>
                  </div>

                  {/* Attached Ticket Card */}
                  {msg.ticketAttachment && (
                    <div className="bg-black/60 rounded-xl p-2.5 border border-white/15 space-y-1 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono text-[#FACC15] font-bold">
                          {msg.ticketAttachment.ticketBandCode || msg.ticketAttachment.ticketId}
                        </span>
                        <span
                          className={`text-[9px] font-black px-1.5 py-0.2 rounded-full uppercase ${
                            msg.ticketAttachment.status === 'PAID'
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                              : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                          }`}
                        >
                          {msg.ticketAttachment.status}
                        </span>
                      </div>

                      <div className="font-bold text-white leading-snug">
                        {msg.ticketAttachment.eventName} · {msg.ticketAttachment.ticketTier}
                      </div>

                      <div className="text-[11px] text-gray-300 flex items-center justify-between">
                        <span>Price: <strong className="text-white">{msg.ticketAttachment.price}</strong></span>
                        {msg.ticketAttachment.payshapReference && (
                          <span className="font-mono text-[10px] text-gray-400">
                            Ref: {msg.ticketAttachment.payshapReference}
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Attached Image (Screenshot of PayShap / Bank Receipt) */}
                  {msg.imageUrl && (
                    <div className="rounded-xl overflow-hidden border border-white/20 bg-black/40">
                      <img
                        src={msg.imageUrl}
                        alt="Proof of Payment"
                        className="max-h-56 w-full object-cover cursor-pointer hover:opacity-95 transition"
                        onClick={() => setFullScreenImage(msg.imageUrl || null)}
                      />
                      <div className="p-1.5 bg-black/60 text-[10px] text-gray-300 flex items-center justify-between">
                        <span>📷 Proof of payment attached</span>
                        <span className="text-emerald-400 font-bold hover:underline cursor-pointer">
                          Tap to view full
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Attached Audio Voice Note */}
                  {msg.audioUrl && (
                    <div className="rounded-xl overflow-hidden border border-white/20 bg-black/40 p-2">
                      <audio controls src={msg.audioUrl} className="w-full h-8" />
                    </div>
                  )}

                  {/* Text Message Content */}
                  {msg.text && (
                    <p className="text-xs leading-relaxed break-words whitespace-pre-wrap">
                      {msg.text}
                    </p>
                  )}

                  {/* Quick View QR Code button on Manual Approval */}
                  {!isCustomer &&
                    (msg.text?.includes('Admin approved your ticket') ||
                      (msg.ticketAttachment && msg.ticketAttachment.status === 'PAID')) && (
                      <button
                        type="button"
                        onClick={() => {
                          const linkedTicket = msg.ticketAttachment
                            ? tickets.find(
                                (t) =>
                                  t.id === msg.ticketAttachment?.ticketId ||
                                  t.ticketId === msg.ticketAttachment?.ticketId
                              )
                            : undefined;
                          setIsSupportModalOpen(false);
                          if (linkedTicket) {
                            setSelectedTicket(linkedTicket);
                            setActiveModal('ticket-detail');
                          } else {
                            navigateTo('/tickets');
                          }
                        }}
                        className="mt-1.5 w-full py-2 px-3 rounded-xl bg-[#FACC15] hover:bg-yellow-400 text-black font-black text-[11px] flex items-center justify-center gap-1.5 cursor-pointer transition shadow"
                      >
                        <TicketIcon className="w-3.5 h-3.5 stroke-[2.5]" />
                        <span>View Ticket & QR Code</span>
                        <ExternalLink className="w-3 h-3" />
                      </button>
                    )}
                </div>
              </div>
            );
          })}

          <div ref={messagesEndRef} />
        </div>

        {/* Selected Proof, Audio & Ticket Preview Strip (Before Sending) */}
        {(selectedProofImage || selectedAudioUrl || selectedTicketForProof) && (
          <div className="bg-[#18181C] p-2.5 border-t border-white/10 shrink-0 space-y-1.5 text-xs">
            <div className="flex items-center justify-between text-[11px] font-bold text-gray-300">
              <span>Attached to next message:</span>
              <button
                type="button"
                onClick={() => {
                  setSelectedProofImage(null);
                  setSelectedAudioUrl(null);
                  setSelectedTicketForProof(null);
                }}
                className="text-red-400 hover:text-red-300 font-medium text-[10px]"
              >
                Clear all
              </button>
            </div>

            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5">
              {selectedTicketForProof && (
                <div className="bg-amber-950/60 border border-amber-500/50 rounded-xl px-2.5 py-1.5 text-white flex items-center gap-2 shrink-0">
                  <TicketIcon className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <div className="text-[11px] leading-tight max-w-[140px] truncate">
                    <span className="font-bold">{selectedTicketForProof.eventTitle}</span>
                    <span className="text-gray-400 block">{selectedTicketForProof.price}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedTicketForProof(null)}
                    className="w-4 h-4 rounded-full bg-white/10 hover:bg-white/20 text-gray-300 flex items-center justify-center"
                  >
                    ×
                  </button>
                </div>
              )}

              {selectedProofImage && (
                <div className="relative shrink-0 group">
                  <img
                    src={selectedProofImage}
                    alt="Proof Preview"
                    className="w-12 h-12 rounded-lg object-cover border border-emerald-500/60"
                  />
                  <button
                    type="button"
                    onClick={() => setSelectedProofImage(null)}
                    className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-600 text-white flex items-center justify-center text-[10px] font-bold"
                  >
                    ×
                  </button>
                </div>
              )}

              {selectedAudioUrl && (
                <div className="flex items-center gap-2 bg-black/50 border border-emerald-500/50 rounded-xl px-2 py-1 shrink-0">
                  <audio controls src={selectedAudioUrl} className="h-7 w-40" />
                  <button
                    type="button"
                    onClick={() => setSelectedAudioUrl(null)}
                    className="w-5 h-5 rounded-full bg-red-600 text-white flex items-center justify-center text-[10px] font-bold shrink-0"
                  >
                    ×
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Upload Error Banner */}
        {uploadError && (
          <div className="bg-rose-950/80 border-t border-rose-500/40 px-3 py-1.5 text-[11px] text-rose-300 flex items-center justify-between shrink-0">
            <span>{uploadError}</span>
            <button
              type="button"
              onClick={() => setUploadError(null)}
              className="text-white text-xs font-bold px-1"
            >
              ×
            </button>
          </div>
        )}

        {/* Bottom Input Bar */}
        <form
          onSubmit={handleSendMessage}
          className="bg-[#18181B] p-2.5 border-t border-white/10 flex items-center gap-1.5 shrink-0"
        >
          {/* Hidden File Inputs for Gallery & Camera */}
          <input
            ref={galleryInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleImageSelect}
          />
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleImageSelect}
          />

          {/* Gallery Screenshot Button */}
          <button
            type="button"
            onClick={handleOpenGallery}
            title="Pick screenshot or receipt from Gallery"
            aria-label="Pick screenshot from Gallery"
            className={`w-9 h-9 rounded-full flex items-center justify-center transition shrink-0 cursor-pointer ${
              selectedProofImage
                ? 'bg-emerald-600 text-white'
                : 'bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white'
            }`}
          >
            <ImageIcon className="w-4 h-4 stroke-[2]" />
          </button>

          {/* Camera Photo Button */}
          <button
            type="button"
            onClick={handleOpenCamera}
            title="Take photo of payment receipt with Camera"
            aria-label="Take photo with Camera"
            className={`w-9 h-9 rounded-full flex items-center justify-center transition shrink-0 cursor-pointer ${
              selectedProofImage
                ? 'bg-emerald-600 text-white'
                : 'bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white'
            }`}
          >
            <Camera className="w-4 h-4 stroke-[2]" />
          </button>

          {/* Microphone Voice Note Button */}
          <button
            type="button"
            onClick={handleToggleVoiceRecord}
            title={isRecordingAudio ? 'Stop recording voice note' : 'Record voice note'}
            aria-label={isRecordingAudio ? 'Stop recording voice note' : 'Record voice note'}
            className={`w-9 h-9 rounded-full flex items-center justify-center transition shrink-0 cursor-pointer ${
              isRecordingAudio
                ? 'bg-rose-600 text-white animate-pulse'
                : selectedAudioUrl
                ? 'bg-emerald-600 text-white'
                : 'bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white'
            }`}
          >
            {isRecordingAudio ? (
              <Square className="w-3.5 h-3.5 fill-white" />
            ) : (
              <Mic className="w-4 h-4 stroke-[2]" />
            )}
          </button>

          {/* Text Message Input */}
          <input
            type="text"
            value={messageInput}
            onChange={(e) => setMessageInput(e.target.value)}
            placeholder={isRecordingAudio ? 'Recording audio...' : 'Type your message to support...'}
            disabled={isSending || isRecordingAudio}
            className="flex-1 bg-black/50 border border-white/10 rounded-full px-4 py-2.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500/70"
          />

          {/* Send Button */}
          <button
            type="submit"
            disabled={isSending || isRecordingAudio || (!messageInput.trim() && !selectedProofImage && !selectedAudioUrl)}
            aria-label="Send Message"
            className="w-10 h-10 rounded-full bg-emerald-600 hover:bg-emerald-500 active:scale-95 disabled:opacity-40 disabled:hover:bg-emerald-600 text-white flex items-center justify-center shrink-0 transition cursor-pointer shadow-md"
          >
            <Send className="w-4 h-4 stroke-[2.3] ml-0.5" />
          </button>
        </form>
      </div>

      {/* Full Screen Image Viewer Modal */}
      {fullScreenImage && (
        <div
          className="fixed inset-0 z-60 bg-black/95 flex flex-col items-center justify-center p-4 animate-in fade-in"
          onClick={() => setFullScreenImage(null)}
        >
          <button
            type="button"
            onClick={() => setFullScreenImage(null)}
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20 transition cursor-pointer"
          >
            <X className="w-6 h-6" />
          </button>

          <img
            src={fullScreenImage}
            alt="Payment Proof Fullscreen"
            className="max-h-[85vh] max-w-[95vw] object-contain rounded-xl shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
          <span className="text-xs text-gray-400 mt-3">Proof of Payment Preview</span>
        </div>
      )}
    </div>
  );
};

export default CustomerSupportModal;
