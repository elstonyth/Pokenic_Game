import type { Metadata } from 'next';
import { AccountHeader, Panel } from '@/components/account/ui';
import SettingsForm from '@/components/account/SettingsForm';
import { getCustomer } from '@/lib/data/customer';

export const metadata: Metadata = { title: 'Settings' };

// Per-customer data behind the auth gate — always rendered fresh.
export const dynamic = 'force-dynamic';

// No backend representation yet (2FA/notifications are launch follow-ups in
// docs/note.md) — so these render as plain "coming soon" rows, NOT as live
// toggles. A money product must never show a 2FA switch that does nothing.
const UPCOMING = [
  'Email notifications',
  'Pull alerts',
  'Marketplace activity',
  'Two-factor authentication',
];

export default async function SettingsPage() {
  const customer = await getCustomer();
  // The account layout gate redirects unauthenticated visitors, so this is a
  // defensive guard for the nullable type rather than a reachable state.
  if (!customer) return null;

  return (
    <>
      <AccountHeader
        title="Settings"
        sub="Manage your profile, security, and notifications."
      />
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel>
          <h2 className="mb-4 font-heading text-lg font-bold text-white">
            Profile
          </h2>
          <SettingsForm
            customer={{
              id: customer.id,
              email: customer.email,
              first_name: customer.first_name ?? null,
              last_name: customer.last_name ?? null,
              phone: customer.phone ?? null,
            }}
          />
        </Panel>
        <Panel>
          <h2 className="mb-4 font-heading text-lg font-bold text-white">
            Notifications &amp; security
          </h2>
          <ul className="flex flex-col divide-y divide-white/5">
            {UPCOMING.map((t) => (
              <li key={t} className="flex items-center justify-between py-3">
                <span className="text-sm text-white/80">{t}</span>
                <span className="rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-white/60">
                  Coming soon
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[12px] text-white/55">
            These controls unlock as each feature ships.
          </p>
        </Panel>
      </div>
    </>
  );
}
