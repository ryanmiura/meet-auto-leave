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
