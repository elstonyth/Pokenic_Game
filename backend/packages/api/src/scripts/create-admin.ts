import { ExecArgs } from '@medusajs/framework/types';
import {
  ContainerRegistrationKeys,
  FeatureFlag,
  Modules,
} from '@medusajs/framework/utils';

// Idempotently creates a super-admin user from ADMIN_EMAIL / ADMIN_PASSWORD env
// vars, replicating `medusa user -e -p` exactly (create-users-workflow + emailpass
// register + link). Reads process.env directly so it does NOT depend on shell
// interpolation (the `medusa user -e $ADMIN_EMAIL` yarn-script form silently
// passed literal "$ADMIN_EMAIL" and produced an unusable account).
// Run: medusa exec ./src/scripts/create-admin.ts
export default async function createAdmin({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const email = process.env.ADMIN_EMAIL || 'admin@pokenic.app';
  const password = process.env.ADMIN_PASSWORD;

  if (!password) {
    logger.warn('ADMIN: ADMIN_PASSWORD not set — skipping admin creation');
    return;
  }

  const userModule: any = container.resolve(Modules.USER);
  const authService: any = container.resolve(Modules.AUTH);
  const workflowService: any = container.resolve(Modules.WORKFLOW_ENGINE);

  const existing = await userModule.listUsers({ email });
  if (existing.length) {
    logger.info(
      `ADMIN: ${email} already exists (id=${existing[0].id}) — skipping`,
    );
    return;
  }

  let userRoles: string[] = [];
  if (FeatureFlag.isFeatureEnabled('rbac')) {
    const rbacService: any = container.resolve(Modules.RBAC);
    const superAdminRoles = await rbacService.listRbacRoles({
      id: 'role_super_admin',
    });
    if (superAdminRoles.length > 0) {
      userRoles = [superAdminRoles[0].id];
    }
  }

  const { result: users } = await workflowService.run('create-users-workflow', {
    input: { users: [{ email, roles: userRoles }] },
  });
  const user = users[0];

  const { authIdentity, error } = await authService.register('emailpass', {
    body: { email, password },
  });
  if (error || !authIdentity) {
    logger.error(`ADMIN: emailpass register failed: ${error}`);
    return;
  }

  await authService.updateAuthIdentities({
    id: authIdentity.id,
    app_metadata: { user_id: user.id },
  });

  logger.info(
    `ADMIN: created ${email} (user=${user.id}) with super admin role`,
  );
}
