// =================================================================
// TOTALKMON V37 - CTO APPROVED (BULLETPROOF INIT)
// =================================================================

const SUPABASE_URL = 'https://zlddmiulbfjhwytfkvlw.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpsZGRtaXVsYmZqaHd5dGZrdmx3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY0OTU4ODEsImV4cCI6MjA4MjA3MTg4MX0.61pMT7GbYU9ZpWJjZnsBGrF_Lb9jLX0OkIYf1a6k6GY';

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_KEY);

// DATOS ESTATICOS
const imposterWords = ["Hospital", "Cementerio", "Escuela", "Cárcel", "Playa", "Cine", "Discoteca", "Gimnasio", "Aeropuerto", "Supermercado", "Restaurante", "Zoológico", "Hotel", "Teléfono", "Cuchara", "Inodoro", "Cama", "Reloj", "Pizza", "Sushi", "Hamburguesa", "Chocolate", "Perro", "Gato", "León", "Policía", "Médico", "Bombero"];
const debateTopics = [
    { title: "Tortilla de Patatas", a: "CON Cebolla", b: "SIN Cebolla" },
    { title: "Pizza", a: "Con Piña", b: "Sin Piña" },
    { title: "Dinero", a: "Da la felicidad", b: "No la da" },
    { title: "Redes Sociales", a: "Buenas", b: "Tóxicas" },
    { title: "Cine", a: "Doblado", b: "V.O." },
    { title: "Vacaciones", a: "Playa", b: "Montaña" }
];

// ESTADO GLOBAL
const appState = {
    user: { id: null, name: 'Anónimo', avatar: '🦊', streak: 0, votes: 0 },
    room: { id: null, isHost: false, sub: null, mode: 'classic' },
    questions: [],
    category: 'Mix',
    clash: { id: null, data: {a:'',b:'',va:0,vb:0} }
};

// =================================================================
// 1. INICIALIZACIÓN BLOQUEANTE (NO START UNTIL AUTH)
// =================================================================
const App = {
    init: async () => {
        console.log("Iniciando App V37...");
        
        // 1. Recuperar local
        const localId = localStorage.getItem('user_uuid');
        const localName = localStorage.getItem('profile_name') || 'Anónimo';
        const localAvatar = localStorage.getItem('profile_avatar') || '🦊';
        
        let validId = null;

        // 2. Verificar DB (Anti-Zombie)
        if (localId) {
            const { data } = await db.from('profiles').select('id, streak, votes_cast').eq('id', localId).single();
            if (data) {
                validId = data.id;
                appState.user.streak = data.streak;
                appState.user.votes = data.votes_cast;
            } else {
                console.warn("Usuario local no existe en DB. Reseteando.");
                localStorage.removeItem('user_uuid'); // Limpiar zombi
            }
        }

        // 3. Crear si no existe
        if (!validId) {
            const { data, error } = await db.from('profiles').insert([{ username: localName, avatar: localAvatar }]).select().single();
            if (error) { alert("Error crítico DB. Recarga."); return; }
            validId = data.id;
            localStorage.setItem('user_uuid', validId);
        }

        // 4. Asignar estado y desbloquear UI
        appState.user.id = validId;
        appState.user.name = localName;
        appState.user.avatar = localAvatar;
        
        App.renderProfile();
        App.fetchQuestions();
        App.loadClash();
        
        // Ocultar pantalla de carga
        document.getElementById('loading-overlay').style.display = 'none';
        console.log("App lista. Usuario:", validId);
    },

    // --- ORACULO ---
    fetchQuestions: async () => {
        const { data } = await db.from('questions').select('*').limit(2000);
        if(data && data.length > 0) appState.questions = data;
        else appState.questions = [{text:"Cargando...", category:"Mix"}];
        App.nextQuestion();
    },

    nextQuestion: () => {
        let pool = [];
        if (appState.category.toLowerCase() === 'mix' || appState.category.toLowerCase() === 'aleatorio') {
            pool = appState.questions;
        } else {
            pool = appState.questions.filter(q => q.category && q.category.toLowerCase() === appState.category.toLowerCase());
        }
        if (pool.length === 0) pool = appState.questions;
        
        const r = pool[Math.floor(Math.random() * pool.length)];
        document.getElementById('q-text').innerText = r.text;
        document.getElementById('q-cat').innerText = r.category;
    },

    setCategory: (cat, btn) => {
        App.playSfx('click');
        appState.category = cat;
        document.querySelectorAll('.topic-chip').forEach(el => el.classList.remove('active'));
        btn.classList.add('active');
        App.nextQuestion();
    },

    // --- MODO FIESTA (Host Identity Fix) ---
    selectMode: (mode) => {
        App.playSfx('click');
        appState.room.mode = mode;
        document.querySelectorAll('.mode-option').forEach(el => el.classList.remove('selected'));
        document.getElementById('mode-' + mode).classList.add('selected');
    },

    createRoom: async () => {
        App.playSfx('click');
        const code = Math.random().toString(36).substring(2, 6).toUpperCase();
        
        // Crear Sala (El host_id es CRUCIAL)
        const { error } = await db.from('rooms').insert({ 
            id: code, host_id: appState.user.id, 
            current_card_text: "Sala Lista", current_card_category: "...", 
            gamemode: appState.room.mode 
        });
        
        if(error) return alert("Error creando sala: " + error.message);

        // Unirse
        await App.joinRoomProcess(code);
    },

    joinRoom: async () => {
        const code = document.getElementById('join-code').value.toUpperCase().trim();
        if(code.length !== 4) return alert("Código incorrecto");
        App.playSfx('click');
        
        const { data } = await db.from('rooms').select('*').eq('id', code).single();
        if(!data) return alert("Sala no existe");
        
        await App.joinRoomProcess(code);
    },

    joinRoomProcess: async (code) => {
        // Upsert para evitar error de duplicado
        await db.from('room_participants').upsert({ 
            room_id: code, user_id: appState.user.id, role: 'spectator' 
        }, { onConflict: 'room_id, user_id' });

        appState.room.id = code;
        App.enterRoomUI();
    },

    enterRoomUI: () => {
        document.getElementById('party-lobby').style.display = 'none';
        document.getElementById('party-active').style.display = 'block';
        document.getElementById('display-room-code').innerText = appState.room.id;
        
        // Suscripción
        if(appState.room.sub) db.removeChannel(appState.room.sub);
        appState.room.sub = db.channel('room-' + appState.room.id)
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${appState.room.id}` }, payload => {
                App.handleRoomUpdate(payload.new);
            })
            .subscribe();

        // Fetch inicial para determinar HOST vs GUEST
        db.from('rooms').select('*').eq('id', appState.room.id).single().then(({data}) => {
            if(data) App.handleRoomUpdate(data);
        });
    },

    handleRoomUpdate: async (room) => {
        // ACTUALIZAR ESTADO DE HOST (Single Source of Truth)
        appState.room.isHost = (room.host_id === appState.user.id);
        
        // Actualizar UI según Host
        document.getElementById('host-controls').style.display = appState.room.isHost ? 'block' : 'none';
        document.getElementById('guest-controls').style.display = appState.room.isHost ? 'none' : 'block';

        // Cambio de modo
        if (room.gamemode !== appState.room.mode) {
            appState.room.mode = room.gamemode;
            App.updateGameUI();
        }

        App.playSfx('swoosh');
        const card = document.getElementById('party-card-' + appState.room.mode);
        card.classList.remove('flash-animation'); void card.offsetWidth; card.classList.add('flash-animation');

        if(appState.room.mode === 'classic') {
            document.getElementById('party-text').innerText = room.current_card_text;
            document.getElementById('party-cat').innerText = room.current_card_category;
        } else if(appState.room.mode === 'imposter') {
            const el = document.getElementById('imposter-role-text');
            el.style.filter = 'blur(15px)';
            if(appState.user.id === room.imposter_id) el.innerText = "🤫 ERES EL IMPOSTOR";
            else el.innerText = room.current_card_text;
        } else if(appState.room.mode === 'versus') {
            document.getElementById('versus-main-text').innerText = room.current_card_text;
            // Fetch rol específico
            const { data } = await db.from('room_participants').select('role').match({room_id: appState.room.id, user_id: appState.user.id}).single();
            const opts = room.current_card_category.split('|');
            const box = document.getElementById('versus-role-box');
            const txt = document.getElementById('versus-role-text');
            box.classList.remove('team-a-style', 'team-b-style');
            if(data && data.role === 'team_a') { box.classList.add('team-a-style'); txt.innerText = "DEFENDER: " + (opts[0]||'A'); }
            else if(data && data.role === 'team_b') { box.classList.add('team-b-style'); txt.innerText = "DEFENDER: " + (opts[1]||'B'); }
            else txt.innerText = "ESPERANDO...";
        }
    },

    updateGameUI: () => {
        ['classic', 'imposter', 'versus'].forEach(m => document.getElementById('party-card-' + m).style.display = 'none');
        document.getElementById('party-card-' + appState.room.mode).style.display = 'flex';
    },

    partyNextRound: async () => {
        if(!appState.room.isHost) return; // Seguridad extra
        App.playSfx('click');
        
        if (appState.room.mode === 'classic') {
            const r = appState.questions[Math.floor(Math.random() * appState.questions.length)];
            await db.from('rooms').update({ current_card_text: r.text, current_card_category: r.category }).eq('id', appState.room.id);
        } 
        else if (appState.room.mode === 'imposter') {
            const w = imposterWords[Math.floor(Math.random() * imposterWords.length)];
            const { data: ps } = await db.from('room_participants').select('user_id').eq('room_id', appState.room.id);
            let imp = appState.user.id;
            if(ps.length > 0) imp = ps[Math.floor(Math.random() * ps.length)].user_id;
            await db.from('rooms').update({ current_card_text: w, imposter_id: imp }).eq('id', appState.room.id);
        }
        else if (appState.room.mode === 'versus') {
            const t = debateTopics[Math.floor(Math.random() * debateTopics.length)];
            const { data: ps } = await db.from('room_participants').select('user_id').eq('room_id', appState.room.id);
            if(ps.length > 0) {
                for(let i=ps.length-1; i>0; i--) { const j=Math.floor(Math.random()*(i+1)); [ps[i], ps[j]] = [ps[j], ps[i]]; }
                const updates = ps.map((p, i) => db.from('room_participants').update({ role: i%2===0?'team_a':'team_b' }).match({room_id: appState.room.id, user_id: p.user_id}));
                await Promise.all(updates);
            }
            setTimeout(async () => {
                await db.from('rooms').update({ current_card_text: t.title, current_card_category: t.a+"|"+t.b }).eq('id', appState.room.id);
            }, 200);
        }
    },

    exitRoom: () => {
        if(appState.room.sub) db.removeChannel(appState.room.sub);
        appState.room.id = null; appState.room.isHost = false;
        document.getElementById('party-lobby').style.display = 'block';
        document.getElementById('party-active').style.display = 'none';
    },

    // --- UI HELPERS ---
    switchTab: (tab, btn) => {
        App.playSfx('click');
        document.querySelectorAll('.dock-item').forEach(el => el.classList.remove('active'));
        btn.classList.add('active');
        ['oracle', 'clash', 'party', 'judgment', 'profile', 'admin'].forEach(s => document.getElementById(s + '-section').classList.remove('active-section'));
        document.getElementById(tab + '-section').classList.add('active-section');
        if(tab === 'clash') App.loadClash();
    },

    renderProfile: () => {
        document.getElementById('profile-name').value = appState.user.name;
        document.getElementById('profile-avatar').innerText = appState.user.avatar;
        document.getElementById('stat-streak').innerText = appState.user.streak;
        document.getElementById('stat-votes').innerText = appState.user.votes;
        localStorage.setItem('profile_name', appState.user.name);
        localStorage.setItem('profile_avatar', appState.user.avatar);
    },

    saveProfile: () => {
        appState.user.name = document.getElementById('profile-name').value;
        App.renderProfile();
        db.from('profiles').update({ username: appState.user.name }).eq('id', appState.user.id).then();
    },

    toggleAvatarEdit: () => { const s = document.getElementById('avatar-selector'); s.style.display = s.style.display === 'none' ? 'grid' : 'none'; },
    setAvatar: (av) => { 
        appState.user.avatar = av; 
        document.getElementById('avatar-selector').style.display = 'none'; 
        App.renderProfile(); 
        db.from('profiles').update({ avatar: av }).eq('id', appState.user.id).then();
    },

    // --- DILEMA ---
    loadClash: async () => {
        const today = new Date().toISOString().split('T')[0];
        let { data } = await db.from('clashes').select('*').eq('publish_date', today);
        if (!data || data.length === 0) { const { data: r } = await db.from('clashes').select('*').limit(1); data = r; }
        if(data && data.length > 0) {
            const c = data[0];
            appState.clash.id = c.id;
            appState.clash.data = { a: c.option_a, b: c.option_b, va: c.votes_a, vb: c.votes_b };
            document.getElementById('text-a').innerText = c.option_a;
            document.getElementById('text-b').innerText = c.option_b;
            if (localStorage.getItem('voted_' + c.id)) App.showClashResults();
        }
    },
    
    voteClash: async (opt) => {
        if(document.getElementById('clash-section').classList.contains('voted')) return;
        App.playSfx('click');
        if(opt==='a') appState.clash.data.va++; else appState.clash.data.vb++;
        App.showClashResults();
        localStorage.setItem('voted_' + appState.clash.id, 'true');
        await db.from('user_votes').insert({ user_id: appState.user.id, clash_id: appState.clash.id, vote_option: opt });
        await db.from('clashes').update({ votes_a: appState.clash.data.va, votes_b: appState.clash.data.vb }).eq('id', appState.clash.id);
    },

    showClashResults: () => {
        const t = appState.clash.data.va + appState.clash.data.vb;
        const pa = t===0 ? 0 : Math.round((appState.clash.data.va/t)*100);
        const pb = t===0 ? 0 : Math.round((appState.clash.data.vb/t)*100);
        document.getElementById('bar-a').style.width=pa+'%'; document.getElementById('bar-b').style.width=pb+'%';
        document.getElementById('perc-a').innerText=pa+'%'; document.getElementById('perc-b').innerText=pb+'%';
        document.getElementById('clash-section').classList.add('voted');
    },

    // --- AUDIO & EXTRAS ---
    playSfx: (type) => {
        if(typeof audioCtx === 'undefined') return;
        if (audioCtx.state === 'suspended') audioCtx.resume().catch(()=>{});
        try {
            const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
            osc.connect(gain); gain.connect(audioCtx.destination);
            const now = audioCtx.currentTime;
            if (type === 'click') { osc.frequency.setValueAtTime(600, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1); osc.start(now); osc.stop(now + 0.1); } 
            else if (type === 'swoosh') { osc.type = 'triangle'; gain.gain.setValueAtTime(0.05, now); gain.gain.linearRampToValueAtTime(0, now + 0.15); osc.start(now); osc.stop(now + 0.15); }
        } catch(e){}
    },
    
    openModal: () => document.getElementById('suggestionModal').style.display='flex',
    closeModal: () => document.getElementById('suggestionModal').style.display='none',
    sendSuggestion: async () => { 
        const t = document.getElementById('sug-text').value;
        if(t) { await db.from('suggestions').insert([{text:t, category:'Mix'}]); alert("Enviado"); App.closeModal(); }
    },
    share: (t) => alert("Captura guardada.")
};

// AUTO-START (EXPOSING APP TO GLOBAL SCOPE FOR HTML ACCESS)
window.app = App;
document.addEventListener('DOMContentLoaded', App.init);