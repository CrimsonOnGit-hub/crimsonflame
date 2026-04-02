import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut, setPersistence, browserLocalPersistence, updateProfile } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, query, orderBy, where, doc, onSnapshot, updateDoc, serverTimestamp, arrayUnion, arrayRemove } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

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
setPersistence(auth, browserLocalPersistence);

let activeServerId = null;
let activeServerAdmins = []; 
let activeChannelId = null;

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
        new Notification(title, { body: body, icon: "https://cdn-icons-png.flaticon.com/512/3237/3237472.png" });
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

        if(user.email === ADMIN_EMAIL) document.getElementById('admin-panel').style.display = 'block';
    } else {
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
    if(isLogin) signInWithEmailAndPassword(auth, email, pass).then(()=>routeTo('home')).catch(err=>alert(err.message));
    else createUserWithEmailAndPassword(auth, email, pass).then(()=>routeTo('home')).catch(err=>alert(err.message));
};

document.getElementById('logout-btn').onclick = () => { signOut(auth); routeTo('home'); };

document.getElementById('profile-form').onsubmit = async (e) => {
    e.preventDefault();
    const newName = document.getElementById('display-name').value;
    const newPfp = document.getElementById('display-pfp').value;
    if (auth.currentUser) {
        await updateProfile(auth.currentUser, { displayName: newName, photoURL: newPfp });
        document.getElementById('dashboard-pfp-preview').src = newPfp || DEFAULT_PFP;
        alert("Profile Updated!");
    }
};

// --- UPDATES ---
async function fetchNews() {
    const snap = await getDocs(query(collection(db, "news"), orderBy("timestamp", "desc")));
    const feed = document.getElementById('news-feed');
    feed.innerHTML = "";
    snap.forEach(d => {
        const data = d.data();
        feed.innerHTML += `<div class="news-card"><small style="color:var(--crimson);">${data.date}</small><h3 style="margin:5px 0;">${data.title}</h3><div>${marked.parse(data.body)}</div></div>`;
    });
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
                name: name, 
                owner: auth.currentUser.uid, 
                members: [auth.currentUser.uid], 
                admins: [auth.currentUser.uid], 
                banned: [],
                photoURL: "",
                timestamp: serverTimestamp() 
            });
            await addDoc(collection(db, "discord_servers", newServer.id, "channels"), { name: "general", timestamp: serverTimestamp() });
        } catch(err) { alert("Failed to create server. " + err.message); }
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
    document.getElementById('active-channel-name').innerText = "Discover Public Servers";
    
    const discBox = document.getElementById('discovery-box');
    discBox.style.display = 'flex';
    discBox.innerHTML = "Loading servers...";

    const snap = await getDocs(collection(db, "discord_servers"));
    discBox.innerHTML = "";
    
    if(snap.empty) { discBox.innerHTML = "<p style='color:#aaa; width:100%; text-align:center;'>No servers exist.</p>"; return; }

    snap.forEach(docSnap => {
        const data = docSnap.data();
        const membersList = data.members || [];
        const bannedList = data.banned || [];
        
        if(!membersList.includes(auth.currentUser.uid) && !bannedList.includes(auth.currentUser.uid)) {
            const imgHtml = data.photoURL ? `<img src="${data.photoURL}">` : `<div style="width:80px;height:80px;border-radius:50%;background:#222;margin:0 auto 10px;line-height:80px;font-size:1.5rem;font-weight:bold;">${data.name.substring(0,2).toUpperCase()}</div>`;
            
            discBox.innerHTML += `
                <div class="discovery-card">
                    ${imgHtml}
                    <h3>${data.name}</h3>
                    <p style="color:#aaa; font-size:0.8rem;">${membersList.length} Member(s)</p>
                    <button class="btn-primary" onclick="joinServer('${docSnap.id}')">Join Server</button>
                </div>
            `;
        }
    });

    if(discBox.innerHTML === "") { discBox.innerHTML = "<p style='color:#aaa; width:100%; text-align:center;'>No new servers available to join.</p>"; }
};

window.joinServer = async function(serverId) {
    try {
        await updateDoc(doc(db, "discord_servers", serverId), { members: arrayUnion(auth.currentUser.uid) });
        document.getElementById('btn-discovery').click();
    } catch(err) { alert("Failed to join. " + err.message); }
};

function selectServer(serverId, serverData, element) {
    document.getElementById('chat-box').style.display = 'flex';
    document.getElementById('discovery-box').style.display = 'none';

    activeServerId = serverId;
    activeServerAdmins = serverData.admins || [serverData.owner];
    activeChannelId = null;
    
    document.getElementById('active-server-name').innerText = serverData.name;
    
    const amIAdmin = activeServerAdmins.includes(auth.currentUser.uid);
    document.getElementById('add-channel-btn').style.display = amIAdmin ? 'block' : 'none';
    document.getElementById('server-settings-btn').style.display = amIAdmin ? 'block' : 'none';
    
    document.getElementById('active-channel-name').innerText = "Select a channel";
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

document.getElementById('server-settings-btn').onclick = async () => {
    const url = prompt("Enter new Server Icon Image URL:");
    if(url) {
        try {
            await updateDoc(doc(db, "discord_servers", activeServerId), { photoURL: url });
            alert("Server Icon Updated!");
        } catch(e) { alert("Error updating icon: " + e.message); }
    }
};

document.getElementById('add-channel-btn').onclick = async () => {
    if(!activeServerId) return;
    const name = prompt("Enter Channel Name:");
    if(name) {
        try {
            await addDoc(collection(db, "discord_servers", activeServerId, "channels"), {
                name: name.toLowerCase().replace(/\s+/g, '-'),
                timestamp: serverTimestamp()
            });
        } catch(err) { alert("Failed to add channel. Error: " + err.message); }
    }
};

function selectChannel(channelId, channelName, element) {
    activeChannelId = channelId;
    document.getElementById('active-channel-name').innerText = `# ${channelName}`;
    document.getElementById('chat-form').style.display = 'block';
    
    document.querySelectorAll('.channel-item').forEach(el => el.classList.remove('active'));
    element.classList.add('active');

    const amIAdmin = activeServerAdmins.includes(auth.currentUser.uid);
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
                if (!activeServerAdmins.includes(m.senderUid)) {
                    actionHTML += `<button class="action-btn promote" onclick="promoteAdmin('${m.senderUid}')">👑 Promote</button>`;
                }
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
                        const isPinged = m.text.includes(`@${myName}`) || m.text.includes('@everyone');

                        if (isPinged) {
                            triggerBrowserNotification(`You were pinged in #${channelName}`, `${senderDisplay}: ${m.text}`);
                        } else if (document.hidden) {
                            triggerBrowserNotification(`New message in #${channelName}`, `${senderDisplay}: ${m.text}`);
                        }
                    }
                }
            });
        }
        isInitialLoad = false;
    });
}

window.promoteAdmin = async function(targetUid) {
    if(confirm("Make this user an Admin?")) {
        try {
            await updateDoc(doc(db, "discord_servers", activeServerId), { admins: arrayUnion(targetUid) });
            activeServerAdmins.push(targetUid); 
            alert("User Promoted.");
        } catch(err) { alert(err.message); }
    }
};

window.banUser = async function(targetUid) {
    if(confirm("Ban this user? They will be removed and unable to rejoin.")) {
        try {
            await updateDoc(doc(db, "discord_servers", activeServerId), {
                members: arrayRemove(targetUid),
                banned: arrayUnion(targetUid)
            });
            alert("User banned.");
        } catch(e) { alert("Failed to ban: " + e.message); }
    }
};

document.getElementById('chat-form').onsubmit = async (e) => {
    e.preventDefault();
    const input = document.getElementById('chat-input');
    if(!input.value.trim() || !activeServerId || !activeChannelId) return;

    try {
        await addDoc(collection(db, "discord_servers", activeServerId, "channels", activeChannelId, "messages"), {
            text: input.value,
            senderUid: auth.currentUser.uid,
            senderEmail: auth.currentUser.email,
            senderName: auth.currentUser.displayName || "",
            senderPfp: auth.currentUser.photoURL || "",
            timestamp: serverTimestamp()
        });
        input.value = "";
    } catch(err) { alert("Failed to send. Error: " + err.message); }
};

// --- SUPPORT TICKETS ---
window.fetchTickets = async function() {
    if(!auth.currentUser) return;
    const list = document.getElementById('ticket-list');
    list.innerHTML = "Syncing Grid...";
    
    let q = query(collection(db, "tickets"), orderBy("timestamp", "desc"));
    if(auth.currentUser.email !== ADMIN_EMAIL) {
        q = query(collection(db, "tickets"), where("userId", "==", auth.currentUser.uid), orderBy("timestamp", "desc"));
    }
    
    try {
        const snap = await getDocs(q);
        list.innerHTML = "";
        snap.forEach(tDoc => {
            const d = tDoc.data();
            const item = document.createElement('div');
            item.className = "auth-card";
            item.style.cursor = "pointer";
            item.innerHTML = `<strong>${d.subject}</strong> <span style="float:right; color:${d.status === 'Open' ? '#0f0' : '#777'}">${d.status}</span><br><small>${d.userEmail}</small>`;
            item.onclick = () => openThread(tDoc.id, d);
            list.appendChild(item);
        });
    } catch(err) { console.error(err); }
}

function openThread(id, data) {
    activeTicketId = id;
    document.getElementById('list-view').style.display = 'none';
    document.getElementById('thread-view').style.display = 'block';
    document.getElementById('active-subject').innerText = data.subject;
    document.getElementById('active-status').innerText = "Status: " + data.status;

    const chatForm = document.getElementById('ticket-chat-form');
    const resBox = document.getElementById('resolution-box');
    const adminArea = document.getElementById('admin-close-area');

    if (data.status === "Closed") {
        chatForm.style.display = 'none';
        adminArea.style.display = 'none';
        resBox.style.display = 'block';
        document.getElementById('resolution-text').innerText = data.closeReason || "No reason recorded.";
    } else {
        chatForm.style.display = 'flex';
        resBox.style.display = 'none';
        adminArea.style.display = (auth.currentUser.email === ADMIN_EMAIL) ? 'block' : 'none';
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
    fetchTickets();
};

document.getElementById('ticket-chat-form').onsubmit = async (e) => {
    e.preventDefault();
    const input = document.getElementById('ticket-chat-input');
    await addDoc(collection(db, "tickets", activeTicketId, "messages"), {
        text: input.value, sender: auth.currentUser.email, senderName: auth.currentUser.displayName || auth.currentUser.email, timestamp: serverTimestamp()
    });
    input.value = "";
};

document.getElementById('ticket-form').onsubmit = async (e) => {
    e.preventDefault();
    const subj = document.getElementById('ticket-subject').value;
    const msg = document.getElementById('ticket-msg').value;
    await addDoc(collection(db, "tickets"), {
        userId: auth.currentUser.uid,
        userEmail: auth.currentUser.email,
        subject: subj, message: msg, status: "Open", timestamp: serverTimestamp()
    });
    document.getElementById('ticket-form').reset();
    fetchTickets();
};
