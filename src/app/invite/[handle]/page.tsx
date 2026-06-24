import type { Metadata } from 'next';
import InviteClient from './InviteClient';

export const metadata: Metadata = { title: 'Join on Pokenic' };

export default async function InvitePage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;
  return <InviteClient handle={handle} />;
}
