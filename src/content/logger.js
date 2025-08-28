function logDebug(...args) {
    const style = 'background: #1a73e8; color: white; padding: 2px 5px; border-radius: 3px;';
    console.log('%c[Meet Auto Leave]', style, ...args);

    // Log to on-page container if it exists
    const debugContainer = document.getElementById('meet-auto-leave-debug');
    if (debugContainer) {
        const logLine = document.createElement('div');
        logLine.textContent = `[${new Date().toLocaleTimeString()}] ${args.map(arg =>
            typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
        ).join(' ')}`;
        debugContainer.insertBefore(logLine, debugContainer.firstChild);
    }

    // Send to background script
    chrome.runtime.sendMessage({
        type: 'DEBUG_LOG',
        data: {
            source: 'content',
            message: args.map(arg =>
                typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
            ).join(' ')
        }
    }).catch(() => {
        // Fail silently if background connection is not available, e.g. during extension reload.
    });
}
