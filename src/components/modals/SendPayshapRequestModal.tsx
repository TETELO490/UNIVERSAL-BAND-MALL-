import React, { useState } from 'react';
import { Ticket } from '../../types';
import { getEventPayshapReference, parsePriceNumber } from '../../utils/ticketStatus';
import {
  X,
  Send,
  Copy,
  Check,
  Smartphone,
  ExternalLink,
  Clock,
  CheckCircle2,
  User,
  Phone,
  Banknote,
} from 'lucide-react';

interface SendPayshapRequestModalProps {
  ticket: Ticket | null;
  onClose: () => void;
  onMarkRequestSent: (ticketId: string) => Promise<boolean>;
}

export const SendPayshapRequestModal: React.FC<SendPayshapRequestModalProps> = ({
  ticket,
  onClose,
  onMarkRequestSent,
}) => {
  const [copiedField, setCopiedField] = useState<'phone' | 'amount' | 'ref' | null>(null);
  const [isMarking, setIsMarking] = useState(false);
  const [sentFeedback, setSentFeedback] = useState<string | null>(null);

  if (!ticket) return null;

  const customerName = ticket.attendeeName || ticket.customerName || 'Customer';
  const customerPhone = (ticket.attendeePhone || ticket.customerPhone || '').trim();
  const numericAmount = parsePriceNumber(ticket.price);
  const formattedAmount = `R${numericAmount.toFixed(2)}`;
  const amountPlain = numericAmount > 0 ? numericAmount.toFixed(2) : '0';
  const refText =
    ticket.payshapReference ||
    (ticket.eventTitle || ticket.eventName
      ? getEventPayshapReference(ticket.eventTitle || ticket.eventName)
      : `${ticket.ticketId || ticket.id}`);

  const handleCopy = (field: 'phone' | 'amount' | 'ref', value: string) => {
    if (!value) return;
    navigator.clipboard?.writeText(value);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleOpenTymeBankAndMark = async () => {
    setIsMarking(true);
    try {
      await onMarkRequestSent(ticket.id);
      setSentFeedback('Request Sent - Waiting for customer to approve in their bank app');

      // Copy customer's phone number automatically so Admin can paste right into TymeBank PayShap Request
      if (customerPhone) {
        try {
          navigator.clipboard?.writeText(customerPhone);
        } catch {}
      }

      // Attempt Android intent / TymeBank app deep link safely without window.open
      const isAndroid = /android/i.test(navigator.userAgent || '');
      if (isAndroid) {
        const anchor = document.createElement('a');
        anchor.href =
          'intent://payshap#Intent;package=com.tymebank.app;scheme=tymebank;end';
        anchor.style.display = 'none';
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
      }
    } finally {
      setIsMarking(false);
    }
  };

  const handleConfirmSentOnly = async () => {
    setIsMarking(true);
    try {
      await onMarkRequestSent(ticket.id);
      setSentFeedback('Request Sent - Waiting for customer to approve in their bank app');
    } finally {
      setIsMarking(false);
    }
  };

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-[70] bg-black/85 backdrop-blur-md flex items-center justify-center p-4"
    >
      <div className="w-full max-w-sm bg-[#1A1A1A] border border-amber-500/40 rounded-3xl p-5 text-white shadow-2xl relative animate-in fade-in zoom-in-95 max-h-[92vh] overflow-y-auto space-y-4">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close PayShap Request Modal"
          className="absolute top-4 right-4 min-w-[44px] min-h-[44px] rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-gray-300 hover:text-white cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="pr-10">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-amber-300">
            <Clock className="w-3.5 h-3.5" />
            <span>WAITING FOR PAYMENT</span>
          </span>
          <h2 className="text-lg font-extrabold text-white mt-1">
            Send PayShap Request to Customer
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Send a PayShap Request from your TymeBank app for the exact ticket amount. Once customer approves and TymeBank SMS arrives, the ticket marks PAID automatically.
          </p>
        </div>

        {/* Customer Details Card */}
        <div className="bg-[#111111] border border-white/10 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between gap-2 pb-2 border-b border-white/10">
            <div className="flex items-center gap-2 min-w-0">
              <User className="w-4 h-4 text-[#FACC15] shrink-0" />
              <div className="min-w-0">
                <span className="text-[10px] text-gray-400 block">Customer Name</span>
                <span className="text-sm font-bold text-white truncate block">{customerName}</span>
              </div>
            </div>
            <span className="text-[11px] font-bold text-[#FACC15] shrink-0">
              {ticket.ticketTier || 'Ticket'}
            </span>
          </div>

          {/* Customer Phone Number */}
          <div className="flex items-center justify-between gap-2 bg-black/50 rounded-xl p-2.5 border border-white/10">
            <div className="flex items-center gap-2 min-w-0">
              <Phone className="w-4 h-4 text-[#FACC15] shrink-0" />
              <div className="min-w-0">
                <span className="text-[10px] text-gray-400 block">Customer Phone Number</span>
                <span className="text-sm font-mono font-black text-white tabular-nums">
                  {customerPhone || 'Not provided'}
                </span>
              </div>
            </div>
            {customerPhone && (
              <button
                type="button"
                onClick={() => handleCopy('phone', customerPhone)}
                className="min-h-[44px] px-3 bg-white/10 hover:bg-white/20 text-white text-xs font-bold rounded-xl flex items-center gap-1 cursor-pointer shrink-0"
              >
                {copiedField === 'phone' ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                <span>{copiedField === 'phone' ? 'Copied' : 'Copy'}</span>
              </button>
            )}
          </div>

          {/* Exact Amount */}
          <div className="flex items-center justify-between gap-2 bg-black/50 rounded-xl p-2.5 border border-white/10">
            <div className="flex items-center gap-2 min-w-0">
              <Banknote className="w-4 h-4 text-emerald-400 shrink-0" />
              <div className="min-w-0">
                <span className="text-[10px] text-gray-400 block">Exact PayShap Request Amount</span>
                <span className="text-lg font-mono font-black text-[#FACC15] tabular-nums">
                  {formattedAmount}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => handleCopy('amount', amountPlain)}
              className="min-h-[44px] px-3 bg-white/10 hover:bg-white/20 text-white text-xs font-bold rounded-xl flex items-center gap-1 cursor-pointer shrink-0"
            >
              {copiedField === 'amount' ? (
                <Check className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
              <span>{copiedField === 'amount' ? 'Copied' : 'Copy'}</span>
            </button>
          </div>

          {/* Reference */}
          <div className="flex items-center justify-between gap-2 bg-black/50 rounded-xl p-2.5 border border-[#FACC15]/30">
            <div className="min-w-0">
              <span className="text-[10px] text-gray-400 block">PayShap Reference</span>
              <span className="text-xs font-mono font-black text-[#FACC15] break-all">
                {refText}
              </span>
            </div>
            <button
              type="button"
              onClick={() => handleCopy('ref', refText)}
              className="min-h-[44px] px-3 bg-[#FACC15] text-black text-xs font-black rounded-xl flex items-center gap-1 cursor-pointer shrink-0"
            >
              {copiedField === 'ref' ? (
                <Check className="w-3.5 h-3.5" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
              <span>{copiedField === 'ref' ? 'Copied' : 'Copy'}</span>
            </button>
          </div>
        </div>

        {(sentFeedback || ticket.payshapRequestSent) && (
          <div className="p-3 rounded-xl bg-amber-950/70 border border-amber-500/40 text-amber-200 text-xs font-bold flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" />
            <span>
              {sentFeedback || 'Request Sent - Waiting for customer to approve in their bank app'}
            </span>
          </div>
        )}

        {/* Action Buttons */}
        <div className="space-y-2">
          <button
            type="button"
            disabled={isMarking}
            onClick={handleOpenTymeBankAndMark}
            className="w-full min-h-[48px] bg-[#FACC15] hover:bg-yellow-400 active:scale-[0.99] text-black font-black text-xs rounded-xl flex items-center justify-center gap-2 shadow-lg transition cursor-pointer disabled:opacity-50"
          >
            <Smartphone className="w-4 h-4 stroke-[2.5]" />
            <span>Open TymeBank App &amp; Copy Phone</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            disabled={isMarking}
            onClick={handleConfirmSentOnly}
            className="w-full min-h-[44px] bg-white/10 hover:bg-white/15 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50"
          >
            <Send className="w-3.5 h-3.5 text-[#FACC15]" />
            <span>
              {ticket.payshapRequestSent
                ? 'Request Already Marked Sent'
                : 'Mark Request Sent (Keep Waiting)'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default SendPayshapRequestModal;
