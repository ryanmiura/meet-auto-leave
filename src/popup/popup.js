// Popup script - Meet Auto Leave Extension

document.addEventListener('DOMContentLoaded', initialize);

//!* IDs dos formulários definidos no popup.html
const scheduleForm = document.getElementById('scheduleForm');
const configForm = document.getElementById('configForm');
const status = document.getElementById('status');
const meetingsList = document.getElementById('meetingsList');
const showDebugToggle = document.getElementById('showDebug');

// Elementos das abas
const tabButtons = document.querySelectorAll('.tab-button');
const tabContents = document.querySelectorAll('.tab-content');

async function initialize() {
    try {
        // Carregar configurações atuais
        const config = await StorageManager.getConfig();
        populateConfigForm(config);

        // Carregar e exibir reuniões agendadas
        await updateMeetingsList();

        //!* ID do input de data/hora definido no popup.html
        const meetTime = document.getElementById('meetTime');
        
        // Configura data/hora mínima (momento atual)
        const now = new Date();
        now.setSeconds(0); // Zera apenas os segundos
        
        // Converte para string local ISO
        const localISOString = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
            .toISOString()
            .slice(0, 16);
        
        meetTime.min = localISOString;
        meetTime.value = localISOString;

        // Adicionar event listeners
        scheduleForm.addEventListener('submit', handleScheduleSubmit);
        configForm.addEventListener('submit', handleConfigSubmit);
        meetingsList.addEventListener('click', handleMeetingClick);
        showDebugToggle.addEventListener('change', handleDebugToggle);
        
        // Event listeners das abas
        tabButtons.forEach(button => {
            button.addEventListener('click', () => switchTab(button.dataset.tab));
        });

        // Restaurar última aba ativa
        const lastTab = localStorage.getItem('lastActiveTab') || 'auto-join';
        switchTab(lastTab);
    } catch (error) {
        showStatus('Erro ao inicializar: ' + error.message, 'error');
    }
}

// Funções de navegação das abas
function switchTab(tabId) {
    // Remove classe active de todas as abas
    tabButtons.forEach(button => {
        button.classList.remove('active');
        if (button.dataset.tab === tabId) {
            button.classList.add('active');
        }
    });

    // Esconde todos os conteúdos e mostra o selecionado
    tabContents.forEach(content => {
        content.classList.remove('active');
        if (content.id === tabId) {
            content.classList.add('active');
        }
    });

    // Salva a última aba ativa
    localStorage.setItem('lastActiveTab', tabId);
}

// Handlers de formulário
async function handleScheduleSubmit(event) {
    event.preventDefault();

    //!* IDs dos campos do formulário de agendamento definidos no popup.html
    const meetUrl = document.getElementById('meetUrl').value;
    const meetTimeInput = document.getElementById('meetTime').value;
    
    // Converte a string local para timestamp UTC
    const localDate = new Date(meetTimeInput);
    const selectedTime = localDate.getTime();
    const now = Date.now();

    // Validar URL do Meet
    if (!isValidMeetUrl(meetUrl)) {
        showStatus('URL inválida do Google Meet', 'error');
        return;
    }

    // Validar se a data/hora não é no passado ou menos de 5 segundos no futuro
    if (selectedTime <= now) {
        showStatus('A data/hora deve ser no futuro', 'error');
        return;
    }

    if (selectedTime - now < 5000) { // 5000ms = 5 segundos
        showStatus('A reunião deve ser agendada para pelo menos 30 segundos no futuro', 'error');
        return;
    }

    const meetingData = {
        url: meetUrl,
        time: selectedTime
    };

    try {
        // Notifica o background para salvar e criar alarme
        const response = await chrome.runtime.sendMessage({
            type: 'SCHEDULE_MEETING',
            data: meetingData
        });

        if (!response || !response.success) {
            throw new Error(response?.error || 'Erro ao agendar reunião');
        }

        showStatus('Reunião agendada com sucesso!', 'success');
        scheduleForm.reset();
        
        // Reseta o campo de data/hora para o momento atual
        const currentTime = new Date();
        currentTime.setSeconds(0); // Zera apenas os segundos
        const nextLocalISOString = new Date(currentTime.getTime() - currentTime.getTimezoneOffset() * 60000)
            .toISOString()
            .slice(0, 16);
        document.getElementById('meetTime').value = nextLocalISOString;

        // Atualiza a lista de reuniões
        await updateMeetingsList();
    } catch (error) {
        showStatus('Erro ao agendar reunião: ' + error.message, 'error');
    }
}

async function handleConfigSubmit(event) {
    event.preventDefault();

    //!* IDs dos campos do formulário de configuração definidos no popup.html
    const config = {
        timerDuration: parseInt(document.getElementById('timerDuration').value) || 30,
        minParticipants: parseInt(document.getElementById('minParticipants').value) || 2,
        peakPercentage: parseInt(document.getElementById('peakPercentage').value) || 10,
        autoReactThreshold: parseInt(document.getElementById('autoReactThreshold').value) || 5
    };

    try {
        await StorageManager.updateConfig(config);
        showStatus('Configurações salvas com sucesso!', 'success');
    } catch (error) {
        showStatus('Erro ao salvar configurações: ' + error.message, 'error');
    }
}

// Handler para cliques na lista de reuniões
async function handleMeetingClick(event) {
    const removeButton = event.target.closest('.btn-remove');
    if (!removeButton) return;

    const meetingItem = event.target.closest('.meeting-item');
    const meetingData = {
        url: meetingItem.dataset.url,
        time: parseInt(meetingItem.dataset.time)
    };

    try {
        const removed = await StorageManager.removeMeeting(meetingData.url, meetingData.time);
        if (removed) {
            await updateMeetingsList();
            showStatus('Reunião removida com sucesso!', 'success');
        }
    } catch (error) {
        showStatus('Erro ao remover reunião: ' + error.message, 'error');
    }
}

// Funções auxiliares
function isValidMeetUrl(url) {
    try {
        const meetUrl = new URL(url);
        return meetUrl.hostname === 'meet.google.com';
    } catch {
        return false;
    }
}

function populateConfigForm(config) {
    //!* IDs dos campos do formulário de configuração definidos no popup.html
    document.getElementById('timerDuration').value = config.timerDuration;
    document.getElementById('minParticipants').value = config.minParticipants;
    document.getElementById('peakPercentage').value = config.peakPercentage;
    document.getElementById('autoReactThreshold').value = config.autoReactThreshold;
    document.getElementById('showDebug').checked = config.showDebug;
}

function showStatus(message, type) {
    status.className = 'status show';
    status.classList.add(`status-${type}`);
    //!* Classe do elemento de mensagem de status definida no popup.html
    status.querySelector('.status-message').textContent = message;

    setTimeout(() => {
        status.className = 'status hidden';
    }, 3000);
}

async function updateMeetingsList() {
    const meetings = await StorageManager.getMeetings();
    
    if (!meetings || meetings.length === 0) {
        meetingsList.innerHTML = '<div class="no-meetings">Nenhuma reunião agendada</div>';
        return;
    }

    // Ordena reuniões por data
    meetings.sort((a, b) => a.time - b.time);

    // Filtra reuniões duplicadas
    const uniqueMeetings = meetings.filter((meeting, index, self) =>
        index === self.findIndex(m => m.url === meeting.url && m.time === meeting.time)
    );

    // Cria HTML para cada reunião
    const now = Date.now();
    const meetingsHtml = uniqueMeetings.map(meeting => {
        const date = new Date(meeting.time);
        const isPast = meeting.time < now;
        const formattedDate = formatDateTime(date);
        const timeFromNow = formatTimeFromNow(meeting.time);
        
        return `
            <div class="meeting-item ${isPast ? 'completed' : ''}" 
                 data-url="${meeting.url}" 
                 data-time="${meeting.time}">
                <div class="meeting-time">
                    ${formattedDate}
                    <span class="time-from-now">(${timeFromNow})</span>
                </div>
                <div class="meeting-url">${meeting.url}</div>
                <div class="meeting-remove">
                    <button class="btn-remove" title="Remover reunião">
                        Remover
                    </button>
                </div>
            </div>
        `;
    }).join('');

    meetingsList.innerHTML = meetingsHtml;
}

function formatDateTime(date) {
    const options = {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    };
    return new Intl.DateTimeFormat('pt-BR', options).format(date);
}

function formatTimeFromNow(timestamp) {
    const now = Date.now();
    const diff = timestamp - now;
    const seconds = Math.floor(diff / 1000);
    
    if (seconds < 60) {
        return `em ${seconds} segundo${seconds !== 1 ? 's' : ''}`;
    }
    
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) {
        const remainingSeconds = seconds % 60;
        return `em ${minutes} minuto${minutes !== 1 ? 's' : ''} e ${remainingSeconds} segundo${remainingSeconds !== 1 ? 's' : ''}`;
    }
    
    const hours = Math.floor(minutes / 60);
    if (hours < 24) {
        return `em ${hours} hora${hours !== 1 ? 's' : ''}`;
    }
    
    const days = Math.floor(hours / 24);
    return `em ${days} dia${days !== 1 ? 's' : ''}`;
}

// Handler para toggle de debug
async function handleDebugToggle(event) {
    try {
        const config = await StorageManager.getConfig();
        config.showDebug = event.target.checked;
        await StorageManager.updateConfig(config);
        
        // Notifica a content script sobre a mudança
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.url?.includes('meet.google.com')) {
            await chrome.tabs.sendMessage(tab.id, {
                type: 'TOGGLE_DEBUG',
                data: { showDebug: config.showDebug }
            });
        }
    } catch (error) {
        showStatus('Erro ao atualizar configuração de debug: ' + error.message, 'error');
    }
}