import { redirect } from 'next/navigation';

// The daily free box moved onto /vip (it's a VIP-tier benefit). Keep this
// redirect so old links, bookmarks, and the /rewards → daily hop still land on
// the box.
export default function DailyPage(): never {
  redirect('/vip');
}
