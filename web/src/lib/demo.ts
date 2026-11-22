import "server-only";

/**
 * One-click demo logins for the demo institution (see supabase/seed/demo.sql).
 * Off unless DEMO_LOGINS=on, so real deployments never show them.
 */
export const DEMO_ENABLED = process.env.DEMO_LOGINS === "on";

export const DEMO_ACCOUNTS = {
  admin: "admin@demo.ardoise.cm",
  registrar: "scolarite@demo.ardoise.cm",
  hod: "hod.info@demo.ardoise.cm",
  teacher: "j.mbarga@demo.ardoise.cm",
  student: "brenda@demo.ardoise.cm",
} as const;

export type DemoRole = keyof typeof DEMO_ACCOUNTS;

// The seeded demo password; it is public by design (printed in the README).
export const DEMO_PASSWORD = "Ardoise2026!";
