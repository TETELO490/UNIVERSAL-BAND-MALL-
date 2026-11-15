import { Reservation } from '../types';

export interface CancellationCalculation {
  canCancel: boolean;
  eventStarted: boolean;
  hoursUntilEvent: number;
  daysUntilEvent: number;
  feePercentage: number;
  feeAmount: number;
  refundAmount: number;
  policyTierLabel: string;
  policyExplanation: string;
  timeRemainingText: string;
}

export const getEventTimeRemaining = (eventTimestamp: number): {
  eventStarted: boolean;
  hoursUntilEvent: number;
  daysUntilEvent: number;
  text: string;
} => {
  const diffMs = eventTimestamp - Date.now();
  if (diffMs <= 0) {
    return {
      eventStarted: true,
      hoursUntilEvent: 0,
      daysUntilEvent: 0,
      text: 'Event already started / in progress',
    };
  }

  const diffHours = diffMs / (1000 * 60 * 60);
  const diffDays = diffHours / 24;

  const hours = Math.floor(diffHours);
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

  if (diffDays >= 1) {
    const days = Math.floor(diffDays);
    const remHours = hours % 24;
    return {
      eventStarted: false,
      hoursUntilEvent: diffHours,
      daysUntilEvent: diffDays,
      text: `${days}d ${remHours}h remaining`,
    };
  }

  return {
    eventStarted: false,
    hoursUntilEvent: diffHours,
    daysUntilEvent: diffDays,
    text: `${hours}h ${minutes}m remaining`,
  };
};

export const calculateCancellation = (reservation: Reservation): CancellationCalculation => {
  const { eventStarted, hoursUntilEvent, daysUntilEvent, text } = getEventTimeRemaining(
    reservation.eventTimestamp
  );

  const price = reservation.itemPrice;
  const isFood = reservation.itemType === 'food';

  // 1. If event already started
  if (eventStarted) {
    if (isFood) {
      return {
        canCancel: false,
        eventStarted: true,
        hoursUntilEvent: 0,
        daysUntilEvent: 0,
        feePercentage: 100,
        feeAmount: price,
        refundAmount: 0,
        policyTierLabel: 'Event Started (No Refund)',
        policyExplanation: 'Event has started. Food is already cooked, 100% cancellation fee applies.',
        timeRemainingText: text,
      };
    } else {
      return {
        canCancel: false,
        eventStarted: true,
        hoursUntilEvent: 0,
        daysUntilEvent: 0,
        feePercentage: 0,
        feeAmount: 0,
        refundAmount: 0,
        policyTierLabel: 'Event In Progress',
        policyExplanation: 'Event has started. Drinks cannot be cancelled, but your order is reserved for venue collection.',
        timeRemainingText: text,
      };
    }
  }

  // 2. FOOD CANCELLATION POLICY
  if (isFood) {
    // If more than 2 hours before event start
    if (hoursUntilEvent > 2) {
      const fee = Number((price * 0.15).toFixed(2));
      const refund = Number((price - fee).toFixed(2));
      return {
        canCancel: true,
        eventStarted: false,
        hoursUntilEvent,
        daysUntilEvent,
        feePercentage: 15,
        feeAmount: fee,
        refundAmount: refund,
        policyTierLabel: 'Early Cancellation (15% Fee)',
        policyExplanation: `Cancelled more than 2 hours before start. 15% handling fee (R${fee.toFixed(2)}) deducted; 85% (R${refund.toFixed(2)}) refunded to your wallet.`,
        timeRemainingText: text,
      };
    } else {
      // Less than 2 hours before start
      return {
        canCancel: true,
        eventStarted: false,
        hoursUntilEvent,
        daysUntilEvent,
        feePercentage: 100,
        feeAmount: price,
        refundAmount: 0,
        policyTierLabel: 'Late Cancellation (100% Fee - R0 Refund)',
        policyExplanation: 'Cancelled less than 2 hours before start. Food is already prepared and cooked by the kitchen; 100% preparation fee applies.',
        timeRemainingText: text,
      };
    }
  }

  // 3. ALCOHOL & SOFT DRINKS POLICY
  // Tier 1: > 8 days before event -> 5% fee, 95% refund
  if (daysUntilEvent > 8) {
    const fee = Number((price * 0.05).toFixed(2));
    const refund = Number((price - fee).toFixed(2));
    return {
      canCancel: true,
      eventStarted: false,
      hoursUntilEvent,
      daysUntilEvent,
      feePercentage: 5,
      feeAmount: fee,
      refundAmount: refund,
      policyTierLabel: 'Tier 1: > 8 Days Prior (5% Fee)',
      policyExplanation: `Cancelled > 8 days prior. 5% handling fee (R${fee.toFixed(2)}) applies; 95% (R${refund.toFixed(2)}) refunded immediately.`,
      timeRemainingText: text,
    };
  }

  // Tier 2: Between 8 days and 2 hours before event -> 10% fee, 90% refund
  if (hoursUntilEvent > 2) {
    const fee = Number((price * 0.10).toFixed(2));
    const refund = Number((price - fee).toFixed(2));
    return {
      canCancel: true,
      eventStarted: false,
      hoursUntilEvent,
      daysUntilEvent,
      feePercentage: 10,
      feeAmount: fee,
      refundAmount: refund,
      policyTierLabel: 'Tier 2: 8 Days to 2 Hours Prior (10% Fee)',
      policyExplanation: `Cancelled between 8 days and 2 hours prior. 10% handling fee (R${fee.toFixed(2)}) applies; 90% (R${refund.toFixed(2)}) refunded immediately.`,
      timeRemainingText: text,
    };
  }

  // Tier 3: Less than 2 hours before event start -> 15% fee, 85% refund
  const fee = Number((price * 0.15).toFixed(2));
  const refund = Number((price - fee).toFixed(2));
  return {
    canCancel: true,
    eventStarted: false,
    hoursUntilEvent,
    daysUntilEvent,
    feePercentage: 15,
    feeAmount: fee,
    refundAmount: refund,
    policyTierLabel: 'Tier 3: < 2 Hours Prior (15% Fee)',
    policyExplanation: `Cancelled less than 2 hours before start. 15% handling fee (R${fee.toFixed(2)}) applies; 85% (R${refund.toFixed(2)}) refunded immediately.`,
    timeRemainingText: text,
  };
};
