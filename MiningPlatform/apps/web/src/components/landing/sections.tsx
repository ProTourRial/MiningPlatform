const features = [
  ['Mining Pool Gateway', 'Koneksi worker, autentikasi Stratum, validasi share, dan relay ke upstream pool.'],
  ['Farm Monitoring', 'Hashrate, uptime, share, temperatur, fan speed, daya, dan efisiensi perangkat.'],
  ['Reward Accounting', 'Rekonsiliasi reward dan ledger double-entry tanpa kolom saldo yang dapat diubah langsung.'],
  ['Payout Control', 'Minimum payout, jadwal harian, idempotency, status transaksi, dan audit trail.'],
  ['Mining Simulator', 'Estimasi reward, biaya listrik, pool fee, biaya operasional, dan profit bersih.'],
  ['Public Transparency', 'Statistik agregat pool, status layanan, uptime, reward, dan payout publik.'],
] as const;

export function LandingSections() {
  return (
    <main>
      <section id="features" className="mx-auto max-w-7xl px-6 py-24">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[var(--accent)]">Fitur</p>
        <h2 className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight">Batas fungsi yang jelas.</h2>
        <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {features.map(([title, description]) => (
            <article key={title} className="rounded-2xl border border-white/10 bg-[var(--surface)] p-6">
              <h3 className="text-lg font-semibold">{title}</h3>
              <p className="mt-3 leading-7 text-[var(--muted)]">{description}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="how-it-works" className="border-y border-white/10 bg-white/[0.02]">
        <div className="mx-auto max-w-7xl px-6 py-24">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[var(--accent)]">Cara Kerja</p>
          <div className="mt-10 grid gap-5 md:grid-cols-4">
            {[
              ['01', 'Daftarkan Worker', 'Buat worker dan dapatkan konfigurasi Stratum.'],
              ['02', 'Hubungkan ASIC', 'Arahkan miner ke endpoint gateway platform.'],
              ['03', 'Proses Share', 'Sistem memvalidasi, mengagregasi, dan merekonsiliasi share.'],
              ['04', 'Terima Payout', 'Reward masuk ke ledger lalu dibayar sesuai jadwal dan batas minimum.'],
            ].map(([number, title, description]) => (
              <div key={number} className="rounded-2xl border border-white/10 p-6">
                <span className="text-sm font-semibold text-[var(--accent)]">{number}</span>
                <h3 className="mt-6 text-lg font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="statistics" className="mx-auto max-w-7xl px-6 py-24">
        <div className="grid gap-10 lg:grid-cols-2">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[var(--accent)]">Statistik</p>
            <h2 className="mt-4 text-4xl font-semibold tracking-tight">Metrik operasional, bukan janji keuntungan.</h2>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {[
              ['Pool Hashrate', '0 PH/s'],
              ['Worker Aktif', '0'],
              ['Payout Selesai', '0 BTC'],
              ['Status', 'Setup'],
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl border border-white/10 bg-[var(--surface)] p-5">
                <p className="text-sm text-[var(--muted)]">{label}</p>
                <p className="mt-3 text-2xl font-semibold">{value}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="simulator" className="border-y border-white/10 bg-[var(--surface)]">
        <div className="mx-auto max-w-7xl px-6 py-24">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[var(--accent)]">Simulator</p>
          <h2 className="mt-4 text-4xl font-semibold tracking-tight">Kalkulasi mining terpisah dari saldo nyata.</h2>
          <p className="mt-5 max-w-3xl leading-7 text-[var(--muted)]">
            Modul simulator akan memakai hashrate, konsumsi daya, tarif listrik, network difficulty, block
            reward, harga aset, dan pool fee. Hasilnya hanya estimasi dan tidak membuat reward pada ledger.
          </p>
        </div>
      </section>

      <section id="faq" className="mx-auto max-w-4xl px-6 py-24">
        <h2 className="text-4xl font-semibold tracking-tight">FAQ</h2>
        <div className="mt-10 space-y-4">
          {[
            ['Apakah ini cloud mining?', 'Tidak. Platform tidak menjual kontrak atau hashrate. Miner fisik harus terhubung melalui Stratum.'],
            ['Apakah reward langsung dikirim?', 'Tidak. Reward masuk ke internal ledger dan dibayar setelah memenuhi aturan payout.'],
            ['Apakah data simulator menambah saldo?', 'Tidak. Simulator hanya menghasilkan estimasi analitis.'],
          ].map(([question, answer]) => (
            <details key={question} className="rounded-2xl border border-white/10 bg-[var(--surface)] p-5">
              <summary className="cursor-pointer font-semibold">{question}</summary>
              <p className="mt-4 leading-7 text-[var(--muted)]">{answer}</p>
            </details>
          ))}
        </div>
      </section>
    </main>
  );
}
