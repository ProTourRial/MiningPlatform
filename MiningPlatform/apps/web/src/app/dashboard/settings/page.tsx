/** MiningPlatform — Author: Abia Nugrahanto */
import { PageShell } from '@/components/dashboard/page-shell';
import { NotificationSettingsPanel } from '@/components/dashboard/notification-settings-panel';
export default function Page() { return <PageShell title="Settings" description="Kelola kanal notifikasi terenkripsi. Pengiriman eksternal tetap membutuhkan adapter worker."><NotificationSettingsPanel /></PageShell>; }
