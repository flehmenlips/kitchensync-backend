import { Hono } from 'hono';
import { supabase } from '../supabase';
import {
  CreateOrderSchema,
  UpdateOrderSchema,
  UpdateOrderItemStatusSchema,
} from '../types';

const ordersRouter = new Hono();

// Helper to convert snake_case to camelCase
function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

// Helper to convert camelCase to snake_case
function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

// Convert object keys from snake_case to camelCase
function toCamelCase<T>(obj: any): T {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) {
    return obj.map((item) => toCamelCase(item)) as T;
  }
  if (typeof obj === 'object') {
    const newObj: any = {};
    for (const key in obj) {
      const camelKey = snakeToCamel(key);
      newObj[camelKey] = toCamelCase(obj[key]);
    }
    return newObj as T;
  }
  return obj;
}

// Convert object keys from camelCase to snake_case for Supabase insert/update
function toSnakeCase(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) {
    return obj.map((item) => toSnakeCase(item));
  }
  if (typeof obj === 'object') {
    const newObj: any = {};
    for (const key in obj) {
      const snakeKey = camelToSnake(key);
      newObj[snakeKey] = toSnakeCase(obj[key]);
    }
    return newObj;
  }
  return obj;
}

// Helper to generate order number
async function generateOrderNumber(businessId: string): Promise<string> {
  const today = new Date();
  const datePrefix = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;

  // Get count of orders for today
  const startOfDay = new Date(today);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(today);
  endOfDay.setHours(23, 59, 59, 999);

  const { count, error } = await supabase
    .from('orders')
    .select('*', { count: 'exact', head: true })
    .eq('business_id', businessId)
    .gte('created_at', startOfDay.toISOString())
    .lte('created_at', endOfDay.toISOString());

  const orderCount = count || 0;

  return `${datePrefix}-${String(orderCount + 1).padStart(4, '0')}`;
}

// Helper to award loyalty points for completed orders
async function awardLoyaltyPoints(order: {
  id: string;
  businessId: string;
  totalAmount: number;
  customerEmail?: string | null;
  customerPhone?: string | null;
  customerName: string;
}) {
  // Check if loyalty program is enabled
  const { data: loyaltySettings, error: settingsError } = await supabase
    .from('loyalty_settings')
    .select('*')
    .eq('business_id', order.businessId)
    .single();

  if (settingsError || !loyaltySettings?.is_enabled) {
    return null;
  }

  // Check minimum spend requirement
  if (loyaltySettings.minimum_spend && order.totalAmount < loyaltySettings.minimum_spend) {
    return null;
  }

  // Find or create customer
  let customer = null;

  if (order.customerEmail) {
    const { data: customerByEmail } = await supabase
      .from('customers')
      .select('*')
      .eq('business_id', order.businessId)
      .eq('email', order.customerEmail)
      .single();
    customer = customerByEmail;
  }

  if (!customer && order.customerPhone) {
    const { data: customerByPhone } = await supabase
      .from('customers')
      .select('*')
      .eq('business_id', order.businessId)
      .eq('phone', order.customerPhone)
      .single();
    customer = customerByPhone;
  }

  // If no customer exists, create one
  if (!customer) {
    const nameParts = order.customerName.split(' ');
    const firstName = nameParts[0] || 'Guest';
    const lastName = nameParts.slice(1).join(' ') || '';

    const { data: newCustomer, error: createError } = await supabase
      .from('customers')
      .insert({
        business_id: order.businessId,
        first_name: firstName,
        last_name: lastName,
        email: order.customerEmail,
        phone: order.customerPhone,
        source: 'order',
      })
      .select()
      .single();

    if (createError) {
      return null;
    }
    customer = newCustomer;
  }

  // Get or create loyalty points record
  let loyaltyPoints = null;
  const { data: existingPoints } = await supabase
    .from('loyalty_points')
    .select('*')
    .eq('customer_id', customer.id)
    .single();

  loyaltyPoints = existingPoints;

  if (!loyaltyPoints) {
    const { data: newPoints, error: createPointsError } = await supabase
      .from('loyalty_points')
      .insert({
        customer_id: customer.id,
        business_id: order.businessId,
      })
      .select()
      .single();

    if (createPointsError) {
      return null;
    }
    loyaltyPoints = newPoints;
  }

  // Calculate points to award
  const pointsToAward = Math.floor(order.totalAmount * loyaltySettings.points_per_dollar);

  if (pointsToAward <= 0) {
    return null;
  }

  const newBalance = (loyaltyPoints.points_balance || 0) + pointsToAward;
  const newLifetimeEarned = (loyaltyPoints.lifetime_earned || 0) + pointsToAward;

  // Determine new tier based on lifetime points
  let newTier = 'bronze';
  if (loyaltySettings.tier_thresholds) {
    const thresholds = typeof loyaltySettings.tier_thresholds === 'string'
      ? JSON.parse(loyaltySettings.tier_thresholds)
      : loyaltySettings.tier_thresholds as Record<string, number>;
    if (thresholds.platinum && newLifetimeEarned >= thresholds.platinum) newTier = 'platinum';
    else if (thresholds.gold && newLifetimeEarned >= thresholds.gold) newTier = 'gold';
    else if (thresholds.silver && newLifetimeEarned >= thresholds.silver) newTier = 'silver';
  }

  // Update loyalty points
  const { data: updatedPoints, error: updateError } = await supabase
    .from('loyalty_points')
    .update({
      points_balance: newBalance,
      lifetime_earned: newLifetimeEarned,
      tier: newTier,
      updated_at: new Date().toISOString(),
    })
    .eq('customer_id', customer.id)
    .select()
    .single();

  if (updateError) {
    return null;
  }

  // Create transaction record
  await supabase
    .from('loyalty_transactions')
    .insert({
      loyalty_points_id: loyaltyPoints.id,
      business_id: order.businessId,
      transaction_type: 'earned',
      points: pointsToAward,
      balance_after: newBalance,
      order_id: order.id,
      description: `Earned from order (${order.totalAmount.toFixed(2)})`,
    });

  // Record customer activity
  await supabase
    .from('customer_activities')
    .insert({
      customer_id: customer.id,
      business_id: order.businessId,
      activity_type: 'loyalty_earned',
      order_id: order.id,
      amount: pointsToAward,
      description: `Earned ${pointsToAward} points from order`,
    });

  // Update customer stats
  const newTotalVisits = (customer.total_visits || 0) + 1;
  const newTotalSpent = (customer.total_spent || 0) + order.totalAmount;
  const newAverageSpend = newTotalSpent / newTotalVisits;

  await supabase
    .from('customers')
    .update({
      total_visits: newTotalVisits,
      total_spent: newTotalSpent,
      average_spend: newAverageSpend,
      last_visit_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', customer.id);

  return {
    customerId: customer.id,
    pointsAwarded: pointsToAward,
    newBalance,
    tier: newTier,
  };
}

// ============================================
// Orders CRUD
// ============================================

// List orders for a business
ordersRouter.get('/:businessId', async (c) => {
  const { businessId } = c.req.param();
  const status = c.req.query('status');
  const orderType = c.req.query('orderType');
  const date = c.req.query('date');
  const limit = parseInt(c.req.query('limit') || '50');
  const offset = parseInt(c.req.query('offset') || '0');

  let query = supabase
    .from('orders')
    .select('*', { count: 'exact' })
    .eq('business_id', businessId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (status) {
    query = query.eq('status', status);
  }

  if (orderType) {
    query = query.eq('order_type', orderType);
  }

  if (date) {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);
    query = query
      .gte('created_at', startOfDay.toISOString())
      .lte('created_at', endOfDay.toISOString());
  }

  const { data: orders, count, error } = await query;

  if (error) {
    return c.json({ error: { message: error.message, code: 'DB_ERROR' } }, 500);
  }

  // Get table info for orders with table_id
  const tableIds = orders?.filter(o => o.table_id).map(o => o.table_id) || [];
  let tablesMap = new Map<string, any>();
  if (tableIds.length > 0) {
    const { data: tables } = await supabase
      .from('restaurant_tables')
      .select('id, table_number, section')
      .in('id', tableIds);
    if (tables) {
      tablesMap = new Map(tables.map(t => [t.id, { id: t.id, tableNumber: t.table_number, section: t.section }]));
    }
  }

  // Get order items for all orders
  const orderIds = orders?.map(o => o.id) || [];
  let itemsMap = new Map<string, any[]>();
  if (orderIds.length > 0) {
    const { data: items } = await supabase
      .from('order_items')
      .select('*')
      .in('order_id', orderIds);
    if (items) {
      for (const item of items) {
        if (!itemsMap.has(item.order_id)) {
          itemsMap.set(item.order_id, []);
        }
        itemsMap.get(item.order_id)!.push(toCamelCase(item));
      }
    }
  }

  // Assemble orders with nested data
  const result = (orders || []).map(order => {
    const camelOrder = toCamelCase<any>(order);
    camelOrder.table = order.table_id ? tablesMap.get(order.table_id) || null : null;
    camelOrder.items = itemsMap.get(order.id) || [];
    return camelOrder;
  });

  const total = count || 0;

  return c.json({
    data: result,
    pagination: {
      total,
      limit,
      offset,
      hasMore: offset + result.length < total,
    },
  });
});

// Get single order
ordersRouter.get('/:businessId/:orderId', async (c) => {
  const { businessId, orderId } = c.req.param();

  const { data: order, error } = await supabase
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .eq('business_id', businessId)
    .single();

  if (error || !order) {
    return c.json({ error: { message: 'Order not found', code: 'NOT_FOUND' } }, 404);
  }

  // Get table info if exists
  let table = null;
  if (order.table_id) {
    const { data: tableData } = await supabase
      .from('restaurant_tables')
      .select('id, table_number, section')
      .eq('id', order.table_id)
      .single();
    if (tableData) {
      table = { id: tableData.id, tableNumber: tableData.table_number, section: tableData.section };
    }
  }

  // Get order items
  const { data: items } = await supabase
    .from('order_items')
    .select('*')
    .eq('order_id', orderId);

  const camelOrder = toCamelCase<any>(order);
  camelOrder.table = table;
  camelOrder.items = toCamelCase(items || []);

  return c.json({ data: camelOrder });
});

// Create order
ordersRouter.post('/:businessId', async (c) => {
  const { businessId } = c.req.param();
  const body = await c.req.json();

  const parsed = CreateOrderSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: { message: 'Invalid request', code: 'VALIDATION_ERROR', details: parsed.error.issues } }, 400);
  }

  // Verify business exists
  const { data: business, error: bizError } = await supabase
    .from('business_accounts')
    .select('id')
    .eq('id', businessId)
    .single();

  if (bizError || !business) {
    return c.json({ error: { message: 'Business not found', code: 'NOT_FOUND' } }, 404);
  }

  // Validate table if dine-in
  if (parsed.data.orderType === 'dine_in' && parsed.data.tableId) {
    const { data: table, error: tableError } = await supabase
      .from('restaurant_tables')
      .select('id')
      .eq('id', parsed.data.tableId)
      .eq('business_id', businessId)
      .single();

    if (tableError || !table) {
      return c.json({ error: { message: 'Table not found', code: 'NOT_FOUND' } }, 404);
    }
  }

  // Fetch menu items and calculate prices
  const menuItemIds = parsed.data.items.map(item => item.menuItemId);
  const { data: menuItems, error: menuError } = await supabase
    .from('menu_items')
    .select('*')
    .in('id', menuItemIds)
    .eq('business_id', businessId);

  if (menuError) {
    return c.json({ error: { message: menuError.message, code: 'DB_ERROR' } }, 500);
  }

  const menuItemMap = new Map((menuItems || []).map(item => [item.id, item]));

  // Validate all items exist and calculate totals
  let subtotal = 0;
  const orderItems: Array<{
    menu_item_id: string;
    item_name: string;
    item_price: number;
    quantity: number;
    modifiers: string | null;
    modifiers_total: number;
    total_price: number;
    special_requests: string | null;
  }> = [];

  for (const item of parsed.data.items) {
    const menuItem = menuItemMap.get(item.menuItemId);
    if (!menuItem) {
      return c.json({
        error: {
          message: `Menu item not found: ${item.menuItemId}`,
          code: 'NOT_FOUND'
        }
      }, 404);
    }

    if (!menuItem.is_available || !menuItem.is_active) {
      return c.json({
        error: {
          message: `Menu item not available: ${menuItem.name}`,
          code: 'ITEM_UNAVAILABLE'
        }
      }, 400);
    }

    const modifiersTotal = item.modifiers?.reduce((sum, m) => sum + m.priceAdjustment, 0) || 0;
    const itemTotal = (menuItem.price + modifiersTotal) * item.quantity;
    subtotal += itemTotal;

    orderItems.push({
      menu_item_id: menuItem.id,
      item_name: menuItem.name,
      item_price: menuItem.price,
      quantity: item.quantity,
      modifiers: item.modifiers ? JSON.stringify(item.modifiers) : null,
      modifiers_total: modifiersTotal,
      total_price: itemTotal,
      special_requests: item.specialRequests || null,
    });
  }

  // Calculate totals
  const taxRate = 0.08; // 8% tax - could be configurable per business
  const taxAmount = subtotal * taxRate;
  const tipAmount = parsed.data.tipAmount || 0;
  const deliveryFee = parsed.data.orderType === 'delivery' ? 5.00 : 0; // Could be configurable
  const totalAmount = subtotal + taxAmount + tipAmount + deliveryFee;

  // Generate order number
  const orderNumber = await generateOrderNumber(businessId);

  // Create order
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .insert({
      business_id: businessId,
      order_number: orderNumber,
      order_type: parsed.data.orderType,
      customer_name: parsed.data.customerName,
      customer_email: parsed.data.customerEmail,
      customer_phone: parsed.data.customerPhone,
      table_id: parsed.data.tableId,
      reservation_id: parsed.data.reservationId,
      delivery_address: parsed.data.deliveryAddress,
      delivery_notes: parsed.data.deliveryNotes,
      delivery_fee: parsed.data.orderType === 'delivery' ? deliveryFee : null,
      scheduled_for: parsed.data.scheduledFor ? new Date(parsed.data.scheduledFor).toISOString() : null,
      subtotal,
      tax_amount: taxAmount,
      tip_amount: tipAmount,
      total_amount: totalAmount,
      payment_method: parsed.data.paymentMethod,
      special_instructions: parsed.data.specialInstructions,
      source: parsed.data.source || 'pos',
      status: 'pending',
    })
    .select()
    .single();

  if (orderError || !order) {
    return c.json({ error: { message: orderError?.message || 'Failed to create order', code: 'DB_ERROR' } }, 500);
  }

  // Create order items
  const itemsToInsert = orderItems.map(item => ({
    ...item,
    order_id: order.id,
  }));

  const { data: items, error: itemsError } = await supabase
    .from('order_items')
    .insert(itemsToInsert)
    .select();

  if (itemsError) {
    return c.json({ error: { message: itemsError.message, code: 'DB_ERROR' } }, 500);
  }

  // Get table info if exists
  let table = null;
  if (order.table_id) {
    const { data: tableData } = await supabase
      .from('restaurant_tables')
      .select('id, table_number, section')
      .eq('id', order.table_id)
      .single();
    if (tableData) {
      table = { id: tableData.id, tableNumber: tableData.table_number, section: tableData.section };
    }
  }

  const camelOrder = toCamelCase<any>(order);
  camelOrder.table = table;
  camelOrder.items = toCamelCase(items || []);

  return c.json({ data: camelOrder }, 201);
});

// Update order
ordersRouter.put('/:businessId/:orderId', async (c) => {
  const { businessId, orderId } = c.req.param();
  const body = await c.req.json();

  const parsed = UpdateOrderSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: { message: 'Invalid request', code: 'VALIDATION_ERROR', details: parsed.error.issues } }, 400);
  }

  const { data: existing, error: existError } = await supabase
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .eq('business_id', businessId)
    .single();

  if (existError || !existing) {
    return c.json({ error: { message: 'Order not found', code: 'NOT_FOUND' } }, 404);
  }

  // Build update data with timestamps
  const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };

  // Map camelCase fields to snake_case
  if (parsed.data.status !== undefined) updateData.status = parsed.data.status;
  if (parsed.data.paymentStatus !== undefined) updateData.payment_status = parsed.data.paymentStatus;
  if (parsed.data.paymentMethod !== undefined) updateData.payment_method = parsed.data.paymentMethod;
  if (parsed.data.paymentReference !== undefined) updateData.payment_reference = parsed.data.paymentReference;
  if (parsed.data.internalNotes !== undefined) updateData.internal_notes = parsed.data.internalNotes;
  if (parsed.data.tableId !== undefined) updateData.table_id = parsed.data.tableId;
  if (parsed.data.cancellationReason !== undefined) updateData.cancellation_reason = parsed.data.cancellationReason;

  if (parsed.data.status) {
    const now = new Date().toISOString();
    switch (parsed.data.status) {
      case 'confirmed':
        updateData.confirmed_at = now;
        break;
      case 'preparing':
        updateData.preparing_at = now;
        break;
      case 'ready':
        updateData.ready_at = now;
        break;
      case 'completed':
        updateData.completed_at = now;
        // Award loyalty points when order is completed
        if (existing.status !== 'completed') {
          await awardLoyaltyPoints({
            id: orderId,
            businessId,
            totalAmount: existing.total_amount,
            customerEmail: existing.customer_email,
            customerPhone: existing.customer_phone,
            customerName: existing.customer_name,
          });
        }
        break;
      case 'cancelled':
        updateData.cancelled_at = now;
        break;
    }
  }

  if (parsed.data.paymentStatus === 'paid') {
    updateData.paid_at = new Date().toISOString();
  }

  if (parsed.data.estimatedReady) {
    updateData.estimated_ready = new Date(parsed.data.estimatedReady).toISOString();
  }

  const { data: order, error: updateError } = await supabase
    .from('orders')
    .update(updateData)
    .eq('id', orderId)
    .select()
    .single();

  if (updateError || !order) {
    return c.json({ error: { message: updateError?.message || 'Failed to update order', code: 'DB_ERROR' } }, 500);
  }

  // Get table info if exists
  let table = null;
  if (order.table_id) {
    const { data: tableData } = await supabase
      .from('restaurant_tables')
      .select('id, table_number, section')
      .eq('id', order.table_id)
      .single();
    if (tableData) {
      table = { id: tableData.id, tableNumber: tableData.table_number, section: tableData.section };
    }
  }

  // Get order items
  const { data: items } = await supabase
    .from('order_items')
    .select('*')
    .eq('order_id', orderId);

  const camelOrder = toCamelCase<any>(order);
  camelOrder.table = table;
  camelOrder.items = toCamelCase(items || []);

  return c.json({ data: camelOrder });
});

// Update order status (shorthand)
ordersRouter.put('/:businessId/:orderId/status', async (c) => {
  const { businessId, orderId } = c.req.param();
  const body = await c.req.json();

  const { status, cancellationReason } = body;

  if (!['pending', 'confirmed', 'preparing', 'ready', 'completed', 'cancelled'].includes(status)) {
    return c.json({ error: { message: 'Invalid status', code: 'VALIDATION_ERROR' } }, 400);
  }

  const { data: existing, error: existError } = await supabase
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .eq('business_id', businessId)
    .single();

  if (existError || !existing) {
    return c.json({ error: { message: 'Order not found', code: 'NOT_FOUND' } }, 404);
  }

  const now = new Date().toISOString();
  const updateData: Record<string, unknown> = { status, updated_at: now };

  switch (status) {
    case 'confirmed':
      updateData.confirmed_at = now;
      break;
    case 'preparing':
      updateData.preparing_at = now;
      break;
    case 'ready':
      updateData.ready_at = now;
      break;
    case 'completed':
      updateData.completed_at = now;
      // Award loyalty points when order is completed
      if (existing.status !== 'completed') {
        await awardLoyaltyPoints({
          id: orderId,
          businessId,
          totalAmount: existing.total_amount,
          customerEmail: existing.customer_email,
          customerPhone: existing.customer_phone,
          customerName: existing.customer_name,
        });
      }
      break;
    case 'cancelled':
      updateData.cancelled_at = now;
      if (cancellationReason) {
        updateData.cancellation_reason = cancellationReason;
      }
      break;
  }

  const { data: order, error: updateError } = await supabase
    .from('orders')
    .update(updateData)
    .eq('id', orderId)
    .select()
    .single();

  if (updateError || !order) {
    return c.json({ error: { message: updateError?.message || 'Failed to update order', code: 'DB_ERROR' } }, 500);
  }

  // Get table info if exists
  let table = null;
  if (order.table_id) {
    const { data: tableData } = await supabase
      .from('restaurant_tables')
      .select('id, table_number, section')
      .eq('id', order.table_id)
      .single();
    if (tableData) {
      table = { id: tableData.id, tableNumber: tableData.table_number, section: tableData.section };
    }
  }

  // Get order items
  const { data: items } = await supabase
    .from('order_items')
    .select('*')
    .eq('order_id', orderId);

  const camelOrder = toCamelCase<any>(order);
  camelOrder.table = table;
  camelOrder.items = toCamelCase(items || []);

  return c.json({ data: camelOrder });
});

// ============================================
// Order Items
// ============================================

// Update order item status
ordersRouter.put('/:businessId/:orderId/items/:itemId/status', async (c) => {
  const { businessId, orderId, itemId } = c.req.param();
  const body = await c.req.json();

  const parsed = UpdateOrderItemStatusSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: { message: 'Invalid request', code: 'VALIDATION_ERROR', details: parsed.error.issues } }, 400);
  }

  // Verify order belongs to business
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('id')
    .eq('id', orderId)
    .eq('business_id', businessId)
    .single();

  if (orderError || !order) {
    return c.json({ error: { message: 'Order not found', code: 'NOT_FOUND' } }, 404);
  }

  const { data: item, error: itemError } = await supabase
    .from('order_items')
    .select('*')
    .eq('id', itemId)
    .eq('order_id', orderId)
    .single();

  if (itemError || !item) {
    return c.json({ error: { message: 'Order item not found', code: 'NOT_FOUND' } }, 404);
  }

  const now = new Date().toISOString();
  const updateData: Record<string, unknown> = { status: parsed.data.status, updated_at: now };

  if (parsed.data.status === 'ready') {
    updateData.prepared_at = now;
  } else if (parsed.data.status === 'served') {
    updateData.served_at = now;
  }

  const { data: updatedItem, error: updateError } = await supabase
    .from('order_items')
    .update(updateData)
    .eq('id', itemId)
    .select()
    .single();

  if (updateError || !updatedItem) {
    return c.json({ error: { message: updateError?.message || 'Failed to update item', code: 'DB_ERROR' } }, 500);
  }

  return c.json({ data: toCamelCase(updatedItem) });
});

// ============================================
// Order Stats
// ============================================

// Get order stats for a business
ordersRouter.get('/:businessId/stats/summary', async (c) => {
  const { businessId } = c.req.param();
  const date = c.req.query('date');

  let baseQuery = supabase
    .from('orders')
    .select('*', { count: 'exact', head: true })
    .eq('business_id', businessId);

  if (date) {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);
    baseQuery = baseQuery
      .gte('created_at', startOfDay.toISOString())
      .lte('created_at', endOfDay.toISOString());
  }

  // Get total orders count
  const { count: totalOrders } = await baseQuery;

  // Get counts by status
  let pendingQuery = supabase
    .from('orders')
    .select('*', { count: 'exact', head: true })
    .eq('business_id', businessId)
    .eq('status', 'pending');

  let preparingQuery = supabase
    .from('orders')
    .select('*', { count: 'exact', head: true })
    .eq('business_id', businessId)
    .eq('status', 'preparing');

  let completedQuery = supabase
    .from('orders')
    .select('*', { count: 'exact', head: true })
    .eq('business_id', businessId)
    .eq('status', 'completed');

  let cancelledQuery = supabase
    .from('orders')
    .select('*', { count: 'exact', head: true })
    .eq('business_id', businessId)
    .eq('status', 'cancelled');

  let revenueQuery = supabase
    .from('orders')
    .select('total_amount')
    .eq('business_id', businessId)
    .eq('status', 'completed');

  if (date) {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);
    const startStr = startOfDay.toISOString();
    const endStr = endOfDay.toISOString();

    pendingQuery = pendingQuery.gte('created_at', startStr).lte('created_at', endStr);
    preparingQuery = preparingQuery.gte('created_at', startStr).lte('created_at', endStr);
    completedQuery = completedQuery.gte('created_at', startStr).lte('created_at', endStr);
    cancelledQuery = cancelledQuery.gte('created_at', startStr).lte('created_at', endStr);
    revenueQuery = revenueQuery.gte('created_at', startStr).lte('created_at', endStr);
  }

  const [
    { count: pendingOrders },
    { count: preparingOrders },
    { count: completedOrders },
    { count: cancelledOrders },
    { data: revenueData },
  ] = await Promise.all([
    pendingQuery,
    preparingQuery,
    completedQuery,
    cancelledQuery,
    revenueQuery,
  ]);

  const totalRevenue = (revenueData || []).reduce((sum, order) => sum + (order.total_amount || 0), 0);
  const completedCount = completedOrders || 0;
  const averageOrderValue = completedCount > 0 ? totalRevenue / completedCount : 0;

  return c.json({
    data: {
      totalOrders: totalOrders || 0,
      pendingOrders: pendingOrders || 0,
      preparingOrders: preparingOrders || 0,
      completedOrders: completedCount,
      cancelledOrders: cancelledOrders || 0,
      totalRevenue,
      averageOrderValue,
    },
  });
});

export { ordersRouter };
