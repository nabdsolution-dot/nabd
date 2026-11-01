export const PERMISSIONS = [
  'sell',
  'discount_over_5',
  'process_return',
  'close_other_shift',
  'manage_prices',
  'manage_products',
  'manage_users',
  'manage_tills',
  'view_reports'
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
  view_reports: 'View reports and dashboard'
};

export const ROLES: { id: string; name: string; permissions: Partial<Record<Permission, { pin?: boolean }>> }[] = [
  { id: 'cashier', name: 'Cashier', permissions: { sell: {}, process_return: { pin: true } } },
  {
    id: 'supervisor',
    name: 'Supervisor',
    permissions: { sell: {}, discount_over_5: { pin: true }, process_return: {}, close_other_shift: {}, view_reports: {} }
  },
  {
    id: 'store_manager',
    name: 'Store manager',
    permissions: {
      sell: {}, discount_over_5: {}, process_return: {}, close_other_shift: {},
      manage_prices: {}, manage_products: {}, manage_tills: {}, view_reports: {}
    }
  },
  {
    id: 'head_office',
    name: 'Head office',
    permissions: { discount_over_5: {}, manage_prices: {}, manage_products: {}, manage_users: {}, manage_tills: {}, view_reports: {} }
  }
];
