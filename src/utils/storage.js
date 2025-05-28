// Storage Manager - Meet Auto Leave Extension

// Configurações padrão
const DEFAULT_CONFIG = {
  exitMode: 'timer',
  timerDuration: 30,
  minParticipants: 2,
  peakPercentage: 10,
  autoReactThreshold: 5,
  showExitInfo: true,     // Container de informações de saída ativado por padrão
  showDebug: false,       // Container de debug desativado por padrão
  autoExitEnabled: true   // Saída automática ativada por padrão
};

// Exporta diretamente no objeto window para uso em outros scripts
window.StorageManager = {
  /**
   * Inicializa o armazenamento com valores padrão se necessário
   */
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

  /**
   * Obtém as configurações atuais
   * @returns {Promise<Config>}
   */
  async getConfig() {
    const data = await chrome.storage.sync.get('config');
    return data.config || DEFAULT_CONFIG;
  },

  /**
   * Atualiza as configurações
   * @param {Config} newConfig - Novas configurações
   */
  async updateConfig(newConfig) {
    // Valida e sanitiza os valores
    const sanitizedConfig = {
      exitMode: ['timer', 'participants', 'peak'].includes(newConfig.exitMode)
        ? newConfig.exitMode
        : DEFAULT_CONFIG.exitMode,
      timerDuration: Math.max(0, parseInt(newConfig.timerDuration) || DEFAULT_CONFIG.timerDuration),
      minParticipants: Math.max(1, parseInt(newConfig.minParticipants) || DEFAULT_CONFIG.minParticipants),
      peakPercentage: Math.min(100, Math.max(1, parseInt(newConfig.peakPercentage) || DEFAULT_CONFIG.peakPercentage)),
      autoReactThreshold: Math.max(1, parseInt(newConfig.autoReactThreshold) || DEFAULT_CONFIG.autoReactThreshold),
      showExitInfo: typeof newConfig.showExitInfo === 'boolean' ? newConfig.showExitInfo : DEFAULT_CONFIG.showExitInfo,
      showDebug: Boolean(newConfig.showDebug),
      autoExitEnabled: typeof newConfig.autoExitEnabled === 'boolean' ? newConfig.autoExitEnabled : DEFAULT_CONFIG.autoExitEnabled
    };

    await chrome.storage.sync.set({ config: sanitizedConfig });
  },

  /**
   * Obtém todas as reuniões agendadas
   * @param {boolean} [includeCompleted=false] - Se deve incluir reuniões já realizadas
   * @returns {Promise<ScheduledMeeting[]>}
   */
  async getMeetings(includeCompleted = false) {
    const data = await chrome.storage.sync.get('meetings');
    const meetings = data.meetings || [];
    
    if (!includeCompleted) {
      return meetings.filter(m => !m.completed);
    }
    return meetings;
  },

  /**
   * Agenda uma nova reunião
   * @param {string} url - URL do Google Meet
   * @param {number} time - Timestamp da reunião
   */
  async scheduleMeeting(url, time) {
    const meetings = await this.getMeetings(true);
    
    // Adiciona nova reunião
    meetings.push({
      url,
      time,
      completed: false
    });

    // Ordena por data
    meetings.sort((a, b) => a.time - b.time);

    // Limita a 50 reuniões para não sobrecarregar o storage
    const limitedMeetings = meetings.slice(-50);
    
    await chrome.storage.sync.set({ meetings: limitedMeetings });
  },

  /**
   * Remove uma reunião agendada
   * @param {string} url - URL da reunião
   * @param {number} time - Timestamp da reunião
   * @returns {Promise<boolean>} - true se removido com sucesso
   */
  async removeMeeting(url, time) {
    const meetings = await this.getMeetings(true);
    const index = meetings.findIndex(m => m.url === url && m.time === time);
    
    if (index === -1) {
      return false;
    }

    meetings.splice(index, 1);
    await chrome.storage.sync.set({ meetings });
    return true;
  },

  /**
   * Marca uma reunião como concluída
   * @param {string} url - URL da reunião
   * @param {string} exitReason - Razão da saída
   */
  async completeMeeting(url, exitReason) {
    const meetings = await this.getMeetings(true);
    
    const meeting = meetings.find(m => m.url === url && !m.completed);
    if (meeting) {
      meeting.completed = true;
      meeting.exitReason = exitReason;
      await chrome.storage.sync.set({ meetings });
    }
  },

  /**
   * Remove reuniões antigas (mais de 30 dias)
   */
  async cleanupOldMeetings() {
    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
    const meetings = await this.getMeetings(true);
    
    const recentMeetings = meetings.filter(m => 
      !m.completed || m.time > thirtyDaysAgo
    );

    await chrome.storage.sync.set({ meetings: recentMeetings });
  }
};