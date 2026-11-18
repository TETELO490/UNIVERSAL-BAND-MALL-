import { EventItem, MenuItem, MenuItemDoc, Promoter, Reservation, Store, UserProfile } from '../types';

export const INITIAL_USER: UserProfile = {
  id: 'user_admin',
  name: 'System Admin',
  fullName: 'System Admin',
  idNumber: '0000000000000',
  age: 30,
  email: 'admin@universalband.co.za',
  phone: '',
  role: 'Admin',
  assignedStoreId: '',
  assignedStoreName: '',
  walletBalance: 0,
  isRegistered: true,
};

export const INITIAL_PROMOTERS: Promoter[] = [];

export const INITIAL_FOOD: MenuItem[] = [];

export const INITIAL_ALCOHOL: MenuItem[] = [];

export const INITIAL_SOFTDRINKS: MenuItem[] = [];

export const INITIAL_STORES: Store[] = [];

export const INITIAL_EVENTS: EventItem[] = [];

export const INITIAL_RESERVATIONS: Reservation[] = [];

export const INITIAL_MENU_ITEMS: MenuItemDoc[] = [];

export const INITIAL_ITEMS = INITIAL_MENU_ITEMS;
