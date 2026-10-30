// Renderer skript v TypeScripte pre riadenie emulátora

interface WebviewElement extends HTMLElement {
  src: string;
  loadURL(url: string): Promise<void>;
  reload(): void;
  goBack(): void;
  goForward(): void;
  canGoBack(): boolean;
  canGoForward(): boolean;
  getURL(): string;
  getTitle(): string;
  isLoading(): boolean;
}

window.addEventListener('DOMContentLoaded', () => {
  const webview = document.getElementById('web-view') as WebviewElement;
  const urlInput = document.getElementById('url-input') as HTMLInputElement;
  const goBtn = document.getElementById('go-btn') as HTMLButtonElement;
  const reloadBtn = document.getElementById('reload-btn') as HTMLButtonElement;
  const backBtn = document.getElementById('back-btn') as HTMLButtonElement;
  const forwardBtn = document.getElementById('forward-btn') as HTMLButtonElement;
  const statusIndicator = document.getElementById('status-indicator') as HTMLSpanElement;

  function navigateTo(targetUrl: string): void {
    if (!targetUrl) return;
    let trimmed = targetUrl.trim();
    if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
      trimmed = 'https://' + trimmed;
    }
    urlInput.value = trimmed;
    webview.loadURL(trimmed);
  }

  // Odoslanie URL tlačidlom alebo klávesom Enter
  goBtn.addEventListener('click', () => navigateTo(urlInput.value));
  urlInput.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter') navigateTo(urlInput.value);
  });

  // Tlačidlá navigácie (Späť / Dopredu / Obnoviť)
  reloadBtn.addEventListener('click', () => webview.reload());
  backBtn.addEventListener('click', () => {
    if (webview.canGoBack()) webview.goBack();
  });
  forwardBtn.addEventListener('click', () => {
    if (webview.canGoForward()) webview.goForward();
  });

  // Rýchle tlačidlá v bočnom paneli
  document.querySelectorAll('.tool-btn').forEach((button) => {
    button.addEventListener('click', () => {
      const targetUrl = button.getAttribute('data-url');
      if (targetUrl) {
        navigateTo(targetUrl);
        document.querySelectorAll('.tool-btn').forEach((b) => b.classList.remove('active'));
        button.classList.add('active');
      }
    });
  });

  // Udalosti webview (automatická synchronizácia adresného riadka a stavu načítavania)
  webview.addEventListener('did-start-loading', () => {
    if (statusIndicator) statusIndicator.textContent = 'Načítavam...';
  });

  webview.addEventListener('did-stop-loading', () => {
    if (statusIndicator) statusIndicator.textContent = 'Pripravené';
    urlInput.value = webview.getURL();
    backBtn.disabled = !webview.canGoBack();
    forwardBtn.disabled = !webview.canGoForward();
  });

  webview.addEventListener('did-navigate', (event: any) => {
    urlInput.value = event.url;
  });

  webview.addEventListener('did-navigate-in-page', (event: any) => {
    urlInput.value = event.url;
  });
});

