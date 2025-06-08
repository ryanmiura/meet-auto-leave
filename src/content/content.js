// Content script - Meet Auto Leave Extension

// Função para log que envia para o background também
function logDebug(...args) {
    // Log local na página do Meet com highlight especial
    const style = 'background: #1a73e8; color: white; padding: 2px 5px; border-radius: 3px;';
    console.log('%c[Meet Auto Leave]', style, ...args);
    
    // Log persistente na página (aparece no topo)
    const debugContainer = getOrCreateDebugContainer();
    const logLine = document.createElement('div');
    logLine.textContent = `[${new Date().toLocaleTimeString()}] ${args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
    ).join(' ')}`;
    debugContainer.insertBefore(logLine, debugContainer.firstChild);

    // Envia para o background script também
    chrome.runtime.sendMessage({
        type: 'DEBUG_LOG',
        data: {
            source: 'content',
            message: args.map(arg => 
                typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
            ).join(' ')
        }
    }).catch(() => {
        console.log('%c[Meet Auto Leave]', style, 'Não foi possível enviar log para background');
    });
}

// Cria ou obtém o container de debug
function getOrCreateDebugContainer() {
    let container = document.getElementById('meet-auto-leave-debug');
    if (!container) {
        container = document.createElement('div');
        container.id = 'meet-auto-leave-debug';
        container.style.display = config?.showDebug ? 'block' : 'none';
        Object.assign(container.style, {
            position: 'fixed',
            top: '10px',
            right: '10px',
            zIndex: '9999',
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            color: 'white',
            padding: '10px',
            borderRadius: '5px',
            maxHeight: '300px',
            overflowY: 'auto',
            fontSize: '12px',
            fontFamily: 'monospace',
            whiteSpace: 'pre-wrap'
        });
        document.body.appendChild(container);
    }
    return container;
}

// Cria ou obtém o container de informações de saída
function getOrCreateExitInfoContainer() {
    let container = document.getElementById('meet-auto-leave-info');
    if (!container) {
        container = document.createElement('div');
        container.id = 'meet-auto-leave-info';
        
        // Define display inicial baseado na configuração
        container.style.display = config?.showExitInfo !== false ? 'flex' : 'none';

        // Adiciona título
        const title = document.createElement('div');
        title.className = 'info-title';
        title.textContent = 'Meet Auto Leave';
        container.appendChild(title);

        // Adiciona conteúdo
        const content = document.createElement('div');
        content.id = 'meet-auto-leave-info-content';
        container.appendChild(content);

        document.body.appendChild(container);
    }
    return container;
}

// Atualiza as informações de saída
function updateExitInfo(timeLeft = null) {
    try {
        // Verifica se deve mostrar o container
        if (!config?.autoExitEnabled || config?.showExitInfo === false) {
            const container = document.getElementById('meet-auto-leave-info');
            if (container) {
                container.remove();
            }
            return;
        }

        const container = getOrCreateExitInfoContainer();
        const content = container.querySelector('#meet-auto-leave-info-content');
        if (!content) {
            logDebug('Erro: Container de conteúdo não encontrado');
            return;
        }

        // Define o conteúdo baseado no modo de saída
        switch(config.exitMode) {
            case 'timer':
                if (typeof timeLeft !== 'number') {
                    logDebug('Aviso: timeLeft não especificado para modo timer');
                    return;
                }
                updateTimerInfo(content, timeLeft);
                break;
            case 'participants':
                if (typeof participantCount !== 'number' || typeof config.minParticipants !== 'number') {
                    logDebug('Erro: dados de participantes inválidos', {
                        participantCount,
                        minParticipants: config.minParticipants
                    });
                    return;
                }
                updateParticipantsInfo(content);
                break;
            case 'peak':
                if (typeof participantCount !== 'number' || typeof peakParticipants !== 'number') {
                    logDebug('Erro: dados de pico inválidos', {
                        participantCount,
                        peakParticipants
                    });
                    return;
                }
                updatePeakInfo(content);
                break;
            default:
                logDebug('Modo de saída inválido:', config.exitMode);
                return;
        }

        container.style.display = 'flex';
        logDebug('Container atualizado:', {
            modo: config.exitMode,
            participantes: participantCount,
            pico: peakParticipants
        });
    } catch (error) {
        logDebug('Erro ao atualizar container:', error);
    }
}

function updateTimerInfo(content, timeLeft) {
    try {
        const minutes = Math.max(0, Math.floor(timeLeft / 60000));
        const seconds = Math.max(0, Math.floor((timeLeft % 60000) / 1000));
        const isWarning = minutes === 0 && seconds <= 60;
        const isAlert = minutes === 0 && seconds <= 30;

        const template = `
            <div class="exit-mode">Modo: Saída por tempo</div>
            <div class="mode-timer">
                <div class="countdown ${isAlert ? 'alert-state' : isWarning ? 'warning-state' : ''}">
                    ${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}
                </div>
            </div>
        `;

        content.innerHTML = template;
    } catch (error) {
        logDebug('Erro ao atualizar timer:', error);
    }
}

function updateParticipantsInfo(content) {
    try {
        const difference = participantCount - config.minParticipants;
        const isWarning = difference <= 2 && difference > 0;
        const isAlert = difference <= 0;

        const template = `
            <div class="exit-mode">Modo: Saída por participantes</div>
            <div class="mode-participants">
                <div class="info-grid ${isAlert ? 'alert-state' : isWarning ? 'warning-state' : ''}">
                    <div>Atual: <span class="highlight">${participantCount}</span></div>
                    <div>Mínimo: ${config.minParticipants}</div>
                    <div>Diferença: ${difference}</div>
                </div>
            </div>
        `;

        content.innerHTML = template;
        logDebug('Info de participantes atualizada:', {
            atual: participantCount,
            minimo: config.minParticipants,
            diferenca: difference,
            estado: isAlert ? 'alerta' : isWarning ? 'aviso' : 'normal'
        });
    } catch (error) {
        logDebug('Erro ao atualizar info de participantes:', error);
    }
}

function updatePeakInfo(content) {
    try {
        const currentPercentage = (participantCount / peakParticipants) * 100;
        const exitNumber = Math.ceil(peakParticipants * (config.peakPercentage / 100));
        const isWarning = currentPercentage <= config.peakPercentage + 5;
        const isAlert = currentPercentage <= config.peakPercentage;

        const template = `
            <div class="exit-mode">Modo: Saída por pico</div>
            <div class="mode-peak">
                <div class="info-grid ${isAlert ? 'alert-state' : isWarning ? 'warning-state' : ''}">
                    <div>Pico: <span class="highlight">${peakParticipants}</span></div>
                    <div>Atual: ${participantCount}</div>
                    <div>Meta: ${config.peakPercentage}%</div>
                    <div>Sair em: ${exitNumber}</div>
                </div>
            </div>
        `;

        content.innerHTML = template;
        logDebug('Info de pico atualizada:', {
            pico: peakParticipants,
            atual: participantCount,
            porcentagem: currentPercentage.toFixed(1) + '%',
            meta: config.peakPercentage + '%',
            sairEm: exitNumber,
            estado: isAlert ? 'alerta' : isWarning ? 'aviso' : 'normal'
        });
    } catch (error) {
        logDebug('Erro ao atualizar info de pico:', error);
    }
}

// State management
let config = null;
let participantCount = 0;
let peakParticipants = 0;
let joinTime = null;
let exitTimer = null;
let checkTimerInterval = null;
let currentUrl = window.location.href;

// Seletores para botões e controles
const SELECTORS = {
    JOIN: [
        // Seletor específico do novo layout
        'div[jsname="Qx7uuf"] button.UywwFc-LgbsSe',
        // Seletor pelo texto específico
        'button.UywwFc-LgbsSe span[jsname="V67aGc"]',
        // Seletor mais genérico
        'button.UywwFc-LgbsSe-OWXEXe-dgl2Hf',
        // Fallback
        'button:has(span[jsname="V67aGc"]:contains("Participar agora"))'
    ],
    CONTROLS: {
        MIC: {
            BUTTON: [
                'div[jsname="hw0c9"][role="button"]',
                '[role="button"][aria-label*="microfone"]'
            ]
        },
        CAMERA: {
            BUTTON: [
                'div[jsname="psRWwc"][role="button"]',
                '[role="button"][aria-label*="câmera"]'
            ]
        }
    },
    PARTICIPANTS: {
        COUNTER: [
            '[data-participant-count]',
            '[aria-label*="participant"]',
            '[aria-label*="participante"]'
        ]
    },
    CHAT: {
        BUTTON: [
            '[aria-label*="chat"]',
            '[role="button"][aria-label*="mensagem"]'
        ],
        INPUT: [
            '[aria-label*="Enviar mensagem"]',
            '[aria-label*="Send message"]',
            '[role="textbox"]'
        ]
    },
    LEAVE: [
        '[role="button"][aria-label*="Sair da chamada"]',
        '[role="button"][aria-label*="Leave call"]',
        '[role="button"][aria-label*="Desligar"]'
    ]
};

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

async function autoJoin() {
    logDebug('Iniciando processo de entrada automática');
    try {
        // Configura dispositivos primeiro e só continua se for bem sucedido
        const devicesConfigured = await configureDevices();
        if (!devicesConfigured) {
            logDebug('Não foi possível configurar os dispositivos corretamente. Abortando entrada.');
            return;
        }
        logDebug('Dispositivos configurados com sucesso. Prosseguindo com a entrada.');
        
        // Tenta encontrar e clicar no botão repetidamente
        for (let attempt = 1; attempt <= 5; attempt++) {
            logDebug(`Tentativa ${attempt} de encontrar o botão de participar`);
            const joined = await joinMeeting();
            if (joined) {
                logDebug('Entrada bem sucedida na tentativa', attempt);
                
                // Aguarda 10 segundos para a interface carregar completamente
                logDebug('Aguardando interface da reunião carregar...');
                await new Promise(resolve => setTimeout(resolve, 10000));

                // Inicia o sistema de saída se estiver ativado
                if (config.autoExitEnabled) {
                    const exitSystemStarted = startExitTimer();
                    if (exitSystemStarted) {
                        logDebug('Sistema de saída iniciado com sucesso:', {
                            modo: config.exitMode,
                            container: document.getElementById('meet-auto-leave-info') ? 'presente' : 'ausente'
                        });
                    } else {
                        logDebug('Falha ao iniciar sistema de saída - verifique as configurações');
                    }
                } else {
                    logDebug('Sistema de saída não iniciado - desativado nas configurações');
                }
                
                // Tenta enviar mensagem inicial
                await sendInitialMessage();
                return;
            }
            // Espera 2 segundos entre tentativas
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
        logDebug('Todas as tentativas de entrada falharam');
    } catch (error) {
        logDebug('Erro ao entrar na reunião:', error);
    }
}

async function configureDevices() {
    logDebug('Configurando dispositivos');
    let micConfigured = false;
    let cameraConfigured = false;

    // Função auxiliar para verificar estado do dispositivo
    const checkDeviceState = async (button, deviceName) => {
        // Verifica múltiplos indicadores do estado
        const isMuted = button.getAttribute('data-is-muted') === 'true';
        const hasMutedClass = button.classList.contains('FTMc0c');
        const ariaLabel = button.getAttribute('aria-label') || '';
        const isActivatingLabel = ariaLabel.startsWith('Ativar');
        
        // Considera o dispositivo ativo se TODOS os indicadores mostrarem que está ativo
        const isActive = !isMuted && !hasMutedClass && !isActivatingLabel;
        
        logDebug(`Estado do ${deviceName} após verificação:`, {
            'data-is-muted': isMuted ? 'mutado' : 'ativo',
            'classe FTMc0c': hasMutedClass ? 'presente (mutado)' : 'ausente (ativo)',
            'aria-label': ariaLabel,
            'estado final': isActive ? 'ativo' : 'desativado'
        });
        
        return isActive;
    };

    // Função auxiliar para tentar desativar dispositivo
    const tryDisableDevice = async (button, deviceName) => {
        // Verifica estado inicial
        const initialState = await checkDeviceState(button, deviceName);
        if (!initialState) {
            logDebug(`${deviceName} já está desativado`);
            return true;
        }

        // Cria callback para verificar estado do dispositivo
        const checkDeviceCallback = async () => {
            const state = await checkDeviceState(button, deviceName);
            // Retorna true se o dispositivo está desativado (estado desejado)
            return !state;
        };

        // Tenta desativar usando os métodos de clique
        const success = await clickWithAllMethods(button, checkDeviceCallback);
        if (success) {
            logDebug(`${deviceName} desativado com sucesso`);
            return true;
        } else {
            logDebug(`Não foi possível desativar ${deviceName}`);
            return false;
        }
    };

    // Configura o microfone
    const micButton = await findElement(SELECTORS.CONTROLS.MIC.BUTTON);
    if (micButton) {
        micConfigured = await tryDisableDevice(micButton, 'microfone');
        if (!micConfigured) {
            return false;
        }
    } else {
        logDebug('Botão do microfone não encontrado');
        return false;
    }

    // Configura a câmera
    const cameraButton = await findElement(SELECTORS.CONTROLS.CAMERA.BUTTON);
    if (cameraButton) {
        cameraConfigured = await tryDisableDevice(cameraButton, 'câmera');
        if (!cameraConfigured) {
            return false;
        }
    } else {
        logDebug('Botão da câmera não encontrado');
        return false;
    }

    // Verificação final dupla
    
    const finalMicButton = await findElement(SELECTORS.CONTROLS.MIC.BUTTON);
    const finalCameraButton = await findElement(SELECTORS.CONTROLS.CAMERA.BUTTON);
    
    const micFinalCheck = !await checkDeviceState(finalMicButton, 'microfone (verificação final)');
    const cameraFinalCheck = !await checkDeviceState(finalCameraButton, 'câmera (verificação final)');

    logDebug('Verificação final dos dispositivos:', {
        microfone: micFinalCheck ? 'desativado' : 'ativo',
        camera: cameraFinalCheck ? 'desativada' : 'ativa'
    });

    return micFinalCheck && cameraFinalCheck;
}

async function joinMeeting() {
    logDebug('Procurando botão de participar');

    // Tenta encontrar o botão pelos seletores
    for (const selector of SELECTORS.JOIN) {
        logDebug('Tentando seletor:', selector);
        
        const element = await waitForElement(selector, 5000);
        if (!element) continue;

        // Se encontramos o span, precisamos pegar o botão pai
        const button = element.tagName.toLowerCase() === 'button'
            ? element
            : element.closest('button');

        if (!button) {
            logDebug('Botão pai não encontrado');
            continue;
        }

        // Verifica se o botão tem o texto correto
        const buttonText = button.querySelector('span[jsname="V67aGc"]')?.textContent;
        if (buttonText !== 'Participar agora') {
            logDebug('Botão encontrado mas texto não corresponde');
            continue;
        }

        logDebug('Botão encontrado:', button);

        // Tenta clicar
        if (await clickWithAllMethods(button)) {
            logDebug('Clique bem sucedido');
            joinTime = Date.now();
            return true;
        }
    }

    logDebug('Botão não encontrado ou clique não funcionou');
    return false;
}

// Função para clique direto
async function tryDirectClick(element) {
    try {
        logDebug('Tentando clique direto');
        element.click();
        return true;
    } catch (error) {
        logDebug('Erro no clique direto:', error);
        return false;
    }
}

// Função para clique nativo
async function tryNativeClick(element) {
    try {
        logDebug('Tentando clique nativo');
        const rect = element.getBoundingClientRect();
        const response = await chrome.runtime.sendMessage({
            type: 'NATIVE_CLICK',
            data: {
                x: Math.round(rect.left + rect.width / 2),
                y: Math.round(rect.top + rect.height / 2)
            }
        });
        return response?.success || false;
    } catch (error) {
        logDebug('Erro no clique nativo:', error);
        return false;
    }
}

// Função para eventos de mouse
async function tryMouseEvents(element) {
    try {
        logDebug('Tentando eventos de mouse');
        ['mouseover', 'mousedown', 'mouseup', 'click'].forEach(type => {
            element.dispatchEvent(new MouseEvent(type, {
                bubbles: true,
                cancelable: true,
                view: window
            }));
        });
        return true;
    } catch (error) {
        logDebug('Erro nos eventos de mouse:', error);
        return false;
    }
}

async function clickWithAllMethods(element, checkStateCallback) {
    // Array com todas as funções de clique
    const clickMethods = [
        tryDirectClick,
        tryNativeClick,
        tryMouseEvents
    ];

    // Tenta cada método até um funcionar
    for (const method of clickMethods) {
        const clicked = await method(element);
        if (!clicked) {
            logDebug('Método de clique falhou, tentando próximo...');
            continue;
        }

        // Se tiver callback para verificar estado, aguarda e verifica
        if (checkStateCallback) {
            await new Promise(resolve => setTimeout(resolve, 2000));
            const state = await checkStateCallback();
            if (state) {
                logDebug('Clique bem sucedido e estado verificado');
                return true;
            }
            logDebug('Estado não está correto após clique, tentando próximo método...');
        } else {
            return true;
        }
    }

    return false;
}

async function sendInitialMessage() {
    logDebug('Aguardando 5 segundos adicionais antes de enviar mensagem...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    logDebug('Enviando mensagem inicial');
    try {
        logDebug('Procurando botão do chat');
        for (let attempt = 1; attempt <= 3; attempt++) {
            logDebug(`Tentativa ${attempt} de encontrar o chat`);
            
            const chatButton = await findElement(SELECTORS.CHAT.BUTTON, 5000);
            if (!chatButton) {
                logDebug('Chat não encontrado, tentando novamente...');
                continue;
            }

            logDebug('Botão do chat encontrado, tentando clicar');
            const clicked = await simulateClick(chatButton);
            if (!clicked) {
                logDebug('Falha ao clicar no chat, tentando novamente...');
                continue;
            }

            logDebug('Chat aberto, procurando campo de input');
            const input = await waitForElement(SELECTORS.CHAT.INPUT, 5000);
            if (!input) {
                logDebug('Input do chat não encontrado, tentando novamente...');
                continue;
            }

            logDebug('Enviando mensagem: Olá');
            input.textContent = 'Olá';
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
            
            logDebug('Mensagem enviada com sucesso');
            return true;
        }
        throw new Error('Todas as tentativas de enviar mensagem falharam');
    } catch (error) {
        logDebug('Erro ao enviar mensagem:', error);
    }
}

function setupParticipantObserver() {
    const observer = new MutationObserver(checkParticipants);
    
    for (const selector of SELECTORS.PARTICIPANTS.COUNTER) {
        waitForElement(selector).then(async element => {
            if (element) {
                logDebug('Observer de participantes configurado com seletor:', selector);
                observer.observe(element, {
                    childList: true,
                    characterData: true,
                    subtree: true
                });

                // Processa contagem inicial
                const text = element.textContent;
                const match = text.match(/\d+/);
                if (match) {
                    const initialCount = parseInt(match[0]);
                    if (!isNaN(initialCount)) {
                        logDebug('Contagem inicial de participantes:', initialCount);
                        participantCount = initialCount;
                        peakParticipants = initialCount;

                        // Atualiza o container se estiver em um modo relevante
                        if (config.autoExitEnabled && (config.exitMode === 'participants' || config.exitMode === 'peak')) {
                            updateExitInfo();
                        }

                        // Verifica condições de saída após contagem inicial
                        await checkExitConditions();
                    }
                }
                return;
            }
        });
    }
}

async function checkParticipants(mutations) {
    try {
        let countElement = null;
        for (const selector of SELECTORS.PARTICIPANTS.COUNTER) {
            countElement = document.querySelector(selector);
            if (countElement) break;
        }
        
        if (!countElement) return;

        const text = countElement.textContent;
        const match = text.match(/\d+/);
        if (!match) return;

        const newCount = parseInt(match[0]);
        if (isNaN(newCount)) return;

        if (newCount !== participantCount) {
            logDebug('Número de participantes atualizado:', {
                anterior: participantCount,
                atual: newCount,
                pico: Math.max(peakParticipants, newCount)
            });
            
            // Atualiza contadores
            participantCount = newCount;
            peakParticipants = Math.max(peakParticipants, newCount);
            
            // Atualiza display se estiver nos modos relevantes
            if (config.exitMode === 'participants' || config.exitMode === 'peak') {
                updateExitInfo();
            }
        }

        await checkExitConditions();
    } catch (error) {
        logDebug('Erro ao verificar participantes:', error);
    }
}

function startExitTimer() {
    // Limpa timers existentes primeiro
    if (exitTimer) {
        clearTimeout(exitTimer);
        exitTimer = null;
    }
    if (checkTimerInterval) {
        clearInterval(checkTimerInterval);
        checkTimerInterval = null;
    }

    // Se saída automática estiver desativada, remove o container e retorna
    if (!config.autoExitEnabled) {
        logDebug('Timer não iniciado - Saída automática desativada');
        const container = document.getElementById('meet-auto-leave-info');
        if (container) {
            container.remove();
        }
        return false;
    }

    // Configuração baseada no modo de saída
    switch (config.exitMode) {
        case 'timer':
            if (config.timerDuration > 0) {
                const timeInMs = config.timerDuration * 60 * 1000;
                const exitTime = new Date(Date.now() + timeInMs);
                
                logDebug('Iniciando timer de saída:', {
                    duracaoMinutos: config.timerDuration,
                    horarioSaida: exitTime.toLocaleTimeString()
                });

                exitTimer = setTimeout(() => {
                    logDebug('Timer de saída disparado');
                    exitMeeting('Timer expirou');
                }, timeInMs);

                // Inicia verificação periódica do timer
                checkTimerInterval = setInterval(() => {
                    const timeLeft = exitTime - Date.now();
                    updateExitInfo(timeLeft);
                    
                    // Log a cada minuto em vez de a cada segundo
                    if (timeLeft % 60000 < 1000) {
                        logDebug(`Timer de saída: ${Math.round(timeLeft / 1000 / 60)} minutos restantes`);
                    }
                }, 1000);

                // Atualização inicial
                updateExitInfo(timeInMs);
                return true;
            }
            break;

        case 'participants':
        case 'peak':
            // Apenas atualiza o container com as informações iniciais
            updateExitInfo();
            return true;
    }

    logDebug('Timer não iniciado - Modo ou duração inválidos:', {
        modo: config.exitMode,
        duracao: config.timerDuration
    });
    return false;
}

function setupReactionObserver() {
    // Implementar depois
}

async function checkExitConditions() {
    try {
        if (!config.autoExitEnabled) {
            return;
        }

        switch (config.exitMode) {
            case 'participants':
                const participantsDiff = participantCount - config.minParticipants;
                
                // Log detalhado da situação
                logDebug('Verificando condição de participantes:', {
                    atual: participantCount,
                    minimo: config.minParticipants,
                    diferenca: participantsDiff
                });

                if (participantCount <= config.minParticipants) {
                    logDebug('Condição de saída atingida: mínimo de participantes');
                    await exitMeeting('Número mínimo de participantes atingido');
                }
                // Se estiver próximo do limite, atualiza o container
                else if (participantsDiff <= 3) {
                    updateExitInfo();
                }
                break;

            case 'peak':
                const peakPercentage = (participantCount / peakParticipants) * 100;
                const exitNumber = Math.ceil(peakParticipants * (config.peakPercentage / 100));
                
                // Log detalhado da situação
                logDebug('Verificando condição de pico:', {
                    pico: peakParticipants,
                    atual: participantCount,
                    porcentagem: peakPercentage.toFixed(1) + '%',
                    meta: config.peakPercentage + '%',
                    sairEm: exitNumber
                });

                if (peakPercentage <= config.peakPercentage) {
                    logDebug('Condição de saída atingida: porcentagem do pico');
                    await exitMeeting('Porcentagem do pico atingida');
                }
                // Se estiver próximo do limite, atualiza o container
                else if (peakPercentage <= config.peakPercentage + 5) {
                    updateExitInfo();
                }
                break;

            // Caso 'timer' não precisa ser verificado aqui pois é gerenciado pelo startExitTimer
        }
    } catch (error) {
        logDebug('Erro ao verificar condições de saída:', error);
    }
}

async function exitMeeting(reason) {
    logDebug('Iniciando processo de saída. Motivo:', reason);
    try {
        // Limpa timers primeiro para evitar chamadas duplicadas
        if (exitTimer) {
            logDebug('Limpando timer de saída');
            clearTimeout(exitTimer);
            exitTimer = null;
        }
        
        if (checkTimerInterval) {
            logDebug('Limpando intervalo de verificação');
            clearInterval(checkTimerInterval);
            checkTimerInterval = null;
        }

        // Remove o container de informações
        const infoContainer = document.getElementById('meet-auto-leave-info');
        if (infoContainer) {
            infoContainer.remove();
        }

        await sendChatMessage('Até mais');

        await chrome.runtime.sendMessage({
            type: 'COMPLETE_MEETING',
            data: {
                url: currentUrl,
                exitReason: reason
            }
        });

        const leaveButton = await findElement(SELECTORS.LEAVE);
        if (leaveButton) {
            const clicked = await simulateClick(leaveButton);
            if (clicked) {
                logDebug('Saída da reunião bem sucedida');
            } else {
                logDebug('Falha ao clicar no botão de saída');
                throw new Error('Falha ao clicar no botão de saída');
            }
        } else {
            logDebug('Botão de saída não encontrado');
            throw new Error('Botão de saída não encontrado');
        }

    } catch (error) {
        logDebug('Erro ao sair da reunião:', error);
        // Tenta forçar o fechamento da aba como fallback
        chrome.runtime.sendMessage({
            type: 'FORCE_CLOSE_TAB',
            data: { reason: 'Falha ao sair normalmente: ' + error.message }
        });
    }
}

async function findElement(selectors, timeout = 10000) {
    logDebug('Procurando elemento com seletores:', selectors);
    
    const selectorArray = Array.isArray(selectors) ? selectors : [selectors];
    
    for (const selector of selectorArray) {
        logDebug('Tentando seletor:', selector);
        const element = document.querySelector(selector);
        if (element) {
            logDebug('Elemento encontrado com seletor:', selector);
            return element;
        }
    }

    for (const selector of selectorArray) {
        logDebug('Aguardando elemento aparecer com seletor:', selector);
        const element = await waitForElement(selector, timeout);
        if (element) {
            logDebug('Elemento encontrado após espera com seletor:', selector);
            return element;
        }
    }

    logDebug('Elemento não encontrado com nenhum seletor');
    return null;
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

async function simulateClick(element) {
    if (!element) {
        logDebug('Tentativa de clique em elemento nulo');
        return false;
    }

    try {
        const rect = element.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) {
            logDebug('Elemento tem dimensões zero');
            return false;
        }

        // Tenta clique nativo primeiro
        try {
            const response = await chrome.runtime.sendMessage({
                type: 'NATIVE_CLICK',
                data: {
                    x: Math.round(rect.left + rect.width / 2),
                    y: Math.round(rect.top + rect.height / 2)
                }
            });
            if (response?.success) {
                logDebug('Clique nativo bem sucedido');
                return true;
            }
        } catch (error) {
            logDebug('Erro no clique nativo:', error);
        }

        // Se falhar, tenta outros métodos
        const methods = [
            {
                name: 'click()',
                fn: () => element.click()
            },
            {
                name: 'MouseEvent',
                fn: () => element.dispatchEvent(new MouseEvent('click', { 
                    bubbles: true,
                    cancelable: true,
                    composed: true
                }))
            },
            {
                name: 'complete simulation',
                fn: () => {
                    ['mouseover', 'mousedown', 'mouseup', 'click'].forEach(type => {
                        element.dispatchEvent(new MouseEvent(type, {
                            bubbles: true,
                            cancelable: true,
                            composed: true,
                            view: window
                        }));
                    });
                }
            }
        ];

        for (const method of methods) {
            try {
                logDebug('Tentando método de clique:', method.name);
                await method.fn();
                logDebug('Clique bem sucedido com método:', method.name);
                return true;
            } catch (e) {
                logDebug('Método de clique falhou:', method.name, e);
                continue;
            }
        }

        logDebug('Todos os métodos de clique falharam');
        return false;
    } catch (error) {
        logDebug('Erro ao simular clique:', error);
        return false;
    }
}