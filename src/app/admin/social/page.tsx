import { redirect } from 'next/navigation';

// The separate Social Engine was retired in September 2026. Old bookmarks return
// to the normal admin dashboard instead of keeping a hidden route into it.
export const metadata = { title: 'Windsor Glow Admin' };

export default function AdminSocialPage() {
  redirect('/admin/dashboard');
}
