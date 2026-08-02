/** MiningPlatform — Author: Abia Nugrahanto */
import { AdminManagementPanel } from '@/components/dashboard/admin-management-panel';
import { PageShell } from '@/components/dashboard/page-shell';
export default function Page() { return <PageShell title="Admin" description="Kelola status user dan tinjau posture akun. Akses memerlukan ADMIN/OWNER dengan TOTP aktif."><AdminManagementPanel /></PageShell>; }
