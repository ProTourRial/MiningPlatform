/** MiningPlatform — Author: Abia Nugrahanto */
import { PageShell } from '@/components/dashboard/page-shell';
import { ApiKeyManagementPanel } from '@/components/dashboard/api-key-management-panel';
export default function Page() { return <PageShell title="API Access" description="Buat API key berscope terbatas untuk integrasi monitoring dan otomasi."><ApiKeyManagementPanel /></PageShell>; }
