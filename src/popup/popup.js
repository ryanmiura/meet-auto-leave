// Popup script - Meet Auto Leave Extension

document.addEventListener('DOMContentLoaded', initialize);

// Elementos do DOM
const scheduleForm = document.getElementById('scheduleForm');
const configForm = document.getElementById('configForm');
const status = document.getElementById('status');

async function initialize() {
    // Carregar configurações atuais
    const config = await getConfiguration();
    populateConfigForm(config);

    // Configurar data mínima para agendamento
    const meetTime = document.getElementById('meetTime');
    meetTime.min = new Date().toISOString().slice(0, 16);

    // Adicionar event listeners
    scheduleForm.addEventListener('submit', handleScheduleSubmit);
    configForm.addEventListener('submit', handleConfigSubmit);
}

// Handlers de formulário
async function handleScheduleSubmit(event) {
    event.preventDefault();

    const meetUrl = document.getElementById('meetUrl').value;
    const meetTime = document.getElementById('meetTime').value;

    // Validar URL do Meet
    if (!isValidMeetUrl(meetUrl)) {
        showStatus('URL inválida do Google Meet', 'error');
        return;
    }

    try {
        await scheduleMeeting({
            url: meetUrl,
            time: new Date(meetTime).getTime()
        });

        showStatus('Reunião agendada com sucesso!', 'success');
        scheduleForm.reset();
    } catch (error) {
        showStatus('Erro ao agendar reunião: ' + error.message, 'error');
    }
}

async function handleConfigSubmit(event) {
    event.preventDefault();

    const config = {
        timerDuration: parseInt(document.getElementById('timerDuration').value) || 30,
        minParticipants: parseInt(document.getElementById('minParticipants').value) || 2,
        peakPercentage: parseInt(document.getElementById('peakPercentage').value) || 10,
        autoReactThreshold: parseInt(document.getElementById('autoReactThreshold').value) || 5
    };

    try {
        await updateConfiguration(config);
        showStatus('Configurações salvas com sucesso!', 'success');
    } catch (error) {
        showStatus('Erro ao salvar configurações: ' + error.message, 'error');
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
    document.getElementById('timerDuration').value = config.timerDuration;
    document.getElementById('minParticipants').value = config.minParticipants;
    document.getElementById('peakPercentage').value = config.peakPercentage;
    document.getElementById('autoReactThreshold').value = config.autoReactThreshold;
}

function showStatus(message, type) {
    status.className = 'status show';
    status.classList.add(`status-${type}`);
    status.querySelector('.status-message').textContent = message;

    setTimeout(() => {
        status.className = 'status hidden';
    }, 3000);
}

// Comunicação com background script
function getConfiguration() {
    return new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: 'GET_CONFIG' }, (config) => {
            resolve(config);
        });
    });
}

function updateConfiguration(config) {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ 
            type: 'UPDATE_CONFIG', 
            data: config 
        }, (response) => {
            if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
            } else {
                resolve(response);
            }
        });
    });
}

function scheduleMeeting(meetingData) {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
            type: 'SCHEDULE_MEETING',
            data: meetingData
        }, (response) => {
            if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
            } else {
                resolve(response);
            }
        });
    });
}