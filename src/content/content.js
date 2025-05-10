// Content script - Meet Auto Leave Extension

// State management
let config = null;
let participantCount = 0;
let peakParticipants = 0;
let joinTime = null;
let exitTimer = null;

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', initialize);

async function initialize() {
  // Get configuration from storage
  config = await getConfiguration();
  
  // Set up observers for participant count and reactions
  setupParticipantObserver();
  setupReactionObserver();
  
  // Set up auto-join functionality
  await autoJoin();
  
  // Send initial message in chat
  await sendInitialMessage();
}

// Participant monitoring
function setupParticipantObserver() {
  const observer = new MutationObserver(checkParticipants);
  
  // Start observing once the participant count element is available
  waitForElement('[data-participant-count]').then(element => {
    observer.observe(element, { 
      childList: true, 
      characterData: true, 
      subtree: true 
    });
  });
}

async function checkParticipants(mutations) {
  const countElement = document.querySelector('[data-participant-count]');
  if (!countElement) return;

  const newCount = parseInt(countElement.textContent);
  if (isNaN(newCount)) return;

  participantCount = newCount;
  peakParticipants = Math.max(peakParticipants, newCount);

  // Check exit conditions
  await checkExitConditions();
}

// Auto-join functionality
async function autoJoin() {
  // Wait for and click the mic/camera off buttons if needed
  const micButton = await waitForElement('[aria-label*="microfone"]');
  const cameraButton = await waitForElement('[aria-label*="câmera"]');
  
  if (micButton?.getAttribute('data-is-muted') === 'false') {
    micButton.click();
  }
  
  if (cameraButton?.getAttribute('data-is-muted') === 'false') {
    cameraButton.click();
  }

  // Click the join button
  const joinButton = await waitForElement('[aria-label*="Participar"]');
  if (joinButton) {
    joinButton.click();
    joinTime = Date.now();
    startExitTimer();
  }
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
}

// Chat functionality
async function sendInitialMessage() {
  await waitForElement('[aria-label*="chat"]');
  await sendChatMessage('Olá');
}

async function sendChatMessage(message) {
  const chatButton = document.querySelector('[aria-label*="chat"]');
  if (chatButton) {
    chatButton.click();
    
    const input = await waitForElement('[aria-label*="Enviar mensagem"]');
    if (input) {
      input.textContent = message;
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    }
  }
}

// Reaction functionality
function setupReactionObserver() {
  const observer = new MutationObserver(checkReactions);
  
  waitForElement('[data-reaction-count]').then(element => {
    observer.observe(element, {
      childList: true,
      characterData: true,
      subtree: true
    });
  });
}

// Helper functions
async function getConfiguration() {
  return new Promise(resolve => {
    chrome.runtime.sendMessage({ type: 'GET_CONFIG' }, config => {
      resolve(config);
    });
  });
}

function waitForElement(selector, timeout = 10000) {
  return new Promise(resolve => {
    const element = document.querySelector(selector);
    if (element) {
      resolve(element);
      return;
    }

    const observer = new MutationObserver(() => {
      const element = document.querySelector(selector);
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

async function exitMeeting(reason) {
  // Send goodbye message
  await sendChatMessage('Até mais');
  
  // Click leave button
  const leaveButton = document.querySelector('[aria-label*="Sair da chamada"]');
  if (leaveButton) {
    leaveButton.click();
  }
  
  // Clean up
  if (exitTimer) {
    clearTimeout(exitTimer);
  }
  
  // Log exit
  console.log(`Left meeting: ${reason}`);
}