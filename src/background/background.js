// Background script - Meet Auto Leave Extension

// Configuration defaults
const DEFAULT_CONFIG = {
  timerDuration: 30, // minutes
  minParticipants: 2,
  peakPercentage: 10,
  autoReactThreshold: 5
};

// Initialize extension
chrome.runtime.onInstalled.addListener(async () => {
  // Set default configuration
  await chrome.storage.sync.set({ config: DEFAULT_CONFIG });
  
  // Clear any existing alarms
  await chrome.alarms.clearAll();
});

// Listen for alarm triggers (scheduled meetings)
chrome.alarms.onAlarm.addListener(async (alarm) => {
  const meetingData = JSON.parse(alarm.name);
  await openMeeting(meetingData.url);
});

// Listen for messages from content script or popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'SCHEDULE_MEETING':
      scheduleMeeting(message.data);
      break;
    case 'UPDATE_CONFIG':
      updateConfiguration(message.data);
      break;
    case 'GET_CONFIG':
      getConfiguration().then(sendResponse);
      return true; // Keep the message channel open for async response
  }
});

// Helper functions
async function openMeeting(url) {
  const tab = await chrome.tabs.create({ url });
  return tab;
}

async function scheduleMeeting(data) {
  const alarmName = JSON.stringify({
    url: data.url,
    scheduledTime: data.time
  });
  
  await chrome.alarms.create(alarmName, {
    when: new Date(data.time).getTime()
  });
}

async function updateConfiguration(config) {
  await chrome.storage.sync.set({ config });
}

async function getConfiguration() {
  const data = await chrome.storage.sync.get('config');
  return data.config || DEFAULT_CONFIG;
}