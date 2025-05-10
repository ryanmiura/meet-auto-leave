// Content script - Meet Auto Leave Extension

// State management
let config = null;
let participantCount = 0;
let peakParticipants = 0;
let joinTime = null;
let exitTimer = null;
let currentUrl = window.location.href;

// Seletores para botões e controles
const SELECTORS = {
    MIC: {
        BUTTON: [
            '[role="button"][aria-label*="microfone" i]',
            '[role="button"][aria-label*="mic" i]'
        ],
        STATUS: 'data-is-muted'
    },
    CAMERA: {
        BUTTON: [
            '[role="button"][aria-label*="câmera" i]',
            '[role="button"][aria-label*="camera" i]'
        ],
        STATUS: 'data-is-muted'
    },
    JOIN: [
        '[role="button"][aria-label*="Participar" i]',
        '[role="button"][aria-label*="Entrar" i]',
        '[role="button"][aria-label*="Participar agora" i]'
    ],
    PARTICIPANTS: {
        COUNT: '[data-participant-count]',
        LABEL: '[aria-label*="participante" i]'
    },
    CHAT: {
        BUTTON: '[aria-label*="chat" i]',
        INPUT: '[aria-label*="Enviar mensagem" i]',
        SEND: '[aria-label*="Enviar" i]'
    },
    LEAVE: [
        '[role="button"][aria-label*="Sair da chamada" i]',
        '[role="button"][aria-label*="Desligar" i]'
    ]
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', initialize);

async function initialize() {
    try {
        // Get configuration from storage
        config = await StorageManager.getConfig();
        
        // Set up observers for participant count and reactions
        setupParticipantObserver();
        setupReactionObserver();
        
        // Set up auto-join functionality
        await autoJoin();
        
        // Send initial message in chat
        await sendInitialMessage();
    } catch (error) {
        console.error('Erro ao inicializar:', error);
    }
}

// Participant monitoring
function setupParticipantObserver() {
    const observer = new MutationObserver(checkParticipants);
    
    // Try multiple selectors for participant count
    for (const selector of [SELECTORS.PARTICIPANTS.COUNT, SELECTORS.PARTICIPANTS.LABEL]) {
        waitForElement(selector).then(element => {
            if (element) {
                observer.observe(element, { 
                    childList: true, 
                    characterData: true, 
                    subtree: true 
                });
                return; // Stop after first successful observation
            }
        });
    }
}

async function checkParticipants(mutations) {
    try {
        // Try both selectors for participant count
        let countElement = document.querySelector(SELECTORS.PARTICIPANTS.COUNT) ||
                          document.querySelector(SELECTORS.PARTICIPANTS.LABEL);
        
        if (!countElement) return;

        // Extract number from text content
        const text = countElement.textContent;
        const match = text.match(/\d+/);
        if (!match) return;

        const newCount = parseInt(match[0]);
        if (isNaN(newCount)) return;

        participantCount = newCount;
        peakParticipants = Math.max(peakParticipants, newCount);

        // Check exit conditions
        await checkExitConditions();
    } catch (error) {
        console.error('Erro ao verificar participantes:', error);
    }
}

// Auto-join functionality
async function autoJoin() {
    try {
        // Wait for and configure devices
        await configureDevices();

        // Try to join the meeting
        await joinMeeting();

        // Start monitoring
        startExitTimer();
    } catch (error) {
        console.error('Erro ao entrar na reunião:', error);
    }
}

async function configureDevices() {
    // Configure microphone
    const micButton = await findElement(SELECTORS.MIC.BUTTON);
    if (micButton && micButton.getAttribute(SELECTORS.MIC.STATUS) === 'false') {
        await simulateClick(micButton);
    }

    // Configure camera
    const cameraButton = await findElement(SELECTORS.CAMERA.BUTTON);
    if (cameraButton && cameraButton.getAttribute(SELECTORS.CAMERA.STATUS) === 'false') {
        await simulateClick(cameraButton);
    }
}

async function joinMeeting() {
    const joinButton = await findElement(SELECTORS.JOIN);
    if (joinButton) {
        await simulateClick(joinButton);
        joinTime = Date.now();
        return true;
    }
    return false;
}

// Exit conditions
function startExitTimer() {
    if (config.timerDuration > 0) {
        exitTimer = setTimeout(() => {
            exitMeeting('Timer expired');
        }, config.timerDuration * 60 * 1000);
    }
}

async function checkExitConditions() {
    try {
        // Check minimum participants
        if (participantCount <= config.minParticipants) {
            await exitMeeting('Minimum participants reached');
            return;
        }

        // Check peak percentage
        const peakPercentage = (participantCount / peakParticipants) * 100;
        if (peakPercentage <= config.peakPercentage) {
            await exitMeeting('Peak percentage threshold reached');
            return;
        }
    } catch (error) {
        console.error('Erro ao verificar condições de saída:', error);
    }
}

// Chat functionality
async function sendInitialMessage() {
    try {
        await sendChatMessage('Olá');
    } catch (error) {
        console.error('Erro ao enviar mensagem inicial:', error);
    }
}

async function sendChatMessage(message) {
    try {
        // Find and click chat button
        const chatButton = await findElement([SELECTORS.CHAT.BUTTON]);
        if (!chatButton) {
            throw new Error('Chat button not found');
        }
        await simulateClick(chatButton);

        // Wait for input field
        const input = await waitForElement(SELECTORS.CHAT.INPUT);
        if (!input) {
            throw new Error('Chat input not found');
        }

        // Type and send message
        input.textContent = message;
        input.dispatchEvent(new KeyboardEvent('input', { bubbles: true }));
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    } catch (error) {
        console.error('Erro ao enviar mensagem:', error);
    }
}

// Helper functions
async function findElement(selectors) {
    // Try each selector in the array
    if (Array.isArray(selectors)) {
        for (const selector of selectors) {
            const element = document.querySelector(selector);
            if (element) return element;
        }
        return null;
    }
    // Single selector
    return document.querySelector(selectors);
}

function waitForElement(selector, timeout = 30000) {
    return new Promise(resolve => {
        const element = findElement(Array.isArray(selector) ? selector : [selector]);
        if (element) {
            resolve(element);
            return;
        }

        const observer = new MutationObserver(() => {
            const element = findElement(Array.isArray(selector) ? selector : [selector]);
            if (element) {
                observer.disconnect();
                resolve(element);
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        setTimeout(() => {
            observer.disconnect();
            resolve(null);
        }, timeout);
    });
}

async function simulateClick(element) {
    if (!element) return false;

    try {
        element.click();
        return true;
    } catch (error) {
        console.error('Erro ao clicar no elemento:', error);
        return false;
    }
}

async function exitMeeting(reason) {
    try {
        // Send goodbye message
        await sendChatMessage('Até mais');

        // Notify background about meeting completion
        await chrome.runtime.sendMessage({
            type: 'COMPLETE_MEETING',
            data: {
                url: currentUrl,
                exitReason: reason
            }
        });

        // Click leave button
        const leaveButton = await findElement(SELECTORS.LEAVE);
        if (leaveButton) {
            await simulateClick(leaveButton);
        }

        // Clean up
        if (exitTimer) {
            clearTimeout(exitTimer);
        }

        // Log exit
        console.log(`Left meeting: ${reason}`);
    } catch (error) {
        console.error('Erro ao sair da reunião:', error);
    }
}