// ==========================================
// 1. CONFIGURACIÓN Y CLAVES (SUPABASE)
// ==========================================
const SUPABASE_URL = 'https://zlddmiulbfjhwytfkvlw.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpsZGRtaXVsYmZqaHd5dGZrdmx3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY0OTU4ODEsImV4cCI6MjA4MjA3MTg4MX0.61pMT7GbYU9ZpWJjZnsBGrF_Lb9jLX0OkIYf1a6k6GY';

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_KEY);

// ==========================================
// 2. ESTADO GLOBAL
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
let adminTapCount = 0; // Para desbloquear God Mode

// ==========================================
// 3. MOTOR DE SONIDO (PROCEDURAL)
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
// 4. GOD MODE (ADMINISTRACIÓN) - OPTIMIZADO
// ==========================================
function triggerAdminUnlock() {
    adminTapCount++;
    if (adminTapCount === 5) {
        const pin = prompt("🔐 GOD MODE ACCESS PIN:");
        if (pin === "2025") { 
            alert("Bienvenido, CEO.");
            switchTab('admin');
            loadAdminStats();
            fetchAdminModeration();
        } else {
            alert("Acceso denegado.");
        }
        adminTapCount = 0;
    }
}

async function loadAdminStats() {
    // KPIs en tiempo real
    const { count: users } = await db.from('profiles').select('*', { count: 'exact', head: true });
    const { count: pending } = await db.from('suggestions').select('*', { count: 'exact', head: true });
    
    document.getElementById('admin-users').innerText = users || 0;
    document.getElementById('admin-pending').innerText = pending || 0;
}

// AQUÍ ESTÁ LA NUEVA LÓGICA DE SUPREMACÍA
async function adminCreateClash() {
    const a = document.getElementById('admin-opt-a').value;
    const b = document.getElementById('admin-opt-b').value;
    
    if(!a || !b) return alert("⚠️ Rellena las dos opciones, jefe.");
    
    // 1. Calcular fecha de MAÑANA
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateStr = tomorrow.toISOString().split('T')[0];
    
    // 2. PROTOCOLO DE SUPREMACÍA (Limpieza previa)
    // Borramos cualquier dilema automático o manual que ya existiera para esa fecha
    const { error: deleteError } = await db
        .from('clashes')
        .delete()
        .eq('publish_date', dateStr);

    if (deleteError) {
        console.error("Error limpiando fecha:", deleteError);
        return alert("Error técnico al limpiar la fecha.");
    }

    // 3. INSERCIÓN LIMPIA
    const { error: insertError } = await db.from('clashes').insert({
        option_a: a, 
        option_b: b, 
        publish_date: dateStr, 
        votes_a: 0, 
        votes_b: 0
    });

    if (insertError) {
        console.error("Error insertando:", insertError);
        return alert("No se pudo guardar el dilema.");
    }

    // 4. Feedback
    playSfx('success');
    alert(`✅ Dilema programado para mañana (${dateStr}).\nCualquier otro dilema anterior para esa fecha ha sido eliminado.`);
    
    document.getElementById('admin-opt-a').value = "";
    document.getElementById('admin-opt-b').value = "";
}

let adminJudgeId = null;
async function fetchAdminModeration() {
    const { data } = await db.from('suggestions').select('*').limit(1);
    if(data && data.length > 0) {
        adminJudgeId = data[0].id;
        document.getElementById('admin-sug-text').innerText = `(${data[0].category}) ${data[0].text}`;
    } else {
        document.getElementById('admin-sug-text').innerText = "No hay nada pendiente.";
        adminJudgeId = null;
    }
}

async function adminModerate(val) {
    if(!adminJudgeId) return;
    const { data: current } = await db.from('suggestions').select('*').eq('id', adminJudgeId).single();
    
    if(val === 1) { // APROBAR (Dedo de Dios)
        await db.from('questions').insert([{ text: current.text, category: current.category }]);
        await db.from('suggestions').delete().eq('id', adminJudgeId);
        playSfx('success');
    } else { // BORRAR
        await db.from('suggestions').delete().eq('id', adminJudgeId);
    }
    fetchAdminModeration();
}

// ==========================================
// 5. MOTOR VIRAL (GENERADOR DE IMAGEN)
// ==========================================
async function shareScreenshot(type) {
    playSfx('click');
    const captureDiv = document.getElementById('capture-stage');
    const textDiv = document.getElementById('capture-text');
    
    // Preparar contenido según sección
    if (type === 'oracle') {
        const q = document.getElementById('q-text').innerText;
        textDiv.innerHTML = `"${q}"`;
    } else if (type === 'clash') {
        const winText = clashData.va > clashData.vb ? clashData.a : clashData.b;
        const total = clashData.va + clashData.vb;
        const perc = total===0 ? 0 : Math.round((Math.max(clashData.va, clashData.vb)/total)*100);
        textDiv.innerHTML = `La gente prefiere:<br><br><span style="color:#FFD700">${winText}</span><br>(${perc}%)`;
    } else if (type === 'profile') {
        textDiv.innerHTML = `Soy ${currentUser.name} ${currentUser.avatar}<br><br>Racha: ${currentUser.streak} 🔥<br>Nivel: ${document.getElementById('profile-level').innerText}`;
    }

    try {
        // Renderizar imagen
        const canvas = await html2canvas(captureDiv, { scale: 2, useCORS: true });
        
        canvas.toBlob(async (blob) => {
            const file = new File([blob], "totalkmon_share.png", { type: "image/png" });
            
            // Compartir nativo
            if (navigator.share) {
                await navigator.share({
                    files: [file],
                    title: 'Totalkmon',
                    text: 'Mira esto 👇'
                });
            } else {
                alert("Tu dispositivo no soporta compartir imágenes directas. Haz captura manual.");
            }
        });
    } catch (err) {
        console.error(err);
        alert("Error generando imagen.");
    }
}

// ==========================================
// 6. IDENTIDAD EN LA NUBE (LOGIN SILENCIOSO)
// ==========================================
async function initUser() {
    if (!currentUser.id) {
        // Registro nuevo usuario
        const { data } = await db.from('profiles').insert([{
            username: currentUser.name,
            avatar: currentUser.avatar,
            streak: 1,
            last_visit: new Date().toISOString()
        }]).select().single();

        if (data) {
            currentUser.id = data.id;
            localStorage.setItem('user_uuid', data.id);
        }
    } else {
        // Sincronización usuario existente
        const { data } = await db.from('profiles').select('*').eq('id', currentUser.id).single();
        if (data) {
            currentUser.streak = data.streak;
            currentUser.votes = data.votes_cast;
            checkStreakCloud(data);
            updateProfileUI();
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

function checkStreakCloud(cloudData) {
    const today = new Date().toISOString().split('T')[0];
    const lastVisit = cloudData.last_visit ? cloudData.last_visit.split('T')[0] : null;

    if (lastVisit !== today) {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split('T')[0];

        if (lastVisit === yesterdayStr) {
            currentUser.streak++; // Racha sigue
            setTimeout(() => playSfx('success'), 800);
        } else {
            currentUser.streak = 1; // Racha rota
        }
        
        // Guardar en nube
        db.from('profiles').update({ 
            last_visit: new Date().toISOString(),
            streak: currentUser.streak 
        }).eq('id', currentUser.id);

        updateProfileUI();
    }
}

// ==========================================
// 7. FUNCIONES DEL ORÁCULO
// ==========================================
async function fetchQuestions() {
    const { data } = await db.from('questions').select('*').limit(50); 
    if(data && data.length > 0) allQuestions = data;
    else allQuestions = [{text: "Bienvenido.", category: "Inicio"}];
    nextQuestion();
}

function nextQuestion() {
    let pool = allQuestions;
    if(currentCategory !== 'aleatorio') pool = allQuestions.filter(q => q.category.toLowerCase() === currentCategory.toLowerCase());
    
    if(pool.length === 0) pool = allQuestions; 

    const cardContent = document.querySelector('.card-inner');
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
// 8. FUNCIONES DEL DILEMA
// ==========================================
async function loadClash() {
    const today = new Date().toISOString().split('T')[0];
    let { data } = await db.from('clashes').select('*').eq('publish_date', today);
    
    if (!data || data.length === 0) {
        const { data: r } = await db.from('clashes').select('*').limit(1);
        data = r;
    }

    if(data && data.length > 0) {
        const c = data[0];
        currentClashId = c.id;
        clashData = { a: c.option_a, b: c.option_b, va: c.votes_a, vb: c.votes_b };
        document.getElementById('text-a').innerText = c.option_a;
        document.getElementById('text-b').innerText = c.option_b;
        
        // Verificar voto previo (Local + Cloud)
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
    if(document.getElementById('clash-section').classList.contains('voted')) return;

    playSfx('click');

    let a = clashData.va, b = clashData.vb;
    if(opt === 'a') a++; else b++;
    showResults(a, b);

    // Guardar en nube
    await db.from('user_votes').insert({
        user_id: currentUser.id,
        clash_id: currentClashId,
        vote_option: opt
    });

    await db.from('clashes').update({ votes_a: a, votes_b: b }).eq('id', currentClashId);
    
    localStorage.setItem('voted_'+currentClashId, 'true');
    currentUser.votes++;
    updateProfileUI();
    syncProfileToCloud();
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

// ==========================================
// 9. FUNCIONES DE JUICIO
// ==========================================
async function fetchJudge() {
    const { data } = await db.from('suggestions').select('*').limit(5);
    if (data && data.length > 0) {
        const r = data[Math.floor(Math.random() * data.length)];
        currentJudgeId = r.id;
        document.getElementById('judge-text').innerText = r.text;
        document.getElementById('judge-cat').innerText = r.category;
    } else {
        document.getElementById('judge-text').innerText = "Todo