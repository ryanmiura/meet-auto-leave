// Background script - Meet Auto Leave Extension

// Default config
const DEFAULT_CONFIG = {
  timerDuration: 30,
  minParticipants: 2,
  peakPercentage: 10,
  autoReactThreshold: 5
};

// Storage Manager implementation for background
const StorageManager = {
  async initialize() {
    const data = await chrome.storage.sync.get(['config', 'meetings']);
    
    // Se não existir configuração, usa o padrão
    if (!data.config) {
      await chrome.storage.sync.set({ config: DEFAULT_CONFIG });
    }
    
    // Se não existir lista de reuniões, cria vazia
    if (!data.meetings) {
      await chrome.storage.sync.set({ meetings: [] });
    }
  },

  async getConfig() {
    const data = await chrome.storage.sync.get('config');
    return data.config || DEFAULT_CONFIG;
  },

  async updateConfig(newConfig) {
    const sanitizedConfig = {
      timerDuration: Math.max(0, parseInt(newConfig.timerDuration) || DEFAULT_CONFIG.timerDuration),
      minParticipants: Math.max(1, parseInt(newConfig.minParticipants) || DEFAULT_CONFIG.minParticipants),
      peakPercentage: Math.min(100, Math.max(1, parseInt(newConfig.peakPercentage) || DEFAULT_CONFIG.peakPercentage)),
      autoReactThreshold: Math.max(1, parseInt(newConfig.autoReactThreshold) || DEFAULT_CONFIG.autoReactThreshold)
    };

    await chrome.storage.sync.set({ config: sanitizedConfig });
  },

  async getMeetings(includeCompleted = false) {
    const data = await chrome.storage.sync.get('meetings');
    const meetings = data.meetings || [];
    
    if (!includeCompleted) {
      return meetings.filter(m => !m.completed);
    }
    return meetings;
  },

  async scheduleMeeting(url, time) {
    const meetings = await this.getMeetings(true);
    
    meetings.push({
      url,
      time,
      completed: false
    });

    meetings.sort((a, b) => a.time - b.time);
    const limitedMeetings = meetings.slice(-50);
    
    await chrome.storage.sync.set({ meetings: limitedMeetings });
  },

  async completeMeeting(url, exitReason) {
    const meetings = await this.getMeetings(true);
    
    const meeting = meetings.find(m => m.url === url && !m.completed);
    if (meeting) {
      meeting.completed = true;
      meeting.exitReason = exitReason;
      await chrome.storage.sync.set({ meetings });
    }
  },

  async cleanupOldMeetings() {
    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
    const meetings = await this.getMeetings(true);
    
    const recentMeetings = meetings.filter(m => 
      !m.completed || m.time > thirtyDaysAgo
    );

    await chrome.storage.sync.set({ meetings: recentMeetings });
  }
};

// Initialize extension
chrome.runtime.onInstalled.addListener(async () => {
  // Inicializa o sistema de armazenamento
  await StorageManager.initialize();
  
  // Limpa alarmes existentes
  await chrome.alarms.clearAll();
  
  // Recria alarmes para reuniões futuras
  const meetings = await StorageManager.getMeetings();
  for (const meeting of meetings) {
    if (meeting.time > Date.now()) {
      createAlarmForMeeting(meeting);
    }
  }

  // Agenda limpeza periódica de reuniões antigas
  chrome.alarms.create('cleanup', {
    periodInMinutes: 24 * 60 // Uma vez por dia
  });
});

// Listen for alarm triggers
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'cleanup') {
    await StorageManager.cleanupOldMeetings();
    return;
  }

  try {
    const meetingData = JSON.parse(alarm.name);
    await openMeeting(meetingData.url);
  } catch (error) {
    console.error('Erro ao processar alarme:', error);
  }
});

// Listen for messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'SCHEDULE_MEETING':
      handleScheduleMeeting(message.data).then(sendResponse);
      break;
    case 'UPDATE_CONFIG':
      handleUpdateConfig(message.data).then(sendResponse);
      break;
    case 'GET_CONFIG':
      handleGetConfig().then(sendResponse);
      break;
    case 'COMPLETE_MEETING':
      handleCompleteMeeting(message.data).then(sendResponse);
      break;
  }
  return true; // Mantém o canal de mensagem aberto para respostas assíncronas
});

// Handler functions
async function handleScheduleMeeting(data) {
  try {
    await StorageManager.scheduleMeeting(data.url, data.time);
    createAlarmForMeeting(data);
    return { success: true };
  } catch (error) {
    console.error('Erro ao agendar reunião:', error);
    return { success: false, error: error.message };
  }
}

async function handleUpdateConfig(config) {
  try {
    await StorageManager.updateConfig(config);
    return { success: true };
  } catch (error) {
    console.error('Erro ao atualizar configurações:', error);
    return { success: false, error: error.message };
  }
}

async function handleGetConfig() {
  try {
    const config = await StorageManager.getConfig();
    return { success: true, data: config };
  } catch (error) {
    console.error('Erro ao obter configurações:', error);
    return { success: false, error: error.message };
  }
}

async function handleCompleteMeeting(data) {
  try {
    await StorageManager.completeMeeting(data.url, data.exitReason);
    return { success: true };
  } catch (error) {
    console.error('Erro ao completar reunião:', error);
    return { success: false, error: error.message };
  }
}

// Helper functions
function createAlarmForMeeting(meeting) {
  const alarmName = JSON.stringify({
    url: meeting.url,
    time: meeting.time
  });
  
  chrome.alarms.create(alarmName, {
    when: meeting.time
  });
}

async function openMeeting(url) {
  try {
    await chrome.tabs.create({ url });
  } catch (error) {
    console.error('Erro ao abrir reunião:', error);
  }
}