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

// ── Notification type → human-readable label mapping ──
const NOTIFICATION_LABELS: Record<string, string> = {
  follow: 'started following you',
  follow_request: 'sent you a follow request',
  like: 'liked your recipe',
  comment: 'commented on your recipe',
  reply: 'replied to your comment',
  mention: 'mentioned you',
  new_recipe: 'shared a new recipe',
  post_like: 'liked your post',
  post_comment: 'commented on your post',
  post_reply: 'replied to your comment',
  new_post: 'published a new post',
  repost: 'reposted your post',
};

// Map notification types to the corresponding user preference column
const TYPE_TO_PREF: Record<string, string> = {
  follow: 'notify_new_follower',
  follow_request: 'notify_follow_request',
  like: 'notify_recipe_like',
  comment: 'notify_recipe_comment',
  reply: 'notify_comment_reply',
  mention: 'notify_mention',
  post_like: 'notify_post_like',
  post_comment: 'notify_post_comment',
  post_reply: 'notify_post_comment',
  repost: 'notify_repost',
  new_post: 'notify_new_post_from_following',
};

// Map notification types to Android notification channels
const TYPE_TO_CHANNEL: Record<string, string> = {
  follow: 'social',
  follow_request: 'social',
  like: 'social',
  comment: 'social',
  reply: 'social',
  mention: 'social',
  new_recipe: 'social',
  post_like: 'social',
  post_comment: 'social',
  post_reply: 'social',
  new_post: 'social',
  repost: 'social',
};

/**
 * Webhook handler: called when a row is inserted into the `notifications` table.
 * Supabase Database Webhooks POST the new row as { record: { ... } }.
 */
notificationsRouter.post('/webhook/on-notification', async (c) => {
  try {
    const payload = await c.req.json();
    const record = payload.record ?? payload;

    const userId = record.user_id;
    const notifType = record.type as string;
    const actorId = record.actor_id;

    if (!userId) return c.json({ skipped: true, reason: 'no user_id' });

    // Fetch recipient profile: push token + notification preferences
    const prefColumn = TYPE_TO_PREF[notifType];
    const selectCols = `push_token, display_name${prefColumn ? `, ${prefColumn}` : ''}`;

    const { data: recipient } = await supabase
      .from('user_profiles')
      .select(selectCols)
      .eq('user_id', userId)
      .single();

    if (!recipient?.push_token) return c.json({ skipped: true, reason: 'no_push_token' });

    // Respect user's preference for this notification type
    if (prefColumn && (recipient as any)[prefColumn] === false) {
      return c.json({ skipped: true, reason: 'user_preference_disabled' });
    }

    // Build the notification body
    let actorName = 'Someone';
    if (actorId) {
      const { data: actor } = await supabase
        .from('user_profiles')
        .select('display_name')
        .eq('user_id', actorId)
        .single();
      if (actor?.display_name) actorName = actor.display_name;
    }

    const label = NOTIFICATION_LABELS[notifType] || 'sent you a notification';
    const body = `${actorName} ${label}`;

    // Get total unread count for the badge
    const { count: unreadCount } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_read', false);

    const channelId = TYPE_TO_CHANNEL[notifType] || 'social';

    const result = await sendExpoPush(
      [recipient.push_token],
      'KitchenSync',
      body,
      {
        type: notifType,
        actorId: actorId || undefined,
        targetId: record.target_id || undefined,
        targetType: record.target_type || undefined,
        channelId,
      },
    );

    return c.json({ data: result });
  } catch (err) {
    console.error('Webhook on-notification error:', err);
    return c.json({ error: 'Internal error' }, 500);
  }
});

/**
 * Webhook handler: called when a row is inserted into the `messages` table.
 * Sends a push notification to all participants except the sender.
 */
notificationsRouter.post('/webhook/on-message', async (c) => {
  try {
    const payload = await c.req.json();
    const record = payload.record ?? payload;

    const conversationId = record.conversation_id;
    const senderId = record.sender_id;
    const content = record.content;
    const messageType = record.message_type || 'text';

    if (!conversationId || !senderId) {
      return c.json({ skipped: true, reason: 'missing fields' });
    }

    // Get all participants except the sender
    const { data: participants } = await supabase
      .from('conversation_participants')
      .select('user_id, is_muted')
      .eq('conversation_id', conversationId)
      .neq('user_id', senderId);

    if (!participants || participants.length === 0) {
      return c.json({ skipped: true, reason: 'no_recipients' });
    }

    // Filter out muted participants
    const recipientIds = participants
      .filter(p => !p.is_muted)
      .map(p => p.user_id);

    if (recipientIds.length === 0) {
      return c.json({ skipped: true, reason: 'all_muted' });
    }

    // Fetch recipients' push tokens and DM preference
    const { data: profiles } = await supabase
      .from('user_profiles')
      .select('user_id, push_token, display_name, notify_direct_message')
      .in('user_id', recipientIds)
      .not('push_token', 'is', null);

    if (!profiles || profiles.length === 0) {
      return c.json({ skipped: true, reason: 'no_push_tokens' });
    }

    // Get sender display name
    const { data: senderProfile } = await supabase
      .from('user_profiles')
      .select('display_name')
      .eq('user_id', senderId)
      .single();

    const senderName = senderProfile?.display_name || 'Someone';

    let preview = content;
    if (messageType !== 'text') {
      preview = messageType === 'image' ? 'Sent a photo' : `Shared ${messageType.replace('_', ' ')}`;
    }
    if (preview && preview.length > 100) preview = preview.slice(0, 97) + '...';

    const tokens = profiles
      .filter(p => p.notify_direct_message !== false)
      .map(p => p.push_token)
      .filter(Boolean) as string[];

    if (tokens.length === 0) {
      return c.json({ skipped: true, reason: 'all_dm_disabled' });
    }

    const result = await sendExpoPush(
      tokens,
      senderName,
      preview || 'Sent you a message',
      {
        type: 'dm',
        conversationId,
        senderId,
        channelId: 'messages',
      },
    );

    return c.json({ data: result });
  } catch (err) {
    console.error('Webhook on-message error:', err);
    return c.json({ error: 'Internal error' }, 500);
  }
});

export { notificationsRouter };
