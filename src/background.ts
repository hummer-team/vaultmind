console.log("VaultMind Service Worker: Script loading and running.");

chrome.action.onClicked.addListener(async (tab) => {
    if (!tab.id) {
        console.error("[action.onClicked] Tab ID is missing.");
        return;
    }

    /* This check is removed as sidePanel works on chrome://newtab/
    if (tab.url && tab.url.startsWith('chrome://')) {
        console.warn('[action.onClicked] Cannot open side panel on chrome:// URL:', tab.url);
        return;
    }
    */

    console.log(`[action.onClicked] Triggered for tab ID: ${tab.id}. Attempting to open side panel.`);

    try {
        // Open the side panel for the current tab
        await chrome.sidePanel.open({ tabId: tab.id });
        console.log(`[action.onClicked] Side panel opened successfully for tab ID: ${tab.id}.`);
    } catch (error) {
        console.error("[action.onClicked] Error opening side panel:", error);
    }
});

// Add listener to handle messages from the side panel (e.g., close requests)
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === 'CLOSE_SIDEBAR') {
        console.log(`Background script received CLOSE_SIDEBAR message from side panel.`);
        
        let activeTabId: number; // To hold the tab ID


        chrome.tabs.query({ active: true, currentWindow: true })
            .then(async (tabs) => {
                if (tabs.length > 0 && tabs[0].id !== undefined) {
                    activeTabId = tabs[0].id;
                    console.log(`Found active tab ID: ${activeTabId}. Attempting to set side panel options.`);
                    await chrome.sidePanel.setOptions({
                        tabId: activeTabId,
                        enabled: false
                    });
                    // return  await chrome.tabs.remove(activeTabId).catch( error=>{
                   //      console.error("Error closing tab:", error);
                   //  });
                } else {
                    throw new Error("No active tab found or tab ID is missing.");
                }
            })
            .then(() => {
                console.log(`Side panel options set for tab ID: ${activeTabId}.`);
                // Get and log the current state of the side panel for this tab
                return chrome.sidePanel.getOptions({ tabId: activeTabId });
            })
            .then((options) => {
                console.log(`Current side panel state for tab ${activeTabId}:`, options);
                sendResponse({ status: 'success', state: options });
            })
            .catch((error) => {
                console.error(`Error processing CLOSE_SIDEBAR message:`, error);
                sendResponse({ status: 'error', message: error.message });
            });
        
        return true; // Indicate that sendResponse will be called asynchronously
    }
    // For other messages, let other listeners handle them or return false
    return false;
});
