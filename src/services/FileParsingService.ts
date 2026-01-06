/**
 * This service is a "pure messenger" to the sandbox.
 * It has ZERO knowledge of any parsing libraries. Its only job is to
 * manage the iframe and the postMessage communication with a robust handshake.
 */
export class FileParsingService {
  private static instance: FileParsingService;

  private sandbox: HTMLIFrameElement | null = null;
  private requestCounter = 0;
  private readonly requests = new Map<number, { resolve: (data: Uint8Array) => void; reject: (error: any) => void }>();
  private sandboxReadyPromise: Promise<void> | null = null;

  private constructor() {
    this.initializeSandbox();
  }

  public static getInstance(): FileParsingService {
    if (!FileParsingService.instance) {
      FileParsingService.instance = new FileParsingService();
    }
    return FileParsingService.instance;
  }

  private initializeSandbox() {
    if (this.sandboxReadyPromise) return;

    this.sandboxReadyPromise = new Promise((resolve, reject) => {
      const appendAndInitIframe = () => {
        let iframe = document.getElementById('vaultmind-sandbox') as HTMLIFrameElement;
        if (!iframe) {
          iframe = document.createElement('iframe');
          iframe.id = 'vaultmind-sandbox';
          iframe.src = chrome.runtime.getURL('sandbox.html');
          iframe.style.display = 'none';
          document.body.appendChild(iframe);
        }
        this.sandbox = iframe;

        const timeout = setTimeout(() => reject(new Error('Sandbox handshake timed out.')), 5000);

        const handleMessage = (event: MessageEvent) => {
          if (event.source !== this.sandbox?.contentWindow) return;

          if (event.data.type === 'PONG') {
            clearTimeout(timeout);
            window.removeEventListener('message', handleMessage);
            resolve();
          } else {
            const { id, data, error, type } = event.data;
            if (this.requests.has(id)) {
              const promise = this.requests.get(id)!;
              if (type === 'PARSE_SUCCESS') promise.resolve(data);
              else if (type === 'PARSE_ERROR') promise.reject(new Error(error));
              this.requests.delete(id);
            }
          }
        };

        window.addEventListener('message', handleMessage);

        this.sandbox.onload = () => {
          this.sandbox?.contentWindow?.postMessage({ type: 'PING' }, '*');
        };
      };

      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', appendAndInitIframe);
      } else {
        appendAndInitIframe();
      }
    });
  }

  public async parseFileToArrow(file: File): Promise<Uint8Array> {
    await this.sandboxReadyPromise;
    const arrayBuffer = await file.arrayBuffer();

    return new Promise((resolve, reject) => {
      if (!this.sandbox?.contentWindow) {
        return reject(new Error('Sandbox not initialized.'));
      }
      const id = ++this.requestCounter;
      this.requests.set(id, { resolve, reject });

      this.sandbox.contentWindow.postMessage(
        { type: 'PARSE_BUFFER_TO_ARROW', buffer: arrayBuffer, fileName: file.name, id },
        '*',
        [arrayBuffer]
      );
    });
  }
}
