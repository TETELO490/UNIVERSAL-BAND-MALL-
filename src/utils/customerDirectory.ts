import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';

export interface VerifiedCustomerProfile {
  id: string;
  name: string;
  fullName: string;
  idNumber: string;
  phone: string;
  email: string;
  photo: string;
  customerQrId?: string;
  age?: number;
  walletBalance?: number;
  role?: string;
}

const mapUserDocToProfile = (id: string, docData: any, fallbackPhone = '', fallbackIdNum = '', fallbackEmail = ''): VerifiedCustomerProfile => ({
  id,
  name: docData.name || docData.fullName || 'Customer',
  fullName: docData.fullName || docData.name || 'Customer',
  idNumber: docData.idNumber || fallbackIdNum,
  phone: docData.phone || fallbackPhone,
  email: docData.email || fallbackEmail,
  photo: docData.photo || docData.profilePicture || '',
  customerQrId: docData.customerQrId || '',
  age: docData.age,
  walletBalance: Number(docData.walletBalance ?? 0),
  role: docData.role || 'Customer',
});

/**
 * Searches for a real registered customer in Firestore 'users' by ID Number, Phone Number, Email, customerQrId, or User ID.
 * Returns null if no real account exists in Firestore.
 */
export async function searchCustomerByIdOrPhone(
  searchQuery: string
): Promise<VerifiedCustomerProfile | null> {
  const raw = searchQuery.trim();
  const clean = raw.toLowerCase();
  const digits = raw.replace(/\D/g, '');
  if (!clean) return null;

  try {
    const usersRef = collection(db, 'users');

    // 0. By permanent Customer ONE QR ID
    if (raw.toUpperCase().startsWith('UBQR-')) {
      const qQr = query(usersRef, where('customerQrId', '==', raw.toUpperCase()));
      const snapQr = await getDocs(qQr);
      if (!snapQr.empty) {
        return mapUserDocToProfile(snapQr.docs[0].id, snapQr.docs[0].data());
      }
    }

    // 1. By SA idNumber
    const qId = query(usersRef, where('idNumber', '==', raw));
    const snapId = await getDocs(qId);
    if (!snapId.empty) {
      return mapUserDocToProfile(snapId.docs[0].id, snapId.docs[0].data(), '', raw);
    }

    // 2. By exact phone
    const qPhone = query(usersRef, where('phone', '==', raw));
    const snapPhone = await getDocs(qPhone);
    if (!snapPhone.empty) {
      return mapUserDocToProfile(snapPhone.docs[0].id, snapPhone.docs[0].data(), raw);
    }

    // 3. By normalized digits phone (if differs)
    if (digits && digits !== raw) {
      const qDigits = query(usersRef, where('phone', '==', digits));
      const snapDigits = await getDocs(qDigits);
      if (!snapDigits.empty) {
        return mapUserDocToProfile(snapDigits.docs[0].id, snapDigits.docs[0].data(), digits);
      }
    }

    // 4. By email
    if (clean.includes('@')) {
      const qEmail = query(usersRef, where('email', '==', clean));
      const snapEmail = await getDocs(qEmail);
      if (!snapEmail.empty) {
        return mapUserDocToProfile(snapEmail.docs[0].id, snapEmail.docs[0].data(), '', '', clean);
      }
    }

    // 5. Direct doc lookup by ID
    const directDoc = await getDoc(doc(db, 'users', raw));
    if (directDoc.exists()) {
      return mapUserDocToProfile(directDoc.id, directDoc.data());
    }
  } catch (err) {
    console.warn('Firestore user search error:', err);
  }

  return null;
}
