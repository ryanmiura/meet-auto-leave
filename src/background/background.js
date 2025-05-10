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
    console.log('Inicializando StorageManager...');
    const data = await chrome.storage.sync.get(['config', 'meetings']);
    
    // Se não existir configuração, usa o padrão
    if (!data.config) {
      console.log('Configuração padrão criada');
      await chrome.storage.sync.set({ config: DEFAULT_CONFIG });
    }
    
    // Se não existir lista de reuniões, cria vazia
    if (!data.meetings) {
      console.log('Lista de reuniões inicializada');
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
    console.log('Agendando reunião:', { url, time });
    const meetings = await this.getMeetings(true);
    
    // Verifica se já existe
    const exists = meetings.some(m => m.url === url && m.time === time);
    if (exists) {
      console.log('Reunião já existe');
      return null;
    }

    // Adiciona nova reunião
    const newMeeting = {
      url,
      time,
      completed: false
    };
    
    meetings.push(newMeeting);

    // Ordena por data
    meetings.sort((a, b) => a.time - b.time);

    // Limita a 50 reuniões para não sobrecarregar o storage
    const limitedMeetings = meetings.slice(-50);
    
    await chrome.storage.sync.set({ meetings: limitedMeetings });
    console.log('Reunião salva com sucesso');
    
    return newMeeting;
  },

  async removeMeeting(url, time) {
    console.log('Removendo reunião:', { url, time });
    const meetings = await this.getMeetings(true);
    const index = meetings.findIndex(m => m.url === url && m.time === time);
    
    if (index === -1) {
      console.log('Reunião não encontrada');
      return false;
    }

    meetings.splice(index, 1);
    await chrome.storage.sync.set({ meetings });
    console.log('Reunião removida com sucesso');
    return true;
  },

  async completeMeeting(url, exitReason) {
    console.log('Completando reunião:', { url, exitReason });
    const meetings = await this.getMeetings(true);
    
    const meeting = meetings.find(m => m.url === url && !m.completed);
    if (meeting) {
      meeting.completed = true;
      meeting.exitReason = exitReason;
      await chrome.storage.sync.set({ meetings });
      console.log('Reunião marcada como completa');
    }
  },

  async cleanupOldMeetings() {
    console.log('Iniciando limpeza de reuniões antigas...');
    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
    const meetings = await this.getMeetings(true);
    
    const recentMeetings = meetings.filter(m => 
      !m.completed || m.time > thirtyDaysAgo
    );

    await chrome.storage.sync.set({ meetings: recentMeetings });
    console.log('Limpeza concluída');
  }
};

// Initialize extension
chrome.runtime.onInstalled.addListener(async () => {
  console.log('Extensão instalada/atualizada - configurando...');
  
  try {
    // Inicializa o sistema de armazenamento
    await StorageManager.initialize();
    
    // Limpa alarmes existentes
    await chrome.alarms.clearAll();
    
    // Recria alarmes para reuniões futuras
    const meetings = await StorageManager.getMeetings();
    console.log('Reuniões encontradas:', meetings);
    
    for (const meeting of meetings) {
      if (meeting.time > Date.now()) {
        console.log('Criando alarme para reunião existente:', meeting);
        await createAlarmForMeeting(meeting);
      }
    }

    // Agenda limpeza periódica de reuniões antigas
    chrome.alarms.create('cleanup', {
      periodInMinutes: 24 * 60 // Uma vez por dia
    });
    
    console.log('Configuração inicial concluída');
  } catch (error) {
    console.error('Erro na inicialização:', error);
  }
});

// Listen for alarm triggers
chrome.alarms.onAlarm.addListener(async (alarm) => {
  console.log('Alarme disparado:', alarm);
  
  if (alarm.name === 'cleanup') {
    console.log('Iniciando limpeza de reuniões antigas...');
    await StorageManager.cleanupOldMeetings();
    return;
  }

  try {
    const meetingData = JSON.parse(alarm.name);
    console.log('Abrindo reunião:', meetingData);
    
    // Cria nova aba com a URL do Meet
    const tab = await chrome.tabs.create({ 
      url: meetingData.url,
      active: true // Foca na nova aba
    });
    
    console.log('Aba criada:', tab);
  } catch (error) {
    console.error('Erro ao processar alarme:', error);
  }
});

// Listen for messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Mensagem recebida:', message);
  
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
    console.log('Agendando nova reunião:', data);
    
    // Salva a reunião e obtém o objeto criado
    const meeting = await StorageManager.scheduleMeeting(data.url, data.time);
    
    if (!meeting) {
      return { success: false, error: 'Reunião já existe' };
    }

    // Cria alarme imediatamente para a nova reunião
    if (meeting.time > Date.now()) {
      console.log('Criando alarme para nova reunião:', meeting);
      await createAlarmForMeeting(meeting);
    }
    
    console.log('Reunião agendada e alarme criado com sucesso');
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
async function createAlarmForMeeting(meeting) {
  console.log('Criando alarme para:', meeting);
  
  const alarmName = JSON.stringify({
    url: meeting.url,
    time: meeting.time
  });
  
  // Remove qualquer alarme existente com o mesmo nome
  await chrome.alarms.clear(alarmName);
  
  // Cria o novo alarme
  await chrome.alarms.create(alarmName, {
    when: meeting.time
  });
  
  console.log('Alarme criado com sucesso:', alarmName);
}