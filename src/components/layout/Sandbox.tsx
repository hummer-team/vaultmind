import { forwardRef } from 'react';

/**
 * A React component whose only job is to render the sandbox iframe.
 * It uses `forwardRef` to allow parent components to get a direct reference
 * to the iframe element after it has been mounted by React.
 */
const Sandbox = forwardRef<HTMLIFrameElement>((_props, ref) => {
  console.log("Sandbox component rendering...");
  return (
    <iframe
      ref={ref}
      id="vaultmind-sandbox"
      src={chrome.runtime.getURL('sandbox.html')}
      style={{ display: 'none' }}
      title="Vaultmind Sandbox"
    />
  );
});

export default Sandbox;
