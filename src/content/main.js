// Content script - Meet Auto Leave Extension

// State management
let config = null;
let participantCount = 0;
let peakParticipants = 0;
let joinTime = null;
let exitTimer = null;
let checkTimerInterval = null;
let currentUrl = window.location.href;

// Adiciona um atraso inicial maior para garantir que a página carregou
setTimeout(() => {
    logDebug('Content script iniciando com atraso proposital...');
    initialize();
}, 5000); // 5 segundos de atraso

async function initialize() {
    logDebug('Content script inicializado');
    try {
        // Carrega configuração do storage
        config = await StorageManager.getConfig();
        logDebug('Configuração carregada:', {
            modo: config.exitMode,
            ativo: config.autoExitEnabled,
            showDebug: config.showDebug,
            showExitInfo: config.showExitInfo
        });

        // Atualiza visibilidade do debug container com a configuração inicial
        const debugContainer = document.getElementById('meet-auto-leave-debug');
        if (debugContainer) {
            debugContainer.style.display = config.showDebug ? 'block' : 'none';
        }

        // Inicializa o contador de participantes e pico
        participantCount = 0;
        peakParticipants = 0;

        // Setup message listener for toggles
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            switch (message.type) {
                case 'TOGGLE_DEBUG':
                    const debugContainer = getOrCreateDebugContainer();
                    debugContainer.style.display = message.data.showDebug ? 'block' : 'none';
                    config.showDebug = message.data.showDebug;
                    break;
                case 'TOGGLE_EXIT_INFO':
                    const infoContainer = getOrCreateExitInfoContainer();
                    infoContainer.style.display = message.data.showExitInfo ? 'flex' : 'none';
                    config.showExitInfo = message.data.showExitInfo;
                    break;
                case 'TOGGLE_AUTO_EXIT':
                    config.autoExitEnabled = message.data.autoExitEnabled;
                    logDebug('Saída automática ' + (config.autoExitEnabled ? 'ativada' : 'desativada'));

                    // Se desativado, limpa timers e remove container
                    if (!config.autoExitEnabled) {
                        // Limpa timers
                        if (exitTimer) {
                            clearTimeout(exitTimer);
                            exitTimer = null;
                        }
                        if (checkTimerInterval) {
                            clearInterval(checkTimerInterval);
                            checkTimerInterval = null;
                        }

                        // Remove container
                        const container = document.getElementById('meet-auto-leave-info');
                        if (container) {
                            container.remove();
                        }
                    } else {
                        // Se ativado, inicia o sistema para qualquer modo
                        startExitTimer();
                    }
                    break;
                case 'CONFIG_UPDATED':
                    const oldConfig = { ...config };
                    config = message.data.config;
                    logDebug('Configurações atualizadas:', {
                        modoAnterior: oldConfig.exitMode,
                        modoNovo: config.exitMode,
                        ativo: config.autoExitEnabled
                    });

                    // Limpa timers existentes
                    if (exitTimer) {
                        clearTimeout(exitTimer);
                        exitTimer = null;
                    }
                    if (checkTimerInterval) {
                        clearInterval(checkTimerInterval);
                        checkTimerInterval = null;
                    }

                    // Se a saída automática estiver ativada, inicia o sistema
                    if (config.autoExitEnabled) {
                        startExitTimer();
                    } else {
                        // Remove container se saída automática estiver desativada
                        const container = document.getElementById('meet-auto-leave-info');
                        if (container) {
                            container.remove();
                        }
                    }
                    break;
            }
            sendResponse({ success: true });
            return true;
        });

        // Tenta entrar na reunião primeiro
        logDebug('Tentando entrar na reunião primeiro');
        await autoJoin();

        // Depois configura os observers
        setupParticipantObserver();
        setupReactionObserver();
    } catch (error) {
        logDebug('Erro ao inicializar:', error);
    }
}
