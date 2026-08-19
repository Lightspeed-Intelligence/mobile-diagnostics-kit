/**
 * Converts an explicitly injected build variable into a diagnostics gate.
 * There is intentionally no development-mode fallback: store builds must
 * remain closed unless their host opted in at bundle time.
 */
export function parseDiagnosticsFlag(value: string | undefined): boolean {
  return value === '1'
}
