export const PERMISSIONS = [
  'sell',
  'discount_over_5',
  'process_return',
  'close_other_shift',
  'manage_prices',
  'manage_products',
  'manage_users',
  'manage_tills',
  'view_reports',
  'use_customers',
  'manage_customers',
  'manage_promotions'
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export const PERMISSION_LABELS: Record<Permission, string> = {
  sell: 'Sell and take payment',
  discount_over_5: 'Apply a discount over 5%',
  process_return: 'Process a return',
  close_other_shift: "Close another cashier's shift",
  manage_prices: 'Change prices',
  manage_products: 'Manage products',
  manage_users: 'Manage users and roles',
  manage_tills: 'Manage stores and tills',
  view_reports: 'View reports and dashboard',
  use_customers: 'Find and add customers, sell on account, take account payments',
  manage_customers: 'Manage customers, credit limits, points and statements',
  manage_promotions: 'Manage promotions and loyalty settings'
};

export const ROLES: { id: string; name: string; permissions: Partial<Record<Permission, { pin?: boolean }>> }[] = [
  { id: 'cashier', name: 'Cashier', permissions: { sell: {}, use_customers: {}, process_return: { pin: true } } },
  {
    id: 'supervisor',
    name: 'Supervisor',
    permissions: { sell: {}, use_customers: {}, discount_over_5: { pin: true }, process_return: {}, close_other_shift: {}, view_reports: {} }
  },
  {
    id: 'store_manager',
    name: 'Store manager',
    permissions: {
      sell: {}, discount_over_5: {}, process_return: {}, close_other_shift: {},
      manage_prices: {}, manage_products: {}, manage_tills: {}, view_reports: {},
      use_customers: {}, manage_customers: {}, manage_promotions: {}
    }
  },
  {
    id: 'head_office',
    name: 'Head office',
    permissions: { discount_over_5: {}, manage_prices: {}, manage_products: {}, manage_users: {}, manage_tills: {}, view_reports: {}, manage_customers: {}, manage_promotions: {} }
  }
];
