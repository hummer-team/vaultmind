import { forwardRef } from 'react';

const Sandbox = forwardRef<HTMLIFrameElement>((_props, ref) => {
  console.log("Sandbox component rendering...");

  // Use a relative path. When index.html is at the root of the extension,
  // this should resolve to chrome-extension://<ID>/sandbox.html
  const sandboxUrl = chrome.runtime.getURL("sandbox.html");
  console.log('[Sandbox.tsx] Using relative path for sandbox.html:', sandboxUrl);

  return (
    <iframe
      ref={ref}
      id="vaultmind-sandbox"
      src={sandboxUrl}
      style={{ display: 'none' }}
      title="Vaultmind Sandbox"
    />
  );
});

export default Sandbox;
