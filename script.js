// ==========================================
// 1. CONFIGURACIÓN (¡VERIFICA ESTOS DATOS!)
// ==========================================
// Pega aquí TU URL y TU CLAVE de Supabase si son diferentes
const SUPABASE_URL = 'https://zlddmiulbfjhwytfkvlw.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpsZGRtaXVsYmZqaHd5dGZrdmx3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY0OTU4ODEsImV4cCI6MjA4MjA3MTg4MX0.61pMT7GbYU9ZpWJjZnsBGrF_Lb9jLX0OkIYf1a6k6GY';

// Control de errores global
window.onerror = function(msg, url, line) {
    console.error(`ERROR CRÍTICO: ${msg} en línea ${line}`);
    // Descomenta la siguiente línea si quieres ver alertas en el móvil
    // alert(`Error: ${msg}`);
};

if (typeof supabase === 'undefined') {
    alert("¡Fallo Crítico! La librería de Supabase no ha cargado. Revisa tu conexión a internet.");
}

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_KEY);

// ==========================================
// 2. DICCIONARIOS DE DATOS
// ==========================================
const imposterWords = [
    "Hospital", "Cementerio", "Escuela", "Cárcel", "Playa", "Cine", "Discoteca", "Gimnasio", "Biblioteca", "Aeropuerto",
    "Supermercado", "Restaurante", "Iglesia", "Zoológico", "Museo", "Piscina", "Banco", "Hotel", "Farmacia",
    "Teléfono", "Cuchara", "Inodoro", "Cama", "Espejo", "Reloj", "Llave", "Gafas", "Zapato", "Calcetín",
    "Pizza", "Sushi", "Hamburguesa", "Huevo", "Pan", "Queso", "Chocolate", "Helado", "Plátano",
    "Perro", "Gato", "Ratón", "León", "Tigre", "Elefante", "Jirafa", "Mono", "Gorila",
    "Policía", "Ladrón", "Médico", "Bombero", "Profesor", "Cocinero", "Camarero", "Piloto"
];

const debateTopics = [
    { title: "Tortilla de Patatas", a: "CON Cebolla", b: "SIN Cebolla" },
    { title: "Pizza", a: "Con Piña", b: "Sin Piña" },
    { title: "Dinero", a: "Da la felicidad", b: "No la da" },
    { title: "Redes Sociales", a: "Buenas", b: "Malas" },
    { title: "Cine", a: "Doblado", b: "V.O." },
    { title: "Vacaciones", a: "Playa", b: "Montaña" },
    { title: "Futuro", a: "Optimista", b: "Pesimista" },
    { title: "Amor", a: "A primera vista", b: "Se construye" },
    { title: "Aliens", a: "Existen", b: "Estamos solos" },
    { title: "Inteligencia Artificial", a: "Peligro", b: "Avance" }
];

// ==========================================
// 3. ESTADO GLOBAL
// ==========================================
let currentUser = {
    id: localStorage.getItem('user_uuid'),
    name: localStorage.getItem('profile_name') || 'Anónimo',
    avatar: localStorage.getItem('profile_avatar') || '🦊',
    streak: parseInt(localStorage.getItem('streak') || 0),
    votes: parseInt(localStorage.getItem('profile_votes') || 0)
};

let allQuestions = [];
let currentCategory = 'aleatorio';
let currentRoomId = null;
let isHost = false;
let roomSubscription = null;
let selectedGameMode = 'classic';
let adminTapCount = 0;

// ==========================================
// 4. INICIALIZACIÓN (MOTOR DE ARRANQUE)
// ==========================================
async function initApp() {
    console.log("Iniciando App...");
    try {
        await initUser();
        await fetchQuestions();
        console.log("App Iniciada Correctamente");
    } catch (e) {
        console.error("Error en arranque:", e);
        alert("Error iniciando la app. Intenta recargar.");
    }
}

async function initUser() {
    // Si no tenemos ID, creamos uno nuevo
    if (!currentUser.id) {
        console.log("Creando usuario nuevo...");
        const { data, error } = await db.from('profiles').insert([{
            username: currentUser.name,
            avatar: currentUser.avatar,
            streak: 1,
            last_visit: new Date().toISOString()
        }]).select().single();

        if (error) throw error;
        
        if (data) {
            currentUser.id = data.id;
            localStorage.setItem('user_uuid', data.id);
        }
    } else {
        // Si tenemos ID, intentamos sincronizar
        console.log("Sincronizando usuario existente...", currentUser.id);
        const { data, error } = await db.from('profiles').select('*').eq('id', currentUser.id).single();
        
        if (data) {
            currentUser.streak = data.streak || 1;
            currentUser.votes = data.votes_cast || 0;
            checkStreakCloud(data);
        } else {
            // Si el ID local no existe en la nube (ej: borrado de base de datos), limpiamos y recreamos
            console.warn("Usuario local no encontrado en nube. Reseteando.");
            localStorage.removeItem('user_uuid');
            currentUser.id = null;
            await initUser(); // Reintentar recursivamente
            return;
        }
    }
    updateProfileUI();
}

function checkStreakCloud(data) {
    const today = new Date().toISOString().split('T')[0];
    const lastVisit = data.last_visit ? data.last_visit.split('T')[0] : null;
    
    if (lastVisit !== today) {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split('T')[0];
        
        if (lastVisit === yesterdayStr) currentUser.streak++;
        else currentUser.streak = 1;
        
        db.from('profiles').update({ 
            last_visit: new Date().toISOString(), 
            streak: currentUser.streak 
        }).eq('id', currentUser.id);
        
        updateProfileUI();
    }
}

function updateProfileUI() {
    if(!document.getElementById('profile-name')) return;
    document.getElementById('profile-name').value = currentUser.name;
    document.getElementById('profile-avatar').innerText = currentUser.avatar;
    document.getElementById('stat-streak').innerText = currentUser.streak;
    document.getElementById('streak-count').innerText = currentUser.streak;
    document.getElementById('stat-votes').innerText = currentUser.votes;
    document.getElementById('profile-level').innerText = "Nivel " + (Math.floor(currentUser.votes/10)+1);
}

// ==========================================
// 5. MODO FIESTA (LÓGICA REFORZADA)
// ==========================================
function selectGameMode(mode) {
    playSfx('click');
    selectedGameMode = mode;
    document.querySelectorAll('.mode-option').forEach(el => el.classList.remove('selected'));
    const btn = document.getElementById('mode-' + mode);
    if(btn) btn.classList.add('selected');
}

async function createRoom() {
    if(!currentUser.id) return alert("Espera... conectando perfil.");
    playSfx('click');
    
    const code = Math.random().toString(36).substring(2, 6).toUpperCase();
    
    const { error } = await db.from('rooms').insert({
        id: code,
        host_id: currentUser.id,
        current_card_text: "Sala Creada",
        current_card_category: "Esperando...",
        gamemode: selectedGameMode,
        game_state: 'waiting'
    });

    if (error) return alert("Error creando sala: " + error.message);

    await joinRoomProcess(code, true);
}

async function joinRoom() {
    const code = document.getElementById('join-code').value.toUpperCase().trim();
    if(code.length !== 4) return alert("Código inválido.");
    playSfx('click');
    
    // Verificar que la sala existe
    const { data, error } = await db.from('rooms').select('*').eq('id', code).single();
    if (error || !data) return alert("Sala no encontrada.");
    
    await joinRoomProcess(code, false, data.gamemode);
}

async function joinRoomProcess(code, isCreator, modeOverride = null) {
    // Unirse a la tabla de participantes
    const { error } = await db.from('room_participants').insert({
        room_id: code,
        user_id: currentUser.id,
        role: 'spectator' // Rol por defecto hasta que empiece el juego
    });

    if (error && error.code !== '23505') { // Ignorar error de duplicado (ya unido)
        console.error("Error uniéndose:", error);
    }

    currentRoomId = code;
    isHost = isCreator;
    if(modeOverride) selectedGameMode = modeOverride;
    
    enterPartyUI(code);
}

function enterPartyUI(code) {
    document.getElementById('party-lobby').style.display = 'none';
    document.getElementById('party-active').style.display = 'block';
    document.getElementById('display-room-code').innerText = code;
    
    updateGameUI(selectedGameMode);
    
    document.getElementById('host-controls').style.display = isHost ? 'block' : 'none';
    document.getElementById('guest-controls').style.display = isHost ? 'none' : 'block';

    // SUSCRIPCIÓN REALTIME
    if (roomSubscription) db.removeChannel(roomSubscription);
    
    roomSubscription = db.channel('room-logic')
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${code}` }, payload => {
            handleRoomUpdate(payload.new);
        })
        .subscribe();
        
    // Carga inicial
    if (!isHost) {
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
    const active = document.getElementById('party-card-' + mode);
    if(active) active.style.display = 'flex';
}

async function handleRoomUpdate(roomData) {
    // Sincronizar modo de juego si cambia
    if(roomData.gamemode && roomData.gamemode !== selectedGameMode) {
        selectedGameMode = roomData.gamemode;
        updateGameUI(selectedGameMode);
    }

    triggerFlash(document.querySelector('.card-container'));

    if (selectedGameMode === 'classic') {
        document.getElementById('party-text').innerText = roomData.current_card_text;
        document.getElementById('party-cat').innerText = roomData.current_card_category;
    } 
    else if (selectedGameMode === 'imposter') {
        const textEl = document.getElementById('imposter-role-text');
        textEl.style.filter = 'blur(15px)'; // Reset blur
        
        if (currentUser.id === roomData.imposter_id) {
            textEl.innerText = "🤫 ERES EL IMPOSTOR";
        } else {
            textEl.innerText = roomData.current_card_text; // Palabra secreta
        }
    }
    else if (selectedGameMode === 'versus') {
        // En versus, primero actualizamos el título
        document.getElementById('versus-main-text').innerText = roomData.current_card_text;
        
        // Luego consultamos nuestro rol específico
        const { data } = await db.from('room_participants')
            .select('role')
            .eq('room_id', currentRoomId)
            .eq('user_id', currentUser.id)
            .single();
            
        const myRole = data ? data.role : 'spectator';
        const options = roomData.current_card_category ? roomData.current_card_category.split('|') : ["A", "B"];
        const box = document.getElementById('versus-role-box');
        const roleText = document.getElementById('versus-role-text');
        
        box.classList.remove('team-a-style', 'team-b-style');
        
        if (myRole === 'team_a') {
            box.classList.add('team-a-style');
            roleText.innerText = "DEFIENDE: " + (options[0] || "A");
        } else if (myRole === 'team_b') {
            box.classList.add('team-b-style');
            roleText.innerText = "DEFIENDE: " + (options[1] || "B");
        } else {
            roleText.innerText = "ESPERANDO ASIGNACIÓN...";
        }
    }
}

// LÓGICA DEL HOST (CEREBRO DEL JUEGO)
async function partyNextRound() {
    if (!isHost) return;
    playSfx('click');

    if (selectedGameMode === 'classic') {
        const random = allQuestions[Math.floor(Math.random() * allQuestions.length)];
        await db.from('rooms').update({ 
            current_card_text: random.text, 
            current_card_category: random.category 
        }).eq('id', currentRoomId);
    } 
    else if (selectedGameMode === 'imposter') {
        const secretWord = imposterWords[Math.floor(Math.random() * imposterWords.length)];
        // Obtener jugadores para elegir impostor
        const { data: players } = await db.from('room_participants').select('user_id').eq('room_id', currentRoomId);
        
        let imposter = currentUser.id;
        if (players && players.length > 0) {
            imposter = players[Math.floor(Math.random() * players.length)].user_id;
        }
        
        await db.from('rooms').update({ 
            current_card_text: secretWord, 
            imposter_id: imposter 
        }).eq('id', currentRoomId);
    }
    else if (selectedGameMode === 'versus') {
        const debate = debateTopics[Math.floor(Math.random() * debateTopics.length)];
        
        // 1. Asignar equipos
        const { data: players } = await db.from('room_participants').select('user_id').eq('room_id', currentRoomId);
        if (players) {
            // Barajar
            for (let i = players.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [players[i], players[j]] = [players[j], players[i]];
            }
            // Asignar
            const updates = players.map((p, idx) => {
                const team = idx % 2 === 0 ? 'team_a' : 'team_b';
                return db.from('room_participants').update({ role: team }).match({ room_id: currentRoomId, user_id: p.user_id });
            });
            await Promise.all(updates);
        }
        
        // 2. Lanzar debate
        await db.from('rooms').update({ 
            current_card_text: debate.title, 
            current_card_category: `${debate.a}|${debate.b}` 
        }).eq('id', currentRoomId);
    }
}

function exitRoom() {
    if (roomSubscription) db.removeChannel(roomSubscription);
    currentRoomId = null; isHost = false;
    document.getElementById('party-lobby').style.display = 'block';
    document.getElementById('party-active').style.display = 'none';
}

function triggerFlash(el) {
    if(el) {
        el.classList.remove('flash-animation');
        void el.offsetWidth;
        el.classList.add('flash-animation');
        playSfx('swoosh');
        if(navigator.vibrate) navigator.vibrate(50);
    }
}

// ==========================================
// 6. FUNCIONES CORE (ORACULO, DILEMA, ETC)
// ==========================================
async function fetchQuestions() {
    const { data } = await db.from('questions').select('*').limit(50);
    if(data) allQuestions = data; else allQuestions = [{text:"Hola", category:"Inicio"}];
    nextQuestion();
}
function nextQuestion() {
    let pool = allQuestions;
    if(currentCategory !== 'aleatorio') pool = allQuestions.filter(q => q.category.toLowerCase() === currentCategory.toLowerCase());
    if(pool.length === 0) pool = allQuestions;
    const el = document.querySelector('.card-inner');
    if(el) {
        el.style.opacity = '0';
        setTimeout(() => {
            const r = pool[Math.floor(Math.random() * pool.length)];
            document.getElementById('q-text').innerText = r.text;
            document.getElementById('q-cat').innerText = r.category;
            el.style.opacity = '1';
        }, 200);
    }
}
function setCategory(c, b) { playSfx('click'); currentCategory = c; document.querySelectorAll('.topic-chip').forEach(btn => btn.classList.remove('active')); if(b) b.classList.add('active'); nextQuestion(); }

// DOCK NAVIGATION
function switchTab(t, el) {
    playSfx('click');
    document.querySelectorAll('.dock-item').forEach(d => d.classList.remove('active'));
    if(el) el.classList.add('active');
    ['oracle', 'clash', 'party', 'judgment', 'profile', 'admin'].forEach(s => {
        const sec = document.getElementById(s + '-section');
        if(sec) sec.classList.remove('active-section');
    });
    const target = document.getElementById(t + '-section');
    if(target) target.classList.add('active-section');
    if (t === 'profile') updateProfileUI();
}

// OTRAS FUNCIONALIDADES UI
function openModal() { document.getElementById('suggestionModal').style.display = 'flex'; }
function closeModal() { document.getElementById('suggestionModal').style.display = 'none'; }
function openStreakModal() { document.getElementById('streakModal').style.display = 'flex'; }
function closeStreakModal() { document.getElementById('streakModal').style.display = 'none'; }
function toggleAvatarEdit() { 
    const s = document.getElementById('avatar-selector'); 
    s.style.display = s.style.display === 'none' ? 'grid' : 'none'; 
}
function setAvatar(e) {
    currentUser.avatar = e;
    document.getElementById('avatar-selector').style.display = 'none';
    saveProfile();
}
function saveProfile() {
    const n = document.getElementById('profile-name').value;
    if (n) currentUser.name = n;
    syncProfileToCloud();
    updateProfileUI();
}

// ARRANQUE
document.addEventListener('DOMContentLoaded', () => {
    initApp();
});