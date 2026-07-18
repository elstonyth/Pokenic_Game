import { redirect } from 'next/navigation';

// The daily free box moved onto /vip (it's a VIP-tier benefit). The "Task" tab
// now points at the Weekly Challenge (/task). Keep this redirect so old links,
// bookmarks, and the /rewards → daily hop still land on the box.
export default function DailyPage(): never {
  redirect('/vip');
}
