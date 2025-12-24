// ==========================================
// 1. CONFIGURACIÓN Y SEGURIDAD
// ==========================================
window.onerror = function(msg, url, line) {
    console.error("Error Detectado: " + msg + "\nLínea: " + line);
};

const SUPABASE_URL = 'https://zlddmiulbfjhwytfkvlw.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpsZGRtaXVsYmZqaHd5dGZrdmx3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY0OTU4ODEsImV4cCI6MjA4MjA3MTg4MX0.61pMT7GbYU9ZpWJjZnsBGrF_Lb9jLX0OkIYf1a6k6GY';

if (typeof supabase === 'undefined') {
    alert("Error Crítico: No se pudo cargar Supabase. Recarga la página.");
    throw new Error("Supabase undefined");
}

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_KEY);

// ==========================================
// 2. DICCIONARIOS
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
// 3. ESTADO GLOBAL
// ==========================================
let currentUser = {
    id: localStorage.getItem('user_uuid') || null,
    name: localStorage.getItem('profile_name') || 'Anónimo',
    avatar: localStorage.getItem('profile_avatar') || '🦊',
    streak: parseInt(localStorage.getItem('streak') || 0),
    votes: parseInt(localStorage.getItem('profile_votes') || 0)
};

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

// ==========================================
// 4. SONIDO
// ==========================================
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playSfx(type) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    const now = audioCtx.currentTime;

    if (type === 'click') {
        osc.frequency.setValueAtTime(600, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
        osc.start(now); osc.stop(now + 0.1);
        if(navigator.vibrate) navigator.vibrate(5);
    } 
    else if (type === 'swoosh') {
        osc.type = 'triangle'; 
        gain.gain.setValueAtTime(0.05, now);
        gain.gain.linearRampToValueAtTime(0, now + 0.15);
        osc.start(now); osc.stop(now + 0.15);
    }
    else if (type === 'success') { 
        [440, 554, 659].forEach((f, i) => {
            const o = audioCtx.createOscillator(); const g = audioCtx.createGain();
            o.connect(g); g.connect(audioCtx.destination); o.frequency.value = f;
            g.gain.exponentialRampToValueAtTime(0.001, now + 0.5 + (i*0.1));
            o.start(now); o.stop(now + 0.5);
        });
    }
}

// ==========================================
// 5. MODO FIESTA (CORE)
// ==========================================
function selectGameMode(mode) {
    playSfx('click');
    selectedGameMode = mode;
    document.querySelectorAll('.mode-option').forEach(el => el.classList.remove('selected'));
    const btn = document.getElementById('mode-' + mode);
    if(btn) btn.classList.add('selected');
}

async function createRoom() {
    if(!currentUser.id) return alert("Espera a que cargue tu perfil (o refresca).");
    playSfx('click');
    
    const code = Math.random().toString(36).substring(2, 6).toUpperCase();
    const { error } = await db.from('rooms').insert({ 
        id: code, 
        host_id: currentUser.id, 
        current_card_text: "¡Sala Creada!", 
        current_card_category: "Esperando...",
        gamemode: selectedGameMode
    });
    
    if(error) return alert("Error creando sala.");
    
    await db.from('room_participants').insert({ room_id: code, user_id: currentUser.id, role: 'civilian' });
    currentRoomId = code; isHost = true; enterPartyMode(code, selectedGameMode);
}

async function joinRoom() {
    const code = document.getElementById('join-code').value.toUpperCase().trim();
    if(code.length !== 4) return alert("Código incorrecto (4 letras).");
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

    if(roomSubscription) db.removeChannel(roomSubscription);
    roomSubscription = db.channel('room-'+code)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${code}` }, (payload) => {
        handleRoomUpdate(payload.new);
    })
    .subscribe();

    if(!isHost) { 
        db.from('rooms').select('*').eq('id', code).single().then(({data}) => { 
            if(data) handleRoomUpdate(data);
        });
    }
}

function updateGameUI(mode) {
    ['classic', 'imposter', 'versus'].forEach(m => {
        const el = document.getElementById('party-card-' + m);
        if(el) el.style.display = 'none';
    });
    const currentEl = document.getElementById('party-card-' + mode);
    if(currentEl) currentEl.style.display = 'flex';
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
        // En versus, ahora consultamos la DB para saber nuestro equipo exacto
        await updateVersusCard(roomData.current_card_text, roomData.current_card_category);
    }
}

function updateClassicCard(text, category) {
    const card = document.getElementById('party-card-classic');
    triggerFlash(card);
    const inner = card.querySelector('.card-inner');
    inner.style.opacity = '0';
    setTimeout(() => {
        document.getElementById('party-text').innerText = text;
        document.getElementById('party-cat').innerText = category;
        inner.style.opacity = '1';
    }, 200);
}

function updateImposterCard(mainText, subText) {
    const card = document.getElementById('party-card-imposter');
    triggerFlash(card);
    const textEl = document.getElementById('imposter-role-text');
    textEl.innerText = mainText;
    textEl.style.filter = 'blur(15px)';
    card.querySelector('.hint').innerText = subText;
}

// NUEVA LÓGICA DE VERSUS: PREGUNTA A LA BASE DE DATOS
async function updateVersusCard(title, optionsStr) {
    if(!currentUser.id) return;

    const card = document.getElementById('party-card-versus');
    triggerFlash(card);
    
    // Parsear opciones (formato: "Opción A|Opción B")
    const parts = optionsStr ? optionsStr.split('|') : ["A", "B"];
    const optA = parts[0] || "A";
    const optB = parts[1] || "B";

    document.getElementById('versus-main-text').innerText = title;
    
    // CONSULTAR MI EQUIPO EN LA DB (Fuente de la verdad)
    const { data } = await db.from('room_participants')
        .select('role')
        .match({ room_id: currentRoomId, user_id: currentUser.id })
        .single();
    
    const myRole = data ? data.role : 'spectator'; // Si no está asignado, espectador

    const box = document.getElementById('versus-role-box');
    const roleText = document.getElementById('versus-role-text');

    box.classList.remove('team-a-style', 'team-b-style');
    
    if(myRole === 'team_a') {
        box.classList.add('team-a-style');
        roleText.innerText = "DEFENDER: " + optA;
    } else if(myRole === 'team_b') {
        box.classList.add('team-b-style');
        roleText.innerText = "DEFENDER: " + optB;
    } else {
        // Espectador o error
        roleText.innerText = "ESPECTADOR (Juez)";
        box.style.borderColor = '#888';
        box.style.background = 'rgba(255,255,255,0.05)';
    }
}

function triggerFlash(element) {
    if(!element) return;
    element.classList.remove('flash-animation');
    void element.offsetWidth; // Trigger reflow
    element.classList.add('flash-animation');
    playSfx('swoosh');
    if(navigator.vibrate) navigator.vibrate([50, 50, 50]);
}

// CONTROL DEL ANFITRIÓN (MASTERMIND)
async function partyNextRound() {
    if(!isHost) return;
    playSfx('click');

    if(selectedGameMode === 'classic') {
        const random = allQuestions[Math.floor(Math.random() * allQuestions.length)];
        await db.from('rooms').update({ 
            current_card_text: random.text, 
            current_card_category: random.category 
        }).eq('id', currentRoomId);
    } 
    else if(selectedGameMode === 'imposter') {
        const secretWord = imposterWords[Math.floor(Math.random() * imposterWords.length)];
        const { data: participants } = await db.from('room_participants').select('user_id').eq('room_id', currentRoomId);
        
        let imposter = null;
        if(!participants || participants.length < 2) {
             imposter = currentUser.id; // Debug solo
        } else {
            imposter = participants[Math.floor(Math.random() * participants.length)].user_id;
        }
        
        await db.from('rooms').update({
            current_card_text: secretWord, 
            imposter_id: imposter,
            game_state: 'playing'
        }).eq('id', currentRoomId);
    }
    else if(selectedGameMode === 'versus') {
        const debate = debateTopics[Math.floor(Math.random() * debateTopics.length)];
        
        // 1. OBTENER JUGADORES
        const { data: participants } = await db.from('room_participants').select('user_id').eq('room_id', currentRoomId);
        
        if(participants && participants.length > 0) {
            // 2. BARAJAR JUGADORES (Algoritmo Fisher-Yates)
            for (let i = participants.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [participants[i], participants[j]] = [participants[j], participants[i]];
            }

            // 3. ASIGNAR EQUIPOS EQUILIBRADOS
            // Pares -> Equipo A, Impares -> Equipo B
            const updates = participants.map((p, index) => {
                const team = index % 2 === 0 ? 'team_a' : 'team_b';
                return db