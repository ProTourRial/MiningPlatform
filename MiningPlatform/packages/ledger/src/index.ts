export type LedgerLine = {
  accountCode: string;
  debit: bigint;
  credit: bigint;
};

export function assertBalanced(lines: readonly LedgerLine[]): void {
  const debit = lines.reduce((sum, line) => sum + line.debit, 0n);
  const credit = lines.reduce((sum, line) => sum + line.credit, 0n);

  if (debit !== credit) {
    throw new Error(`Unbalanced journal entry: debit=${debit} credit=${credit}`);
  }

  for (const line of lines) {
    if (line.debit < 0n || line.credit < 0n) throw new Error('Ledger values cannot be negative');
    if (line.debit > 0n && line.credit > 0n) throw new Error('A line cannot contain both debit and credit');
  }
}
