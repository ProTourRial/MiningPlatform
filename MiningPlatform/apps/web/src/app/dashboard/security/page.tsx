/** MiningPlatform — Author: Abia Nugrahanto */
import { PageShell } from '@/components/dashboard/page-shell';
import { SecurityManagementPanel } from '@/components/dashboard/security-management-panel';
export default function Page() { return <PageShell title="Security" description="Kelola TOTP 2FA, recovery code, dan sesi aktif."><SecurityManagementPanel /></PageShell>; }
