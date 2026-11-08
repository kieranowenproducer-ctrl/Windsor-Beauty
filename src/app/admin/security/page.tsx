import AdminSidebar from '@/components/admin/AdminSidebar';
import PasskeySettings from '@/components/account/PasskeySettings';
export const dynamic='force-dynamic';
export default function AdminSecurityPage() {
  const enabled=process.env.WB_ADMIN_PASSKEYS_ENABLED==='true';
  return <div className="min-h-screen lg:flex"><AdminSidebar/><main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8"><div className="mx-auto max-w-3xl"><h1 className="mb-4 font-serif text-3xl">Security and login</h1>
    <p className="mb-5 text-sm text-stone-700">Keep your administrator password as a backup. Passkeys are separate for Windsor Beauty.</p>
    {enabled ? <PasskeySettings emailVerified scope="admin"/> : <div className="rounded-2xl border border-stone-200 bg-white p-6 text-sm text-stone-700">Passkey setup is not active yet. Use your existing administrator password.</div>}
  </div></main></div>;
}
