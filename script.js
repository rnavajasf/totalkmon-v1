// ==========================================
// 1. CONFIGURACIÓN Y CLAVES
// ==========================================
const SUPABASE_URL = 'https://zlddmiulbfjhwytfkvlw.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpsZGRtaXVsYmZqaHd5dGZrdmx3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY0OTU4ODEsImV4cCI6MjA4MjA3MTg4MX0.61pMT7GbYU9ZpWJjZnsBGrF_Lb9jLX0OkIYf1a6k6GY';

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_KEY);

// ==========================================
// 2. ESTADO GLOBAL & USUARIO
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

// ==========================================
// 3. MOTOR DE IDENTIDAD (CLOUD SYNC)
// ==========================================
async function initUser() {
    // Si no tiene ID, es usuario nuevo: Lo registramos en la nube
    if (!currentUser.id) {
        const { data, error } = await db.from('profiles').insert([{
            username: currentUser.name,
            avatar: currentUser.avatar,
            streak: 1, // Empieza con 1 por entrar hoy
            last_visit: new Date().toISOString()
        }]).select().single();

        if (data) {
            currentUser.id = data.id;
            localStorage.setItem('user_uuid', data.id); // Guardamos la llave maestra
            console.log("Usuario registrado en nube:", data.id);
        }
    } else {
        // Si ya tiene ID, sincronizamos sus datos de vuelta (Backup)
        const { data } = await db.from('profiles').select('*').eq('id', currentUser.id).single();
        if (data) {
            // Actualizamos local con lo que diga la nube (La nube manda)
            currentUser.streak = data.streak;
            currentUser.votes = data.votes_cast;
            updateProfileUI(); // Refrescar pantalla
            
            // Revisar racha en la nube
            checkStreakCloud(data);
        }
    }
    updateProfileUI();
}

async function syncProfileToCloud() {
    if(!currentUser.id) return;
    await db.from('profiles').update({
        username: currentUser.name,
        avatar: currentUser.avatar,
        streak: currentUser.streak,
        votes_cast: currentUser.votes
    }).eq('id', currentUser.id);
}

// ==========================================
// 4. LÓGICA DE RACHAS (HÍBRIDA)
// ==========================================
function checkStreakCloud(cloudData) {
    const today = new Date().toISOString().split('T')[0];
    const lastVisit = cloudData.last_visit ? cloudData.last_visit.split('T')[0] : null;

    if (lastVisit !== today) {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split('T')[0];

        if (lastVisit === yesterdayStr) {
            currentUser.streak++; // Mantenemos racha
            setTimeout(() => playSfx('success'), 800);
        } else {
            currentUser.streak = 1; // Racha rota :(
        }
        
        // Guardamos la visita de hoy
        db.from('profiles').update({ 
            last_visit: new Date().toISOString(),
            streak: currentUser.streak 
        }).eq('id', currentUser.id);

        localStorage.setItem('streak', currentUser.streak);
        updateProfileUI();
    }
}

// ==========================================
// 5. SONIDO (SFX ENGINE)
// ==========================================
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function playSfx(type) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain); gain.connect(audioCtx.destination);
    
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
            g.gain.setValueAtTime(0, now);
            g.gain.linearRampToValueAtTime(0.1, now + (i*0.1));
            g.gain.exponentialRampToValueAtTime(0.001, now + 0.5 + (i*0.1));
            o.start(now); o.stop(now + 0.6);
        });
    }
}

// ==========================================
// 6. CORE: ORÁCULO
// ==========================================
async function fetchQuestions() {
    // Optimización: Pedimos solo 50 random para no saturar memoria
    const { data } = await db.from('questions').select('*').limit(50); 
    if(data && data.length > 0) allQuestions = data;
    else allQuestions = [{text: "Bienvenido a Totalkmon.", category: "Inicio"}];
    nextQuestion();
}

function nextQuestion() {
    let pool = allQuestions;
    if(currentCategory !== 'aleatorio') pool = allQuestions.filter(q => q.category.toLowerCase() === currentCategory.toLowerCase());
    
    // Fallback inteligente si no hay preguntas de esa categoría
    if(pool.length === 0) pool = allQuestions; 

    const cardContent = document.querySelector('.card-inner');
    // Animación suave
    cardContent.style.opacity = '0';
    cardContent.style.transform = 'scale(0.95)';
    cardContent.style.transition = 'all 0.2s ease';
    
    setTimeout(() => {
        const random = pool[Math.floor(Math.random() * pool.length)];
        document.getElementById('q-text').innerText = random.text;
        document.getElementById('q-cat').innerText = random.category;
        
        cardContent.style.opacity = '1';
        cardContent.style.transform = 'scale(1)';
    }, 200);
}

function setCategory(cat, btn) {
    playSfx('click');
    currentCategory = cat;
    document.querySelectorAll('.topic-chip').forEach(b => b.classList.remove('active'));
    if(btn) btn.classList.add('active');
    nextQuestion();
}

// ==========================================
// 7. CORE: DILEMA (Blindado)
// ==========================================
async function loadClash() {
    const today = new Date().toISOString().split('T')[0];
    let { data } = await db.from('clashes').select('*').eq('publish_date', today);
    
    if (!data || data.length === 0) {
        const { data: randomData } = await db.from('clashes').select('*').limit(1); // Fallback
        data = randomData;
    }

    if(data && data.length > 0) {
        const c = data[0];
        currentClashId = c.id;
        clashData = { a: c.option_a, b: c.option_b, va: c.votes_a, vb: c.votes_b };
        document.getElementById('text-a').innerText = c.option_a;
        document.getElementById('text-b').innerText = c.option_b;
        
        // Verificamos si YA votó este usuario en la NUBE (Anti-trampas)
        if(currentUser.id) {
            const { data: vote } = await db.from('user_votes')
                .select('*')
                .eq('user_id', currentUser.id)
                .eq('clash_id', currentClashId)
                .single();
            
            if(vote || localStorage.getItem('voted_'+c.id)) {
                showResults(c.votes_a, c.votes_b);
            }
        }
    }
}

async function voteClash(opt) {
    if(!currentClashId || !currentUser.id) return;
    
    // Doble chequeo local para UX instantánea
    if(document.getElementById('clash-section').classList.contains('voted')) return;

    playSfx('click');

    // Optimista UI Update (El usuario ve el voto al instante)
    let a = clashData.va, b = clashData.vb;
    if(opt === 'a') a++; else b++;
    showResults(a, b);

    // Registro en NUBE (La verdad)
    // 1. Registrar voto en historial
    await db.from('user_votes').insert({
        user_id: currentUser.id,
        clash_id: currentClashId,
        vote_option: opt
    });

    // 2. Actualizar contadores globales
    await db.from('clashes').update({ votes_a: a, votes_b: b }).eq('id', currentClashId);
    
    localStorage.setItem('voted_'+currentClashId, 'true');
    
    currentUser.votes++;
    updateProfileUI();
    syncProfileToCloud(); // Guardar estadística de votos
}

function showResults(a, b) {
    let t = a + b;
    let pa = t===0?0:Math.round((a/t)*100), pb = t===0?0:Math.round((b/t)*100);
    document.getElementById('bar-a').style.width = pa+'%'; 
    document.getElementById('bar-b').style.width = pb+'%';
    document.getElementById('perc-a').innerText = pa+'%'; 
    document.getElementById('perc-b').innerText = pb+'%';
    document.getElementById('clash-section').classList.add('voted');
}

function shareClash() {
    const total = clashData.va + clashData.vb;
    const winText = clashData.va > clashData.vb ? clashData.a : clashData.b;
    const winPerc = total === 0 ? 0 : Math.round((Math.max(clashData.va, clashData.vb) / total) * 100);
    if (navigator.share) {
        navigator.share({ title: 'Totalkmon', text: `📊 ${winPerc}% prefiere: "${winText}". ¿Tú qué dices?`, url: window.location.href });
    } else { alert("Link copiado."); }
}

// ==========================================
// 8. CORE: JUICIO & PERFIL
// ==========================================
async function fetchJudge() {
    const { data } = await db.from('suggestions').select('*').limit(5);
    if (data && data.length > 0) {
        const random = data[Math.floor(Math.random() * data.length)];
        currentJudgeId = random.id;
        document.getElementById('judge-text').innerText = random.text;
        document.getElementById('judge-cat').innerText = random.category;
    } else {
        document.getElementById('judge-text').innerText = "Todo limpio por hoy.";
        document.getElementById('judge-cat').innerText = "Vuelve más tarde";
        currentJudgeId = null;
    }
}

async function voteJudgment(val) {
    if(!currentJudgeId) return;
    playSfx('click');
    
    // UI Feedback instantáneo
    document.querySelector('.judge-card').style.transform = 'translateX(' + (val * 20) + 'px)';
    setTimeout(() => document.querySelector('.judge-card').style.transform = 'translateX(0)', 200);

    const { data: current } = await db.from('suggestions').select('*').eq('id', currentJudgeId).single();
    if(!current) { fetchJudge(); return; }
    
    let newVotes = (current.votes || 0) + val;
    
    // Lógica Servidor
    if (newVotes >= 5) {
        await db.from('questions').insert([{ text: current.text, category: current.category }]);
        await db.from('suggestions').delete().eq('id', currentJudgeId);
        playSfx('success');
    } else if (newVotes <= -5) {
        await db.from('suggestions').delete().eq('id', currentJudgeId);
    } else {
        await db.from('suggestions').update({ votes: newVotes }).eq('id', currentJudgeId);
    }
    
    currentUser.votes++;
    updateProfileUI();
    syncProfileToCloud();
    fetchJudge();
}

// GESTIÓN UI PERFIL
function updateProfileUI() {
    document.getElementById('profile-name').value = currentUser.name;
    document.getElementById('profile-avatar').innerText = currentUser.avatar;
    document.getElementById('stat-streak').innerText = currentUser.streak;
    document.getElementById('streak-count').innerText = currentUser.streak; // Header
    document.getElementById('stat-votes').innerText = currentUser.votes;
    
    // Guardar Local también por velocidad
    localStorage.setItem('profile_name', currentUser.name);
    localStorage.setItem('profile_avatar', currentUser.avatar);
    localStorage.setItem('streak', currentUser.streak);
    localStorage.setItem('profile_votes', currentUser.votes);

    // Calcular nivel
    const level = Math.floor(currentUser.votes / 10) + 1;
    let title = "Novato";
    if(level > 5) title = "Juez";
    if(level > 20) title = "Oráculo";
    if(level > 50) title = "Dios del Caos";
    document.getElementById('profile-level').innerText = `Nivel ${level}: ${title}`;
}

function saveProfile() {
    const name = document.getElementById('profile-name').value;
    if(name.trim() === "") return;
    currentUser.name = name;
    updateProfileUI();
    syncProfileToCloud(); // Guardar en nube
}

function toggleAvatarEdit() {
    const selector = document.getElementById('avatar-selector');
    selector.style.display = selector.style.display === 'none' ? 'grid' : 'none';
    playSfx('click');
}

function setAvatar(emoji) {
    currentUser.avatar = emoji;
    document.getElementById('avatar-selector').style.display = 'none';
    playSfx('success');
    updateProfileUI();
    syncProfileToCloud(); // Guardar en nube
}

async function sendSuggestion() {
    playSfx('click');
    const txt = document.getElementById('sug-text').value;
    const cat = document.getElementById('sug-cat').value;
    if(!txt) return;
    await db.from('suggestions').insert([{ text: txt, category: cat, votes: 0 }]);
    alert("Enviado. ¡Gracias!");
    closeModal();
    document.getElementById('sug-text').value = "";
}

// NAV & MODALS
function switchTab(t, el) {
    playSfx('click');
    document.querySelectorAll('.dock-item').forEach(d => d.classList.remove('active'));
    if(el) el.classList.add('active');
    
    ['oracle', 'clash', 'judgment', 'profile'].forEach(s => {
        document.getElementById(s + '-section').classList.remove('active-section');
    });
    
    document.getElementById(t + '-section').classList.add('active-section');
    
    if(t === 'clash') loadClash();
    if(t === 'judgment') fetchJudge();
    if(t === 'profile') updateProfileUI();
}

function openModal() { document.getElementById('suggestionModal').style.display = 'flex'; }
function closeModal() { document.getElementById('suggestionModal').style.display = 'none'; }
function openStreakModal() {
    document.getElementById('modal-streak-count').innerText = currentUser.streak;
    document.getElementById('streakModal').style.display = 'flex';
    playSfx('click');
}
function closeStreakModal() { document.getElementById('streakModal').style.display = 'none'; }

// EFECTOS VISUALES
const pc = document.getElementById('particles');
for(let i=0;i<20;i++){
    let p=document.createElement('div'); p.className='particle';
    p.style.left=Math.random()*100+'%'; p.style.width=p.style.height=(Math.random()*5+2)+'px';
    p.style.animationDelay=Math.random()*5+'s'; p.style.animationDuration=(Math.random()*10+15)+'s';
    pc.appendChild(p);
}

// INICIO MAESTRO
initUser(); // Arranca el registro en la nube
fetchQuestions();