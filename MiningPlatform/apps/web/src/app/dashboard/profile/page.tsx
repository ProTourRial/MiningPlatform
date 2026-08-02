/** MiningPlatform — Author: Abia Nugrahanto */
import { PageShell } from '@/components/dashboard/page-shell';
import { ProfileManagementPanel } from '@/components/dashboard/profile-management-panel';
export default function Page() { return <PageShell title="Profile" description="Kelola identitas, bahasa, timezone, dan informasi mining account."><ProfileManagementPanel /></PageShell>; }
