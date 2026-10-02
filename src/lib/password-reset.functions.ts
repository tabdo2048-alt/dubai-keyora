import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function recoveryRedirectUrl(): string {
  const base = process.env.APP_URL || (process.env.NODE_ENV === "production"
    ? "https://keyora-dubai.vercel.app" : "http://localhost:8080");
  const origin = new URL(/^https?:\/\//i.test(base) ? base : `https://${base}`);
  if (origin.protocol !== "https:" && !(process.env.NODE_ENV !== "production" && origin.hostname === "localhost")) {
    throw new Error("Password recovery URL must use HTTPS");
  }
  return new URL("/reset-password", origin).toString();
}

/** Send a recovery email for a real platform account. The browser never supplies an email or privileged key. */
export const sendPlatformUserPasswordReset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { userId: string }) => {
    if (!input?.userId || !UUID_RE.test(input.userId)) throw new Error("A valid user is required");
    return input;
  })
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const { data: owner, error: ownerError } = await sb.rpc("current_user_is_platform_owner");
    if (ownerError || owner !== true) throw new Error("Forbidden: platform owner only");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: account, error: lookupError } = await supabaseAdmin.auth.admin.getUserById(data.userId);
    if (lookupError || !account.user?.email || account.user.is_anonymous) {
      throw new Error("User account not found");
    }

    const { error } = await sb.auth.resetPasswordForEmail(account.user.email, {
      redirectTo: recoveryRedirectUrl(),
    });
    if (error) {
      console.error("Platform password recovery email failed", { targetUserId: data.userId, code: error.code });
      throw new Error("Could not send a reset email. Check the Auth email and redirect settings.");
    }
    return { sent: true };
  });
