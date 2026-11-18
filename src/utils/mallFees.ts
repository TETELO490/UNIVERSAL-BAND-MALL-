/**
 * Universal Band Mall Fee Calculation Rules
 * 
 * Requirements:
 * 1. Checkout Fee: Flat fee of R4.00 + R1.00 per item, strictly capped at R10.00.
 * 2. Phone Lookup Pickup Fee: If a customer collects without a QR code using their phone number,
 *    an R5.00 fee applies where R2.00 is credited to the store owner's wallet and R3.00 is credited to the platform owner.
 */

export const MALL_FEES = {
  FLAT_FEE: 4,
  PER_ITEM_FEE: 1,
  FEE_CAP: 10,
  DEFAULT_DELIVERY_FEE: 25,
  PHONE_LOOKUP_TOTAL: 5,
  PHONE_LOOKUP_STORE_SHARE: 2,
  PHONE_LOOKUP_PLATFORM_SHARE: 3,
};

/**
 * Calculates the customer checkout platform fee based on total item quantity.
 * Flat R4 + R1 per item, capped at R10.
 * 
 * @param totalQuantity Total number of items in the cart
 * @returns number The fee in ZAR (Rands)
 */
export function calculatePlatformFee(totalQuantity: number): number {
  if (totalQuantity <= 0) return 0;
  const rawFee = MALL_FEES.FLAT_FEE + (totalQuantity * MALL_FEES.PER_ITEM_FEE);
  return Math.min(MALL_FEES.FEE_CAP, rawFee);
}

/**
 * Resolves the recorded delivery fee on an order without inventing a fake fee if zero or unset.
 */
export function resolveDeliveryFee(fee?: number | null): number {
  if (typeof fee === 'number' && Number.isFinite(fee) && fee >= 0) {
    return fee;
  }
  return 0;
}

/**
 * Breakdown of phone number lookup collection fee.
 */
export function getPhoneLookupFeeSplit() {
  return {
    totalFee: MALL_FEES.PHONE_LOOKUP_TOTAL,
    storeOwnerShare: MALL_FEES.PHONE_LOOKUP_STORE_SHARE,
    platformShare: MALL_FEES.PHONE_LOOKUP_PLATFORM_SHARE,
  };
}
