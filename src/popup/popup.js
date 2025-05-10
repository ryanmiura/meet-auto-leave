// Popup script - Meet Auto Leave Extension

document.addEventListener('DOMContentLoaded', initialize);

//!* IDs dos formulários definidos no popup.html
const scheduleForm = document.getElementById('scheduleForm');
const configForm = document.getElementById('configForm');
const status = document.getElementById('status');
const meetingsList = document.getElementById('meetingsList');

async function initialize() {
    try {
        // Carregar configurações atuais
        const config = await StorageManager.getConfig();
        populateConfigForm(config);

        // Carregar e exibir reuniões agendadas
        await updateMeetingsList();

        //!* ID do input de data/hora definido no popup.html
        const meetTime = document.getElementById('meetTime');
        
        // Configura data/hora mínima (próximo minuto)
        const now = new Date();
        now.setMinutes(now.getMinutes() + 1, 0, 0); // Próximo minuto, zerando segundos
        
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
    } catch (error) {
        showStatus('Erro ao inicializar: ' + error.message, 'error');
    }
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

    // Validar se a data/hora não é no passado ou menos de 1 minuto no futuro
    if (selectedTime <= now) {
        showStatus('A data/hora deve ser no futuro', 'error');
        return;
    }

    if (selectedTime - now < 60000) { // 60000ms = 1 minuto
        showStatus('A reunião deve ser agendada para pelo menos 1 minuto no futuro', 'error');
        return;
    }

    try {
        await StorageManager.scheduleMeeting(meetUrl, selectedTime);
        await updateMeetingsList(); // Atualiza a lista após agendar
        showStatus('Reunião agendada com sucesso!', 'success');
        scheduleForm.reset();
        
        // Reseta o campo de data/hora para o próximo minuto
        const nextMinute = new Date();
        nextMinute.setMinutes(nextMinute.getMinutes() + 1, 0, 0);
        const nextLocalISOString = new Date(nextMinute.getTime() - nextMinute.getTimezoneOffset() * 60000)
            .toISOString()
            .slice(0, 16);
        document.getElementById('meetTime').value = nextLocalISOString;
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
    
    if (meetings.length === 0) {
        meetingsList.innerHTML = '<div class="no-meetings">Nenhuma reunião agendada</div>';
        return;
    }

    // Ordena reuniões por data
    meetings.sort((a, b) => a.time - b.time);

    // Cria HTML para cada reunião
    const now = Date.now();
    const meetingsHtml = meetings.map(meeting => {
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
        hour12: false
    };
    return new Intl.DateTimeFormat('pt-BR', options).format(date);
}

function formatTimeFromNow(timestamp) {
    const now = Date.now();
    const diff = timestamp - now;
    const minutes = Math.floor(diff / 60000);
    
    if (minutes < 60) {
        return `em ${minutes} minuto${minutes !== 1 ? 's' : ''}`;
    }
    
    const hours = Math.floor(minutes / 60);
    if (hours < 24) {
        return `em ${hours} hora${hours !== 1 ? 's' : ''}`;
    }
    
    const days = Math.floor(hours / 24);
    return `em ${days} dia${days !== 1 ? 's' : ''}`;
}