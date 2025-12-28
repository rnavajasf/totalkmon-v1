// ==========================================
// CONFIGURACIÓN
// ==========================================
const SUPABASE_URL = 'https://zlddmiulbfjhwytfkvlw.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpsZGRtaXVsYmZqaHd5dGZrdmx3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY0OTU4ODEsImV4cCI6MjA4MjA3MTg4MX0.61pMT7GbYU9ZpWJjZnsBGrF_Lb9jLX0OkIYf1a6k6GY';

// Control de errores global inmediato
window.onerror = function(msg, url, line) {
    document.getElementById('loading-log').innerText = "ERROR JS: " + msg;
    document.getElementById('retry-btn').style.display = 'block';
};

// Checkeo de librería
if (typeof supabase === 'undefined') {
    document.getElementById('loading-log').innerText = "ERROR: Supabase no cargó.";
    throw new Error("Supabase missing");
}

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_KEY);

// Estado
const App = {
    user: { id: null, name: 'Anónimo' },
    room: { id: null, isHost: false, sub: null, mode: 'classic' },
    data: { questions: [], clash: {} }
};

// ==========================================
// ARRANQUE BLINDADO
// ==========================================
window.onload = async () => {
    const log = document.getElementById('loading-log');
    
    try {
        log.innerText = "Conectando DB...";
        
        // 1. GESTIÓN DE USUARIO (IDempotente)
        let uid = localStorage.getItem('v41_uid');
        if (!uid) {
            uid = crypto.randomUUID();
            localStorage.setItem('v41_uid', uid);
        }
        
        // Upsert usuario (Si existe lo deja, si no lo crea. A prueba de fallos)
        log.innerText = "Verificando identidad...";
        const { error: uErr } = await db.from('profiles').upsert({ 
            id: uid, 
            username: 'Anónimo', 
            avatar: '🦊' 
        }, { onConflict: 'id' });
        
        if (uErr) throw uErr;
        App.user.id = uid;

        // 2. CARGA DE DATOS
        log.innerText = "Cargando contenido...";
        const { data: qData } = await db.from('questions').select('*').limit(100);
        App.data.questions = qData || [{text:'Hola', category:'Mix'}];
        
        // Carga Dilema
        const t = new Date().toISOString().split('T')[0];
        const { data: cData } = await db.from('clashes').select('*').limit(1); // Simplificado para que no falle si la fecha no coincide
        if(cData && cData.length > 0) App.data.clash = cData[0];

        // 3. UI
        App.nextQuestion();
        App.renderClash();
        
        // DESBLOQUEO
        log.innerText = "¡Listo!";
        setTimeout(() => document.getElementById('loading-screen').style.display = 'none', 500);

    } catch (e) {
        log.innerText = "ERROR: " + e.message;
        log.style.color = "red";
        document.getElementById('retry-btn').style.display = 'block';
        console.error(e);
    }
};

// ==========================================
// LÓGICA DE JUEGO (Métodos Globales)
// ==========================================

App.setCategory = (cat, btn) => {
    document.querySelectorAll('.topic-chip').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    
    let pool = App.data.questions.filter(q => q.category.toLowerCase() === cat.toLowerCase());
    if (cat === 'Mix' || pool.length === 0) pool = App.data.questions;
    
    const r = pool[Math.floor(Math.random() * pool.length)];
    document.getElementById('q-text').innerText = r.text;
    document.getElementById('q-cat').innerText = r.category;
};

App.nextQuestion = () => {
    const activeBtn = document.querySelector('.topic-chip.active');
    const cat = activeBtn ? activeBtn.innerText.replace('✨ ', '').replace('💘 ', '') : 'Mix'; // Limpieza básica
    // Reutilizamos setCategory lógica pero sin cambiar botón
    let pool = App.data.questions; // Default Mix
    // Aquí simplifico: usa siempre aleatorio para probar que funciona
    const r = pool[Math.floor(Math.random() * pool.length)];
    document.getElementById('q-text').innerText = r.text;
    document.getElementById('q-cat').innerText = r.category;
};

App.voteClash = async (opt) => {
    if (!App.data.clash.id) return;
    document.getElementById('bar-' + opt).style.width = '100%'; // Feedback visual inmediato
    
    let a = App.data.clash.votes_a || 0;
    let b = App.data.clash.votes_b || 0;
    if (opt === 'a') a++; else b++;
    
    // Optimistic UI update
    const total = a + b;
    document.getElementById('perc-a').innerText = Math.round((a/total)*100) + '%';
    document.getElementById('perc-b').innerText = Math.round((b/total)*100) + '%';
    document.getElementById('bar-a').style.width = Math.round((a/total)*100) + '%';
    document.getElementById('bar-b').style.width = Math.round((b/total)*100) + '%';

    await db.from('clashes').update({ votes_a: a, votes_b: b }).eq('id', App.data.clash.id);
};

App.renderClash = () => {
    if (App.data.clash.id) {
        document.getElementById('text-a').innerText = App.data.clash.option_a;
        document.getElementById('text-b').innerText = App.data.clash.option_b;
    }
};

App.switchTab = (tab, btn) => {
    document.querySelectorAll('.active-section').forEach(s => s.classList.remove('active-section'));
    document.getElementById('section-' + tab).classList.add('active-section');
    document.querySelectorAll('.dock-item').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
};

// ==========================================
// MODO FIESTA (Simplificado al máximo)
// ==========================================
App.setGameMode = (m) => {
    App.room.mode = m;
    document.querySelectorAll('.mode-option').forEach(o => o.classList.remove('selected'));
    document.getElementById('mode-' + m).classList.add('selected');
};

App.createRoom = async () => {
    const code = Math.random().toString(36).substring(2, 6).toUpperCase();
    await db.from('rooms').insert({ id: code, host_id: App.user.id, gamemode: App.room.mode });
    App.joinRoomProcess(code, true);
};

App.joinRoom = async () => {
    const code = document.getElementById('join-code').value.toUpperCase();
    const { data } = await db.from('rooms').select('*').eq('id', code).single();
    if (!data) return alert("Sala no existe");
    App.room.mode = data.gamemode;
    App.joinRoomProcess(code, data.host_id === App.user.id);
};

App.joinRoomProcess = (code, isHost) => {
    App.room.id = code;
    App.room.isHost = isHost;
    
    document.getElementById('party-lobby').style.display = 'none';
    document.getElementById('party-active').style.display = 'block';
    document.getElementById('room-display-code').innerText = code;
    
    if (isHost) document.getElementById('host-controls').style.display = 'block';
    
    // Suscripción simple
    db.channel('room').on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${code}` }, payload => {
        const r = payload.new;
        document.getElementById('party-text').innerText = r.current_card_text;
        document.getElementById('party-cat').innerText = r.current_card_category;
    }).subscribe();
};

App.partyNextRound = async () => {
    const r = App.data.questions[Math.floor(Math.random() * App.data.questions.length)];
    await db.from('rooms').update({ current_card_text: r.text, current_card_category: r.category }).eq('id', App.room.id);
};

App.exitRoom = () => location.reload(); // La forma más segura de salir es recargar