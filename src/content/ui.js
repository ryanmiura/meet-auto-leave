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
