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
        const initialDisplay = config?.showExitInfo !== false ? 'flex' : 'none';
        Object.assign(container.style, {
            position: 'fixed',
            bottom: '20px',
            left: '20px',
            zIndex: '9999',
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            color: 'white',
            padding: '10px',
            borderRadius: '5px',
            fontSize: '14px',
            fontFamily: 'Arial, sans-serif',
            boxShadow: '0 2px 5px rgba(0, 0, 0, 0.2)',
            display: initialDisplay,
            flexDirection: 'column',
            gap: '5px',
            minWidth: '200px',
            backdropFilter: 'blur(5px)',
            border: '1px solid rgba(255, 255, 255, 0.1)'
        });

        // Adiciona título
        const title = document.createElement('div');
        title.style.fontWeight = 'bold';
        title.style.marginBottom = '5px';
        title.textContent = '🕒 Meet Auto Leave';
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
function updateExitInfo(timeLeft) {
    // Se saída automática estiver desativada ou modo não for timer,
    // remove o container se existir e retorna
    if (!config.autoExitEnabled || config.exitMode !== 'timer') {
        const container = document.getElementById('meet-auto-leave-info');
        if (container) {
            container.remove();
        }
        return;
    }

    // Se container não deve ser mostrado, remove e retorna
    if (config.showExitInfo === false) {
        const container = document.getElementById('meet-auto-leave-info');
        if (container) {
            container.remove();
        }
        return;
    }

    const container = getOrCreateExitInfoContainer();
    const content = container.querySelector('#meet-auto-leave-info-content');

    // Atualiza o conteúdo do container
    const minutes = Math.max(0, Math.floor(timeLeft / 60000));
    const seconds = Math.max(0, Math.floor((timeLeft % 60000) / 1000));
    content.innerHTML = `
        <div style="opacity: 0.8">Modo: Saída por tempo</div>
        <div style="font-size: 16px; font-weight: bold">
            ${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}
        </div>
    `;
    container.style.display = 'flex';
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
        // Get configuration from storage
        config = await StorageManager.getConfig();
        logDebug('Configuração carregada:', config);
        
        // Atualiza visibilidade do debug container com a configuração inicial
        const debugContainer = document.getElementById('meet-auto-leave-debug');
        if (debugContainer) {
            debugContainer.style.display = config.showDebug ? 'block' : 'none';
        }

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
                    } else if (config.exitMode === 'timer' && config.timerDuration > 0) {
                        // Se ativado e modo timer, reinicia o timer
                        startExitTimer();
                    }
                    break;
                case 'CONFIG_UPDATED':
                    // Atualiza configuração local
                    config = message.data.config;
                    logDebug('Configurações atualizadas:', config);
                    
                    // Se estiver no modo timer e estiver ativado, reinicia o timer
                    if (config.autoExitEnabled && config.exitMode === 'timer') {
                        // Limpa timers existentes
                        if (exitTimer) {
                            clearTimeout(exitTimer);
                            exitTimer = null;
                        }
                        if (checkTimerInterval) {
                            clearInterval(checkTimerInterval);
                            checkTimerInterval = null;
                        }
                        
                        // Inicia novo timer
                        startExitTimer();
                    } else {
                        // Remove container se não estiver no modo timer
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

                // Inicia o timer de saída e verifica se foi iniciado com sucesso
                const timerStarted = startExitTimer();
                if (timerStarted) {
                    logDebug('Timer de saída iniciado com sucesso');
                } else {
                    logDebug('Falha ao iniciar timer de saída - verifique as configurações');
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
        waitForElement(selector).then(element => {
            if (element) {
                logDebug('Observer de participantes configurado com seletor:', selector);
                observer.observe(element, { 
                    childList: true, 
                    characterData: true, 
                    subtree: true 
                });
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
            logDebug('Número de participantes atualizado:', newCount);
            participantCount = newCount;
            peakParticipants = Math.max(peakParticipants, newCount);
        }

        await checkExitConditions();
    } catch (error) {
        logDebug('Erro ao verificar participantes:', error);
    }
}

function startExitTimer() {
    if (!config.autoExitEnabled) {
        logDebug('Timer não iniciado - Saída automática desativada');
        return false;
    }

    if (config.exitMode === 'timer' && config.timerDuration > 0) {
        const timeInMs = config.timerDuration * 60 * 1000;
        const exitTime = new Date(Date.now() + timeInMs);
        
        logDebug('Iniciando timer de saída:', {
            duracaoMinutos: config.timerDuration,
            horarioSaida: exitTime.toLocaleTimeString()
        });

        if (exitTimer) {
            logDebug('Timer anterior encontrado, limpando...');
            clearTimeout(exitTimer);
        }

        exitTimer = setTimeout(() => {
            logDebug('Timer de saída disparado');
            exitMeeting('Timer expirou');
        }, timeInMs);

        // Limpa intervalos anteriores se existirem
        if (checkTimerInterval) {
            clearInterval(checkTimerInterval);
            checkTimerInterval = null;
        }

        // Inicia verificação periódica do timer e atualização do container
        checkTimerInterval = setInterval(() => {
            const timeLeft = exitTime - Date.now();
            updateExitInfo(timeLeft);
            logDebug(`Timer de saída: ${Math.round(timeLeft / 1000 / 60)} minutos restantes`);
        }, 1000); // Atualiza a cada segundo para ter um timer mais suave

        // Atualização inicial
        updateExitInfo(timeInMs);

        return true;
    } else {
        logDebug('Timer não iniciado - Modo ou duração inválidos:', {
            modo: config.exitMode,
            duracao: config.timerDuration
        });
        return false;
    }
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
                if (participantCount <= config.minParticipants) {
                    logDebug('Condição de saída atingida: mínimo de participantes');
                    await exitMeeting('Número mínimo de participantes atingido');
                }
                break;

            case 'peak':
                const peakPercentage = (participantCount / peakParticipants) * 100;
                if (peakPercentage <= config.peakPercentage) {
                    logDebug('Condição de saída atingida: porcentagem do pico');
                    await exitMeeting('Porcentagem do pico atingida');
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