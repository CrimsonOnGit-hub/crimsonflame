import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut, setPersistence, browserLocalPersistence, updateProfile } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, query, orderBy, where, doc, onSnapshot, updateDoc, serverTimestamp, arrayUnion, arrayRemove } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getStorage, ref, uploadBytesResumable, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-storage.js";

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

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);
setPersistence(auth, browserLocalPersistence);

let activeServerId = null;
let activeServerAdmins = []; 
let activeChannelId = null;
let isGlobalAdmin = false; 

let chatterServersUnsub = null;
let chatterChannelsUnsub = null;
let chatterMessagesUnsub = null;
let ticketChatUnsubscribe = null;
let activeTicketId = null;

// --- NOTIFICATIONS ---
function requestNotificationPermission() {
    if ("Notification" in window && Notification.permission !== "granted" && Notification.permission !== "denied") {
        Notification.requestPermission();
    }
}
function triggerBrowserNotification(title, body) {
    if ("Notification" in window && Notification.permission === "granted") {
        new Notification(title, { body: body, icon: DEFAULT_PFP });
    }
}

// --- ROUTING ---
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

// --- AUTH ---
onAuthStateChanged(auth, user => {
    const navAuth = document.getElementById('nav-auth-link');
    if(user) {
        requestNotificationPermission();
        isGlobalAdmin = (user.email.toLowerCase() === ADMIN_EMAIL.toLowerCase());

        navAuth.innerText = "Dashboard";
        document.getElementById('login-container').style.display = 'none';
        document.getElementById('dashboard-container').style.display = 'block';
        document.getElementById('ticket-locked').style.display = 'none';
        document.getElementById('ticket-system').style.display = 'block';
        document.getElementById('chatter-locked').style.display = 'none';
        document.getElementById('chatter-system').style.display = 'flex';
        
        document.getElementById('user-display-email').innerText = user.email;
        document.getElementById('display-name').value = user.displayName || "";
        document.getElementById('display-pfp').value = user.photoURL || "";
        document.getElementById('dashboard-pfp-preview').src = user.photoURL || DEFAULT_PFP;

        document.getElementById('admin-panel').style.display = isGlobalAdmin ? 'block' : 'none';
    } else {
        isGlobalAdmin = false;
        navAuth.innerText = "Login";
        document.getElementById('login-container').style.display = 'block';
        document.getElementById('dashboard-container').style.display = 'none';
        document.getElementById('ticket-locked').style.display = 'block';
        document.getElementById('ticket-system').style.display = 'none';
        document.getElementById('chatter-locked').style.display = 'flex';
        document.getElementById('chatter-system').style.display = 'none';
    }
});

let isLogin = true;
document.getElementById('toggle-auth').onclick = () => {
    isLogin = !isLogin;
    document.getElementById('auth-title').innerText = isLogin ? "Account Login" : "Register Account";
    document.getElementById('toggle-auth').innerText = isLogin ? "Register here" : "Login here";
};

document.getElementById('login-form').onsubmit = (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const pass = document.getElementById('password').value;
    if(isLogin) signInWithEmailAndPassword(auth, email, pass).then(()=>window.routeTo('home')).catch(err=>alert(err.message));
    else createUserWithEmailAndPassword(auth, email, pass).then(()=>window.routeTo('home')).catch(err=>alert(err.message));
};

document.getElementById('logout-btn').onclick = () => { signOut(auth); window.routeTo('home'); };

document.getElementById('profile-form').onsubmit = async (e) => {
    e.preventDefault();
    const newName = document.getElementById('display-name').value;
    const newPfp = document.getElementById('display-pfp').value;
    if (auth.currentUser) {
        await updateProfile(auth.currentUser, { displayName: newName, photoURL: newPfp });
        document.getElementById('dashboard-pfp-preview').src = newPfp || DEFAULT_PFP;
        alert("Profile Updated Successfully!");
    }
};

// --- DRAG AND DROP STORAGE ---
const pfpDropZone = document.getElementById('pfp-drop-zone');
const pfpFileInput = document.getElementById('pfp-file-input');
pfpDropZone.addEventListener('click', () => pfpFileInput.click());
pfpFileInput.addEventListener('change', (e) => handleImageUpload(e.target.files[0], 'pfp'));
pfpDropZone.addEventListener('dragover', (e) => { e.preventDefault(); pfpDropZone.classList.add('dragover'); });
pfpDropZone.addEventListener('dragleave', () => pfpDropZone.classList.remove('dragover'));
pfpDropZone.addEventListener('drop', (e) => { e.preventDefault(); pfpDropZone.classList.remove('dragover'); if (e.dataTransfer.files.length) handleImageUpload(e.dataTransfer.files[0], 'pfp'); });

const serverDropZone = document.getElementById('server-drop-zone');
const serverFileInput = document.getElementById('server-file-input');
serverDropZone.addEventListener('click', () => serverFileInput.click());
serverFileInput.addEventListener('change', (e) => handleImageUpload(e.target.files[0], 'server'));
serverDropZone.addEventListener('dragover', (e) => { e.preventDefault(); serverDropZone.classList.add('dragover'); });
serverDropZone.addEventListener('dragleave', () => serverDropZone.classList.remove('dragover'));
serverDropZone.addEventListener('drop', (e) => { e.preventDefault(); serverDropZone.classList.remove('dragover'); if (e.dataTransfer.files.length) handleImageUpload(e.dataTransfer.files[0], 'server'); });

async function handleImageUpload(file, type) {
    if (!file || !file.type.startsWith('image/')) return alert("Please upload a valid image file.");
    let path, statusEl, previewEl;
    
    if (type === 'pfp') {
        path = `users/${auth.currentUser.uid}/pfp_${Date.now()}`;
        statusEl = document.getElementById('upload-status');
        previewEl = document.getElementById('dashboard-pfp-preview');
    } else if (type === 'server') {
        if(!activeServerId) return;
        path = `servers/${activeServerId}/icon_${Date.now()}`;
        statusEl = document.getElementById('server-upload-status');
        previewEl = document.getElementById('server-icon-preview');
    }

    statusEl.style.display = 'block';
    statusEl.innerText = "Uploading file to Firebase...";

    try {
        const storageRef = ref(storage, path);
        await uploadBytesResumable(storageRef, file);
        const downloadURL = await getDownloadURL(storageRef);

        previewEl.src = downloadURL;
        previewEl.style.display = 'block';

        if (type === 'pfp') {
            document.getElementById('display-pfp').value = downloadURL;
            statusEl.innerText = "Done! Click 'Save Profile Info'.";
        } else if (type === 'server') {
            await updateDoc(doc(db, "discord_servers", activeServerId), { photoURL: downloadURL });
            statusEl.innerText = "Server Icon Updated!";
        }
        setTimeout(() => statusEl.style.display = 'none', 4000);
    } catch (error) {
        statusEl.innerText = "Error: Permission denied. Check Storage Rules.";
        console.error(error);
    }
}

// --- UPDATES ---
async function fetchNews() {
    const feed = document.getElementById('news-feed');
    try {
        const snap = await getDocs(query(collection(db, "news"), orderBy("timestamp", "desc")));
        feed.innerHTML = "";
        if(snap.empty) { feed.innerHTML = "<p style='color:#aaa;'>No updates posted yet.</p>"; return; }
        snap.forEach(d => {
            const data = d.data();
            feed.innerHTML += `<div class="news-card"><small style="color:var(--crimson);">${data.date}</small><h3 style="margin:5px 0;">${data.title}</h3><div>${marked.parse(data.body)}</div></div>`;
        });
    } catch(e) {
        feed.innerHTML = `<p style="color:var(--crimson);">Error fetching updates: ${e.message}</p>`;
    }
}

document.getElementById('news-form').onsubmit = async (e) => {
    e.preventDefault();
    await addDoc(collection(db, "news"), {
        title: document.getElementById('news-title').value,
        body: document.getElementById('news-body').value,
        date: new Date().toLocaleDateString(),
        timestamp: serverTimestamp()
    });
    document.getElementById('news-form').reset();
    alert("Published!");
};

// --- CHATTER ---
function initChatter() {
    if(chatterServersUnsub) return;
    const serverList = document.getElementById('server-list');
    const myServersQuery = query(collection(db, "discord_servers"), where("members", "array-contains", auth.currentUser.uid));
    
    chatterServersUnsub = onSnapshot(myServersQuery, snap => {
        serverList.innerHTML = "";
        snap.forEach(docSnap => {
            const data = docSnap.data();
            const el = document.createElement('div');
            el.className = `server-icon ${activeServerId === docSnap.id ? 'active' : ''}`;
            el.title = data.name;
            
            if(data.photoURL) {
                el.innerHTML = `<img src="${data.photoURL}">`;
            } else {
                el.innerText = data.name.substring(0,2).toUpperCase();
            }
            
            el.onclick = () => selectServer(docSnap.id, data, el);
            serverList.appendChild(el);
        });
    });
}

document.getElementById('add-server-btn').onclick = async () => {
    if(!auth.currentUser) return;
    const name = prompt("Enter Server Name:");
    if(name) {
        try {
            const newServer = await addDoc(collection(db, "discord_servers"), { 
                name: name, owner: auth.currentUser.uid, members: [auth.currentUser.uid], admins: [auth.currentUser.uid], banned: [], photoURL: "", timestamp: serverTimestamp() 
            });
            await addDoc(collection(db, "discord_servers", newServer.id, "channels"), { name: "general", timestamp: serverTimestamp() });
        } catch(err) { alert("Failed to create server: " + err.message); }
    }
};

document.getElementById('btn-discovery').onclick = async () => {
    document.querySelectorAll('.server-icon').forEach(el => el.classList.remove('active'));
    document.getElementById('btn-discovery').classList.add('active');
    document.getElementById('active-server-name').innerText = "Discovery";
    document.getElementById('channel-list').innerHTML = "";
    document.getElementById('add-channel-btn').style.display = 'none';
    document.getElementById('server-settings-btn').style.display = 'none';
    document.getElementById('chat-box').style.display = 'none';
    document.getElementById('chat-form').style.display = 'none';
    
    const discBox = document.getElementById('discovery-box');
    discBox.style.display = 'flex';
    discBox.innerHTML = "Loading...";

    const snap = await getDocs(collection(db, "discord_servers"));
    discBox.innerHTML = "";
    if(snap.empty) { discBox.innerHTML = "<p style='color:#aaa; width:100%; text-align:center;'>No servers exist.</p>"; return; }

    snap.forEach(docSnap => {
        const data = docSnap.data();
        if(!data.members?.includes(auth.currentUser.uid) && !data.banned?.includes(auth.currentUser.uid)) {
            const imgHtml = data.photoURL ? `<img src="${data.photoURL}">` : `<div class="discovery-card-placeholder">${data.name.substring(0,2).toUpperCase()}</div>`;
            discBox.innerHTML += `<div class="discovery-card">${imgHtml}<h3>${data.name}</h3><button class="btn-primary" onclick="joinServer('${docSnap.id}')">Join</button></div>`;
        }
    });
};

window.joinServer = async function(serverId) {
    try {
        await updateDoc(doc(db, "discord_servers", serverId), { members: arrayUnion(auth.currentUser.uid) });
        document.getElementById('btn-discovery').click();
    } catch(err) { alert("Failed to join."); }
};

function selectServer(serverId, serverData, element) {
    document.getElementById('chat-box').style.display = 'flex';
    document.getElementById('discovery-box').style.display = 'none';

    activeServerId = serverId;
    activeServerAdmins = serverData.admins || [serverData.owner];
    activeChannelId = null;
    document.getElementById('active-server-name').innerText = serverData.name;
    
    const amIAdmin = activeServerAdmins.includes(auth.currentUser.uid) || serverData.owner === auth.currentUser.uid || isGlobalAdmin;
    
    document.getElementById('add-channel-btn').style.display = amIAdmin ? 'block' : 'none';
    document.getElementById('server-settings-btn').style.display = amIAdmin ? 'block' : 'none';
    
    document.getElementById('chat-form').style.display = 'none';
    document.getElementById('chat-box').innerHTML = "";
    
    document.querySelectorAll('.server-icon').forEach(el => el.classList.remove('active'));
    if(element) element.classList.add('active');

    if(chatterChannelsUnsub) chatterChannelsUnsub();
    const channelList = document.getElementById('channel-list');
    
    chatterChannelsUnsub = onSnapshot(query(collection(db, "discord_servers", serverId, "channels"), orderBy("timestamp", "asc")), snap => {
        channelList.innerHTML = "";
        snap.forEach(docSnap => {
            const cData = docSnap.data();
            const el = document.createElement('div');
            el.className = `channel-item ${activeChannelId === docSnap.id ? 'active' : ''}`;
            el.innerText = cData.name;
            el.onclick = () => selectChannel(docSnap.id, cData.name, el);
            channelList.appendChild(el);
        });
    });
}

document.getElementById('server-settings-btn').onclick = () => {
    document.getElementById('server-settings-modal').style.display = 'flex';
    document.getElementById('server-upload-status').style.display = 'none';
};

document.getElementById('add-channel-btn').onclick = async () => {
    if(!activeServerId) return;
    const name = prompt("Enter Channel Name:");
    if(name) await addDoc(collection(db, "discord_servers", activeServerId, "channels"), { name: name.toLowerCase().replace(/\s+/g, '-'), timestamp: serverTimestamp() });
};

function selectChannel(channelId, channelName, element) {
    activeChannelId = channelId;
    document.getElementById('active-channel-name').innerText = `# ${channelName}`;
    document.getElementById('chat-form').style.display = 'block';
    
    document.querySelectorAll('.channel-item').forEach(el => el.classList.remove('active'));
    element.classList.add('active');

    const amIAdmin = activeServerAdmins.includes(auth.currentUser.uid) || isGlobalAdmin;
    const myName = auth.currentUser.displayName || auth.currentUser.email.split('@')[0];

    if(chatterMessagesUnsub) chatterMessagesUnsub();
    const box = document.getElementById('chat-box');
    let isInitialLoad = true;

    chatterMessagesUnsub = onSnapshot(query(collection(db, "discord_servers", activeServerId, "channels", activeChannelId, "messages"), orderBy("timestamp", "asc")), snap => {
        box.innerHTML = "";
        
        snap.forEach(mDoc => {
            const m = mDoc.data();
            const nameToUse = m.senderName || m.senderEmail.split('@')[0];
            const pfpToUse = m.senderPfp || DEFAULT_PFP;
            
            const isEveryone = m.text.includes('@everyone');
            const isPinged = m.text.includes(`@${myName}`) || isEveryone;
            let formattedText = m.text.replace(/@(\w+)/g, '<span class="mention">@$1</span>');
            const pingClass = isPinged ? 'ping-highlight' : '';
            
            let actionHTML = '';
            if(amIAdmin && m.senderUid !== auth.currentUser.uid) {
                if (!activeServerAdmins.includes(m.senderUid)) actionHTML += `<button class="action-btn promote" onclick="promoteAdmin('${m.senderUid}')">👑 Promote</button>`;
                actionHTML += `<button class="action-btn ban" onclick="banUser('${m.senderUid}')">🔨 Ban</button>`;
            }

            box.innerHTML += `
                <div class="msg">
                    <img src="${pfpToUse}" class="chat-pfp">
                    <div class="msg-content">
                        <span class="msg-sender">${nameToUse} <div style="display:flex; gap:5px;">${actionHTML}</div></span>
                        <div class="msg-text ${pingClass}">${formattedText}</div>
                    </div>
                </div>`;
        });
        box.scrollTop = box.scrollHeight;

        if (!isInitialLoad) {
            snap.docChanges().forEach(change => {
                if (change.type === 'added') {
                    const m = change.doc.data();
                    if (m.senderUid !== auth.currentUser.uid) {
                        const senderDisplay = m.senderName || m.senderEmail.split('@')[0];
                        if (m.text.includes(`@${myName}`) || m.text.includes('@everyone')) triggerBrowserNotification(`Ping in #${channelName}`, `${senderDisplay}: ${m.text}`);
                        else if (document.hidden) triggerBrowserNotification(`New message in #${channelName}`, `${senderDisplay}: ${m.text}`);
                    }
                }
            });
        }
        isInitialLoad = false;
    });
}

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

document.getElementById('chat-form').onsubmit = async (e) => {
    e.preventDefault();
    const input = document.getElementById('chat-input');
    if(!input.value.trim() || !activeServerId || !activeChannelId) return;

    await addDoc(collection(db, "discord_servers", activeServerId, "channels", activeChannelId, "messages"), {
        text: input.value, senderUid: auth.currentUser.uid, senderEmail: auth.currentUser.email,
        senderName: auth.currentUser.displayName || "", senderPfp: auth.currentUser.photoURL || "", timestamp: serverTimestamp()
    });
    input.value = "";
};

// --- SUPPORT TICKETS ---
window.fetchTickets = async function() {
    if(!auth.currentUser) return;
    const list = document.getElementById('ticket-list');
    list.innerHTML = "Syncing Grid...";
    
    let q = query(collection(db, "tickets"), orderBy("timestamp", "desc"));
    if(!isGlobalAdmin) q = query(collection(db, "tickets"), where("userId", "==", auth.currentUser.uid), orderBy("timestamp", "desc"));
    
    try {
        const snap = await getDocs(q);
        list.innerHTML = "";
        if(snap.empty) { list.innerHTML = "<p style='color:#aaa;'>No support tickets found.</p>"; return; }
        
        snap.forEach(tDoc => {
            const d = tDoc.data();
            const item = document.createElement('div');
            item.className = "auth-card";
            item.style.cursor = "pointer";
            item.innerHTML = `<strong>${d.subject}</strong> <span style="float:right; color:${d.status === 'Open' ? '#0f0' : '#777'}">${d.status}</span><br><small>${d.userEmail}</small>`;
            item.onclick = () => openThread(tDoc.id, d);
            list.appendChild(item);
        });
    } catch(err) { 
        list.innerHTML = `<p style="color:var(--crimson);">Error fetching tickets: ${err.message}. Check Firebase Index rules.</p>`;
        console.error(err); 
    }
}

function openThread(id, data) {
    activeTicketId = id;
    document.getElementById('list-view').style.display = 'none';
    document.getElementById('thread-view').style.display = 'block';
    document.getElementById('active-subject').innerText = data.subject;
    
    if (data.status === "Closed") {
        document.getElementById('ticket-chat-form').style.display = 'none';
        document.getElementById('admin-close-area').style.display = 'none';
        document.getElementById('resolution-box').style.display = 'block';
        document.getElementById('resolution-text').innerText = data.closeReason || "No reason recorded.";
    } else {
        document.getElementById('ticket-chat-form').style.display = 'flex';
        document.getElementById('resolution-box').style.display = 'none';
        document.getElementById('admin-close-area').style.display = isGlobalAdmin ? 'block' : 'none';
    }

    document.getElementById('close-ticket-btn').onclick = async () => {
        const r = document.getElementById('close-reason').value;
        if(!r) return alert("Resolution required.");
        await updateDoc(doc(db, "tickets", id), { status: "Closed", closeReason: r });
        document.getElementById('back-btn').click();
    };

    let isInitialLoad = true;
    if(ticketChatUnsubscribe) ticketChatUnsubscribe();
    
    ticketChatUnsubscribe = onSnapshot(query(collection(db, "tickets", id, "messages"), orderBy("timestamp", "asc")), snap => {
        const box = document.getElementById('ticket-chat-box');
        box.innerHTML = "";
        snap.forEach(mDoc => {
            const m = mDoc.data();
            const isMe = m.sender === auth.currentUser.email;
            box.innerHTML += `<div style="align-self:${isMe ? 'flex-end' : 'flex-start'}; background:${isMe ? 'var(--crimson)' : '#222'}; padding:8px 12px; border-radius:8px; max-width:80%; font-size:0.9rem;">
                <small style="display:block; opacity:0.5; font-size:0.6rem;">${m.senderName || m.sender}</small>${m.text}</div>`;
        });
        box.scrollTop = box.scrollHeight;

        if (!isInitialLoad && document.hidden) {
            snap.docChanges().forEach(change => {
                if (change.type === 'added') {
                    const m = change.doc.data();
                    if (m.sender !== auth.currentUser.email) {
                        triggerBrowserNotification("Support Ticket Update", `${m.senderName || m.sender}: ${m.text}`);
                    }
                }
            });
        }
        isInitialLoad = false;
    });
}

document.getElementById('back-btn').onclick = () => {
    document.getElementById('list-view').style.display = 'block';
    document.getElementById('thread-view').style.display = 'none';
    if(ticketChatUnsubscribe) ticketChatUnsubscribe();
    window.fetchTickets();
};

document.getElementById('ticket-chat-form').onsubmit = async (e) => {
    e.preventDefault();
    const input = document.getElementById('ticket-chat-input');
    await addDoc(collection(db, "tickets", activeTicketId, "messages"), { text: input.value, sender: auth.currentUser.email, senderName: auth.currentUser.displayName || auth.currentUser.email, timestamp: serverTimestamp() });
    input.value = "";
};

document.getElementById('ticket-form').onsubmit = async (e) => {
    e.preventDefault();
    const subj = document.getElementById('ticket-subject').value;
    const msg = document.getElementById('ticket-msg').value;
    await addDoc(collection(db, "tickets"), { userId: auth.currentUser.uid, userEmail: auth.currentUser.email, subject: subj, message: msg, status: "Open", timestamp: serverTimestamp() });
    document.getElementById('ticket-form').reset();
    window.fetchTickets();
};
