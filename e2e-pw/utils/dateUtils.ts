export function formatDate(date: Date = new Date()): string {
  return date.toISOString().split('T')[0];
}

export function getCurrentTimestamp(): string {
  return new Date().toISOString();
}
