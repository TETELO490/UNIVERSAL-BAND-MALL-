import { UserProfile } from '../types';

export const getUserAge = (user: UserProfile | null | undefined): number => {
  if (!user) return 0;
  if (typeof user.age === 'number' && !isNaN(user.age)) return user.age;
  if (user.idNumber && user.idNumber.length >= 6) {
    const yy = parseInt(user.idNumber.substring(0, 2), 10);
    const mm = parseInt(user.idNumber.substring(2, 4), 10) - 1;
    const dd = parseInt(user.idNumber.substring(4, 6), 10);
    // SA ID YY: if <= 26 it's 2000s, else 1900s
    const fullYear = yy <= 26 ? 2000 + yy : 1900 + yy;
    const birthDate = new Date(fullYear, mm, dd);
    const today = new Date(2026, 8, 30);
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  }
  return 28;
};

export const calculateAgeFromSAID = (idNumber: string): { age: number; birthDate: Date | null; valid: boolean } => {
  const cleanId = (idNumber || '').replace(/\D/g, '');
  if (cleanId.length < 6) {
    return { age: 0, birthDate: null, valid: false };
  }
  const yy = parseInt(cleanId.substring(0, 2), 10);
  const mm = parseInt(cleanId.substring(2, 4), 10) - 1;
  const dd = parseInt(cleanId.substring(4, 6), 10);
  if (mm < 0 || mm > 11 || dd < 1 || dd > 31) {
    return { age: 0, birthDate: null, valid: false };
  }
  const fullYear = yy <= 26 ? 2000 + yy : 1900 + yy;
  const birthDate = new Date(fullYear, mm, dd);
  const today = new Date(2026, 8, 30);
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return { age: Math.max(0, age), birthDate, valid: cleanId.length === 13 };
};

export const isAlcoholItem = (item: {
  category?: string;
  subCategory?: string;
  isAlcohol?: boolean;
  name?: string;
  itemName?: string;
}): boolean => {
  if (item.isAlcohol === true) return true;
  if (item.subCategory?.toLowerCase() === 'alcohol') return true;
  const name = (item.name || item.itemName || '').toLowerCase();
  const alcKeywords = ['heineken', 'savanna', 'corona', 'beer', 'cider', 'whisky', 'gin', 'vodka', 'wine', 'alcohol', 'draught'];
  return alcKeywords.some((kw) => name.includes(kw));
};
