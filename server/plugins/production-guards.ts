/**
 * Startup safety assertions for hosted production deployments.
 *
 * AUTH_DISABLED makes @agent-native/core run every request as the auto dev
 * account (dev@local.test) — see core's isAuthDisabled(). That is a full
 * account takeover if it ever reaches production, and nothing upstream
 * guards against it: a single mistyped `vercel env add AUTH_DISABLED` would
 * silently disable login for the whole tenant. Fail the boot instead of the
 * users.
 *
 * Matches core's truthiness parsing exactly ("1" / "true", trimmed,
 * case-insensitive) so the guard can never disagree with the behavior it
 * protects against.
 */
function isAuthDisabledFlagSet(): boolean {
  const value = process.env.AUTH_DISABLED?.trim().toLowerCase();
  return value === "1" || value === "true";
}

function isProductionRuntime(): boolean {
  if (process.env.VERCEL_ENV === "production") return true;
  // Non-Vercel hosted runtimes: treat NODE_ENV=production as production
  // unless this is a local `pnpm start` against a local database.
  return (
    process.env.NODE_ENV === "production" &&
    !!process.env.VERCEL &&
    process.env.VERCEL_ENV !== "preview" &&
    process.env.VERCEL_ENV !== "development"
  );
}

export default (): void => {
  if (isAuthDisabledFlagSet() && isProductionRuntime()) {
    throw new Error(
      "[production-guards] AUTH_DISABLED is set in a production runtime. " +
        "This would log every visitor in as the auto dev account. Remove the " +
        "AUTH_DISABLED environment variable from the production deployment.",
    );
  }
};
