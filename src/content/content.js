// Content script - Meet Auto Leave Extension

// State management
let config = null;
let participantCount = 0;
let peakParticipants = 0;
let joinTime = null;
let exitTimer = null;
let currentUrl = window.location.href;

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', initialize);

async function initialize() {
  // Get configuration from storage
  config = await StorageManager.getConfig();
  
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
  //!* Seletor para contagem de participantes - precisa verificar no Meet
  waitForElement('[data-participant-count]').then(element => {
    observer.observe(element, { 
      childList: true, 
      characterData: true, 
      subtree: true 
    });
  });
}

async function checkParticipants(mutations) {
  //!* Seletor para elemento de contagem de participantes
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
  //!* Seletor do botão de microfone - verificar texto exato do aria-label
  const micButton = await waitForElement('[aria-label*="microfone"]');
  //!* Seletor do botão de câmera - verificar texto exato do aria-label
  const cameraButton = await waitForElement('[aria-label*="câmera"]');
  
  //!* Atributo que indica se o microfone está mutado
  if (micButton?.getAttribute('data-is-muted') === 'false') {
    micButton.click();
  }
  
  //!* Atributo que indica se a câmera está mutada
  if (cameraButton?.getAttribute('data-is-muted') === 'false') {
    cameraButton.click();
  }

  //!* Seletor do botão de participar - verificar texto exato do aria-label
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
  //!* Seletor do botão de chat - verificar texto exato do aria-label
  await waitForElement('[aria-label*="chat"]');
  await sendChatMessage('Olá');
}

async function sendChatMessage(message) {
  //!* Seletor do botão de chat - verificar texto exato do aria-label
  const chatButton = document.querySelector('[aria-label*="chat"]');
  if (chatButton) {
    chatButton.click();
    
    //!* Seletor do campo de input do chat - verificar texto exato do aria-label
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
  
  //!* Seletor para contagem de reações - precisa verificar no Meet
  waitForElement('[data-reaction-count]').then(element => {
    observer.observe(element, {
      childList: true,
      characterData: true,
      subtree: true
    });
  });
}

// Helper functions
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
  
  // Notify background about meeting completion
  chrome.runtime.sendMessage({
    type: 'COMPLETE_MEETING',
    data: {
      url: currentUrl,
      exitReason: reason
    }
  });
  
  // Click leave button
  //!* Seletor do botão de sair - verificar texto exato do aria-label
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