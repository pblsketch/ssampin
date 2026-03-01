export async function exportToPdf(): Promise<ArrayBuffer | null> {
  if (window.electronAPI) {
    return window.electronAPI.printToPDF();
  }
  // 브라우저 폴백: window.print()
  window.print();
  return null;
}
