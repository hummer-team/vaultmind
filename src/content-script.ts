// content-script.ts
// This file is now primarily for interacting with the host page DOM if needed.
// The side panel UI is handled by chrome.sidePanel API.

// If you need to interact with the host page (e.g., read text, inject elements),
// you can add that logic here.
// For example, to listen for messages from the side panel or background script
// and perform actions on the host page.

// Example: Listen for a message from the side panel to highlight text
// chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
//   if (message.type === 'HIGHLIGHT_TEXT') {
//     console.log('Content script received HIGHLIGHT_TEXT message.');
//     // Implement text highlighting logic here
//     sendResponse({ status: 'highlighted' });
//   }
// });

console.log('Vaultmind content script loaded (sidePanel mode).');
