import { createMiddleware } from "hono/factory";
import { createClient } from "@supabase/supabase-js";
import { env } from "../env";

/**
 * Per-request Supabase client scoped to the user's JWT.
 * Uses the anon key so that RLS policies are enforced against the user's token.
 */
function createUserSupabase(accessToken: string) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

export type AuthUser = {
  id: string;
  email?: string;
};

/**
 * Middleware that verifies the Supabase JWT from the Authorization header.
 * On success, sets `user` (AuthUser) on the Hono context.
 * Returns 401 if the token is missing, invalid, or expired.
 */
export const requireAuth = createMiddleware(async (c, next) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json(
      { error: { message: "Missing authorization token", code: "UNAUTHORIZED" } },
      401
    );
  }

  const token = authHeader.slice(7);

  try {
    const userSupabase = createUserSupabase(token);
    const {
      data: { user },
      error,
    } = await userSupabase.auth.getUser(token);

    if (error || !user) {
      return c.json(
        { error: { message: "Invalid or expired token", code: "UNAUTHORIZED" } },
        401
      );
    }

    c.set("user", { id: user.id, email: user.email } as AuthUser);
    return next();
  } catch {
    return c.json(
      { error: { message: "Authentication failed", code: "UNAUTHORIZED" } },
      401
    );
  }
});
