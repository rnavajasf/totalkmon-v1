// CONFIGURACIÓN SUPABASE
const SUPABASE_URL = 'https://zlddmiulbfjhwytfkvlw.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpsZGRtaXVsYmZqaHd5dGZrdmx3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY0OTU4ODEsImV4cCI6MjA4MjA3MTg4MX0.61pMT7GbYU9ZpWJjZnsBGrF_Lb9jLX0OkIYf1a6k6GY';
const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_KEY);

// ==========================================
// DICCIONARIOS LOCALES
// ==========================================
const imposterWords = [
    "Hospital", "Cementerio", "Escuela", "Cárcel", "Playa", "Cine", "Discoteca", "Gimnasio", "Biblioteca", "Aeropuerto",
    "Supermercado", "Restaurante", "Iglesia", "Zoológico", "Circo", "Museo", "Piscina", "Banco", "Hotel", "Farmacia",
    "Teléfono", "Cuchara", "Inodoro", "Cama", "Espejo", "Reloj", "Llave", "Gafas", "Zapato", "Calcetín",
    "Pizza", "Sushi", "Hamburguesa", "Huevo", "Pan", "Queso", "Chocolate", "Helado", "Plátano", "Manzana",
    "Perro", "Gato", "Ratón", "León", "Tigre", "Elefante", "Jirafa", "Mono", "Gorila", "Oso",
    "Policía", "Ladrón", "Médico", "Enfermero", "Bombero", "Profesor", "Alumno", "Cocinero", "Camarero", "Piloto"
];

const debateTopics = [
    { title: "Tortilla de Patatas", a: "CON Cebolla", b: "SIN Cebolla" },
    { title: "Pizza", a: "Con Piña", b: "Sin Piña" },
    { title: "Dinero", a: "Da la felicidad", b: "No da la felicidad" },
    { title: "Redes Sociales", a: "Beneficiosas", b: "Tóxicas" },
    { title: "Cine", a: "Doblado", b: "Versión Original" },
    { title: "Vacaciones", a: "Playa", b: "Montaña" },
    { title: "Mentiras", a: "Piadosas son útiles", b: "Siempre la verdad" },
    { title: "Futuro", a: "Optimista", b: "Pesimista" },
    { title: "Trabajo", a: "Remoto", b: "Presencial" },
    { title: "Amor", a: "A primera vista", b: "Se construye" },
    { title: "Videojuegos", a: "Arte", b: "Pérdida de tiempo" },
    { title: "Aliens", a: "Existen", b: "Estamos solos" },
    { title: "Música", a: "Antigua era mejor", b: "Actual es mejor" },
    { title: "Moda", a: "Seguir tendencias", b: "Tener estilo propio" },
    { title: "Inteligencia Artificial", a: "Peligro", b: "Oportunidad" }
];

// ==========================================
// ESTADO GLOBAL
// ==========================================
let currentUser = { id: localStorage.getItem('user_uuid'), name: localStorage.getItem('profile_name')||'Anónimo', avatar: localStorage.getItem('profile_avatar')||'🦊', streak: parseInt(localStorage.getItem('streak')||0), votes: parseInt(localStorage.getItem('profile_votes')||0) };
let allQuestions = [];
let currentCategory = 'aleatorio';
let currentJudgeId = null;
let currentClashId = null;
let clashData = { a: '', b: '', va: 0, vb: 0 };
let adminTapCount = 0;

// PARTY MODE STATE
let currentRoomId = null;
let isHost = false;
let roomSubscription = null;
let selectedGameMode = 'classic';

// SONIDO
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function playSfx(type) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
    osc.connect(gain); gain.connect(audioCtx.destination);
    const now = audioCtx.currentTime;
    if (type === 'click') { osc.frequency.setValueAtTime(600, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1); osc.start(now); osc.stop(now + 0.1); if(navigator.vibrate) navigator.vibrate(5); } 
    else if (type === 'swoosh') { osc.type = 'triangle'; gain.gain.setValueAtTime(0.05, now); gain.gain.linearRampToValueAtTime(0, now + 0.15); osc.start(now); osc.stop(now + 0.15); }
    else if (type === 'success') { [440, 554, 659].forEach((f, i) => { const o = audioCtx.createOscillator(); const g = audioCtx.createGain(); o.connect(g); g.connect(audioCtx.destination); o.frequency.value = f; g.gain.exponentialRampToValueAtTime(0.001, now + 0.5 + (i*0.1)); o.start(now); o.stop(now + 0.5); }); }
}

// ==========================================
// MODO FIESTA (CORE)
// ==========================================
function selectGameMode(mode) {
    playSfx('click');
    selectedGameMode = mode;
    document.querySelectorAll('.mode-option').forEach(el => el.classList.remove('selected'));
    document.getElementById('mode-' + mode).classList.add('selected');
}

async function createRoom() {
    if(!currentUser.id) return alert("Espera a que cargue tu perfil.");
    playSfx('click');
    const code = Math.random().toString(36).substring(2, 6).toUpperCase();
    const { error } = await db.from('rooms').insert({ id: code, host_id: currentUser.id, current_card_text: "¡Sala Creada!", current_card_category: "Esperando...", gamemode: selectedGameMode });
    if(error) return alert("Error al crear sala.");
    await db.from('room_participants').insert({ room_id: code, user_id: currentUser.id, role: 'civilian' });
    currentRoomId = code; isHost = true; enterPartyMode(code, selectedGameMode);
}

async function joinRoom() {
    const code = document.getElementById('join-code').value.toUpperCase().trim();
    if(code.length !== 4) return alert("Código incorrecto.");
    playSfx('click');
    const { data } = await db.from('rooms').select('*').eq('id', code).single();
    if(!data) return alert("Sala no encontrada.");
    await db.from('room_participants').insert({ room_id: code, user_id: currentUser.id, role: 'civilian' });
    currentRoomId = code; isHost = false; 
    enterPartyMode(code, data.gamemode);
}

function enterPartyMode(code, mode) {
    document.getElementById('party-lobby').style.display = 'none';
    document.getElementById('party-active').style.display = 'block';
    document.getElementById('display-room-code').innerText = code;
    
    selectedGameMode = mode;
    updateGameUI(mode);

    if(isHost) { 
        document.getElementById('host-controls').style.display = 'block'; 
        document.getElementById('guest-controls').style.display = 'none'; 
    } else { 
        document.getElementById('host-controls').style.display = 'none'; 
        document.getElementById('guest-controls').style.display = 'block'; 
    }

    roomSubscription = db.channel('room-'+code)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${code}` }, (payload) => {
        handleRoomUpdate(payload.new);
    })
    .subscribe();

    if(!isHost) { db.from('rooms').select('*').eq('id', code).single().then(({data}) => { if(data) handleRoomUpdate(data); }); }
}

function updateGameUI(mode) {
    document.getElementById('party-card-classic').style.display = mode === 'classic' ? 'flex' : 'none';
    document.getElementById('party-card-imposter').style.display = mode === 'imposter' ? 'flex' : 'none';
    document.getElementById('party-card-versus').style.display = mode === 'versus' ? 'flex' : 'none';
}

async function handleRoomUpdate(roomData) {
    if(roomData.gamemode !== selectedGameMode) {
        selectedGameMode = roomData.gamemode;
        updateGameUI(selectedGameMode);
    }

    if(selectedGameMode === 'classic') {
        updateClassicCard(roomData.current_card_text, roomData.current_card_category);
    } 
    else if(selectedGameMode === 'imposter') {
        if(currentUser.id === roomData.imposter_id) updateImposterCard("🤫 ERES EL IMPOSTOR", "Nadie lo sabe. Disimula.");
        else updateImposterCard(roomData.current_card_text, "Palabra Secreta");
    }
    else if(selectedGameMode === 'versus') {
        // En versus, usamos current_card_text como JSON string (chapuza rápida pro) o parseamos
        // Para simplificar, asumimos que 'text' es el Título y 'category' son las opciones separadas por "|"
        // Pero para hacerlo limpio, usaremos lógica determinista basada en el ID del usuario
        updateVersusCard(roomData.current_card_text, roomData.current_card_category);
    }
}

function updateClassicCard(text, category) {
    const card = document.getElementById('party-card-classic');
    triggerFlash(card);
    card.querySelector('.card-inner').style.opacity = '0';
    setTimeout(() => {
        document.getElementById('party-text').innerText = text;
        document.getElementById('party-cat').innerText = category;
        card.querySelector('.card-inner').style.opacity = '1';
    }, 200);
}

function updateImposterCard(mainText, subText) {
    const card = document.getElementById('party-card-imposter');
    triggerFlash(card);
    document.getElementById('imposter-role-text').innerText = mainText;
    document.getElementById('imposter-role-text').style.filter = 'blur(15px)';
    card.querySelector('.hint').innerText = subText;
}

function updateVersusCard(title, optionsStr) {
    const card = document.getElementById('party-card-versus');
    triggerFlash(card);
    const box = document.getElementById('versus-role-box');
    const roleText = document.getElementById('versus-role-text');
    
    // Parse options (formato: "Opción A|Opción B")
    const parts = optionsStr ? optionsStr.split('|') : ["A", "B"];
    const optA = parts[0] || "A";
    const optB = parts[1] || "B";

    document.getElementById('versus-main-text').innerText = title;
    
    // Determinismo: Usamos el ID del usuario para asignar equipo
    // Sumamos los códigos ASCII del ID para saber si es par o impar
    let sum = 0;
    for(let i=0; i<currentUser.id.length; i++) sum += currentUser.id.charCodeAt(i);
    const isTeamA = sum % 2 === 0;

    box.classList.remove('team-a-style', 'team-b-style');
    if(isTeamA) {
        box.classList.add('team-a-style');
        roleText.innerText = "DEFENDER: " + optA;
    } else {
        box.classList.add('team-b-style');
        roleText.innerText = "DEFENDER: " + optB;
    }
}

function triggerFlash(element) {
    element.classList.remove('flash-animation');
    void element.offsetWidth;
    element.classList.add('flash-animation');
    playSfx('swoosh');
    if(navigator.vibrate) navigator.vibrate([50, 50, 50]);
}

// CONTROL DEL ANFITRIÓN
async function partyNextRound() {
    if(!isHost) return;
    playSfx('click');

    if(selectedGameMode === 'classic') {
        const random = allQuestions[Math.floor(Math.random() * allQuestions.length)];
        await db.from('rooms').update({ current_card_text: random.text, current_card_category: random.category }).eq('id', currentRoomId);
    } 
    else if(selectedGameMode === 'imposter') {
        const secretWord = imposterWords[Math.floor(Math.random() * imposterWords.length)];
        const { data: participants } = await db.from('room_participants').select('user_id').eq('room_id', currentRoomId);
        let imposter = (!participants || participants.length < 2) ? currentUser.id : participants[Math.floor(Math.random() * participants.length)].user_id;
        await db.from('rooms').update({ current_card_text: secretWord, imposter_id: imposter, game_state: 'playing' }).eq('id', currentRoomId);
    }
    else if(selectedGameMode === 'versus') {
        const debate = debateTopics[Math.floor(Math.random() * debateTopics.length)];
        // Guardamos las opciones en el campo 'category' separadas por '|' para enviarlas a los clientes
        await db.from('rooms').update({ 
            current_card_text: debate.title, 
            current_card_category: `${debate.a}|${debate.b}` 
        }).eq('id', currentRoomId);
    }
}

function exitRoom() {
    if(roomSubscription) db.removeChannel(roomSubscription);
    if(currentRoomId && currentUser.id) { db.from('room_participants').delete().match({ room_id: currentRoomId, user_id: currentUser.id }); }
    currentRoomId = null; isHost = false;
    document.getElementById('party-lobby').style.display = 'block';
    document.getElementById('party-active').style.display = 'none';
    document.getElementById('join-code').value = "";
}

// CORE & UTILS
function triggerAdminUnlock() {
    adminTapCount++;
    if (adminTapCount === 5) { if(prompt("🔐 PIN:") === "2025") { alert("CEO Mode."); switchTab('admin'); loadAdminStats(); fetchAdminModeration(); } adminTapCount = 0; }
}
async function loadAdminStats() {
    const { count: u } = await db.from('profiles').select('*', { count: 'exact', head: true });
    const { count: p } = await db.from('suggestions').select('*', { count: 'exact', head: true });
    if(document.getElementById('admin-users')) document.getElementById('admin-users').innerText = u||0;
    if(document.getElementById('admin-pending')) document.getElementById('admin-pending').innerText = p||0;
}
async function adminCreateClash() {
    const a = document.getElementById('admin-opt-a').value; const b = document.getElementById('admin-opt-b').value;
    if(!a || !b) return alert("Rellena todo.");
    const tom = new Date(); tom.setDate(tom.getDate() + 1); const d = tom.toISOString().split('T')[0];
    await db.from('clashes').delete().eq('publish_date', d);
    await db.from('clashes').insert({ option_a: a, option_b: b, publish_date: d, votes_a: 0, votes_b: 0 });
    alert("Programado.");
}
let adminJudgeId = null;
async function fetchAdminModeration() {
    const { data } = await db.from('suggestions').select