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
