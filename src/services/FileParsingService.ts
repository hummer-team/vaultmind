/**
 * This service is now a Singleton. Its initialization (iframe creation)
 * is handled once, when the service instance is first created.
 * It ensures the iframe is appended to the body only when the DOM is ready.
 */
export class FileParsingService {
  private static instance: FileParsingService;

  private sandbox: HTMLIFrameElement | null = null;
  private requestCounter = 0;
  private readonly requests = new Map<number, { resolve: (data: Uint8Array) => void; reject: (error: any) => void }>();
  private sandboxReadyPromise: Promise<void> | null = null;

  // The constructor now handles the iframe creation and message listener setup.
  private constructor() {
    this.initializeSandbox();
  }

  public static getInstance(): FileParsingService {
    if (!FileParsingService.instance) {
      FileParsingService.instance = new FileParsingService();
    }
    return FileParsingService.instance;
  }

  /**
   * Initializes the sandbox iframe and sets up message listeners.
   * This method is called once by the constructor.
   */
  private initializeSandbox() {
    // Ensure this runs only once.
    if (this.sandboxReadyPromise) {
      return;
    }
    console.log("FileParsingService: Initializing sandbox...");

    this.sandboxReadyPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Sandbox handshake timed out.')), 10000); // Increased timeout

      const appendIframe = () => {
        let iframe = document.getElementById('vaultmind-sandbox') as HTMLIFrameElement;
        if (!iframe) {
          iframe = document.createElement('iframe');
          iframe.id = 'vaultmind-sandbox';
          iframe.src = chrome.runtime.getURL('sandbox.html');
          iframe.style.display = 'none';
          document.body.appendChild(iframe);
          console.log("FileParsingService: Sandbox iframe created and appended to body.");
        }
        this.sandbox = iframe;

        const handleMessage = (event: MessageEvent) => {
          if (event.source !== this.sandbox?.contentWindow) return;

          const { type, id, data, error } = event.data;
          
          if (type === 'PONG') {
            console.log("FileParsingService: PONG received from sandbox. Handshake complete.");
            clearTimeout(timeout);
            window.removeEventListener('message', handleMessage); // Remove this specific listener
            resolve();
          } else if (this.requests.has(id)) {
            const promise = this.requests.get(id)!;
            if (type === 'PARSE_SUCCESS') {
              promise.resolve(data);
            } else if (type === 'PARSE_ERROR') {
              promise.reject(new Error(error));
            }
            this.requests.delete(id);
          }
        };

        console.log("FileParsingService: Adding message event listener.");
        window.addEventListener('message', handleMessage);

        this.sandbox.onload = () => {
          console.log("FileParsingService: Sandbox iframe onload event fired.");
          this.sandbox?.contentWindow?.postMessage({ type: 'PING' }, '*');
        };
        
        // If iframe is already loaded (e.g., from previous session or fast reload),
        // onload might not fire. Send PING directly if contentWindow is available.
        if (this.sandbox.contentWindow) {
           this.sandbox.contentWindow.postMessage({ type: 'PING' }, '*');
        }
      };

      // Ensure DOM is ready before appending iframe.
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', appendIframe);
      } else {
        appendIframe();
      }
    });
  }

  public async parseFileToArrow(file: File): Promise<Uint8Array> {
    // Ensure initialization is complete before proceeding.
    await this.sandboxReadyPromise;

    console.log("FileParsingService: Begin parse upload file");
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
