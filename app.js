import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut, setPersistence, browserLocalPersistence, updateProfile } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, getDoc, query, orderBy, where, doc, onSnapshot, updateDoc, serverTimestamp, arrayUnion, arrayRemove } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyBSSJKDrFJ1_qlliZqgw34CY2TSaKOxxxM",
    authDomain: "crimsonflame-8169e.firebaseapp.com",
    projectId: "crimsonflame-8169e",
    storageBucket: "crimsonflame-8169e.firebasestorage.app",
    messagingSenderId: "406321213530",
    appId: "1:406321213530:web:92d27a69d34d147393a863"
};

const ADMIN_EMAIL = "allaboutwaterdiamond@gmail.com";
const DEFAULT_PFP = "https://cdn-icons-png.flaticon.com/512/149/149071.png";
const IMGBB_API_KEY = "d5fd4e3e9fedc18b9bed075f980f12b7"; 

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- EXPORT FUNCTIONS TO WINDOW (Fixes Menu Clicks) ---
window.routeTo = function(page) {
    document.querySelectorAll('.page-content').forEach(p => p.style.display = 'none');
    const target = document.getElementById('page-' + page);
    if(target) target.style.display = 'block';
    
    document.querySelectorAll('nav a').forEach(a => a.style.color = 'white');
    const activeLink = document.querySelector(`nav a[onclick="routeTo('${page}')"]`);
    if(activeLink) activeLink.style.color = 'var(--crimson)';

    if(page === 'updates') fetchNews();
    if(page === 'chatter' && auth.currentUser) initChatter();
    if(page === 'tickets' && auth.currentUser) window.fetchTickets();
};

window.joinServer = async function(serverId) {
    try {
        await updateDoc(doc(db, "discord_servers", serverId), { members: arrayUnion(auth.currentUser.uid) });
        if(document.getElementById('btn-discovery')) document.getElementById('btn-discovery').click();
    } catch(err) { alert("Failed to join."); }
};

window.promoteAdmin = async function(targetUid) {
    if(confirm("Make this user an Admin?")) {
        await updateDoc(doc(db, "discord_servers", activeServerId), { admins: arrayUnion(targetUid) });
        activeServerAdmins.push(targetUid); 
    }
};

window.banUser = async function(targetUid) {
    if(confirm("Ban this user?")) {
        await updateDoc(doc(db, "discord_servers", activeServerId), { members: arrayRemove(targetUid), banned: arrayUnion(targetUid) });
    }
};

// --- STATE ---
let activeServerId = null;
let activeServerAdmins = []; 
let activeChannelId = null;
let isGlobalAdmin = false; 
let chatterServersUnsub = null;
let chatterChannelsUnsub = null;
let chatterMessagesUnsub = null;
let ticketChatUnsubscribe = null;
let activeTicketId = null;

// --- AUTH & INITIALIZATION ---
setPersistence(auth, browserLocalPersistence);

onAuthStateChanged(auth, user => {
    const navAuth = document.getElementById('nav-auth-link');
    if(user) {
        isGlobalAdmin = (user.email.toLowerCase() === ADMIN_EMAIL.toLowerCase());
        if(navAuth) navAuth.innerText = "Dashboard";
        toggleChatterUI(true, user);
    } else {
        isGlobalAdmin = false;
        if(navAuth) navAuth.innerText = "Login";
        toggleChatterUI(false);
    }
});

function toggleChatterUI(isLoggedIn, user = null) {
    const locked = document.getElementById('chatter-locked');
    const system = document.getElementById('chatter-system');
    const tLocked = document.getElementById('ticket-locked');
    const tSystem = document.getElementById('ticket-system');

    if(isLoggedIn) {
        if(locked) locked.style.display = 'none';
        if(system) system.style.display = 'flex';
        if(tLocked) tLocked.style.display = 'none';
        if(tSystem) tSystem.style.display = 'block';
        
        // Update Profile UI
        if(document.getElementById('user-display-email')) document.getElementById('user-display-email').innerText = user.email;
        if(document.getElementById('display-name')) document.getElementById('display-name').value = user.displayName || "";
        if(document.getElementById('dashboard-pfp-preview')) document.getElementById('dashboard-pfp-preview').src = user.photoURL || DEFAULT_PFP;
        if(document.getElementById('admin-panel')) document.getElementById('admin-panel').style.display = isGlobalAdmin ? 'block' : 'none';
        document.getElementById('login-container').style.display = 'none';
        document.getElementById('dashboard-container').style.display = 'block';
    } else {
        if(locked) locked.style.display = 'flex';
        if(system) system.style.display = 'none';
        if(tLocked) tLocked.style.display = 'block';
        if(tSystem) tSystem.style.display = 'none';
        document.getElementById('login-container').style.display = 'block';
        document.getElementById('dashboard-container').style.display = 'none';
    }
}

// --- CHATTER CORE ---
function initChatter() {
    if(chatterServersUnsub) return;
    const serverList = document.getElementById('server-list');
    const myServersQuery = query(collection(db, "discord_servers"), where("members", "array-contains", auth.currentUser.uid));
    
    chatterServersUnsub = onSnapshot(myServersQuery, snap => {
        if(!serverList) return;
        serverList.innerHTML = "";
        snap.forEach(docSnap => {
            const data = docSnap.data();
            const el = document.createElement('div');
            el.className = `server-icon ${activeServerId === docSnap.id ? 'active' : ''}`;
            if(data.photoURL) el.innerHTML = `<img src="${data.photoURL}">`;
            else el.innerText = data.name.substring(0,2).toUpperCase();
            el.onclick = (e) => { e.preventDefault(); selectServer(docSnap.id, data, el); };
            serverList.appendChild(el);
        });
    });
}

function selectServer(serverId, serverData, element) {
    activeServerId = serverId;
    activeServerAdmins = serverData.admins || [serverData.owner];
    
    document.getElementById('chat-box').style.display = 'flex';
    document.getElementById('discovery-box').style.display = 'none';
    document.getElementById('active-server-name').innerText = serverData.name;
    
    const amIAdmin = activeServerAdmins.includes(auth.currentUser.uid) || isGlobalAdmin;
    document.getElementById('add-channel-btn').style.display = amIAdmin ? 'block' : 'none';
    document.getElementById('server-settings-btn').style.display = amIAdmin ? 'block' : 'none';
    document.getElementById('chat-form').style.display = 'none';
    document.getElementById('chat-box').innerHTML = "";
    
    document.querySelectorAll('.server-icon').forEach(el => el.classList.remove('active'));
    if(element) element.classList.add('active');

    if(chatterChannelsUnsub) chatterChannelsUnsub();
    chatterChannelsUnsub = onSnapshot(query(collection(db, "discord_servers", serverId, "channels"), orderBy("timestamp", "asc")), snap => {
        const channelList = document.getElementById('channel-list');
        channelList.innerHTML = "";
        snap.forEach(docSnap => {
            const cData = docSnap.data();
            const el = document.createElement('div');
            el.className = `channel-item ${activeChannelId === docSnap.id ? 'active' : ''}`;
            el.innerText = cData.name;
            el.onclick = (e) => { e.preventDefault(); selectChannel(docSnap.id, cData.name, el); };
            channelList.appendChild(el);
        });
    });
}

function selectChannel(channelId, channelName, element) {
    activeChannelId = channelId;
    document.getElementById('active-channel-name').innerText = `# ${channelName}`;
    document.getElementById('chat-form').style.display = 'block';
    document.querySelectorAll('.channel-item').forEach(el => el.classList.remove('active'));
    element.classList.add('active');

    if(chatterMessagesUnsub) chatterMessagesUnsub();
    const box = document.getElementById('chat-box');
    chatterMessagesUnsub = onSnapshot(query(collection(db, "discord_servers", activeServerId, "channels", activeChannelId, "messages"), orderBy("timestamp", "asc")), snap => {
        box.innerHTML = "";
        snap.forEach(mDoc => {
            const m = mDoc.data();
            const isMe = m.senderUid === auth.currentUser.uid;
            const isPinged = m.text.includes(`@${auth.currentUser.displayName}`) || m.text.includes('@everyone');
            
            box.innerHTML += `
                <div class="msg">
                    <img src="${m.senderPfp || DEFAULT_PFP}" class="chat-pfp">
                    <div class="msg-content">
                        <span class="msg-sender">${m.senderName || 'User'}</span>
                        <div class="msg-text ${isPinged ? 'ping-highlight' : ''}">${m.text.replace(/@(\w+)/g, '<span class="mention">@$1</span>')}</div>
                    </div>
                </div>`;
        });
        box.scrollTop = box.scrollHeight;
    });
}

// --- MESSAGE SENDING ---
document.getElementById('chat-form').onsubmit = async (e) => {
    e.preventDefault();
    const input = document.getElementById('chat-input');
    if(!input.value.trim() || !activeServerId || !activeChannelId) return;

    await addDoc(collection(db, "discord_servers", activeServerId, "channels", activeChannelId, "messages"), {
        text: input.value, senderUid: auth.currentUser.uid, senderEmail: auth.currentUser.email,
        senderName: auth.currentUser.displayName || "User", senderPfp: auth.currentUser.photoURL || "", timestamp: serverTimestamp()
    });
    input.value = "";
};

// --- IMGBB UPLOAD ---
async function handleImageUpload(file, type) {
    const statusEl = type === 'pfp' ? document.getElementById('upload-status') : document.getElementById('server-upload-status');
    statusEl.style.display = 'block'; statusEl.innerText = "Uploading...";

    const formData = new FormData();
    formData.append("image", file);
    try {
        const res = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, { method: "POST", body: formData });
        const data = await res.json();
        const url = data.data.url;

        if (type === 'pfp') {
            document.getElementById('dashboard-pfp-preview').src = url;
            document.getElementById('display-pfp').value = url;
        } else {
            await updateDoc(doc(db, "discord_servers", activeServerId), { photoURL: url });
            document.getElementById('server-icon-preview').src = url;
        }
        statusEl.innerText = "Done!";
    } catch (err) { statusEl.innerText = "Upload Failed."; }
}

// --- DISCOVERY & SERVER MANAGEMENT ---
document.getElementById('add-server-btn').onclick = async () => {
    const name = prompt("Server Name:");
    if(name) {
        const newS = await addDoc(collection(db, "discord_servers"), { name, owner: auth.currentUser.uid, members: [auth.currentUser.uid], admins: [auth.currentUser.uid], banned: [], timestamp: serverTimestamp() });
        await addDoc(collection(db, "discord_servers", newS.id, "channels"), { name: "general", timestamp: serverTimestamp() });
    }
};

document.getElementById('btn-discovery').onclick = async () => {
    const discBox = document.getElementById('discovery-box');
    discBox.style.display = 'flex';
    document.getElementById('chat-box').style.display = 'none';
    const snap = await getDocs(collection(db, "discord_servers"));
    discBox.innerHTML = "";
    snap.forEach(d => {
        const data = d.data();
        if(!data.members.includes(auth.currentUser.uid)) {
            discBox.innerHTML += `<div class="discovery-card"><h3>${data.name}</h3><button class="btn-primary" onclick="joinServer('${d.id}')">Join</button></div>`;
        }
    });
};

// --- REMAINING DASHBOARD LOGIC ---
document.getElementById('profile-form').onsubmit = async (e) => {
    e.preventDefault();
    await updateProfile(auth.currentUser, { displayName: document.getElementById('display-name').value, photoURL: document.getElementById('display-pfp').value });
    alert("Saved!");
};

document.getElementById('login-form').onsubmit = (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value, pass = document.getElementById('password').value;
    signInWithEmailAndPassword(auth, email, pass).catch(() => createUserWithEmailAndPassword(auth, email, pass));
};

// --- NEWS & TICKETS (Restored Logic) ---
async function fetchNews() {
    const snap = await getDocs(query(collection(db, "news"), orderBy("timestamp", "desc")));
    const feed = document.getElementById('news-feed');
    feed.innerHTML = "";
    snap.forEach(d => feed.innerHTML += `<div class="news-card"><h3>${d.data().title}</h3><p>${d.data().body}</p></div>`);
}

document.getElementById('pfp-drop-zone').onclick = () => document.getElementById('pfp-file-input').click();
document.getElementById('pfp-file-input').onchange = (e) => handleImageUpload(e.target.files[0], 'pfp');
