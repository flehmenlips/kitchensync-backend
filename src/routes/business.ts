import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { supabase } from '../supabase';
import {
  RegisterBusinessSchema,
  UpdateBusinessSchema,
  InviteTeamMemberSchema,
  BusinessHoursSchema,
  DeleteBusinessSchema
} from '../types';
import { z } from 'zod';

export const businessRouter = new Hono();

// Helper to generate slug from business name
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    + '-' + Math.random().toString(36).substring(2, 6);
}

// Helper to convert snake_case to camelCase for response
function toCamelCase<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key in obj) {
    const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    result[camelKey] = obj[key];
  }
  return result;
}

// Helper to convert camelCase to snake_case for database
function toSnakeCase<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key in obj) {
    const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
    result[snakeKey] = obj[key];
  }
  return result;
}

// Map business_accounts row to camelCase response
function mapBusinessAccount(row: Record<string, unknown>): Record<string, unknown> {
  return {
    id: row.id,
    ownerId: row.owner_user_id,
    businessName: row.business_name,
    businessType: row.business_type,
    slug: row.slug,
    email: row.email,
    phone: row.phone,
    description: row.description,
    logoUrl: row.logo_url,
    coverImageUrl: row.cover_image_url,
    brandColor: row.brand_color,
    website: row.website,
    addressLine1: row.address_line1,
    addressLine2: row.address_line2,
    city: row.city,
    state: row.state,
    postalCode: row.postal_code,
    country: row.country,
    latitude: row.latitude,
    longitude: row.longitude,
    taxId: row.tax_id,
    subscriptionTier: row.subscription_tier,
    subscriptionStatus: row.subscription_status,
    trialEndsAt: row.trial_ends_at,
    isVerified: row.is_verified,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Map business_hours row to camelCase response
function mapBusinessHours(row: Record<string, unknown>): Record<string, unknown> {
  return {
    id: row.id,
    businessId: row.business_id,
    dayOfWeek: row.day_of_week,
    openTime: row.open_time,
    closeTime: row.close_time,
    isClosed: row.is_closed,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Map business_team_members row to camelCase response
function mapTeamMember(row: Record<string, unknown>): Record<string, unknown> {
  return {
    id: row.id,
    businessId: row.business_id,
    userId: row.user_id,
    role: row.role,
    status: row.status,
    invitedAt: row.invited_at,
    joinedAt: row.joined_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Map user_profiles row to camelCase response
function mapUserProfile(row: Record<string, unknown>): Record<string, unknown> {
  return {
    id: row.user_id,
    email: row.email,
    name: row.full_name || row.display_name,
    avatarUrl: row.avatar_url,
  };
}

// Register a new business
businessRouter.post(
  '/register',
  zValidator('json', RegisterBusinessSchema),
  async (c) => {
    const data = c.req.valid('json');

    try {
      // The supabaseUserId from the request IS the owner_user_id in business_accounts
      // We don't create users - Supabase Auth handles that
      const ownerUserId = data.supabaseUserId;

      // Generate unique slug
      const slug = generateSlug(data.businessName);

      // Create the business
      const { data: business, error: businessError } = await supabase
        .from('business_accounts')
        .insert({
          owner_user_id: ownerUserId,
          business_name: data.businessName,
          business_type: data.businessType,
          slug: slug,
          email: data.email,
          phone: data.phone || null,
          description: data.description || null,
          trial_ends_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(), // 14 day trial
          is_active: true,
          is_verified: false,
        })
        .select()
        .single();

      if (businessError) {
        console.error('Error creating business:', businessError);
        return c.json({ error: { message: 'Failed to create business', code: 'CREATE_FAILED' } }, 500);
      }

      // Add owner as team member
      const { error: teamError } = await supabase
        .from('business_team_members')
        .insert({
          business_id: business.id,
          user_id: ownerUserId,
          role: 'owner',
          status: 'active',
          joined_at: new Date().toISOString(),
        });

      if (teamError) {
        console.error('Error adding owner to team:', teamError);
        // Don't fail the whole operation, business was created
      }

      // Create default business hours (Mon-Fri 9am-5pm, closed weekends)
      const defaultHours = [
        { day_of_week: 0, is_closed: true, open_time: null, close_time: null }, // Sunday
        { day_of_week: 1, open_time: '09:00', close_time: '17:00', is_closed: false },
        { day_of_week: 2, open_time: '09:00', close_time: '17:00', is_closed: false },
        { day_of_week: 3, open_time: '09:00', close_time: '17:00', is_closed: false },
        { day_of_week: 4, open_time: '09:00', close_time: '17:00', is_closed: false },
        { day_of_week: 5, open_time: '09:00', close_time: '17:00', is_closed: false },
        { day_of_week: 6, is_closed: true, open_time: null, close_time: null }, // Saturday
      ];

      const hoursToInsert = defaultHours.map(h => ({
        ...h,
        business_id: business.id,
      }));

      const { error: hoursError } = await supabase
        .from('business_hours')
        .insert(hoursToInsert);

      if (hoursError) {
        console.error('Error creating business hours:', hoursError);
        // Don't fail the whole operation
      }

      // Get owner profile info if available
      const { data: ownerProfile } = await supabase
        .from('user_profiles')
        .select('user_id, email, full_name, display_name')
        .eq('user_id', ownerUserId)
        .single();

      return c.json({
        data: {
          business: {
            id: business.id,
            businessName: business.business_name,
            businessType: business.business_type,
            slug: business.slug,
            email: business.email,
          },
          owner: {
            id: ownerUserId,
            email: ownerProfile?.email || data.ownerEmail,
            name: ownerProfile?.full_name || ownerProfile?.display_name || data.ownerName,
          }
        }
      }, 201);
    } catch (error) {
      console.error('Error registering business:', error);
      return c.json({ error: { message: 'Failed to register business', code: 'REGISTRATION_FAILED' } }, 500);
    }
  }
);

// Get businesses for a specific user (by Supabase user ID)
// Returns businesses where user is owner OR team member
businessRouter.get('/user/:supabaseUserId', async (c) => {
  const supabaseUserId = c.req.param('supabaseUserId');

  try {
    // Find all team memberships for this user
    const { data: teamMemberships, error: teamError } = await supabase
      .from('business_team_members')
      .select(`
        role,
        status,
        business_id
      `)
      .eq('user_id', supabaseUserId)
      .eq('status', 'active');

    if (teamError) {
      console.error('Error fetching team memberships:', teamError);
      return c.json({ error: { message: 'Failed to fetch businesses', code: 'FETCH_FAILED' } }, 500);
    }

    if (!teamMemberships || teamMemberships.length === 0) {
      return c.json({ data: [] });
    }

    // Get the business IDs
    const businessIds = teamMemberships.map(tm => tm.business_id);

    // Fetch business details
    const { data: businesses, error: businessError } = await supabase
      .from('business_accounts')
      .select(`
        id,
        business_name,
        business_type,
        slug,
        logo_url,
        city,
        state,
        is_verified,
        is_active,
        created_at
      `)
      .in('id', businessIds);

    if (businessError) {
      console.error('Error fetching businesses:', businessError);
      return c.json({ error: { message: 'Failed to fetch businesses', code: 'FETCH_FAILED' } }, 500);
    }

    // Map businesses with role info
    const result = (businesses || []).map(b => {
      const membership = teamMemberships.find(tm => tm.business_id === b.id);
      return {
        id: b.id,
        businessName: b.business_name,
        businessType: b.business_type,
        slug: b.slug,
        logoUrl: b.logo_url,
        city: b.city,
        state: b.state,
        isVerified: b.is_verified,
        isActive: b.is_active,
        createdAt: b.created_at,
        role: membership?.role,
      };
    });

    return c.json({ data: result });
  } catch (error) {
    console.error('Error fetching user businesses:', error);
    return c.json({ error: { message: 'Failed to fetch businesses', code: 'FETCH_FAILED' } }, 500);
  }
});

// Get business by ID
businessRouter.get('/:id', async (c) => {
  const id = c.req.param('id');

  // Check if this is the slug route (handled separately)
  if (id === 'slug') {
    return c.notFound();
  }

  try {
    // Get business
    const { data: business, error: businessError } = await supabase
      .from('business_accounts')
      .select('*')
      .eq('id', id)
      .single();

    if (businessError || !business) {
      return c.json({ error: { message: 'Business not found', code: 'NOT_FOUND' } }, 404);
    }

    // Get owner profile
    const { data: owner } = await supabase
      .from('user_profiles')
      .select('user_id, email, full_name, display_name')
      .eq('user_id', business.owner_user_id)
      .single();

    // Get business hours
    const { data: hours } = await supabase
      .from('business_hours')
      .select('*')
      .eq('business_id', id)
      .order('day_of_week', { ascending: true });

    const mappedBusiness = mapBusinessAccount(business);
    mappedBusiness.owner = owner ? {
      id: owner.user_id,
      email: owner.email,
      name: owner.full_name || owner.display_name,
    } : null;
    mappedBusiness.hours = (hours || []).map(h => mapBusinessHours(h));

    return c.json({ data: mappedBusiness });
  } catch (error) {
    console.error('Error fetching business:', error);
    return c.json({ error: { message: 'Failed to fetch business', code: 'FETCH_FAILED' } }, 500);
  }
});

// Get business by slug (public)
businessRouter.get('/slug/:slug', async (c) => {
  const slug = c.req.param('slug');

  try {
    const { data: business, error } = await supabase
      .from('business_accounts')
      .select('*')
      .eq('slug', slug)
      .single();

    if (error || !business || !business.is_active) {
      return c.json({ error: { message: 'Business not found', code: 'NOT_FOUND' } }, 404);
    }

    // Get business hours
    const { data: hours } = await supabase
      .from('business_hours')
      .select('*')
      .eq('business_id', business.id)
      .order('day_of_week', { ascending: true });

    // Return public info only
    return c.json({
      data: {
        id: business.id,
        businessName: business.business_name,
        businessType: business.business_type,
        slug: business.slug,
        description: business.description,
        logoUrl: business.logo_url,
        coverImageUrl: business.cover_image_url,
        brandColor: business.brand_color,
        phone: business.phone,
        addressLine1: business.address_line1,
        city: business.city,
        state: business.state,
        postalCode: business.postal_code,
        isVerified: business.is_verified,
        hours: (hours || []).map(h => mapBusinessHours(h)),
      }
    });
  } catch (error) {
    console.error('Error fetching business by slug:', error);
    return c.json({ error: { message: 'Failed to fetch business', code: 'FETCH_FAILED' } }, 500);
  }
});

// Update business
businessRouter.put(
  '/:id',
  zValidator('json', UpdateBusinessSchema),
  async (c) => {
    const id = c.req.param('id');
    const data = c.req.valid('json');

    try {
      // Convert camelCase fields to snake_case for Supabase
      const updateData: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };

      // Map the fields that might be updated (based on UpdateBusinessSchema)
      if (data.businessName !== undefined) updateData.business_name = data.businessName;
      if (data.email !== undefined) updateData.email = data.email;
      if (data.phone !== undefined) updateData.phone = data.phone;
      if (data.description !== undefined) updateData.description = data.description;
      if (data.logoUrl !== undefined) updateData.logo_url = data.logoUrl;
      if (data.coverImageUrl !== undefined) updateData.cover_image_url = data.coverImageUrl;
      if (data.brandColor !== undefined) updateData.brand_color = data.brandColor;
      if (data.websiteUrl !== undefined) updateData.website = data.websiteUrl;
      if (data.addressLine1 !== undefined) updateData.address_line1 = data.addressLine1;
      if (data.addressLine2 !== undefined) updateData.address_line2 = data.addressLine2;
      if (data.city !== undefined) updateData.city = data.city;
      if (data.state !== undefined) updateData.state = data.state;
      if (data.postalCode !== undefined) updateData.postal_code = data.postalCode;

      const { data: business, error } = await supabase
        .from('business_accounts')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error || !business) {
        console.error('Error updating business:', error);
        return c.json({ error: { message: 'Failed to update business', code: 'UPDATE_FAILED' } }, 500);
      }

      return c.json({ data: mapBusinessAccount(business) });
    } catch (error) {
      console.error('Error updating business:', error);
      return c.json({ error: { message: 'Failed to update business', code: 'UPDATE_FAILED' } }, 500);
    }
  }
);

// List all businesses (for superadmin/discovery)
businessRouter.get('/', async (c) => {
  const type = c.req.query('type');
  const active = c.req.query('active');

  try {
    let query = supabase
      .from('business_accounts')
      .select(`
        id,
        owner_user_id,
        business_name,
        business_type,
        slug,
        logo_url,
        city,
        state,
        is_verified,
        is_active,
        created_at
      `)
      .order('created_at', { ascending: false })
      .limit(100);

    if (type) {
      query = query.eq('business_type', type);
    }
    if (active === 'true') {
      query = query.eq('is_active', true);
    }

    const { data: businesses, error } = await query;

    if (error) {
      console.error('Error fetching businesses:', error);
      return c.json({ error: { message: 'Failed to fetch businesses', code: 'FETCH_FAILED' } }, 500);
    }

    // Get owner profiles for all businesses
    const ownerIds = [...new Set((businesses || []).map(b => b.owner_user_id).filter(Boolean))];

    let ownerProfiles: Record<string, { user_id: string; email: string; full_name: string | null; display_name: string | null }> = {};
    if (ownerIds.length > 0) {
      const { data: profiles } = await supabase
        .from('user_profiles')
        .select('user_id, email, full_name, display_name')
        .in('user_id', ownerIds);

      if (profiles) {
        ownerProfiles = profiles.reduce((acc, p) => {
          acc[p.user_id] = p;
          return acc;
        }, {} as typeof ownerProfiles);
      }
    }

    const result = (businesses || []).map(b => {
      const owner = ownerProfiles[b.owner_user_id];
      return {
        id: b.id,
        businessName: b.business_name,
        businessType: b.business_type,
        slug: b.slug,
        logoUrl: b.logo_url,
        city: b.city,
        state: b.state,
        isVerified: b.is_verified,
        isActive: b.is_active,
        createdAt: b.created_at,
        owner: owner ? {
          id: owner.user_id,
          email: owner.email,
          name: owner.full_name || owner.display_name,
        } : null,
      };
    });

    return c.json({ data: result });
  } catch (error) {
    console.error('Error fetching businesses:', error);
    return c.json({ error: { message: 'Failed to fetch businesses', code: 'FETCH_FAILED' } }, 500);
  }
});

// Get team members for a business
businessRouter.get('/:id/team', async (c) => {
  const businessId = c.req.param('id');

  try {
    const { data: members, error } = await supabase
      .from('business_team_members')
      .select('*')
      .eq('business_id', businessId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching team members:', error);
      return c.json({ error: { message: 'Failed to fetch team members', code: 'FETCH_FAILED' } }, 500);
    }

    // Get user profiles for all team members
    const userIds = (members || []).map(m => m.user_id).filter(Boolean);

    let userProfiles: Record<string, { user_id: string; email: string; full_name: string | null; display_name: string | null; avatar_url: string | null }> = {};
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from('user_profiles')
        .select('user_id, email, full_name, display_name, avatar_url')
        .in('user_id', userIds);

      if (profiles) {
        userProfiles = profiles.reduce((acc, p) => {
          acc[p.user_id] = p;
          return acc;
        }, {} as typeof userProfiles);
      }
    }

    const result = (members || []).map(m => {
      const user = userProfiles[m.user_id];
      const mapped = mapTeamMember(m);
      mapped.user = user ? {
        id: user.user_id,
        email: user.email,
        name: user.full_name || user.display_name,
        avatarUrl: user.avatar_url,
      } : null;
      return mapped;
    });

    return c.json({ data: result });
  } catch (error) {
    console.error('Error fetching team members:', error);
    return c.json({ error: { message: 'Failed to fetch team members', code: 'FETCH_FAILED' } }, 500);
  }
});

// Invite team member
businessRouter.post(
  '/:id/team/invite',
  zValidator('json', InviteTeamMemberSchema),
  async (c) => {
    const businessId = c.req.param('id');
    const data = c.req.valid('json');

    try {
      // For team invites, we need to find the user by email in user_profiles
      // If not found, we can still create a pending invitation
      const { data: userProfile } = await supabase
        .from('user_profiles')
        .select('user_id, email, full_name, display_name')
        .eq('email', data.email)
        .single();

      if (!userProfile) {
        // User doesn't exist yet - return error (they need to sign up first)
        // In a full implementation, you might send an invite email
        return c.json({ error: { message: 'User not found. They must create an account first.', code: 'USER_NOT_FOUND' } }, 404);
      }

      // Check if already a member
      const { data: existing } = await supabase
        .from('business_team_members')
        .select('id')
        .eq('business_id', businessId)
        .eq('user_id', userProfile.user_id)
        .single();

      if (existing) {
        return c.json({ error: { message: 'User is already a team member', code: 'ALREADY_MEMBER' } }, 400);
      }

      // Create team membership
      const { data: member, error: insertError } = await supabase
        .from('business_team_members')
        .insert({
          business_id: businessId,
          user_id: userProfile.user_id,
          role: data.role,
          status: 'invited',
          invited_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (insertError || !member) {
        console.error('Error creating team member:', insertError);
        return c.json({ error: { message: 'Failed to invite team member', code: 'INVITE_FAILED' } }, 500);
      }

      const result = mapTeamMember(member);
      result.user = {
        id: userProfile.user_id,
        email: userProfile.email,
        name: userProfile.full_name || userProfile.display_name,
      };

      return c.json({ data: result }, 201);
    } catch (error) {
      console.error('Error inviting team member:', error);
      return c.json({ error: { message: 'Failed to invite team member', code: 'INVITE_FAILED' } }, 500);
    }
  }
);

// Verify a business (admin only)
const VerifyBusinessSchema = z.object({
  adminId: z.string().uuid(),
  notes: z.string().optional(),
});

businessRouter.put(
  '/:id/verify',
  zValidator('json', VerifyBusinessSchema),
  async (c) => {
    const businessId = c.req.param('id');
    const { adminId, notes } = c.req.valid('json');

    try {
      // Update business verification status
      const { data: business, error } = await supabase
        .from('business_accounts')
        .update({
          is_verified: true,
          verified_at: new Date().toISOString(),
          verification_notes: notes || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', businessId)
        .select()
        .single();

      if (error || !business) {
        console.error('Error verifying business:', error);
        return c.json({ error: { message: 'Failed to verify business', code: 'VERIFY_FAILED' } }, 500);
      }

      // Log the activity
      await supabase.from('admin_activity_log').insert({
        admin_id: adminId,
        action: 'verify_business',
        entity_type: 'business',
        entity_id: businessId,
        details: { businessName: business.business_name, notes },
      });

      return c.json({ data: mapBusinessAccount(business) });
    } catch (error) {
      console.error('Error verifying business:', error);
      return c.json({ error: { message: 'Failed to verify business', code: 'VERIFY_FAILED' } }, 500);
    }
  }
);

// Reject/unverify a business (admin only)
const RejectBusinessSchema = z.object({
  adminId: z.string().uuid(),
  reason: z.string().min(1, 'Rejection reason is required'),
});

businessRouter.put(
  '/:id/reject',
  zValidator('json', RejectBusinessSchema),
  async (c) => {
    const businessId = c.req.param('id');
    const { adminId, reason } = c.req.valid('json');

    try {
      // Update business verification status
      const { data: business, error } = await supabase
        .from('business_accounts')
        .update({
          is_verified: false,
          verified_at: null,
          verification_notes: reason,
          updated_at: new Date().toISOString(),
        })
        .eq('id', businessId)
        .select()
        .single();

      if (error || !business) {
        console.error('Error rejecting business:', error);
        return c.json({ error: { message: 'Failed to reject business', code: 'REJECT_FAILED' } }, 500);
      }

      // Log the activity
      await supabase.from('admin_activity_log').insert({
        admin_id: adminId,
        action: 'reject_business',
        entity_type: 'business',
        entity_id: businessId,
        details: { businessName: business.business_name, reason },
      });

      return c.json({ data: mapBusinessAccount(business) });
    } catch (error) {
      console.error('Error rejecting business:', error);
      return c.json({ error: { message: 'Failed to reject business', code: 'REJECT_FAILED' } }, 500);
    }
  }
);

// Activate/Deactivate a business (admin only)
const ToggleActiveSchema = z.object({
  adminId: z.string().uuid(),
  isActive: z.boolean(),
  reason: z.string().optional(),
});

businessRouter.put(
  '/:id/toggle-active',
  zValidator('json', ToggleActiveSchema),
  async (c) => {
    const businessId = c.req.param('id');
    const { adminId, isActive, reason } = c.req.valid('json');

    try {
      // Update business active status
      const { data: business, error } = await supabase
        .from('business_accounts')
        .update({
          is_active: isActive,
          updated_at: new Date().toISOString(),
        })
        .eq('id', businessId)
        .select()
        .single();

      if (error || !business) {
        console.error('Error toggling business active status:', error);
        return c.json({ error: { message: 'Failed to update business status', code: 'UPDATE_FAILED' } }, 500);
      }

      // Log the activity
      await supabase.from('admin_activity_log').insert({
        admin_id: adminId,
        action: isActive ? 'activate_business' : 'deactivate_business',
        entity_type: 'business',
        entity_id: businessId,
        details: { businessName: business.business_name, reason: reason || null },
      });

      return c.json({ data: mapBusinessAccount(business) });
    } catch (error) {
      console.error('Error toggling business active status:', error);
      return c.json({ error: { message: 'Failed to update business status', code: 'UPDATE_FAILED' } }, 500);
    }
  }
);

// Update business hours
businessRouter.put(
  '/:id/hours',
  zValidator('json', z.array(BusinessHoursSchema)),
  async (c) => {
    const businessId = c.req.param('id');
    const hours = c.req.valid('json');

    try {
      // Delete existing hours
      const { error: deleteError } = await supabase
        .from('business_hours')
        .delete()
        .eq('business_id', businessId);

      if (deleteError) {
        console.error('Error deleting existing hours:', deleteError);
        return c.json({ error: { message: 'Failed to update hours', code: 'UPDATE_FAILED' } }, 500);
      }

      // Insert new hours
      const hoursToInsert = hours.map(h => ({
        business_id: businessId,
        day_of_week: h.dayOfWeek,
        open_time: h.openTime || null,
        close_time: h.closeTime || null,
        is_closed: h.isClosed,
        notes: h.notes || null,
      }));

      const { error: insertError } = await supabase
        .from('business_hours')
        .insert(hoursToInsert);

      if (insertError) {
        console.error('Error inserting hours:', insertError);
        return c.json({ error: { message: 'Failed to update hours', code: 'UPDATE_FAILED' } }, 500);
      }

      // Fetch updated hours
      const { data: updatedHours, error: fetchError } = await supabase
        .from('business_hours')
        .select('*')
        .eq('business_id', businessId)
        .order('day_of_week', { ascending: true });

      if (fetchError) {
        console.error('Error fetching updated hours:', fetchError);
        return c.json({ error: { message: 'Failed to fetch updated hours', code: 'FETCH_FAILED' } }, 500);
      }

      return c.json({ data: (updatedHours || []).map(h => mapBusinessHours(h)) });
    } catch (error) {
      console.error('Error updating hours:', error);
      return c.json({ error: { message: 'Failed to update hours', code: 'UPDATE_FAILED' } }, 500);
    }
  }
);

// Get related data counts for a business (admin only)
businessRouter.get('/:id/related-counts', async (c) => {
  const businessId = c.req.param('id');

  try {
    // Verify business exists
    const { data: business, error: businessError } = await supabase
      .from('business_accounts')
      .select('id, business_name')
      .eq('id', businessId)
      .single();

    if (businessError || !business) {
      return c.json({ error: { message: 'Business not found', code: 'NOT_FOUND' } }, 404);
    }

    // Get counts for all related tables in parallel
    const [
      menuCategoriesResult,
      menuItemsResult,
      ordersResult,
      reservationsResult,
      customersResult,
      restaurantTablesResult,
    ] = await Promise.all([
      supabase
        .from('menu_categories')
        .select('id', { count: 'exact', head: true })
        .eq('business_id', businessId),
      supabase
        .from('menu_items')
        .select('id', { count: 'exact', head: true })
        .eq('business_id', businessId),
      supabase
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('business_id', businessId),
      supabase
        .from('reservations')
        .select('id', { count: 'exact', head: true })
        .eq('business_id', businessId),
      supabase
        .from('customers')
        .select('id', { count: 'exact', head: true })
        .eq('business_id', businessId),
      supabase
        .from('restaurant_tables')
        .select('id', { count: 'exact', head: true })
        .eq('business_id', businessId),
    ]);

    return c.json({
      data: {
        businessId,
        businessName: business.business_name,
        counts: {
          menuCategories: menuCategoriesResult.count || 0,
          menuItems: menuItemsResult.count || 0,
          orders: ordersResult.count || 0,
          reservations: reservationsResult.count || 0,
          customers: customersResult.count || 0,
          restaurantTables: restaurantTablesResult.count || 0,
        },
        totalRelatedRecords:
          (menuCategoriesResult.count || 0) +
          (menuItemsResult.count || 0) +
          (ordersResult.count || 0) +
          (reservationsResult.count || 0) +
          (customersResult.count || 0) +
          (restaurantTablesResult.count || 0),
      }
    });
  } catch (error) {
    console.error('Error fetching related counts:', error);
    return c.json({ error: { message: 'Failed to fetch related counts', code: 'FETCH_FAILED' } }, 500);
  }
});

// Delete a business (admin only)
businessRouter.delete(
  '/:id',
  zValidator('json', DeleteBusinessSchema),
  async (c) => {
    const businessId = c.req.param('id');
    const hardDelete = c.req.query('hard') === 'true';
    const { adminId, reason } = c.req.valid('json');

    try {
      // First check if the admin is a superadmin
      const { data: adminProfile, error: adminError } = await supabase
        .from('user_profiles')
        .select('user_id, is_superadmin')
        .eq('user_id', adminId)
        .single();

      if (adminError || !adminProfile) {
        return c.json({ error: { message: 'Admin not found', code: 'ADMIN_NOT_FOUND' } }, 404);
      }

      if (!adminProfile.is_superadmin) {
        return c.json({ error: { message: 'Only superadmins can delete businesses', code: 'FORBIDDEN' } }, 403);
      }

      // Verify business exists
      const { data: business, error: businessError } = await supabase
        .from('business_accounts')
        .select('id, business_name, deleted_at')
        .eq('id', businessId)
        .single();

      if (businessError || !business) {
        return c.json({ error: { message: 'Business not found', code: 'NOT_FOUND' } }, 404);
      }

      // Check if already soft-deleted
      if (business.deleted_at && !hardDelete) {
        return c.json({ error: { message: 'Business is already deleted', code: 'ALREADY_DELETED' } }, 400);
      }

      // Handle hard delete
      if (hardDelete) {
        // Check environment variable
        const allowHardDelete = process.env.ALLOW_HARD_DELETE === 'true';
        if (!allowHardDelete) {
          return c.json({
            error: {
              message: 'Hard delete is not enabled. Set ALLOW_HARD_DELETE=true to enable permanent deletion.',
              code: 'HARD_DELETE_DISABLED'
            }
          }, 403);
        }

        // Get related counts first for logging
        const [
          menuCategoriesResult,
          menuItemsResult,
          ordersResult,
          reservationsResult,
          customersResult,
          restaurantTablesResult,
        ] = await Promise.all([
          supabase.from('menu_categories').select('id', { count: 'exact', head: true }).eq('business_id', businessId),
          supabase.from('menu_items').select('id', { count: 'exact', head: true }).eq('business_id', businessId),
          supabase.from('orders').select('id', { count: 'exact', head: true }).eq('business_id', businessId),
          supabase.from('reservations').select('id', { count: 'exact', head: true }).eq('business_id', businessId),
          supabase.from('customers').select('id', { count: 'exact', head: true }).eq('business_id', businessId),
          supabase.from('restaurant_tables').select('id', { count: 'exact', head: true }).eq('business_id', businessId),
        ]);

        const deletedCounts = {
          menuCategories: menuCategoriesResult.count || 0,
          menuItems: menuItemsResult.count || 0,
          orders: ordersResult.count || 0,
          reservations: reservationsResult.count || 0,
          customers: customersResult.count || 0,
          restaurantTables: restaurantTablesResult.count || 0,
        };

        // Delete related records first (respecting foreign key constraints)
        // Delete in order: order_items -> orders, customer_activities/loyalty -> customers, etc.

        // Delete order items first
        await supabase.from('order_items').delete().in(
          'order_id',
          (await supabase.from('orders').select('id').eq('business_id', businessId)).data?.map(o => o.id) || []
        );

        // Delete loyalty transactions
        await supabase.from('loyalty_transactions').delete().eq('business_id', businessId);

        // Delete loyalty points
        await supabase.from('loyalty_points').delete().eq('business_id', businessId);

        // Delete customer activities
        await supabase.from('customer_activities').delete().eq('business_id', businessId);

        // Delete menu modifiers and modifier groups
        const menuItemIds = (await supabase.from('menu_items').select('id').eq('business_id', businessId)).data?.map(i => i.id) || [];
        if (menuItemIds.length > 0) {
          const modifierGroupIds = (await supabase.from('menu_modifier_groups').select('id').in('menu_item_id', menuItemIds)).data?.map(g => g.id) || [];
          if (modifierGroupIds.length > 0) {
            await supabase.from('menu_modifiers').delete().in('modifier_group_id', modifierGroupIds);
          }
          await supabase.from('menu_modifier_groups').delete().in('menu_item_id', menuItemIds);
        }

        // Delete main related records
        await Promise.all([
          supabase.from('orders').delete().eq('business_id', businessId),
          supabase.from('reservations').delete().eq('business_id', businessId),
          supabase.from('customers').delete().eq('business_id', businessId),
          supabase.from('menu_items').delete().eq('business_id', businessId),
          supabase.from('restaurant_tables').delete().eq('business_id', businessId),
          supabase.from('reservation_settings').delete().eq('business_id', businessId),
          supabase.from('loyalty_settings').delete().eq('business_id', businessId),
        ]);

        // Delete menu categories
        await supabase.from('menu_categories').delete().eq('business_id', businessId);

        // Delete team members
        await supabase.from('business_team_members').delete().eq('business_id', businessId);

        // Delete business hours
        await supabase.from('business_hours').delete().eq('business_id', businessId);

        // Delete business activity log
        await supabase.from('business_activity_log').delete().eq('business_id', businessId);

        // Finally delete the business
        const { error: deleteError } = await supabase
          .from('business_accounts')
          .delete()
          .eq('id', businessId);

        if (deleteError) {
          console.error('Error hard deleting business:', deleteError);
          return c.json({ error: { message: 'Failed to delete business', code: 'DELETE_FAILED' } }, 500);
        }

        // Log the activity
        await supabase.from('admin_activity_log').insert({
          admin_id: adminId,
          action: 'hard_delete_business',
          entity_type: 'business',
          entity_id: businessId,
          details: {
            businessName: business.business_name,
            reason: reason || null,
            deletedRelatedRecords: deletedCounts,
          },
        });

        return c.json({
          data: {
            deleted: true,
            hardDelete: true,
            businessId,
            businessName: business.business_name,
            deletedRelatedRecords: deletedCounts,
          }
        });
      }

      // Soft delete - set deleted_at timestamp
      const { data: updatedBusiness, error: updateError } = await supabase
        .from('business_accounts')
        .update({
          deleted_at: new Date().toISOString(),
          is_active: false,
          updated_at: new Date().toISOString(),
        })
        .eq('id', businessId)
        .select()
        .single();

      if (updateError || !updatedBusiness) {
        console.error('Error soft deleting business:', updateError);
        return c.json({ error: { message: 'Failed to delete business', code: 'DELETE_FAILED' } }, 500);
      }

      // Log the activity
      await supabase.from('admin_activity_log').insert({
        admin_id: adminId,
        action: 'soft_delete_business',
        entity_type: 'business',
        entity_id: businessId,
        details: { businessName: business.business_name, reason: reason || null },
      });

      return c.json({
        data: {
          deleted: true,
          hardDelete: false,
          businessId,
          businessName: business.business_name,
          deletedAt: updatedBusiness.deleted_at,
        }
      });
    } catch (error) {
      console.error('Error deleting business:', error);
      return c.json({ error: { message: 'Failed to delete business', code: 'DELETE_FAILED' } }, 500);
    }
  }
);
