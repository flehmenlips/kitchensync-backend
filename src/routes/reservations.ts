import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { supabase } from '../supabase';
import {
  CreateReservationSchema,
  UpdateReservationSchema,
  UpdateReservationStatusSchema,
  CreateTableSchema,
  UpdateTableSchema,
  ReservationSettingsSchema,
} from '../types';

export const reservationsRouter = new Hono();

// Helper to convert snake_case to camelCase
function toCamelCase<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key in obj) {
    const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    result[camelKey] = obj[key];
  }
  return result;
}

// Helper to convert camelCase to snake_case
function toSnakeCase<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key in obj) {
    const snakeKey = key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
    result[snakeKey] = obj[key];
  }
  return result;
}

// Helper to format table response
function formatTableResponse(table: Record<string, unknown>) {
  const camelTable = toCamelCase(table);
  return {
    ...camelTable,
    createdAt: camelTable.createdAt ? new Date(camelTable.createdAt as string).toISOString() : null,
  };
}

// Helper to format reservation response
function formatReservationResponse(reservation: Record<string, unknown>, table?: Record<string, unknown> | null) {
  const camelRes = toCamelCase(reservation);
  return {
    ...camelRes,
    reservationDate: camelRes.reservationDate
      ? new Date(camelRes.reservationDate as string).toISOString().split('T')[0]
      : null,
    confirmedAt: camelRes.confirmedAt ? new Date(camelRes.confirmedAt as string).toISOString() : null,
    seatedAt: camelRes.seatedAt ? new Date(camelRes.seatedAt as string).toISOString() : null,
    completedAt: camelRes.completedAt ? new Date(camelRes.completedAt as string).toISOString() : null,
    cancelledAt: camelRes.cancelledAt ? new Date(camelRes.cancelledAt as string).toISOString() : null,
    createdAt: camelRes.createdAt ? new Date(camelRes.createdAt as string).toISOString() : null,
    updatedAt: camelRes.updatedAt ? new Date(camelRes.updatedAt as string).toISOString() : null,
    table: table
      ? {
          id: table.id,
          tableNumber: table.table_number,
          section: table.section,
        }
      : null,
  };
}

// Helper to format settings response
function formatSettingsResponse(settings: Record<string, unknown>) {
  const camelSettings = toCamelCase(settings);
  return {
    ...camelSettings,
    createdAt: camelSettings.createdAt ? new Date(camelSettings.createdAt as string).toISOString() : null,
    updatedAt: camelSettings.updatedAt ? new Date(camelSettings.updatedAt as string).toISOString() : null,
  };
}

// ============================================
// Tables CRUD (must be before /:businessId/:id)
// ============================================

// List tables
reservationsRouter.get('/:businessId/tables', async (c) => {
  const businessId = c.req.param('businessId');

  try {
    const { data: tables, error } = await supabase
      .from('restaurant_tables')
      .select('*')
      .eq('business_id', businessId)
      .order('table_number', { ascending: true });

    if (error) {
      console.error('Error listing tables:', error);
      return c.json({ error: { message: 'Failed to list tables', code: 'LIST_FAILED' } }, 500);
    }

    return c.json({
      data: (tables || []).map((t) => formatTableResponse(t)),
    });
  } catch (error) {
    console.error('Error listing tables:', error);
    return c.json({ error: { message: 'Failed to list tables', code: 'LIST_FAILED' } }, 500);
  }
});

// Create table
reservationsRouter.post(
  '/:businessId/tables',
  zValidator('json', CreateTableSchema),
  async (c) => {
    const businessId = c.req.param('businessId');
    const data = c.req.valid('json');

    try {
      // Verify business exists
      const { data: business, error: businessError } = await supabase
        .from('business_accounts')
        .select('id')
        .eq('id', businessId)
        .single();

      if (businessError || !business) {
        return c.json({ error: { message: 'Business not found', code: 'NOT_FOUND' } }, 404);
      }

      // Check for duplicate table number
      const { data: existing } = await supabase
        .from('restaurant_tables')
        .select('id')
        .eq('business_id', businessId)
        .eq('table_number', data.tableNumber)
        .single();

      if (existing) {
        return c.json({ error: { message: 'Table number already exists', code: 'DUPLICATE' } }, 400);
      }

      const { data: table, error } = await supabase
        .from('restaurant_tables')
        .insert({
          business_id: businessId,
          table_number: data.tableNumber,
          capacity_min: data.capacityMin ?? 1,
          capacity_max: data.capacityMax,
          section: data.section,
          position_x: data.positionX,
          position_y: data.positionY,
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating table:', error);
        return c.json({ error: { message: 'Failed to create table', code: 'CREATE_FAILED' } }, 500);
      }

      return c.json({
        data: formatTableResponse(table),
      }, 201);
    } catch (error) {
      console.error('Error creating table:', error);
      return c.json({ error: { message: 'Failed to create table', code: 'CREATE_FAILED' } }, 500);
    }
  }
);

// Update table
reservationsRouter.put(
  '/:businessId/tables/:tableId',
  zValidator('json', UpdateTableSchema),
  async (c) => {
    const businessId = c.req.param('businessId');
    const tableId = c.req.param('tableId');
    const data = c.req.valid('json');

    try {
      // Verify table exists and belongs to business
      const { data: existing, error: existingError } = await supabase
        .from('restaurant_tables')
        .select('*')
        .eq('id', tableId)
        .eq('business_id', businessId)
        .single();

      if (existingError || !existing) {
        return c.json({ error: { message: 'Table not found', code: 'NOT_FOUND' } }, 404);
      }

      // Check for duplicate table number if changing
      if (data.tableNumber && data.tableNumber !== existing.table_number) {
        const { data: duplicate } = await supabase
          .from('restaurant_tables')
          .select('id')
          .eq('business_id', businessId)
          .eq('table_number', data.tableNumber)
          .neq('id', tableId)
          .single();

        if (duplicate) {
          return c.json({ error: { message: 'Table number already exists', code: 'DUPLICATE' } }, 400);
        }
      }

      const updateData: Record<string, unknown> = {};
      if (data.tableNumber !== undefined) updateData.table_number = data.tableNumber;
      if (data.capacityMin !== undefined) updateData.capacity_min = data.capacityMin;
      if (data.capacityMax !== undefined) updateData.capacity_max = data.capacityMax;
      if (data.section !== undefined) updateData.section = data.section;
      if (data.positionX !== undefined) updateData.position_x = data.positionX;
      if (data.positionY !== undefined) updateData.position_y = data.positionY;
      if (data.isActive !== undefined) updateData.is_active = data.isActive;

      const { data: table, error } = await supabase
        .from('restaurant_tables')
        .update(updateData)
        .eq('id', tableId)
        .select()
        .single();

      if (error) {
        console.error('Error updating table:', error);
        return c.json({ error: { message: 'Failed to update table', code: 'UPDATE_FAILED' } }, 500);
      }

      return c.json({
        data: formatTableResponse(table),
      });
    } catch (error) {
      console.error('Error updating table:', error);
      return c.json({ error: { message: 'Failed to update table', code: 'UPDATE_FAILED' } }, 500);
    }
  }
);

// Delete table
reservationsRouter.delete('/:businessId/tables/:tableId', async (c) => {
  const businessId = c.req.param('businessId');
  const tableId = c.req.param('tableId');

  try {
    // Verify table exists and belongs to business
    const { data: existing, error: existingError } = await supabase
      .from('restaurant_tables')
      .select('id')
      .eq('id', tableId)
      .eq('business_id', businessId)
      .single();

    if (existingError || !existing) {
      return c.json({ error: { message: 'Table not found', code: 'NOT_FOUND' } }, 404);
    }

    // Check if table has any active reservations
    const { count: activeReservations } = await supabase
      .from('reservations')
      .select('*', { count: 'exact', head: true })
      .eq('table_id', tableId)
      .in('status', ['pending', 'confirmed', 'seated']);

    if (activeReservations && activeReservations > 0) {
      return c.json({
        error: {
          message: 'Cannot delete table with active reservations',
          code: 'HAS_RESERVATIONS',
        },
      }, 400);
    }

    const { error } = await supabase
      .from('restaurant_tables')
      .delete()
      .eq('id', tableId);

    if (error) {
      console.error('Error deleting table:', error);
      return c.json({ error: { message: 'Failed to delete table', code: 'DELETE_FAILED' } }, 500);
    }

    return c.body(null, 204);
  } catch (error) {
    console.error('Error deleting table:', error);
    return c.json({ error: { message: 'Failed to delete table', code: 'DELETE_FAILED' } }, 500);
  }
});

// ============================================
// Reservation Settings (must be before /:businessId/:id)
// ============================================

// Get settings
reservationsRouter.get('/:businessId/settings', async (c) => {
  const businessId = c.req.param('businessId');

  try {
    const { data: settings, error } = await supabase
      .from('reservation_settings')
      .select('*')
      .eq('business_id', businessId)
      .single();

    if (error || !settings) {
      // Return default settings if none exist
      return c.json({
        data: {
          id: null,
          businessId,
          minPartySize: 1,
          maxPartySize: 20,
          bookingWindowDays: 30,
          minAdvanceHours: 2,
          slotDurationMinutes: 15,
          defaultDiningDuration: 90,
          allowWaitlist: true,
          maxReservationsPerSlot: null,
          cancellationPolicy: null,
          cancellationDeadlineHours: 24,
          requireConfirmation: false,
          autoConfirm: true,
          sendReminders: true,
          reminderHoursBefore: 24,
          requireDeposit: false,
          depositAmount: null,
          depositPolicy: null,
          createdAt: null,
          updatedAt: null,
        },
      });
    }

    return c.json({
      data: formatSettingsResponse(settings),
    });
  } catch (error) {
    console.error('Error getting settings:', error);
    return c.json({ error: { message: 'Failed to get settings', code: 'GET_FAILED' } }, 500);
  }
});

// Update settings (upsert)
reservationsRouter.put(
  '/:businessId/settings',
  zValidator('json', ReservationSettingsSchema),
  async (c) => {
    const businessId = c.req.param('businessId');
    const data = c.req.valid('json');

    try {
      // Verify business exists
      const { data: business, error: businessError } = await supabase
        .from('business_accounts')
        .select('id')
        .eq('id', businessId)
        .single();

      if (businessError || !business) {
        return c.json({ error: { message: 'Business not found', code: 'NOT_FOUND' } }, 404);
      }

      // Check if settings exist
      const { data: existingSettings } = await supabase
        .from('reservation_settings')
        .select('id')
        .eq('business_id', businessId)
        .single();

      const settingsData = {
        business_id: businessId,
        min_party_size: data.minPartySize ?? 1,
        max_party_size: data.maxPartySize ?? 20,
        booking_window_days: data.bookingWindowDays ?? 30,
        min_advance_hours: data.minAdvanceHours ?? 2,
        slot_duration_minutes: data.slotDurationMinutes ?? 15,
        default_dining_duration: data.defaultDiningDuration ?? 90,
        allow_waitlist: data.allowWaitlist ?? true,
        max_reservations_per_slot: data.maxReservationsPerSlot,
        cancellation_policy: data.cancellationPolicy,
        cancellation_deadline_hours: data.cancellationDeadlineHours ?? 24,
        require_confirmation: data.requireConfirmation ?? false,
        auto_confirm: data.autoConfirm ?? true,
        send_reminders: data.sendReminders ?? true,
        reminder_hours_before: data.reminderHoursBefore ?? 24,
        require_deposit: data.requireDeposit ?? false,
        deposit_amount: data.depositAmount,
        deposit_policy: data.depositPolicy,
      };

      let settings;
      if (existingSettings) {
        // Update
        const { data: updated, error } = await supabase
          .from('reservation_settings')
          .update(settingsData)
          .eq('business_id', businessId)
          .select()
          .single();

        if (error) {
          console.error('Error updating settings:', error);
          return c.json({ error: { message: 'Failed to update settings', code: 'UPDATE_FAILED' } }, 500);
        }
        settings = updated;
      } else {
        // Insert
        const { data: inserted, error } = await supabase
          .from('reservation_settings')
          .insert(settingsData)
          .select()
          .single();

        if (error) {
          console.error('Error creating settings:', error);
          return c.json({ error: { message: 'Failed to create settings', code: 'CREATE_FAILED' } }, 500);
        }
        settings = inserted;
      }

      return c.json({
        data: formatSettingsResponse(settings),
      });
    } catch (error) {
      console.error('Error updating settings:', error);
      return c.json({ error: { message: 'Failed to update settings', code: 'UPDATE_FAILED' } }, 500);
    }
  }
);

// ============================================
// Availability (must be before /:businessId/:id)
// ============================================

// Check available time slots
reservationsRouter.get('/:businessId/availability', async (c) => {
  const businessId = c.req.param('businessId');
  const date = c.req.query('date'); // "YYYY-MM-DD"
  const partySizeStr = c.req.query('partySize');

  if (!date) {
    return c.json({ error: { message: 'Date is required', code: 'MISSING_DATE' } }, 400);
  }

  const partySize = partySizeStr ? parseInt(partySizeStr, 10) : 2;

  try {
    // Get reservation settings
    const { data: settings } = await supabase
      .from('reservation_settings')
      .select('*')
      .eq('business_id', businessId)
      .single();

    const slotDuration = settings?.slot_duration_minutes ?? 15;
    const maxPerSlot = settings?.max_reservations_per_slot;
    const minParty = settings?.min_party_size ?? 1;
    const maxParty = settings?.max_party_size ?? 20;

    // Check party size limits
    if (partySize < minParty || partySize > maxParty) {
      return c.json({
        error: {
          message: `Party size must be between ${minParty} and ${maxParty}`,
          code: 'INVALID_PARTY_SIZE',
        },
      }, 400);
    }

    // Get business hours for the day of week
    const requestedDate = new Date(date);
    const dayOfWeek = requestedDate.getDay();

    const { data: hours } = await supabase
      .from('business_hours')
      .select('*')
      .eq('business_id', businessId)
      .eq('day_of_week', dayOfWeek)
      .single();

    if (!hours || hours.is_closed || !hours.open_time || !hours.close_time) {
      return c.json({ data: [] }); // Closed, no slots
    }

    // Get existing reservations for this date
    const startDate = date;
    const endDateObj = new Date(date);
    endDateObj.setDate(endDateObj.getDate() + 1);
    const endDate = endDateObj.toISOString().split('T')[0];

    const { data: existingReservations } = await supabase
      .from('reservations')
      .select('reservation_time')
      .eq('business_id', businessId)
      .gte('reservation_date', startDate)
      .lt('reservation_date', endDate)
      .in('status', ['pending', 'confirmed', 'seated']);

    // Count reservations per time slot
    const reservationCounts: Record<string, number> = {};
    for (const res of existingReservations || []) {
      const time = res.reservation_time;
      reservationCounts[time] = (reservationCounts[time] || 0) + 1;
    }

    // Generate time slots
    const slots: Array<{ time: string; available: boolean; remainingCapacity?: number }> = [];

    const openTimeParts = hours.open_time.split(':').map(Number);
    const closeTimeParts = hours.close_time.split(':').map(Number);
    const openHour = openTimeParts[0] ?? 0;
    const openMin = openTimeParts[1] ?? 0;
    const closeHour = closeTimeParts[0] ?? 0;
    const closeMin = closeTimeParts[1] ?? 0;

    let currentMinutes = openHour * 60 + openMin;
    const endMinutes = closeHour * 60 + closeMin;

    // Reserve some buffer time before closing (don't allow new reservations too close to close)
    const defaultDuration = settings?.default_dining_duration ?? 90;
    const lastBookingMinutes = endMinutes - defaultDuration;

    while (currentMinutes <= lastBookingMinutes) {
      const hour = Math.floor(currentMinutes / 60);
      const min = currentMinutes % 60;
      const timeStr = `${hour.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`;

      const count = reservationCounts[timeStr] || 0;
      const available = maxPerSlot ? count < maxPerSlot : true;
      const remainingCapacity = maxPerSlot ? maxPerSlot - count : undefined;

      slots.push({
        time: timeStr,
        available,
        ...(remainingCapacity !== undefined && { remainingCapacity }),
      });

      currentMinutes += slotDuration;
    }

    return c.json({ data: slots });
  } catch (error) {
    console.error('Error checking availability:', error);
    return c.json({ error: { message: 'Failed to check availability', code: 'AVAILABILITY_FAILED' } }, 500);
  }
});

// ============================================
// Reservations CRUD
// ============================================

// Create reservation
reservationsRouter.post(
  '/:businessId',
  zValidator('json', CreateReservationSchema),
  async (c) => {
    const businessId = c.req.param('businessId');
    const data = c.req.valid('json');

    try {
      // Verify business exists
      const { data: business, error: businessError } = await supabase
        .from('business_accounts')
        .select('id')
        .eq('id', businessId)
        .single();

      if (businessError || !business) {
        return c.json({ error: { message: 'Business not found', code: 'NOT_FOUND' } }, 404);
      }

      // Get reservation settings for default duration
      const { data: settings } = await supabase
        .from('reservation_settings')
        .select('*')
        .eq('business_id', businessId)
        .single();

      const durationMinutes = settings?.default_dining_duration ?? 90;

      // Determine initial status based on settings
      const initialStatus = settings?.auto_confirm ? 'confirmed' : 'pending';

      const { data: reservation, error } = await supabase
        .from('reservations')
        .insert({
          business_id: businessId,
          customer_name: data.customerName,
          customer_email: data.customerEmail,
          customer_phone: data.customerPhone,
          reservation_date: data.reservationDate,
          reservation_time: data.reservationTime,
          party_size: data.partySize,
          duration_minutes: durationMinutes,
          seating_preference: data.seatingPreference,
          special_requests: data.specialRequests,
          occasion: data.occasion,
          source: data.source ?? 'app',
          status: initialStatus,
          confirmed_at: initialStatus === 'confirmed' ? new Date().toISOString() : null,
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating reservation:', error);
        return c.json({ error: { message: 'Failed to create reservation', code: 'CREATE_FAILED' } }, 500);
      }

      // Fetch table if assigned
      let table = null;
      if (reservation.table_id) {
        const { data: tableData } = await supabase
          .from('restaurant_tables')
          .select('id, table_number, section')
          .eq('id', reservation.table_id)
          .single();
        table = tableData;
      }

      return c.json({
        data: formatReservationResponse(reservation, table),
      }, 201);
    } catch (error) {
      console.error('Error creating reservation:', error);
      return c.json({ error: { message: 'Failed to create reservation', code: 'CREATE_FAILED' } }, 500);
    }
  }
);

// List reservations with optional date filter
reservationsRouter.get('/:businessId', async (c) => {
  const businessId = c.req.param('businessId');
  const date = c.req.query('date'); // "YYYY-MM-DD"
  const status = c.req.query('status');

  try {
    let query = supabase
      .from('reservations')
      .select('*')
      .eq('business_id', businessId)
      .order('reservation_date', { ascending: true })
      .order('reservation_time', { ascending: true });

    if (date) {
      const endDateObj = new Date(date);
      endDateObj.setDate(endDateObj.getDate() + 1);
      const endDate = endDateObj.toISOString().split('T')[0];
      query = query.gte('reservation_date', date).lt('reservation_date', endDate);
    }

    if (status) {
      query = query.eq('status', status);
    }

    const { data: reservations, error } = await query;

    if (error) {
      console.error('Error listing reservations:', error);
      return c.json({ error: { message: 'Failed to list reservations', code: 'LIST_FAILED' } }, 500);
    }

    // Fetch tables for reservations that have tableId
    const tableIds = (reservations || [])
      .filter((r) => r.table_id)
      .map((r) => r.table_id);

    let tablesMap: Record<string, Record<string, unknown>> = {};
    if (tableIds.length > 0) {
      const { data: tables } = await supabase
        .from('restaurant_tables')
        .select('id, table_number, section')
        .in('id', tableIds);

      if (tables) {
        for (const t of tables) {
          tablesMap[t.id] = t;
        }
      }
    }

    return c.json({
      data: (reservations || []).map((r) =>
        formatReservationResponse(r, r.table_id ? tablesMap[r.table_id] : null)
      ),
    });
  } catch (error) {
    console.error('Error listing reservations:', error);
    return c.json({ error: { message: 'Failed to list reservations', code: 'LIST_FAILED' } }, 500);
  }
});

// Update reservation status (shortcut endpoint - must be before /:businessId/:id)
reservationsRouter.put(
  '/:businessId/:id/status',
  zValidator('json', UpdateReservationStatusSchema),
  async (c) => {
    const businessId = c.req.param('businessId');
    const id = c.req.param('id');
    const data = c.req.valid('json');

    try {
      // Verify reservation exists and belongs to business
      const { data: existing, error: existingError } = await supabase
        .from('reservations')
        .select('*')
        .eq('id', id)
        .eq('business_id', businessId)
        .single();

      if (existingError || !existing) {
        return c.json({ error: { message: 'Reservation not found', code: 'NOT_FOUND' } }, 404);
      }

      const updateData: Record<string, unknown> = { status: data.status };

      // Set appropriate timestamp based on status
      switch (data.status) {
        case 'confirmed':
          updateData.confirmed_at = new Date().toISOString();
          break;
        case 'seated':
          updateData.seated_at = new Date().toISOString();
          break;
        case 'completed':
          updateData.completed_at = new Date().toISOString();
          break;
        case 'cancelled':
          updateData.cancelled_at = new Date().toISOString();
          if (data.cancellationReason) {
            updateData.cancellation_reason = data.cancellationReason;
          }
          break;
        case 'no_show':
          // No specific timestamp
          break;
      }

      const { data: reservation, error } = await supabase
        .from('reservations')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        console.error('Error updating reservation status:', error);
        return c.json({ error: { message: 'Failed to update status', code: 'UPDATE_FAILED' } }, 500);
      }

      // Fetch table if assigned
      let table = null;
      if (reservation.table_id) {
        const { data: tableData } = await supabase
          .from('restaurant_tables')
          .select('id, table_number, section')
          .eq('id', reservation.table_id)
          .single();
        table = tableData;
      }

      return c.json({
        data: formatReservationResponse(reservation, table),
      });
    } catch (error) {
      console.error('Error updating reservation status:', error);
      return c.json({ error: { message: 'Failed to update status', code: 'UPDATE_FAILED' } }, 500);
    }
  }
);

// Get single reservation
reservationsRouter.get('/:businessId/:id', async (c) => {
  const businessId = c.req.param('businessId');
  const id = c.req.param('id');

  try {
    const { data: reservation, error } = await supabase
      .from('reservations')
      .select('*')
      .eq('id', id)
      .eq('business_id', businessId)
      .single();

    if (error || !reservation) {
      return c.json({ error: { message: 'Reservation not found', code: 'NOT_FOUND' } }, 404);
    }

    // Fetch table if assigned
    let table = null;
    if (reservation.table_id) {
      const { data: tableData } = await supabase
        .from('restaurant_tables')
        .select('id, table_number, section')
        .eq('id', reservation.table_id)
        .single();
      table = tableData;
    }

    return c.json({
      data: formatReservationResponse(reservation, table),
    });
  } catch (error) {
    console.error('Error getting reservation:', error);
    return c.json({ error: { message: 'Failed to get reservation', code: 'GET_FAILED' } }, 500);
  }
});

// Update reservation
reservationsRouter.put(
  '/:businessId/:id',
  zValidator('json', UpdateReservationSchema),
  async (c) => {
    const businessId = c.req.param('businessId');
    const id = c.req.param('id');
    const data = c.req.valid('json');

    try {
      // Verify reservation exists and belongs to business
      const { data: existing, error: existingError } = await supabase
        .from('reservations')
        .select('*')
        .eq('id', id)
        .eq('business_id', businessId)
        .single();

      if (existingError || !existing) {
        return c.json({ error: { message: 'Reservation not found', code: 'NOT_FOUND' } }, 404);
      }

      // Prepare update data
      const updateData: Record<string, unknown> = {};

      if (data.customerName) updateData.customer_name = data.customerName;
      if (data.customerEmail) updateData.customer_email = data.customerEmail;
      if (data.customerPhone !== undefined) updateData.customer_phone = data.customerPhone;
      if (data.reservationDate) updateData.reservation_date = data.reservationDate;
      if (data.reservationTime) updateData.reservation_time = data.reservationTime;
      if (data.partySize) updateData.party_size = data.partySize;
      if (data.tableId !== undefined) updateData.table_id = data.tableId || null;
      if (data.seatingPreference !== undefined) updateData.seating_preference = data.seatingPreference;
      if (data.specialRequests !== undefined) updateData.special_requests = data.specialRequests;
      if (data.occasion !== undefined) updateData.occasion = data.occasion;
      if (data.internalNotes !== undefined) updateData.internal_notes = data.internalNotes;

      // Handle status update with timestamps
      if (data.status && data.status !== existing.status) {
        updateData.status = data.status;
        switch (data.status) {
          case 'confirmed':
            updateData.confirmed_at = new Date().toISOString();
            break;
          case 'seated':
            updateData.seated_at = new Date().toISOString();
            break;
          case 'completed':
            updateData.completed_at = new Date().toISOString();
            break;
          case 'cancelled':
            updateData.cancelled_at = new Date().toISOString();
            if (data.cancellationReason) {
              updateData.cancellation_reason = data.cancellationReason;
            }
            break;
          case 'no_show':
            // No timestamp for no_show
            break;
        }
      }

      const { data: reservation, error } = await supabase
        .from('reservations')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        console.error('Error updating reservation:', error);
        return c.json({ error: { message: 'Failed to update reservation', code: 'UPDATE_FAILED' } }, 500);
      }

      // Fetch table if assigned
      let table = null;
      if (reservation.table_id) {
        const { data: tableData } = await supabase
          .from('restaurant_tables')
          .select('id, table_number, section')
          .eq('id', reservation.table_id)
          .single();
        table = tableData;
      }

      return c.json({
        data: formatReservationResponse(reservation, table),
      });
    } catch (error) {
      console.error('Error updating reservation:', error);
      return c.json({ error: { message: 'Failed to update reservation', code: 'UPDATE_FAILED' } }, 500);
    }
  }
);
