import type { ICustomerModuleService } from '@medusajs/framework/types';
import { HANDLE_RE } from './profile-handle';

export function customerIdentity(c: {
  id: string;
  email?: string | null;
  created_at?: string | Date | null;
  metadata?: Record<string, unknown> | null;
}) {
  const handle = (c.metadata ?? {})['handle'];
  return {
    handle: typeof handle === 'string' && HANDLE_RE.test(handle) ? handle : null,
    email: c.email ?? null,
    created_at: c.created_at ?? null,
  };
}

export async function enrichCustomers(
  ids: string[],
  customerService: ICustomerModuleService,
): Promise<Map<string, ReturnType<typeof customerIdentity>>> {
  if (ids.length === 0) return new Map();
  const customers = await customerService.listCustomers({ id: ids }, { take: ids.length });
  return new Map(customers.map((c) => [c.id, customerIdentity(c)]));
}
