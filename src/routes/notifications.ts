import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { supabase } from '../supabase';

const notificationsRouter = new Hono();

const sendPushSchema = z.object({
  userId: z.string().uuid(),
  title: z.string(),
  body: z.string(),
  data: z.record(z.unknown()).optional(),
});

const sendBatchSchema = z.object({
  userIds: z.array(z.string().uuid()),
  title: z.string(),
  body: z.string(),
  data: z.record(z.unknown()).optional(),
});

const digestSchema = z.object({
  userId: z.string().uuid(),
});

async function sendExpoPush(
  tokens: string[],
  title: string,
  body: string,
  data?: Record<string, unknown>,
): Promise<{ sent: number; failed: number }> {
  if (tokens.length === 0) return { sent: 0, failed: 0 };

  const messages = tokens.map(token => ({
    to: token,
    sound: 'default' as const,
    title,
    body,
    data: data ?? {},
  }));

  try {
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(messages),
    });

    if (!response.ok) {
      console.error('Expo push API error:', response.status);
      return { sent: 0, failed: tokens.length };
    }

    const result = await response.json();
    const tickets = result.data ?? [];
    const sent = tickets.filter((t: any) => t.status === 'ok').length;
    return { sent, failed: tokens.length - sent };
  } catch (err) {
    console.error('Push notification error:', err);
    return { sent: 0, failed: tokens.length };
  }
}

// Send a push notification to a single user
notificationsRouter.post('/push', zValidator('json', sendPushSchema), async (c) => {
  const { userId, title, body, data } = c.req.valid('json');

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('push_token')
    .eq('user_id', userId)
    .single();

  if (!profile?.push_token) {
    return c.json({ error: 'No push token for user' }, 404);
  }

  const result = await sendExpoPush([profile.push_token], title, body, data);
  return c.json({ data: result });
});

// Send push notifications to multiple users
notificationsRouter.post('/push/batch', zValidator('json', sendBatchSchema), async (c) => {
  const { userIds, title, body, data } = c.req.valid('json');

  const { data: profiles } = await supabase
    .from('user_profiles')
    .select('push_token')
    .in('user_id', userIds)
    .not('push_token', 'is', null);

  const tokens = (profiles ?? []).map((p: any) => p.push_token).filter(Boolean);
  const result = await sendExpoPush(tokens, title, body, data);
  return c.json({ data: result });
});

// Generate and send a digest notification
notificationsRouter.post('/digest', zValidator('json', digestSchema), async (c) => {
  const { userId } = c.req.valid('json');

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('push_token')
    .eq('user_id', userId)
    .single();

  if (!profile?.push_token) {
    return c.json({ error: 'No push token for user' }, 404);
  }

  // Count unread notifications from last 24 hours
  const { count: unreadCount } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_read', false)
    .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

  if (!unreadCount || unreadCount === 0) {
    return c.json({ data: { sent: false, reason: 'no_unread' } });
  }

  // Count new posts from followed users
  const { data: following } = await supabase
    .from('user_follows')
    .select('following_id')
    .eq('follower_id', userId);

  const followingIds = (following ?? []).map((f: any) => f.following_id);
  let newPostCount = 0;

  if (followingIds.length > 0) {
    const { count } = await supabase
      .from('posts')
      .select('id', { count: 'exact', head: true })
      .in('user_id', followingIds)
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
    newPostCount = count ?? 0;
  }

  const parts: string[] = [];
  if (unreadCount > 0) parts.push(`${unreadCount} new notification${unreadCount > 1 ? 's' : ''}`);
  if (newPostCount > 0) parts.push(`${newPostCount} new post${newPostCount > 1 ? 's' : ''} from people you follow`);

  const body = parts.join(' and ');
  const result = await sendExpoPush([profile.push_token], 'KitchenSync', body, { type: 'digest' });

  return c.json({ data: { sent: true, ...result } });
});

export { notificationsRouter };
