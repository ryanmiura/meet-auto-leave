// Background script - Meet Auto Leave Extension

// Função de log com timestamp
function logDebug(source, ...args) {
    const timestamp = new Date().toLocaleTimeString();
    console.log(`[${timestamp}] [${source}]`, ...args);
}

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
        logDebug('background', 'Inicializando StorageManager...');
        const data = await chrome.storage.sync.get(['config', 'meetings']);
        
        // Se não existir configuração, usa o padrão
        if (!data.config) {
            logDebug('background', 'Configuração padrão criada');
            await chrome.storage.sync.set({ config: DEFAULT_CONFIG });
        }
        
        // Se não existir lista de reuniões, cria vazia
        if (!data.meetings) {
            logDebug('background', 'Lista de reuniões inicializada');
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
        logDebug('background', 'Agendando reunião:', { url, time });
        const meetings = await this.getMeetings(true);
        
        // Verifica se já existe
        const exists = meetings.some(m => m.url === url && m.time === time);
        if (exists) {
            logDebug('background', 'Reunião já existe');
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
        logDebug('background', 'Reunião salva com sucesso');
        
        return newMeeting;
    },

    async removeMeeting(url, time) {
        logDebug('background', 'Removendo reunião:', { url, time });
        const meetings = await this.getMeetings(true);
        const index = meetings.findIndex(m => m.url === url && m.time === time);
        
        if (index === -1) {
            logDebug('background', 'Reunião não encontrada');
            return false;
        }

        meetings.splice(index, 1);
        await chrome.storage.sync.set({ meetings });
        logDebug('background', 'Reunião removida com sucesso');
        return true;
    },

    async completeMeeting(url, exitReason) {
        logDebug('background', 'Completando reunião:', { url, exitReason });
        const meetings = await this.getMeetings(true);
        
        const meeting = meetings.find(m => m.url === url && !m.completed);
        if (meeting) {
            meeting.completed = true;
            meeting.exitReason = exitReason;
            await chrome.storage.sync.set({ meetings });
            logDebug('background', 'Reunião marcada como completa');
        }
    },

    async cleanupOldMeetings() {
        logDebug('background', 'Iniciando limpeza de reuniões antigas...');
        const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
        const meetings = await this.getMeetings(true);
        
        const recentMeetings = meetings.filter(m => 
            !m.completed || m.time > thirtyDaysAgo
        );

        await chrome.storage.sync.set({ meetings: recentMeetings });
        logDebug('background', 'Limpeza concluída');
    }
};

// Initialize extension
chrome.runtime.onInstalled.addListener(async () => {
    logDebug('background', 'Extensão instalada/atualizada - configurando...');
    
    try {
        // Inicializa o sistema de armazenamento
        await StorageManager.initialize();
        
        // Limpa alarmes existentes
        await chrome.alarms.clearAll();
        
        // Recria alarmes para reuniões futuras
        const meetings = await StorageManager.getMeetings();
        logDebug('background', 'Reuniões encontradas:', meetings);
        
        for (const meeting of meetings) {
            if (meeting.time > Date.now()) {
                logDebug('background', 'Criando alarme para reunião existente:', meeting);
                await createAlarmForMeeting(meeting);
            }
        }

        // Agenda limpeza periódica de reuniões antigas
        chrome.alarms.create('cleanup', {
            periodInMinutes: 24 * 60 // Uma vez por dia
        });
        
        logDebug('background', 'Configuração inicial concluída');
    } catch (error) {
        logDebug('background', 'Erro na inicialização:', error);
    }
});

// Listen for alarm triggers
chrome.alarms.onAlarm.addListener(async (alarm) => {
    logDebug('background', 'Alarme disparado:', alarm);
    
    if (alarm.name === 'cleanup') {
        logDebug('background', 'Iniciando limpeza de reuniões antigas...');
        await StorageManager.cleanupOldMeetings();
        return;
    }

    try {
        const meetingData = JSON.parse(alarm.name);
        logDebug('background', 'Verificando reunião:', meetingData);

        // Verifica se a reunião ainda existe no storage
        const meetings = await StorageManager.getMeetings(true);
        const meetingExists = meetings.some(m =>
            m.url === meetingData.url &&
            m.time === meetingData.time &&
            !m.completed
        );

        if (meetingExists) {
            logDebug('background', 'Abrindo reunião:', meetingData);
            // Cria nova aba com a URL do Meet
            const tab = await chrome.tabs.create({
                url: meetingData.url,
                active: true
            });
            logDebug('background', 'Aba criada:', tab);
        } else {
            logDebug('background', 'Reunião não encontrada ou já removida, ignorando alarme');
            // Remove o alarme para garantir
            await chrome.alarms.clear(alarm.name);
        }
    } catch (error) {
        logDebug('background', 'Erro ao processar alarme:', error);
    }
});

// Listen for messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    logDebug('background', 'Mensagem recebida:', message);
    
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
        case 'REMOVE_MEETING_ALARM':
            handleRemoveMeetingAlarm(message.data).then(sendResponse);
            break;
        case 'DEBUG_LOG':
            // Mostra logs do content script
            logDebug(message.data.source, message.data.message);
            break;
        case 'NATIVE_CLICK':
            // Executa clique nativo
            handleNativeClick(message.data, sender.tab.id).then(sendResponse);
            break;
    }
    return true; // Mantém o canal de mensagem aberto para respostas assíncronas
});

// Handler functions
async function handleScheduleMeeting(data) {
    try {
        logDebug('background', 'Agendando nova reunião:', data);
        
        // Salva a reunião e obtém o objeto criado
        const meeting = await StorageManager.scheduleMeeting(data.url, data.time);
        
        if (!meeting) {
            return { success: false, error: 'Reunião já existe' };
        }

        // Cria alarme imediatamente para a nova reunião
        if (meeting.time > Date.now()) {
            logDebug('background', 'Criando alarme para nova reunião:', meeting);
            await createAlarmForMeeting(meeting);
        }
        
        logDebug('background', 'Reunião agendada e alarme criado com sucesso');
        return { success: true };
    } catch (error) {
        logDebug('background', 'Erro ao agendar reunião:', error);
        return { success: false, error: error.message };
    }
}

async function handleUpdateConfig(config) {
    try {
        await StorageManager.updateConfig(config);
        return { success: true };
    } catch (error) {
        logDebug('background', 'Erro ao atualizar configurações:', error);
        return { success: false, error: error.message };
    }
}

async function handleGetConfig() {
    try {
        const config = await StorageManager.getConfig();
        return { success: true, data: config };
    } catch (error) {
        logDebug('background', 'Erro ao obter configurações:', error);
        return { success: false, error: error.message };
    }
}

async function handleCompleteMeeting(data) {
    try {
        await StorageManager.completeMeeting(data.url, data.exitReason);
        return { success: true };
    } catch (error) {
        logDebug('background', 'Erro ao completar reunião:', error);
        return { success: false, error: error.message };
    }
}

// Handler para clique nativo usando chrome.debugger
async function handleNativeClick(data, tabId) {
    try {
        // Anexa debugger
        await chrome.debugger.attach({ tabId }, '1.3');
        
        // Simula mouse move
        await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', {
            type: 'mouseMoved',
            x: data.x,
            y: data.y,
            button: 'left',
            buttons: 1
        });

        // Simula mouse press
        await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', {
            type: 'mousePressed',
            x: data.x,
            y: data.y,
            button: 'left',
            buttons: 1,
            clickCount: 1
        });

        // Simula mouse release
        await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', {
            type: 'mouseReleased',
            x: data.x,
            y: data.y,
            button: 'left',
            buttons: 0,
            clickCount: 1
        });

        // Desanexa debugger
        await chrome.debugger.detach({ tabId });
        
        return { success: true };
    } catch (error) {
        logDebug('background', 'Erro ao executar clique nativo:', error);
        try {
            await chrome.debugger.detach({ tabId });
        } catch {}
        return { success: false, error: error.message };
    }
}

// Helper functions
async function createAlarmForMeeting(meeting) {
    logDebug('background', 'Criando alarme para:', meeting);
    
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
    
    logDebug('background', 'Alarme criado com sucesso:', alarmName);
}

// Handler para remover alarme de uma reunião
async function handleRemoveMeetingAlarm(data) {
    try {
        const alarmName = JSON.stringify({
            url: data.url,
            time: data.time
        });
        
        logDebug('background', 'Removendo alarme:', alarmName);
        await chrome.alarms.clear(alarmName);
        
        return { success: true };
    } catch (error) {
        logDebug('background', 'Erro ao remover alarme:', error);
        return { success: false, error: error.message };
    }
}
