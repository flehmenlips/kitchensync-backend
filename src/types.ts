import { z } from 'zod';

// Business types enum
export const BusinessTypeSchema = z.enum([
  'restaurant',
  'cafe',
  'farm',
  'farmstand',
  'farmers_market',
  'food_producer',
  'food_store',
  'catering',
  'food_truck'
]);

export type BusinessType = z.infer<typeof BusinessTypeSchema>;

// Business registration request
export const RegisterBusinessSchema = z.object({
  businessName: z.string().min(2).max(100),
  businessType: BusinessTypeSchema,
  email: z.string().email(),
  phone: z.string().optional(),
  description: z.string().max(500).optional(),
  // Owner info
  ownerName: z.string().min(2),
  ownerEmail: z.string().email(),
  // Supabase Auth user ID (links to authenticated user)
  supabaseUserId: z.string(),
});

export type RegisterBusinessRequest = z.infer<typeof RegisterBusinessSchema>;

// Business response
export const BusinessResponseSchema = z.object({
  id: z.string(),
  businessName: z.string(),
  businessType: z.string(),
  slug: z.string(),
  email: z.string(),
  phone: z.string().nullable(),
  description: z.string().nullable(),
  logoUrl: z.string().nullable(),
  coverImageUrl: z.string().nullable(),
  brandColor: z.string(),
  isVerified: z.boolean(),
  isActive: z.boolean(),
  subscriptionTier: z.string(),
  subscriptionStatus: z.string(),
  createdAt: z.string(),
});

export type BusinessResponse = z.infer<typeof BusinessResponseSchema>;

// Update business request
export const UpdateBusinessSchema = z.object({
  businessName: z.string().min(2).max(100).optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  description: z.string().max(500).optional(),
  websiteUrl: z.string().url().optional(),
  addressLine1: z.string().optional(),
  addressLine2: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  postalCode: z.string().optional(),
  logoUrl: z.string().url().optional(),
  coverImageUrl: z.string().url().optional(),
  brandColor: z.string().optional(),
});

export type UpdateBusinessRequest = z.infer<typeof UpdateBusinessSchema>;

// Team member schemas
export const TeamRoleSchema = z.enum(['owner', 'manager', 'staff', 'accountant', 'marketing']);
export type TeamRole = z.infer<typeof TeamRoleSchema>;

export const InviteTeamMemberSchema = z.object({
  email: z.string().email(),
  role: TeamRoleSchema,
  name: z.string().optional(),
});

export type InviteTeamMemberRequest = z.infer<typeof InviteTeamMemberSchema>;

// Business hours
export const BusinessHoursSchema = z.object({
  dayOfWeek: z.number().min(0).max(6),
  openTime: z.string().nullable(),
  closeTime: z.string().nullable(),
  isClosed: z.boolean(),
  notes: z.string().optional(),
});

export type BusinessHoursRequest = z.infer<typeof BusinessHoursSchema>;

// Business list item (for discovery/listing)
export const BusinessListItemSchema = z.object({
  id: z.string(),
  businessName: z.string(),
  businessType: z.string(),
  slug: z.string(),
  logoUrl: z.string().nullable(),
  city: z.string().nullable(),
  state: z.string().nullable(),
  isVerified: z.boolean(),
  isActive: z.boolean(),
  createdAt: z.string(),
});

export type BusinessListItem = z.infer<typeof BusinessListItemSchema>;

// Business list item with user role (for user's businesses endpoint)
export const UserBusinessListItemSchema = BusinessListItemSchema.extend({
  role: z.string(), // owner, manager, staff, accountant, marketing
});

export type UserBusinessListItem = z.infer<typeof UserBusinessListItemSchema>;

// Public business profile (for slug lookup)
export const PublicBusinessProfileSchema = z.object({
  id: z.string(),
  businessName: z.string(),
  businessType: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  logoUrl: z.string().nullable(),
  coverImageUrl: z.string().nullable(),
  brandColor: z.string(),
  phone: z.string().nullable(),
  addressLine1: z.string().nullable(),
  city: z.string().nullable(),
  state: z.string().nullable(),
  postalCode: z.string().nullable(),
  isVerified: z.boolean(),
  hours: z.array(z.object({
    dayOfWeek: z.number(),
    openTime: z.string().nullable(),
    closeTime: z.string().nullable(),
    isClosed: z.boolean(),
    notes: z.string().nullable(),
  })),
});

export type PublicBusinessProfile = z.infer<typeof PublicBusinessProfileSchema>;

// Team member response
export const TeamMemberResponseSchema = z.object({
  id: z.string(),
  businessId: z.string(),
  userId: z.string(),
  role: z.string(),
  status: z.string(),
  invitedAt: z.string().nullable(),
  joinedAt: z.string().nullable(),
  createdAt: z.string(),
  user: z.object({
    id: z.string(),
    email: z.string(),
    name: z.string().nullable(),
    avatarUrl: z.string().nullable(),
  }),
});

export type TeamMemberResponse = z.infer<typeof TeamMemberResponseSchema>;

// Registration response
export const RegisterBusinessResponseSchema = z.object({
  business: z.object({
    id: z.string(),
    businessName: z.string(),
    businessType: z.string(),
    slug: z.string(),
    email: z.string(),
  }),
  owner: z.object({
    id: z.string(),
    email: z.string(),
    name: z.string().nullable(),
  }),
});

export type RegisterBusinessResponse = z.infer<typeof RegisterBusinessResponseSchema>;

// ============================================
// Reservation Schemas
// ============================================

// Reservation status enum
export const ReservationStatusSchema = z.enum([
  'pending',
  'confirmed',
  'seated',
  'completed',
  'cancelled',
  'no_show'
]);

export type ReservationStatus = z.infer<typeof ReservationStatusSchema>;

// Create reservation request
export const CreateReservationSchema = z.object({
  customerName: z.string().min(2),
  customerEmail: z.string().email(),
  customerPhone: z.string().optional(),
  reservationDate: z.string(), // "YYYY-MM-DD"
  reservationTime: z.string(), // "HH:mm"
  partySize: z.number().int().min(1).max(50),
  seatingPreference: z.string().optional(),
  specialRequests: z.string().optional(),
  occasion: z.string().optional(),
  source: z.enum(['app', 'website', 'phone', 'walk_in', 'third_party', 'admin']).optional(),
});

export type CreateReservationRequest = z.infer<typeof CreateReservationSchema>;

// Update reservation request
export const UpdateReservationSchema = z.object({
  customerName: z.string().min(2).optional(),
  customerEmail: z.string().email().optional(),
  customerPhone: z.string().optional(),
  reservationDate: z.string().optional(),
  reservationTime: z.string().optional(),
  partySize: z.number().int().min(1).max(50).optional(),
  tableId: z.string().optional(),
  seatingPreference: z.string().optional(),
  specialRequests: z.string().optional(),
  occasion: z.string().optional(),
  status: ReservationStatusSchema.optional(),
  internalNotes: z.string().optional(),
  cancellationReason: z.string().optional(),
});

export type UpdateReservationRequest = z.infer<typeof UpdateReservationSchema>;

// Update reservation status request
export const UpdateReservationStatusSchema = z.object({
  status: ReservationStatusSchema,
  cancellationReason: z.string().optional(),
});

export type UpdateReservationStatusRequest = z.infer<typeof UpdateReservationStatusSchema>;

// Table schemas
export const CreateTableSchema = z.object({
  tableNumber: z.string().min(1),
  capacityMin: z.number().int().min(1).optional(),
  capacityMax: z.number().int().min(1),
  section: z.string().optional(),
  positionX: z.number().int().optional(),
  positionY: z.number().int().optional(),
});

export type CreateTableRequest = z.infer<typeof CreateTableSchema>;

export const UpdateTableSchema = CreateTableSchema.partial().extend({
  isActive: z.boolean().optional(),
});

export type UpdateTableRequest = z.infer<typeof UpdateTableSchema>;

// Reservation settings schema
export const ReservationSettingsSchema = z.object({
  minPartySize: z.number().int().min(1).optional(),
  maxPartySize: z.number().int().min(1).optional(),
  bookingWindowDays: z.number().int().min(1).optional(),
  minAdvanceHours: z.number().int().min(0).optional(),
  slotDurationMinutes: z.number().int().min(5).optional(),
  defaultDiningDuration: z.number().int().min(15).optional(),
  allowWaitlist: z.boolean().optional(),
  maxReservationsPerSlot: z.number().int().optional(),
  cancellationPolicy: z.string().optional(),
  cancellationDeadlineHours: z.number().int().optional(),
  requireConfirmation: z.boolean().optional(),
  autoConfirm: z.boolean().optional(),
  sendReminders: z.boolean().optional(),
  reminderHoursBefore: z.number().int().optional(),
  requireDeposit: z.boolean().optional(),
  depositAmount: z.number().optional(),
  depositPolicy: z.string().optional(),
});

export type ReservationSettingsRequest = z.infer<typeof ReservationSettingsSchema>;

// Reservation response (full model)
export const ReservationResponseSchema = z.object({
  id: z.string(),
  businessId: z.string(),
  customerUserId: z.string().nullable(),
  customerName: z.string(),
  customerEmail: z.string(),
  customerPhone: z.string().nullable(),
  reservationDate: z.string(),
  reservationTime: z.string(),
  partySize: z.number(),
  durationMinutes: z.number(),
  tableId: z.string().nullable(),
  seatingPreference: z.string().nullable(),
  specialRequests: z.string().nullable(),
  occasion: z.string().nullable(),
  status: z.string(),
  confirmedAt: z.string().nullable(),
  seatedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  cancelledAt: z.string().nullable(),
  cancellationReason: z.string().nullable(),
  source: z.string(),
  internalNotes: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  table: z.object({
    id: z.string(),
    tableNumber: z.string(),
    section: z.string().nullable(),
  }).nullable().optional(),
});

export type ReservationResponse = z.infer<typeof ReservationResponseSchema>;

// Table response
export const TableResponseSchema = z.object({
  id: z.string(),
  businessId: z.string(),
  tableNumber: z.string(),
  capacityMin: z.number(),
  capacityMax: z.number(),
  section: z.string().nullable(),
  isActive: z.boolean(),
  positionX: z.number().nullable(),
  positionY: z.number().nullable(),
  createdAt: z.string(),
});

export type TableResponse = z.infer<typeof TableResponseSchema>;

// Settings response
export const ReservationSettingsResponseSchema = z.object({
  id: z.string(),
  businessId: z.string(),
  minPartySize: z.number(),
  maxPartySize: z.number(),
  bookingWindowDays: z.number(),
  minAdvanceHours: z.number(),
  slotDurationMinutes: z.number(),
  defaultDiningDuration: z.number(),
  allowWaitlist: z.boolean(),
  maxReservationsPerSlot: z.number().nullable(),
  cancellationPolicy: z.string().nullable(),
  cancellationDeadlineHours: z.number(),
  requireConfirmation: z.boolean(),
  autoConfirm: z.boolean(),
  sendReminders: z.boolean(),
  reminderHoursBefore: z.number(),
  requireDeposit: z.boolean(),
  depositAmount: z.number().nullable(),
  depositPolicy: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type ReservationSettingsResponse = z.infer<typeof ReservationSettingsResponseSchema>;

// Availability slot
export const AvailabilitySlotSchema = z.object({
  time: z.string(), // "HH:mm"
  available: z.boolean(),
  remainingCapacity: z.number().optional(),
});

export type AvailabilitySlot = z.infer<typeof AvailabilitySlotSchema>;

// ============================================
// Menu Schemas
// ============================================

// Create menu category
export const CreateMenuCategorySchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  imageUrl: z.string().url().optional(),
  displayOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
  availableStartTime: z.string().optional(),
  availableEndTime: z.string().optional(),
  availableDays: z.array(z.number().min(0).max(6)).optional(),
});

export type CreateMenuCategoryRequest = z.infer<typeof CreateMenuCategorySchema>;

// Update menu category
export const UpdateMenuCategorySchema = CreateMenuCategorySchema.partial();
export type UpdateMenuCategoryRequest = z.infer<typeof UpdateMenuCategorySchema>;

// Menu category response
export const MenuCategoryResponseSchema = z.object({
  id: z.string(),
  businessId: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  imageUrl: z.string().nullable(),
  displayOrder: z.number(),
  isActive: z.boolean(),
  availableStartTime: z.string().nullable(),
  availableEndTime: z.string().nullable(),
  availableDays: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type MenuCategoryResponse = z.infer<typeof MenuCategoryResponseSchema>;

// Create menu item
export const CreateMenuItemSchema = z.object({
  categoryId: z.string(),
  name: z.string().min(1).max(100),
  description: z.string().max(1000).optional(),
  imageUrl: z.string().url().optional(),
  price: z.number().min(0),
  displayOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
  isVegetarian: z.boolean().optional(),
  isVegan: z.boolean().optional(),
  isGlutenFree: z.boolean().optional(),
  containsNuts: z.boolean().optional(),
  containsDairy: z.boolean().optional(),
  spiceLevel: z.number().int().min(0).max(5).optional(),
  calories: z.number().int().optional(),
  prepTimeMinutes: z.number().int().optional(),
  tags: z.array(z.string()).optional(),
});

export type CreateMenuItemRequest = z.infer<typeof CreateMenuItemSchema>;

// Update menu item
export const UpdateMenuItemSchema = CreateMenuItemSchema.partial().omit({ categoryId: true }).extend({
  categoryId: z.string().optional(),
  isAvailable: z.boolean().optional(),
  unavailableReason: z.string().optional(),
});
export type UpdateMenuItemRequest = z.infer<typeof UpdateMenuItemSchema>;

// Menu item response
export const MenuItemResponseSchema = z.object({
  id: z.string(),
  businessId: z.string(),
  categoryId: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  imageUrl: z.string().nullable(),
  price: z.number(),
  displayOrder: z.number(),
  isActive: z.boolean(),
  isVegetarian: z.boolean(),
  isVegan: z.boolean(),
  isGlutenFree: z.boolean(),
  containsNuts: z.boolean(),
  containsDairy: z.boolean(),
  spiceLevel: z.number().nullable(),
  calories: z.number().nullable(),
  isAvailable: z.boolean(),
  unavailableReason: z.string().nullable(),
  prepTimeMinutes: z.number().nullable(),
  tags: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type MenuItemResponse = z.infer<typeof MenuItemResponseSchema>;

// Create modifier group
export const CreateModifierGroupSchema = z.object({
  menuItemId: z.string(),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  displayOrder: z.number().int().optional(),
  isRequired: z.boolean().optional(),
  minSelections: z.number().int().min(0).optional(),
  maxSelections: z.number().int().min(1).optional(),
});

export type CreateModifierGroupRequest = z.infer<typeof CreateModifierGroupSchema>;

// Update modifier group
export const UpdateModifierGroupSchema = CreateModifierGroupSchema.partial().omit({ menuItemId: true });
export type UpdateModifierGroupRequest = z.infer<typeof UpdateModifierGroupSchema>;

// Modifier group response
export const ModifierGroupResponseSchema = z.object({
  id: z.string(),
  menuItemId: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  displayOrder: z.number(),
  isRequired: z.boolean(),
  minSelections: z.number(),
  maxSelections: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type ModifierGroupResponse = z.infer<typeof ModifierGroupResponseSchema>;

// Create modifier
export const CreateModifierSchema = z.object({
  modifierGroupId: z.string(),
  name: z.string().min(1).max(100),
  priceAdjustment: z.number().optional(),
  displayOrder: z.number().int().optional(),
  isDefault: z.boolean().optional(),
  isAvailable: z.boolean().optional(),
});

export type CreateModifierRequest = z.infer<typeof CreateModifierSchema>;

// Update modifier
export const UpdateModifierSchema = CreateModifierSchema.partial().omit({ modifierGroupId: true });
export type UpdateModifierRequest = z.infer<typeof UpdateModifierSchema>;

// Modifier response
export const ModifierResponseSchema = z.object({
  id: z.string(),
  modifierGroupId: z.string(),
  name: z.string(),
  priceAdjustment: z.number(),
  displayOrder: z.number(),
  isDefault: z.boolean(),
  isAvailable: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type ModifierResponse = z.infer<typeof ModifierResponseSchema>;

// Modifier group with modifiers
export const ModifierGroupWithModifiersSchema = ModifierGroupResponseSchema.extend({
  modifiers: z.array(ModifierResponseSchema),
});

export type ModifierGroupWithModifiers = z.infer<typeof ModifierGroupWithModifiersSchema>;

// Menu item with modifiers
export const MenuItemWithModifiersSchema = MenuItemResponseSchema.extend({
  modifierGroups: z.array(ModifierGroupWithModifiersSchema),
});

export type MenuItemWithModifiers = z.infer<typeof MenuItemWithModifiersSchema>;

// Menu category with items
export const MenuCategoryWithItemsSchema = MenuCategoryResponseSchema.extend({
  items: z.array(MenuItemResponseSchema),
});

export type MenuCategoryWithItems = z.infer<typeof MenuCategoryWithItemsSchema>;

// Full menu response (for public display)
export const FullMenuResponseSchema = z.object({
  businessId: z.string(),
  businessName: z.string(),
  categories: z.array(MenuCategoryWithItemsSchema),
});

export type FullMenuResponse = z.infer<typeof FullMenuResponseSchema>;

// ============================================
// Order Schemas
// ============================================

// Order type enum
export const OrderTypeSchema = z.enum(['dine_in', 'takeout', 'delivery']);
export type OrderType = z.infer<typeof OrderTypeSchema>;

// Order status enum
export const OrderStatusSchema = z.enum([
  'pending',
  'confirmed',
  'preparing',
  'ready',
  'completed',
  'cancelled'
]);
export type OrderStatus = z.infer<typeof OrderStatusSchema>;

// Payment status enum
export const PaymentStatusSchema = z.enum(['pending', 'paid', 'refunded', 'failed']);
export type PaymentStatus = z.infer<typeof PaymentStatusSchema>;

// Order item modifier
export const OrderItemModifierSchema = z.object({
  name: z.string(),
  priceAdjustment: z.number(),
});

// Create order item
export const CreateOrderItemSchema = z.object({
  menuItemId: z.string(),
  quantity: z.number().int().min(1),
  modifiers: z.array(OrderItemModifierSchema).optional(),
  specialRequests: z.string().optional(),
});

export type CreateOrderItemRequest = z.infer<typeof CreateOrderItemSchema>;

// Create order
export const CreateOrderSchema = z.object({
  orderType: OrderTypeSchema,
  customerName: z.string().min(1),
  customerEmail: z.string().email().optional(),
  customerPhone: z.string().optional(),
  // Dine-in
  tableId: z.string().optional(),
  reservationId: z.string().optional(),
  // Delivery
  deliveryAddress: z.string().optional(),
  deliveryNotes: z.string().optional(),
  // Timing
  scheduledFor: z.string().optional(), // ISO date string
  // Items
  items: z.array(CreateOrderItemSchema).min(1),
  // Notes
  specialInstructions: z.string().optional(),
  // Payment
  paymentMethod: z.string().optional(),
  tipAmount: z.number().min(0).optional(),
  // Source
  source: z.enum(['pos', 'website', 'app', 'phone']).optional(),
});

export type CreateOrderRequest = z.infer<typeof CreateOrderSchema>;

// Update order
export const UpdateOrderSchema = z.object({
  status: OrderStatusSchema.optional(),
  paymentStatus: PaymentStatusSchema.optional(),
  paymentMethod: z.string().optional(),
  paymentReference: z.string().optional(),
  tableId: z.string().optional(),
  estimatedReady: z.string().optional(),
  internalNotes: z.string().optional(),
  cancellationReason: z.string().optional(),
});

export type UpdateOrderRequest = z.infer<typeof UpdateOrderSchema>;

// Update order item status
export const UpdateOrderItemStatusSchema = z.object({
  status: z.enum(['pending', 'preparing', 'ready', 'served']),
});

export type UpdateOrderItemStatusRequest = z.infer<typeof UpdateOrderItemStatusSchema>;

// Order item response
export const OrderItemResponseSchema = z.object({
  id: z.string(),
  orderId: z.string(),
  menuItemId: z.string().nullable(),
  itemName: z.string(),
  itemPrice: z.number(),
  quantity: z.number(),
  modifiers: z.string().nullable(),
  modifiersTotal: z.number(),
  totalPrice: z.number(),
  specialRequests: z.string().nullable(),
  status: z.string(),
  preparedAt: z.string().nullable(),
  servedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type OrderItemResponse = z.infer<typeof OrderItemResponseSchema>;

// Order response
export const OrderResponseSchema = z.object({
  id: z.string(),
  businessId: z.string(),
  orderNumber: z.string(),
  orderType: z.string(),
  customerUserId: z.string().nullable(),
  customerName: z.string(),
  customerEmail: z.string().nullable(),
  customerPhone: z.string().nullable(),
  tableId: z.string().nullable(),
  reservationId: z.string().nullable(),
  deliveryAddress: z.string().nullable(),
  deliveryNotes: z.string().nullable(),
  deliveryFee: z.number().nullable(),
  scheduledFor: z.string().nullable(),
  estimatedReady: z.string().nullable(),
  subtotal: z.number(),
  taxAmount: z.number(),
  tipAmount: z.number(),
  discountAmount: z.number(),
  totalAmount: z.number(),
  paymentStatus: z.string(),
  paymentMethod: z.string().nullable(),
  paymentReference: z.string().nullable(),
  paidAt: z.string().nullable(),
  status: z.string(),
  confirmedAt: z.string().nullable(),
  preparingAt: z.string().nullable(),
  readyAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  cancelledAt: z.string().nullable(),
  cancellationReason: z.string().nullable(),
  source: z.string(),
  specialInstructions: z.string().nullable(),
  internalNotes: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  items: z.array(OrderItemResponseSchema).optional(),
  table: z.object({
    id: z.string(),
    tableNumber: z.string(),
    section: z.string().nullable(),
  }).nullable().optional(),
});

export type OrderResponse = z.infer<typeof OrderResponseSchema>;

// Order list item (for listing)
export const OrderListItemSchema = OrderResponseSchema.omit({
  items: true,
  deliveryNotes: true,
  internalNotes: true,
  specialInstructions: true,
});

export type OrderListItem = z.infer<typeof OrderListItemSchema>;

// ============================================
// Customer CRM Schemas
// ============================================

// Customer source enum
export const CustomerSourceSchema = z.enum(['pos', 'reservation', 'order', 'manual', 'import']);
export type CustomerSource = z.infer<typeof CustomerSourceSchema>;

// Loyalty tier enum
export const LoyaltyTierSchema = z.enum(['bronze', 'silver', 'gold', 'platinum']);
export type LoyaltyTier = z.infer<typeof LoyaltyTierSchema>;

// Create customer request
export const CreateCustomerSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  marketingOptIn: z.boolean().optional(),
  smsOptIn: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
  internalNotes: z.string().optional(),
  dietaryRestrictions: z.string().optional(),
  preferences: z.record(z.string(), z.unknown()).optional(),
  source: CustomerSourceSchema.optional(),
});

export type CreateCustomerRequest = z.infer<typeof CreateCustomerSchema>;

// Update customer request
export const UpdateCustomerSchema = CreateCustomerSchema.partial();
export type UpdateCustomerRequest = z.infer<typeof UpdateCustomerSchema>;

// Customer response
export const CustomerResponseSchema = z.object({
  id: z.string(),
  businessId: z.string(),
  userId: z.string().nullable(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  marketingOptIn: z.boolean(),
  smsOptIn: z.boolean(),
  tags: z.string().nullable(),
  internalNotes: z.string().nullable(),
  dietaryRestrictions: z.string().nullable(),
  preferences: z.string().nullable(),
  totalVisits: z.number(),
  totalSpent: z.number(),
  averageSpend: z.number(),
  lastVisitAt: z.string().nullable(),
  source: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type CustomerResponse = z.infer<typeof CustomerResponseSchema>;

// Customer with loyalty info
export const CustomerWithLoyaltySchema = CustomerResponseSchema.extend({
  loyaltyPoints: z.object({
    id: z.string(),
    pointsBalance: z.number(),
    lifetimeEarned: z.number(),
    lifetimeRedeemed: z.number(),
    tier: z.string(),
  }).nullable().optional(),
});

export type CustomerWithLoyalty = z.infer<typeof CustomerWithLoyaltySchema>;

// Customer list item
export const CustomerListItemSchema = z.object({
  id: z.string(),
  businessId: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  tags: z.string().nullable(),
  totalVisits: z.number(),
  totalSpent: z.number(),
  lastVisitAt: z.string().nullable(),
  loyaltyTier: z.string().nullable(),
  loyaltyPoints: z.number().nullable(),
  createdAt: z.string(),
});

export type CustomerListItem = z.infer<typeof CustomerListItemSchema>;

// Customer activity types
export const CustomerActivityTypeSchema = z.enum([
  'order',
  'reservation',
  'visit',
  'feedback',
  'note',
  'loyalty_earned',
  'loyalty_redeemed',
]);
export type CustomerActivityType = z.infer<typeof CustomerActivityTypeSchema>;

// Create customer activity
export const CreateCustomerActivitySchema = z.object({
  activityType: CustomerActivityTypeSchema,
  orderId: z.string().optional(),
  reservationId: z.string().optional(),
  description: z.string().optional(),
  amount: z.number().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type CreateCustomerActivityRequest = z.infer<typeof CreateCustomerActivitySchema>;

// Customer activity response
export const CustomerActivityResponseSchema = z.object({
  id: z.string(),
  customerId: z.string(),
  businessId: z.string(),
  activityType: z.string(),
  orderId: z.string().nullable(),
  reservationId: z.string().nullable(),
  description: z.string().nullable(),
  amount: z.number().nullable(),
  metadata: z.string().nullable(),
  createdAt: z.string(),
});

export type CustomerActivityResponse = z.infer<typeof CustomerActivityResponseSchema>;

// Loyalty transaction type
export const LoyaltyTransactionTypeSchema = z.enum(['earned', 'redeemed', 'adjusted', 'expired']);
export type LoyaltyTransactionType = z.infer<typeof LoyaltyTransactionTypeSchema>;

// Loyalty points response
export const LoyaltyPointsResponseSchema = z.object({
  id: z.string(),
  customerId: z.string(),
  businessId: z.string(),
  pointsBalance: z.number(),
  lifetimeEarned: z.number(),
  lifetimeRedeemed: z.number(),
  tier: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type LoyaltyPointsResponse = z.infer<typeof LoyaltyPointsResponseSchema>;

// Loyalty transaction response
export const LoyaltyTransactionResponseSchema = z.object({
  id: z.string(),
  loyaltyPointsId: z.string(),
  businessId: z.string(),
  transactionType: z.string(),
  points: z.number(),
  balanceAfter: z.number(),
  orderId: z.string().nullable(),
  description: z.string().nullable(),
  processedBy: z.string().nullable(),
  createdAt: z.string(),
});

export type LoyaltyTransactionResponse = z.infer<typeof LoyaltyTransactionResponseSchema>;

// Adjust loyalty points request
export const AdjustLoyaltyPointsSchema = z.object({
  points: z.number().int(), // Positive to add, negative to subtract
  description: z.string().optional(),
});

export type AdjustLoyaltyPointsRequest = z.infer<typeof AdjustLoyaltyPointsSchema>;

// Redeem loyalty points request
export const RedeemLoyaltyPointsSchema = z.object({
  points: z.number().int().positive(),
  orderId: z.string().optional(),
  description: z.string().optional(),
});

export type RedeemLoyaltyPointsRequest = z.infer<typeof RedeemLoyaltyPointsSchema>;

// Loyalty settings response
export const LoyaltySettingsResponseSchema = z.object({
  id: z.string(),
  businessId: z.string(),
  isEnabled: z.boolean(),
  programName: z.string(),
  pointsPerDollar: z.number(),
  minimumSpend: z.number().nullable(),
  pointsPerReward: z.number(),
  rewardValue: z.number(),
  maxRedemptionPercent: z.number(),
  tierThresholds: z.string().nullable(),
  pointsExpireDays: z.number().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type LoyaltySettingsResponse = z.infer<typeof LoyaltySettingsResponseSchema>;

// Update loyalty settings
export const UpdateLoyaltySettingsSchema = z.object({
  isEnabled: z.boolean().optional(),
  programName: z.string().optional(),
  pointsPerDollar: z.number().int().min(1).optional(),
  minimumSpend: z.number().min(0).optional(),
  pointsPerReward: z.number().int().min(1).optional(),
  rewardValue: z.number().min(0).optional(),
  maxRedemptionPercent: z.number().min(0).max(100).optional(),
  tierThresholds: z.record(z.string(), z.number()).optional(), // { silver: 500, gold: 1000, platinum: 2500 }
  pointsExpireDays: z.number().int().min(1).nullable().optional(),
});

export type UpdateLoyaltySettingsRequest = z.infer<typeof UpdateLoyaltySettingsSchema>;

// Customer stats for a business
export const CustomerStatsSchema = z.object({
  totalCustomers: z.number(),
  newCustomersThisMonth: z.number(),
  activeCustomers: z.number(), // Visited in last 30 days
  averageCustomerValue: z.number(),
  topSpenders: z.array(CustomerListItemSchema),
  loyaltyStats: z.object({
    totalMembers: z.number(),
    bronzeMembers: z.number(),
    silverMembers: z.number(),
    goldMembers: z.number(),
    platinumMembers: z.number(),
    totalPointsOutstanding: z.number(),
  }).optional(),
});

export type CustomerStats = z.infer<typeof CustomerStatsSchema>;

// ============================================
// Analytics Schemas
// ============================================

// Revenue Analytics
export const RevenueSummarySchema = z.object({
  totalRevenue: z.number(),
  avgOrderValue: z.number(),
  totalOrders: z.number(),
  totalTax: z.number(),
  totalTips: z.number(),
  totalDiscounts: z.number(),
  paidAmount: z.number(),
  pendingAmount: z.number(),
  refundedAmount: z.number(),
  byOrderType: z.record(z.string(), z.object({
    count: z.number(),
    revenue: z.number(),
  })),
});

export type RevenueSummary = z.infer<typeof RevenueSummarySchema>;

export const RevenueTimeSeriesSchema = z.object({
  date: z.string(),
  revenue: z.number(),
  orders: z.number(),
  avgOrderValue: z.number(),
});

export type RevenueTimeSeries = z.infer<typeof RevenueTimeSeriesSchema>;

// Order Analytics
export const OrderAnalyticsSummarySchema = z.object({
  totalOrders: z.number(),
  byStatus: z.record(z.string(), z.number()),
  byType: z.record(z.string(), z.number()),
  bySource: z.record(z.string(), z.number()),
  completedOrders: z.number(),
  cancelledOrders: z.number(),
  cancellationRate: z.number(),
});

export type OrderAnalyticsSummary = z.infer<typeof OrderAnalyticsSummarySchema>;

export const OrderByHourSchema = z.object({
  hour: z.number(),
  count: z.number(),
  revenue: z.number(),
});

export type OrderByHour = z.infer<typeof OrderByHourSchema>;

// Customer Analytics
export const CustomerAnalyticsSummarySchema = z.object({
  totalCustomers: z.number(),
  newThisMonth: z.number(),
  activeCustomers: z.number(),
  repeatCustomerRate: z.number(),
  avgLifetimeValue: z.number(),
  avgOrdersPerCustomer: z.number(),
  bySource: z.record(z.string(), z.number()),
});

export type CustomerAnalyticsSummary = z.infer<typeof CustomerAnalyticsSummarySchema>;

export const TopSpenderSchema = z.object({
  id: z.string(),
  name: z.string(),
  totalSpent: z.number(),
  visitCount: z.number(),
  avgSpend: z.number(),
  lastVisit: z.string().nullable(),
});

export type TopSpender = z.infer<typeof TopSpenderSchema>;

// Menu Analytics
export const PopularItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  categoryName: z.string(),
  price: z.number(),
  quantitySold: z.number(),
  revenue: z.number(),
});

export type PopularItem = z.infer<typeof PopularItemSchema>;

export const CategoryPerformanceSchema = z.object({
  id: z.string(),
  name: z.string(),
  itemCount: z.number(),
  activeItemCount: z.number(),
  totalRevenue: z.number(),
  avgPrice: z.number(),
  totalQuantitySold: z.number(),
});

export type CategoryPerformance = z.infer<typeof CategoryPerformanceSchema>;

// Reservation Analytics
export const ReservationAnalyticsSummarySchema = z.object({
  totalReservations: z.number(),
  byStatus: z.record(z.string(), z.number()),
  noShowRate: z.number(),
  cancellationRate: z.number(),
  avgPartySize: z.number(),
  bySource: z.record(z.string(), z.number()),
});

export type ReservationAnalyticsSummary = z.infer<typeof ReservationAnalyticsSummarySchema>;

// Dashboard Summary
export const AnalyticsDashboardSchema = z.object({
  revenue: z.object({
    today: z.number(),
    thisWeek: z.number(),
    thisMonth: z.number(),
    trend: z.array(RevenueTimeSeriesSchema),
  }),
  orders: z.object({
    today: z.number(),
    thisWeek: z.number(),
    thisMonth: z.number(),
    byStatus: z.record(z.string(), z.number()),
    byType: z.record(z.string(), z.number()),
    byHour: z.array(OrderByHourSchema),
  }),
  customers: z.object({
    total: z.number(),
    newThisMonth: z.number(),
    active: z.number(),
    topSpenders: z.array(TopSpenderSchema),
  }),
  menu: z.object({
    popularItems: z.array(PopularItemSchema),
    categoryPerformance: z.array(CategoryPerformanceSchema),
  }),
  reservations: z.object({
    upcoming: z.number(),
    today: z.number(),
    noShowRate: z.number(),
    avgPartySize: z.number(),
  }),
});

export type AnalyticsDashboard = z.infer<typeof AnalyticsDashboardSchema>;

// ============================================
// Business Delete Schemas
// ============================================

// Delete business request
export const DeleteBusinessSchema = z.object({
  adminId: z.string().uuid(),
  reason: z.string().optional(),
});

export type DeleteBusinessRequest = z.infer<typeof DeleteBusinessSchema>;

// Related counts response
export const BusinessRelatedCountsSchema = z.object({
  businessId: z.string(),
  businessName: z.string(),
  counts: z.object({
    menuCategories: z.number(),
    menuItems: z.number(),
    orders: z.number(),
    reservations: z.number(),
    customers: z.number(),
    restaurantTables: z.number(),
  }),
  totalRelatedRecords: z.number(),
});

export type BusinessRelatedCounts = z.infer<typeof BusinessRelatedCountsSchema>;

// Delete business response
export const DeleteBusinessResponseSchema = z.object({
  deleted: z.boolean(),
  hardDelete: z.boolean(),
  businessId: z.string(),
  businessName: z.string(),
  deletedAt: z.string().optional(),
  deletedRelatedRecords: z.object({
    menuCategories: z.number(),
    menuItems: z.number(),
    orders: z.number(),
    reservations: z.number(),
    customers: z.number(),
    restaurantTables: z.number(),
  }).optional(),
});

export type DeleteBusinessResponse = z.infer<typeof DeleteBusinessResponseSchema>;
