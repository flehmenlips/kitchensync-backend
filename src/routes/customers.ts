import { Hono } from 'hono';
import { supabase } from '../supabase';
import {
  CreateCustomerSchema,
  UpdateCustomerSchema,
  CreateCustomerActivitySchema,
  AdjustLoyaltyPointsSchema,
  RedeemLoyaltyPointsSchema,
  UpdateLoyaltySettingsSchema,
} from '../types';

const customersRouter = new Hono();

// Helper function to convert snake_case to camelCase
function toCamelCase<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key in obj) {
    const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    const value = obj[key];
    if (value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
      result[camelKey] = toCamelCase(value as Record<string, unknown>);
    } else {
      result[camelKey] = value;
    }
  }
  return result;
}

// Helper function to convert camelCase to snake_case
function toSnakeCase(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key in obj) {
    const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
    result[snakeKey] = obj[key];
  }
  return result;
}

// ============================================
// Customers CRUD
// ============================================

// List customers for a business
customersRouter.get('/:businessId', async (c) => {
  const { businessId } = c.req.param();
  const search = c.req.query('search');
  const tag = c.req.query('tag');
  const tier = c.req.query('tier');
  const sortBy = c.req.query('sortBy') || 'createdAt';
  const sortOrder = c.req.query('sortOrder') || 'desc';
  const limit = parseInt(c.req.query('limit') || '50');
  const offset = parseInt(c.req.query('offset') || '0');

  // Map camelCase sortBy to snake_case
  const sortByMap: Record<string, string> = {
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    firstName: 'first_name',
    lastName: 'last_name',
    totalSpent: 'total_spent',
    totalVisits: 'total_visits',
    lastVisitAt: 'last_visit_at',
  };
  const sortColumn = sortByMap[sortBy] || 'created_at';

  let query = supabase
    .from('customers')
    .select('*, loyalty_points(points_balance, tier)', { count: 'exact' })
    .eq('business_id', businessId)
    .order(sortColumn, { ascending: sortOrder === 'asc' })
    .range(offset, offset + limit - 1);

  if (search) {
    query = query.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`);
  }

  if (tag) {
    query = query.ilike('tags', `%${tag}%`);
  }

  const { data: customers, error, count } = await query;

  if (error) {
    return c.json({ error: { message: error.message, code: 'DATABASE_ERROR' } }, 500);
  }

  // Filter by tier if specified (after fetch since it's in a relation)
  let filteredCustomers = customers || [];
  if (tier) {
    filteredCustomers = filteredCustomers.filter((cust: Record<string, unknown>) => {
      const loyaltyPoints = cust.loyalty_points as { tier?: string } | null;
      return loyaltyPoints?.tier === tier;
    });
  }

  // Transform for response
  const data = filteredCustomers.map((customer: Record<string, unknown>) => {
    const loyaltyPoints = customer.loyalty_points as { points_balance?: number; tier?: string } | null;
    return {
      id: customer.id,
      businessId: customer.business_id,
      firstName: customer.first_name,
      lastName: customer.last_name,
      email: customer.email,
      phone: customer.phone,
      tags: customer.tags,
      totalVisits: customer.total_visits,
      totalSpent: customer.total_spent,
      lastVisitAt: customer.last_visit_at || null,
      loyaltyTier: loyaltyPoints?.tier || null,
      loyaltyPoints: loyaltyPoints?.points_balance || null,
      createdAt: customer.created_at,
    };
  });

  return c.json({
    data,
    pagination: {
      total: tier ? data.length : (count || 0),
      limit,
      offset,
      hasMore: offset + (customers?.length || 0) < (count || 0),
    },
  });
});

// Get single customer
customersRouter.get('/:businessId/:customerId', async (c) => {
  const { businessId, customerId } = c.req.param();

  const { data: customer, error } = await supabase
    .from('customers')
    .select('*, loyalty_points(*)')
    .eq('id', customerId)
    .eq('business_id', businessId)
    .single();

  if (error || !customer) {
    return c.json({ error: { message: 'Customer not found', code: 'NOT_FOUND' } }, 404);
  }

  // Transform to camelCase
  const loyaltyPoints = customer.loyalty_points ? toCamelCase(customer.loyalty_points as Record<string, unknown>) : null;
  const transformed = {
    ...toCamelCase(customer),
    loyaltyPoints,
  };

  return c.json({ data: transformed });
});

// Create customer
customersRouter.post('/:businessId', async (c) => {
  const { businessId } = c.req.param();
  const body = await c.req.json();

  const parsed = CreateCustomerSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: { message: 'Invalid request', code: 'VALIDATION_ERROR', details: parsed.error.issues } }, 400);
  }

  // Verify business exists
  const { data: business, error: businessError } = await supabase
    .from('business_accounts')
    .select('id')
    .eq('id', businessId)
    .single();

  if (businessError || !business) {
    return c.json({ error: { message: 'Business not found', code: 'NOT_FOUND' } }, 404);
  }

  // Check for duplicate email
  if (parsed.data.email) {
    const { data: existing } = await supabase
      .from('customers')
      .select('id')
      .eq('business_id', businessId)
      .eq('email', parsed.data.email)
      .single();

    if (existing) {
      return c.json({ error: { message: 'Customer with this email already exists', code: 'DUPLICATE' } }, 409);
    }
  }

  const { data: customer, error: createError } = await supabase
    .from('customers')
    .insert({
      business_id: businessId,
      first_name: parsed.data.firstName,
      last_name: parsed.data.lastName,
      email: parsed.data.email,
      phone: parsed.data.phone,
      marketing_opt_in: parsed.data.marketingOptIn || false,
      sms_opt_in: parsed.data.smsOptIn || false,
      tags: parsed.data.tags ? JSON.stringify(parsed.data.tags) : null,
      internal_notes: parsed.data.internalNotes,
      dietary_restrictions: parsed.data.dietaryRestrictions,
      preferences: parsed.data.preferences ? JSON.stringify(parsed.data.preferences) : null,
      source: parsed.data.source || 'manual',
    })
    .select('*')
    .single();

  if (createError || !customer) {
    return c.json({ error: { message: createError?.message || 'Failed to create customer', code: 'DATABASE_ERROR' } }, 500);
  }

  // Create loyalty points record if loyalty program is enabled
  const { data: loyaltySettings } = await supabase
    .from('loyalty_settings')
    .select('is_enabled')
    .eq('business_id', businessId)
    .single();

  if (loyaltySettings?.is_enabled) {
    await supabase
      .from('loyalty_points')
      .insert({
        customer_id: customer.id,
        business_id: businessId,
      });
  }

  // Fetch the customer with loyalty points
  const { data: customerWithLoyalty } = await supabase
    .from('customers')
    .select('*, loyalty_points(*)')
    .eq('id', customer.id)
    .single();

  const transformed = toCamelCase(customerWithLoyalty || customer);
  if (customerWithLoyalty?.loyalty_points) {
    (transformed as Record<string, unknown>).loyaltyPoints = toCamelCase(customerWithLoyalty.loyalty_points as Record<string, unknown>);
  }

  return c.json({ data: transformed }, 201);
});

// Update customer
customersRouter.put('/:businessId/:customerId', async (c) => {
  const { businessId, customerId } = c.req.param();
  const body = await c.req.json();

  const parsed = UpdateCustomerSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: { message: 'Invalid request', code: 'VALIDATION_ERROR', details: parsed.error.issues } }, 400);
  }

  const { data: existing, error: fetchError } = await supabase
    .from('customers')
    .select('*')
    .eq('id', customerId)
    .eq('business_id', businessId)
    .single();

  if (fetchError || !existing) {
    return c.json({ error: { message: 'Customer not found', code: 'NOT_FOUND' } }, 404);
  }

  // Check for duplicate email if changing
  if (parsed.data.email && parsed.data.email !== existing.email) {
    const { data: duplicate } = await supabase
      .from('customers')
      .select('id')
      .eq('business_id', businessId)
      .eq('email', parsed.data.email)
      .neq('id', customerId)
      .single();

    if (duplicate) {
      return c.json({ error: { message: 'Customer with this email already exists', code: 'DUPLICATE' } }, 409);
    }
  }

  const updateData: Record<string, unknown> = {};
  if (parsed.data.firstName !== undefined) updateData.first_name = parsed.data.firstName;
  if (parsed.data.lastName !== undefined) updateData.last_name = parsed.data.lastName;
  if (parsed.data.email !== undefined) updateData.email = parsed.data.email;
  if (parsed.data.phone !== undefined) updateData.phone = parsed.data.phone;
  if (parsed.data.marketingOptIn !== undefined) updateData.marketing_opt_in = parsed.data.marketingOptIn;
  if (parsed.data.smsOptIn !== undefined) updateData.sms_opt_in = parsed.data.smsOptIn;
  if (parsed.data.tags !== undefined) updateData.tags = JSON.stringify(parsed.data.tags);
  if (parsed.data.internalNotes !== undefined) updateData.internal_notes = parsed.data.internalNotes;
  if (parsed.data.dietaryRestrictions !== undefined) updateData.dietary_restrictions = parsed.data.dietaryRestrictions;
  if (parsed.data.preferences !== undefined) updateData.preferences = JSON.stringify(parsed.data.preferences);

  const { data: customer, error: updateError } = await supabase
    .from('customers')
    .update(updateData)
    .eq('id', customerId)
    .select('*, loyalty_points(*)')
    .single();

  if (updateError || !customer) {
    return c.json({ error: { message: updateError?.message || 'Failed to update customer', code: 'DATABASE_ERROR' } }, 500);
  }

  const transformed = toCamelCase(customer);
  if (customer.loyalty_points) {
    (transformed as Record<string, unknown>).loyaltyPoints = toCamelCase(customer.loyalty_points as Record<string, unknown>);
  }

  return c.json({ data: transformed });
});

// Delete customer
customersRouter.delete('/:businessId/:customerId', async (c) => {
  const { businessId, customerId } = c.req.param();

  const { data: existing, error: fetchError } = await supabase
    .from('customers')
    .select('id')
    .eq('id', customerId)
    .eq('business_id', businessId)
    .single();

  if (fetchError || !existing) {
    return c.json({ error: { message: 'Customer not found', code: 'NOT_FOUND' } }, 404);
  }

  const { error: deleteError } = await supabase
    .from('customers')
    .delete()
    .eq('id', customerId);

  if (deleteError) {
    return c.json({ error: { message: deleteError.message, code: 'DATABASE_ERROR' } }, 500);
  }

  return c.json({ data: { success: true } });
});

// ============================================
// Customer Activities
// ============================================

// Get customer activities
customersRouter.get('/:businessId/:customerId/activities', async (c) => {
  const { businessId, customerId } = c.req.param();
  const activityType = c.req.query('activityType');
  const limit = parseInt(c.req.query('limit') || '50');
  const offset = parseInt(c.req.query('offset') || '0');

  // Verify customer belongs to business
  const { data: customer, error: customerError } = await supabase
    .from('customers')
    .select('id')
    .eq('id', customerId)
    .eq('business_id', businessId)
    .single();

  if (customerError || !customer) {
    return c.json({ error: { message: 'Customer not found', code: 'NOT_FOUND' } }, 404);
  }

  let query = supabase
    .from('customer_activities')
    .select('*', { count: 'exact' })
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (activityType) {
    query = query.eq('activity_type', activityType);
  }

  const { data: activities, error, count } = await query;

  if (error) {
    return c.json({ error: { message: error.message, code: 'DATABASE_ERROR' } }, 500);
  }

  const transformedActivities = (activities || []).map((a: Record<string, unknown>) => toCamelCase(a));

  return c.json({
    data: transformedActivities,
    pagination: {
      total: count || 0,
      limit,
      offset,
      hasMore: offset + (activities?.length || 0) < (count || 0),
    },
  });
});

// Add customer activity
customersRouter.post('/:businessId/:customerId/activities', async (c) => {
  const { businessId, customerId } = c.req.param();
  const body = await c.req.json();

  const parsed = CreateCustomerActivitySchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: { message: 'Invalid request', code: 'VALIDATION_ERROR', details: parsed.error.issues } }, 400);
  }

  // Verify customer belongs to business
  const { data: customer, error: customerError } = await supabase
    .from('customers')
    .select('*')
    .eq('id', customerId)
    .eq('business_id', businessId)
    .single();

  if (customerError || !customer) {
    return c.json({ error: { message: 'Customer not found', code: 'NOT_FOUND' } }, 404);
  }

  const { data: activity, error: createError } = await supabase
    .from('customer_activities')
    .insert({
      customer_id: customerId,
      business_id: businessId,
      activity_type: parsed.data.activityType,
      order_id: parsed.data.orderId,
      reservation_id: parsed.data.reservationId,
      description: parsed.data.description,
      amount: parsed.data.amount,
      metadata: parsed.data.metadata ? JSON.stringify(parsed.data.metadata) : null,
    })
    .select('*')
    .single();

  if (createError || !activity) {
    return c.json({ error: { message: createError?.message || 'Failed to create activity', code: 'DATABASE_ERROR' } }, 500);
  }

  // Update customer stats if it's a visit or order
  if (parsed.data.activityType === 'visit' || parsed.data.activityType === 'order') {
    const newTotalVisits = (customer.total_visits || 0) + 1;
    const newTotalSpent = (customer.total_spent || 0) + (parsed.data.amount || 0);

    await supabase
      .from('customers')
      .update({
        total_visits: newTotalVisits,
        total_spent: newTotalSpent,
        average_spend: newTotalSpent / newTotalVisits,
        last_visit_at: new Date().toISOString(),
      })
      .eq('id', customerId);
  }

  return c.json({ data: toCamelCase(activity) }, 201);
});

// ============================================
// Loyalty Points
// ============================================

// Get customer loyalty points
customersRouter.get('/:businessId/:customerId/loyalty', async (c) => {
  const { businessId, customerId } = c.req.param();

  const { data: customer, error: customerError } = await supabase
    .from('customers')
    .select('id')
    .eq('id', customerId)
    .eq('business_id', businessId)
    .single();

  if (customerError || !customer) {
    return c.json({ error: { message: 'Customer not found', code: 'NOT_FOUND' } }, 404);
  }

  let { data: loyaltyPoints, error: loyaltyError } = await supabase
    .from('loyalty_points')
    .select('*')
    .eq('customer_id', customerId)
    .single();

  // Create loyalty record if doesn't exist
  if (loyaltyError || !loyaltyPoints) {
    const { data: newLoyaltyPoints, error: createError } = await supabase
      .from('loyalty_points')
      .insert({
        customer_id: customerId,
        business_id: businessId,
      })
      .select('*')
      .single();

    if (createError) {
      return c.json({ error: { message: createError.message, code: 'DATABASE_ERROR' } }, 500);
    }
    loyaltyPoints = newLoyaltyPoints;
  }

  // Fetch transactions
  const { data: transactions } = await supabase
    .from('loyalty_transactions')
    .select('*')
    .eq('loyalty_points_id', loyaltyPoints!.id)
    .order('created_at', { ascending: false })
    .limit(20);

  const transformed = toCamelCase(loyaltyPoints!);
  (transformed as Record<string, unknown>).transactions = (transactions || []).map((t: Record<string, unknown>) => toCamelCase(t));

  return c.json({ data: transformed });
});

// Adjust loyalty points (manual adjustment)
customersRouter.post('/:businessId/:customerId/loyalty/adjust', async (c) => {
  const { businessId, customerId } = c.req.param();
  const body = await c.req.json();

  const parsed = AdjustLoyaltyPointsSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: { message: 'Invalid request', code: 'VALIDATION_ERROR', details: parsed.error.issues } }, 400);
  }

  const { data: customer, error: customerError } = await supabase
    .from('customers')
    .select('id')
    .eq('id', customerId)
    .eq('business_id', businessId)
    .single();

  if (customerError || !customer) {
    return c.json({ error: { message: 'Customer not found', code: 'NOT_FOUND' } }, 404);
  }

  // Get or create loyalty points
  let { data: loyaltyPoints } = await supabase
    .from('loyalty_points')
    .select('*')
    .eq('customer_id', customerId)
    .single();

  if (!loyaltyPoints) {
    const { data: newLoyaltyPoints, error: createError } = await supabase
      .from('loyalty_points')
      .insert({ customer_id: customerId, business_id: businessId })
      .select('*')
      .single();

    if (createError) {
      return c.json({ error: { message: createError.message, code: 'DATABASE_ERROR' } }, 500);
    }
    loyaltyPoints = newLoyaltyPoints;
  }

  const newBalance = (loyaltyPoints!.points_balance || 0) + parsed.data.points;
  if (newBalance < 0) {
    return c.json({ error: { message: 'Insufficient points', code: 'INSUFFICIENT_POINTS' } }, 400);
  }

  const transactionType = parsed.data.points > 0 ? 'earned' : 'adjusted';

  // Update points
  const { data: updatedPoints, error: updateError } = await supabase
    .from('loyalty_points')
    .update({
      points_balance: newBalance,
      lifetime_earned: parsed.data.points > 0
        ? (loyaltyPoints!.lifetime_earned || 0) + parsed.data.points
        : loyaltyPoints!.lifetime_earned,
    })
    .eq('customer_id', customerId)
    .select('*')
    .single();

  if (updateError || !updatedPoints) {
    return c.json({ error: { message: updateError?.message || 'Failed to update points', code: 'DATABASE_ERROR' } }, 500);
  }

  // Create transaction
  await supabase
    .from('loyalty_transactions')
    .insert({
      loyalty_points_id: loyaltyPoints!.id,
      business_id: businessId,
      transaction_type: transactionType,
      points: parsed.data.points,
      balance_after: newBalance,
      description: parsed.data.description || 'Manual adjustment',
    });

  // Update tier based on lifetime points
  const { data: settings } = await supabase
    .from('loyalty_settings')
    .select('tier_thresholds')
    .eq('business_id', businessId)
    .single();

  if (settings?.tier_thresholds) {
    const thresholds = typeof settings.tier_thresholds === 'string'
      ? JSON.parse(settings.tier_thresholds)
      : settings.tier_thresholds;
    let newTier = 'bronze';
    const lifetime = updatedPoints.lifetime_earned || 0;

    if (thresholds.platinum && lifetime >= thresholds.platinum) newTier = 'platinum';
    else if (thresholds.gold && lifetime >= thresholds.gold) newTier = 'gold';
    else if (thresholds.silver && lifetime >= thresholds.silver) newTier = 'silver';

    if (newTier !== updatedPoints.tier) {
      await supabase
        .from('loyalty_points')
        .update({ tier: newTier })
        .eq('customer_id', customerId);
    }
  }

  // Record activity
  await supabase
    .from('customer_activities')
    .insert({
      customer_id: customerId,
      business_id: businessId,
      activity_type: parsed.data.points > 0 ? 'loyalty_earned' : 'loyalty_redeemed',
      amount: Math.abs(parsed.data.points),
      description: parsed.data.description || `${parsed.data.points > 0 ? 'Earned' : 'Adjusted'} ${Math.abs(parsed.data.points)} points`,
    });

  return c.json({ data: toCamelCase(updatedPoints) });
});

// Redeem loyalty points
customersRouter.post('/:businessId/:customerId/loyalty/redeem', async (c) => {
  const { businessId, customerId } = c.req.param();
  const body = await c.req.json();

  const parsed = RedeemLoyaltyPointsSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: { message: 'Invalid request', code: 'VALIDATION_ERROR', details: parsed.error.issues } }, 400);
  }

  const { data: customer, error: customerError } = await supabase
    .from('customers')
    .select('id')
    .eq('id', customerId)
    .eq('business_id', businessId)
    .single();

  if (customerError || !customer) {
    return c.json({ error: { message: 'Customer not found', code: 'NOT_FOUND' } }, 404);
  }

  const { data: loyaltyPoints, error: loyaltyError } = await supabase
    .from('loyalty_points')
    .select('*')
    .eq('customer_id', customerId)
    .single();

  if (loyaltyError || !loyaltyPoints || (loyaltyPoints.points_balance || 0) < parsed.data.points) {
    return c.json({ error: { message: 'Insufficient points', code: 'INSUFFICIENT_POINTS' } }, 400);
  }

  const newBalance = (loyaltyPoints.points_balance || 0) - parsed.data.points;

  // Update points
  const { data: updatedPoints, error: updateError } = await supabase
    .from('loyalty_points')
    .update({
      points_balance: newBalance,
      lifetime_redeemed: (loyaltyPoints.lifetime_redeemed || 0) + parsed.data.points,
    })
    .eq('customer_id', customerId)
    .select('*')
    .single();

  if (updateError || !updatedPoints) {
    return c.json({ error: { message: updateError?.message || 'Failed to update points', code: 'DATABASE_ERROR' } }, 500);
  }

  // Create transaction
  await supabase
    .from('loyalty_transactions')
    .insert({
      loyalty_points_id: loyaltyPoints.id,
      business_id: businessId,
      transaction_type: 'redeemed',
      points: -parsed.data.points,
      balance_after: newBalance,
      order_id: parsed.data.orderId,
      description: parsed.data.description || `Redeemed ${parsed.data.points} points`,
    });

  // Record activity
  await supabase
    .from('customer_activities')
    .insert({
      customer_id: customerId,
      business_id: businessId,
      activity_type: 'loyalty_redeemed',
      amount: parsed.data.points,
      order_id: parsed.data.orderId,
      description: `Redeemed ${parsed.data.points} points`,
    });

  return c.json({ data: toCamelCase(updatedPoints) });
});

// ============================================
// Loyalty Settings (Business-level)
// ============================================

// Get loyalty settings
customersRouter.get('/:businessId/settings/loyalty', async (c) => {
  const { businessId } = c.req.param();

  let { data: settings, error } = await supabase
    .from('loyalty_settings')
    .select('*')
    .eq('business_id', businessId)
    .single();

  if (error || !settings) {
    // Create default settings
    const { data: newSettings, error: createError } = await supabase
      .from('loyalty_settings')
      .insert({ business_id: businessId })
      .select('*')
      .single();

    if (createError) {
      return c.json({ error: { message: createError.message, code: 'DATABASE_ERROR' } }, 500);
    }
    settings = newSettings;
  }

  return c.json({ data: toCamelCase(settings!) });
});

// Update loyalty settings
customersRouter.put('/:businessId/settings/loyalty', async (c) => {
  const { businessId } = c.req.param();
  const body = await c.req.json();

  const parsed = UpdateLoyaltySettingsSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: { message: 'Invalid request', code: 'VALIDATION_ERROR', details: parsed.error.issues } }, 400);
  }

  // Verify business exists
  const { data: business, error: businessError } = await supabase
    .from('business_accounts')
    .select('id')
    .eq('id', businessId)
    .single();

  if (businessError || !business) {
    return c.json({ error: { message: 'Business not found', code: 'NOT_FOUND' } }, 404);
  }

  const updateData: Record<string, unknown> = {};
  if (parsed.data.isEnabled !== undefined) updateData.is_enabled = parsed.data.isEnabled;
  if (parsed.data.programName !== undefined) updateData.program_name = parsed.data.programName;
  if (parsed.data.pointsPerDollar !== undefined) updateData.points_per_dollar = parsed.data.pointsPerDollar;
  if (parsed.data.minimumSpend !== undefined) updateData.minimum_spend = parsed.data.minimumSpend;
  if (parsed.data.pointsPerReward !== undefined) updateData.points_per_reward = parsed.data.pointsPerReward;
  if (parsed.data.rewardValue !== undefined) updateData.reward_value = parsed.data.rewardValue;
  if (parsed.data.maxRedemptionPercent !== undefined) updateData.max_redemption_percent = parsed.data.maxRedemptionPercent;
  if (parsed.data.pointsExpireDays !== undefined) updateData.points_expire_days = parsed.data.pointsExpireDays;
  if (parsed.data.tierThresholds !== undefined) {
    updateData.tier_thresholds = JSON.stringify(parsed.data.tierThresholds);
  }

  // Check if settings exist
  const { data: existingSettings } = await supabase
    .from('loyalty_settings')
    .select('id')
    .eq('business_id', businessId)
    .single();

  let settings;
  if (existingSettings) {
    // Update existing
    const { data: updatedSettings, error: updateError } = await supabase
      .from('loyalty_settings')
      .update(updateData)
      .eq('business_id', businessId)
      .select('*')
      .single();

    if (updateError) {
      return c.json({ error: { message: updateError.message, code: 'DATABASE_ERROR' } }, 500);
    }
    settings = updatedSettings;
  } else {
    // Create new
    const { data: newSettings, error: createError } = await supabase
      .from('loyalty_settings')
      .insert({ business_id: businessId, ...updateData })
      .select('*')
      .single();

    if (createError) {
      return c.json({ error: { message: createError.message, code: 'DATABASE_ERROR' } }, 500);
    }
    settings = newSettings;
  }

  return c.json({ data: toCamelCase(settings!) });
});

// ============================================
// Customer Stats
// ============================================

// Get customer stats for business
customersRouter.get('/:businessId/stats/summary', async (c) => {
  const { businessId } = c.req.param();

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Fetch all data in parallel
  const [
    totalCustomersResult,
    newCustomersThisMonthResult,
    activeCustomersResult,
    allCustomersResult,
    loyaltyPointsResult,
    topSpendersResult,
  ] = await Promise.all([
    supabase.from('customers').select('id', { count: 'exact', head: true }).eq('business_id', businessId),
    supabase.from('customers').select('id', { count: 'exact', head: true }).eq('business_id', businessId).gte('created_at', startOfMonth.toISOString()),
    supabase.from('customers').select('id', { count: 'exact', head: true }).eq('business_id', businessId).gte('last_visit_at', thirtyDaysAgo.toISOString()),
    supabase.from('customers').select('total_spent').eq('business_id', businessId),
    supabase.from('loyalty_points').select('tier, points_balance').eq('business_id', businessId),
    supabase.from('customers').select('*, loyalty_points(points_balance, tier)').eq('business_id', businessId).order('total_spent', { ascending: false }).limit(5),
  ]);

  const totalCustomers = totalCustomersResult.count || 0;
  const newCustomersThisMonth = newCustomersThisMonthResult.count || 0;
  const activeCustomers = activeCustomersResult.count || 0;
  const allCustomers = allCustomersResult.data || [];
  const loyaltyPointsData = loyaltyPointsResult.data || [];
  const topSpendersData = topSpendersResult.data || [];

  const totalSpent = allCustomers.reduce((sum: number, cust: Record<string, unknown>) => sum + ((cust.total_spent as number) || 0), 0);
  const averageCustomerValue = totalCustomers > 0 ? totalSpent / totalCustomers : 0;

  // Process loyalty stats (manual groupBy since Supabase doesn't support it directly)
  const loyaltyStatsSummary = {
    totalMembers: 0,
    bronzeMembers: 0,
    silverMembers: 0,
    goldMembers: 0,
    platinumMembers: 0,
    totalPointsOutstanding: 0,
  };

  for (const lp of loyaltyPointsData) {
    loyaltyStatsSummary.totalMembers += 1;
    loyaltyStatsSummary.totalPointsOutstanding += (lp.points_balance as number) || 0;

    switch (lp.tier) {
      case 'bronze': loyaltyStatsSummary.bronzeMembers += 1; break;
      case 'silver': loyaltyStatsSummary.silverMembers += 1; break;
      case 'gold': loyaltyStatsSummary.goldMembers += 1; break;
      case 'platinum': loyaltyStatsSummary.platinumMembers += 1; break;
    }
  }

  // Transform top spenders
  const topSpenders = topSpendersData.map((c: Record<string, unknown>) => {
    const loyaltyPoints = c.loyalty_points as { points_balance?: number; tier?: string } | null;
    return {
      id: c.id,
      businessId: c.business_id,
      firstName: c.first_name,
      lastName: c.last_name,
      email: c.email,
      phone: c.phone,
      tags: c.tags,
      totalVisits: c.total_visits,
      totalSpent: c.total_spent,
      lastVisitAt: c.last_visit_at || null,
      loyaltyTier: loyaltyPoints?.tier || null,
      loyaltyPoints: loyaltyPoints?.points_balance || null,
      createdAt: c.created_at,
    };
  });

  return c.json({
    data: {
      totalCustomers,
      newCustomersThisMonth,
      activeCustomers,
      averageCustomerValue,
      topSpenders,
      loyaltyStats: loyaltyStatsSummary,
    },
  });
});

// ============================================
// Find or Create Customer (for orders/reservations)
// ============================================

// Find or create customer by email/phone
customersRouter.post('/:businessId/find-or-create', async (c) => {
  const { businessId } = c.req.param();
  const body = await c.req.json();

  const { email, phone, firstName, lastName, source } = body;

  if (!email && !phone) {
    return c.json({ error: { message: 'Email or phone required', code: 'VALIDATION_ERROR' } }, 400);
  }

  // Try to find existing customer
  let customer = null;

  if (email) {
    const { data } = await supabase
      .from('customers')
      .select('*, loyalty_points(*)')
      .eq('business_id', businessId)
      .eq('email', email)
      .single();
    customer = data;
  }

  if (!customer && phone) {
    const { data } = await supabase
      .from('customers')
      .select('*, loyalty_points(*)')
      .eq('business_id', businessId)
      .eq('phone', phone)
      .single();
    customer = data;
  }

  // Create new customer if not found
  if (!customer && firstName && lastName) {
    const { data: newCustomer, error: createError } = await supabase
      .from('customers')
      .insert({
        business_id: businessId,
        first_name: firstName,
        last_name: lastName,
        email,
        phone,
        source: source || 'order',
      })
      .select('*, loyalty_points(*)')
      .single();

    if (createError) {
      return c.json({ error: { message: createError.message, code: 'DATABASE_ERROR' } }, 500);
    }
    customer = newCustomer;

    // Create loyalty points if program enabled
    const { data: loyaltySettings } = await supabase
      .from('loyalty_settings')
      .select('is_enabled')
      .eq('business_id', businessId)
      .single();

    if (loyaltySettings?.is_enabled) {
      await supabase
        .from('loyalty_points')
        .insert({ customer_id: customer!.id, business_id: businessId });
    }
  }

  if (!customer) {
    return c.json({ error: { message: 'Customer not found and insufficient data to create', code: 'NOT_FOUND' } }, 404);
  }

  // Transform to camelCase
  const transformed = toCamelCase(customer);
  if (customer.loyalty_points) {
    (transformed as Record<string, unknown>).loyaltyPoints = toCamelCase(customer.loyalty_points as Record<string, unknown>);
  }

  return c.json({ data: transformed });
});

export { customersRouter };
