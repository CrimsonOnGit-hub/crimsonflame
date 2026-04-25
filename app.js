import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut, setPersistence, browserLocalPersistence, updateProfile } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, getDoc, query, orderBy, where, doc, onSnapshot, updateDoc, serverTimestamp, arrayUnion, arrayRemove, setDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

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
setPersistence(auth, browserLocalPersistence);

let activeServerId = null;
let activeServerAdmins = []; 
let activeChannelId = null;
let activeChatType = 'server'; 
let activeDmId = null;
let isGlobalAdmin = false; 

let chatterServersUnsub = null;
let chatterChannelsUnsub = null;
let chatterMessagesUnsub = null;
let ticketChatUnsubscribe = null;
let activeTicketId = null;
let isLogin = true;

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

// ==========================================
// --- GLOBAL WINDOW EXPORTS ---
// ==========================================

// --- CORE DATA FETCHING ---
window.fetchHomeImages = async function() {
    const gallery = document.getElementById('home-gallery');
    if(!gallery) return;
    
    try {
        const snap = await getDocs(query(collection(db, "home_images"), orderBy("timestamp", "desc")));
        gallery.innerHTML = "";
        
        if(snap.empty) { 
            gallery.innerHTML = "<p style='color:#aaa;'>No media published yet.</p>"; 
            return; 
        }
        
        snap.forEach(doc => {
            const data = doc.data();
            gallery.innerHTML += `<img src="${data.url}" alt="Homepage Image">`;
        });
    } catch(err) {
        gallery.innerHTML = `<p style="color:var(--crimson);">Error loading gallery.</p>`;
    }
};

window.fetchTerms = async function() {
    const termsBox = document.getElementById('terms-content');
    if(!termsBox) return;
    try {
        const response = await fetch('terms.md');
        if (!response.ok) throw new Error("File not found or could not be loaded.");
        const text = await response.text();
        termsBox.innerHTML = marked.parse(text);
    } catch(e) {
        termsBox.innerHTML = `<p style="color:var(--crimson);">Error loading terms: ${e.message}</p>`;
    }
};

window.fetchPrivacy = async function() {
    const privacyBox = document.getElementById('privacy-content');
    if(!privacyBox) return;
    try {
        const response = await fetch('privacy.md');
        if (!response.ok) throw new Error("File not found or could not be loaded.");
        const text = await response.text();
        privacyBox.innerHTML = marked.parse(text);
    } catch(e) {
        privacyBox.innerHTML = `<p style="color:var(--crimson);">Error loading privacy policy: ${e.message}</p>`;
    }
};

// --- CORE FORMS ---
window.submitLogin = function(e) {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const pass = document.getElementById('password').value;
    if(isLogin) signInWithEmailAndPassword(auth, email, pass).then(()=>window.routeTo('home')).catch(err=>alert(err.message));
    else createUserWithEmailAndPassword(auth, email, pass).then(()=>window.routeTo('home')).catch(err=>alert(err.message));
};

window.submitProfile = async function(e) {
    e.preventDefault();
    const newName = document.getElementById('display-name').value;
    const newPfp = document.getElementById('dashboard-pfp-preview').src;
    if (auth.currentUser) {
        await updateProfile(auth.currentUser, { displayName: newName, photoURL: newPfp });
        alert("Profile Updated Successfully!");
    }
};

window.submitNews = async function(e) {
    e.preventDefault();
    await addDoc(collection(db, "news"), {
        title: document.getElementById('news-title').value,
        body: document.getElementById('news-body').value,
        date: new Date().toLocaleDateString(),
        timestamp: serverTimestamp()
    });
    document.getElementById('news-form').reset();
    alert("Published!");
    window.fetchNews();
};

window.hasPermission = async function(serverId, uid, requiredPermission) {
    const serverSnap = await getDoc(doc(db, "discord_servers", serverId));
    if(!serverSnap.exists()) return false;
    const data = serverSnap.data();
    
    if(data.owner === uid || isGlobalAdmin) return true;
    
    if (data.roles && data.member_roles) {
        const userRoleId = data.member_roles[uid] || 'member_role';
        const userRole = data.roles[userRoleId];
        if (userRole && userRole.permissions.includes(requiredPermission)) return true;
    } else if (requiredPermission === 'ban' && data.admins && data.admins.includes(uid)) {
        return true;
    }
    return false;
};

window.submitChat = async function(e) {
    e.preventDefault();
    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    if(!text) return;

    if (text.startsWith('/ban ')) {
        if (activeChatType !== 'server' || !activeServerId) {
            alert("You must be in a server channel to ban a user.");
            input.value = "";
            return;
        }

        const targetName = text.substring(5).trim();
        const canBan = await window.hasPermission(activeServerId, auth.currentUser.uid, 'ban');
        
        if (!canBan) {
            alert("You don't have permission to ban users in this server.");
            input.value = "";
            return;
        }

        await window.executeBanByName(activeServerId, targetName);
        input.value = "";
        return;
    }

    if (activeChatType === 'server' && activeServerId && activeChannelId) {
        await addDoc(collection(db, "discord_servers", activeServerId, "channels", activeChannelId, "messages"), {
            text: text, senderUid: auth.currentUser.uid, senderEmail: auth.currentUser.email,
            senderName: auth.currentUser.displayName || "", senderPfp: auth.currentUser.photoURL || "", timestamp: serverTimestamp()
        });
    } else if (activeChatType === 'dm' && activeDmId) {
        await addDoc(collection(db, "dms", activeDmId, "messages"), {
            text: text, senderUid: auth.currentUser.uid, senderEmail: auth.currentUser.email,
            senderName: auth.currentUser.displayName || "", senderPfp: auth.currentUser.photoURL || "", timestamp: serverTimestamp()
        });
    }
    
    input.value = "";
};

window.executeBanByName = async function(serverId, targetName) {
    const messagesQuery = query(collection(db, "discord_servers", serverId, "channels", activeChannelId, "messages"));
    const snap = await getDocs(messagesQuery);
    let targetUid = null;
    
    snap.forEach(doc => {
        const data = doc.data();
        const msgSenderName = data.senderName ? data.senderName.toLowerCase() : data.senderEmail.split('@')[0].toLowerCase();
        if (msgSenderName === targetName.toLowerCase()) targetUid = data.senderUid;
    });

    if (!targetUid) {
        alert(`Could not find a user named "${targetName}" in this channel's recent history.`);
        return;
    }

    if (confirm(`Are you sure you want to ban ${targetName}?`)) {
        await updateDoc(doc(db, "discord_servers", serverId), { 
            members: arrayRemove(targetUid), 
            banned: arrayUnion(targetUid) 
        });
        alert(`${targetName} has been banned.`);
    }
};

window.submitTicket = async function(e) {
    e.preventDefault();
    const subj = document.getElementById('ticket-subject').value;
    const msg = document.getElementById('ticket-msg').value;
    await addDoc(collection(db, "tickets"), { userId: auth.currentUser.uid, userEmail: auth.currentUser.email, subject: subj, message: msg, status: "Open", timestamp: serverTimestamp() });
    document.getElementById('ticket-form').reset();
    window.fetchTickets();
};

window.submitTicketChat = async function(e) {
    e.preventDefault();
    const input = document.getElementById('ticket-chat-input');
    await addDoc(collection(db, "tickets", activeTicketId, "messages"), { text: input.value, sender: auth.currentUser.email, senderName: auth.currentUser.displayName || auth.currentUser.email, timestamp: serverTimestamp() });
    input.value = "";
};

// --- BUTTONS & ROUTING ---
window.toggleLoginMode = function() {
    isLogin = !isLogin;
    document.getElementById('auth-title').innerText = isLogin ? "Account Login" : "Register Account";
    document.getElementById('toggle-auth').innerText = isLogin ? "Register here" : "Login here";
};

window.logOutUser = function() {
    signOut(auth); 
    window.routeTo('home');
};

window.closeThreadView = function() {
    document.getElementById('list-view').style.display = 'block';
    document.getElementById('thread-view').style.display = 'none';
    if(ticketChatUnsubscribe) ticketChatUnsubscribe();
    window.fetchTickets();
};

window.closeActiveTicket = async function() {
    const r = document.getElementById('close-reason').value;
    if(!r) return alert("Resolution required.");
    await updateDoc(doc(db, "tickets", activeTicketId), { status: "Closed", closeReason: r });
    window.closeThreadView();
};

// --- ROUTING & METABALL (GOOEY) LIQUID LIGHT BLOB ---
window.routeTo = function(page) {
    document.querySelectorAll('.page-content').forEach(p => p.style.display = 'none');
    const target = document.getElementById('page-' + page);
    if(target) target.style.display = 'block';
    
    document.querySelectorAll('.nav-links a').forEach(a => a.style.color = 'var(--text-muted)');
    
    const activeLink = document.querySelector(`.nav-links a[onclick="routeTo('${page}')"]`);
    const blobMain = document.getElementById('blob-main');
    const blobTrail = document.getElementById('blob-trail');

    // This pushes BOTH blobs to the new link. The CSS delay makes them pinch in the middle!
    if(activeLink && blobMain && blobTrail) {
        activeLink.style.color = 'var(--text-main)'; 
        
        blobMain.style.width = `${activeLink.offsetWidth}px`; 
        blobMain.style.left = `${activeLink.offsetLeft}px`; 
        
        blobTrail.style.width = `${activeLink.offsetWidth}px`; 
        blobTrail.style.left = `${activeLink.offsetLeft}px`; 
    }

    try {
        if(page === 'home') window.fetchHomeImages();
        if(page === 'updates') window.fetchNews();
        if(page === 'terms') window.fetchTerms();
        if(page === 'privacy') window.fetchPrivacy();
        if(page === 'chatter' && auth.currentUser) window.initChatter();
        if(page === 'tickets' && auth.currentUser) window.fetchTickets();
    } catch (err) {
        console.error("Error loading page data:", err);
    }
};

// --- CHATTER LOGIC ---
window.openDiscovery = async function() {
    document.querySelectorAll('.server-icon').forEach(el => el.classList.remove('active'));
    const discBtn = document.getElementById('btn-discovery');
    if(discBtn) discBtn.classList.add('active');
    
    if(document.getElementById('active-server-name')) document.getElementById('active-server-name').innerText = "Discovery";
    if(document.getElementById('channel-list')) document.getElementById('channel-list').innerHTML = "";
    if(document.getElementById('add-channel-btn')) document.getElementById('add-channel-btn').style.display = 'none';
    if(document.getElementById('server-settings-btn')) document.getElementById('server-settings-btn').style.display = 'none';
    if(document.getElementById('chat-box')) document.getElementById('chat-box').style.display = 'none';
    if(document.getElementById('chat-form')) document.getElementById('chat-form').style.display = 'none';
    if(document.getElementById('active-channel-name')) document.getElementById('active-channel-name').innerText = "Discover Public Servers";
    
    const discBox = document.getElementById('discovery-box');
    if(!discBox) return;
    
    discBox.style.display = 'flex';
    discBox.innerHTML = "Loading servers from Grid...";

    try {
        const snap = await getDocs(collection(db, "discord_servers"));
        discBox.innerHTML = "";
        
        if(snap.empty) { 
            discBox.innerHTML = "<p style='color:#aaa; width:100%; text-align:center;'>No servers exist on the grid yet.</p>"; 
            return; 
        }

        let foundServers = false;
        snap.forEach(docSnap => {
            const data = docSnap.data();
            const membersList = data.members || [];
            const bannedList = data.banned || [];
            
            if(!membersList.includes(auth.currentUser.uid) && !bannedList.includes(auth.currentUser.uid)) {
                foundServers = true;
                const imgHtml = data.photoURL ? `<img src="${data.photoURL}">` : `<div style="width:80px;height:80px;border-radius:50%;background:rgba(255,255,255,0.1);margin:0 auto 10px;line-height:80px;font-size:1.5rem;font-weight:bold;">${data.name.substring(0,2).toUpperCase()}</div>`;
                discBox.innerHTML += `<div class="discovery-card">${imgHtml}<h3>${data.name}</h3><button class="btn-primary" onclick="joinServer('${docSnap.id}')">Join Server</button></div>`;
            }
        });

        if(!foundServers) {
            discBox.innerHTML = "<p style='color:#aaa; width:100%; text-align:center;'>You have joined all available servers!</p>";
        }
    } catch(err) {
        console.error(err);
        discBox.innerHTML = "<p style='color:var(--crimson); width:100%; text-align:center;'>Error loading discovery.</p>";
    }
};

window.createServer = async function() {
    if(!auth.currentUser) return;
    const name = prompt("Enter Server Name:");
    if(name) {
        try {
            const newServer = await addDoc(collection(db, "discord_servers"), { 
                name: name, owner: auth.currentUser.uid, members: [auth.currentUser.uid], admins: [auth.currentUser.uid], banned: [], photoURL: "", timestamp: serverTimestamp(),
                roles: {
                    "admin_role": { name: "Admin", permissions: ["ban", "kick", "manage_channels"] },
                    "member_role": { name: "Member", permissions: ["send_messages"] }
                },
                member_roles: {
                    [auth.currentUser.uid]: "admin_role"
                }
            });
            await addDoc(collection(db, "discord_servers", newServer.id, "channels"), { name: "general", timestamp: serverTimestamp() });
        } catch(err) { alert("Failed to create server. " + err.message); }
    }
};

window.createChannel = async function() {
    if(!activeServerId) return;
    const name = prompt("Enter Channel Name:");
    if(name) {
        try {
            await addDoc(collection(db, "discord_servers", activeServerId, "channels"), { name: name.toLowerCase().replace(/\s+/g, '-'), timestamp: serverTimestamp() });
        } catch(err) { alert("Failed to add channel."); }
    }
};

window.openServerSettings = async function() {
    const modal = document.getElementById('server-settings-modal');
    if(modal) modal.style.display = 'flex';
    
    try {
        const serverSnap = await getDoc(doc(db, "discord_servers", activeServerId));
        const url = serverSnap.data().photoURL || "";
        const preview = document.getElementById('server-icon-preview');
        if(preview) {
            preview.src = url;
            preview.style.display = url ? 'block' : 'none';
        }
    } catch(err) { console.error("Error loading settings"); }
};

window.joinServer = async function(serverId) {
    try {
        await updateDoc(doc(db, "discord_servers", serverId), { 
            members: arrayUnion(auth.currentUser.uid),
            [`member_roles.${auth.currentUser.uid}`]: "member_role" 
        });
        window.openDiscovery(); 
    } catch(err) { alert("Failed to join."); }
};

window.promoteAdmin = async function(targetUid) {
    if(confirm("Make this user an Admin?")) {
        await updateDoc(doc(db, "discord_servers", activeServerId), { 
            admins: arrayUnion(targetUid),
            [`member_roles.${targetUid}`]: "admin_role"
        });
        activeServerAdmins.push(targetUid); 
    }
};

window.openDM = async function(targetUid, targetName) {
    if (!auth.currentUser || targetUid === auth.currentUser.uid) return;
    
    activeChatType = 'dm';
    const dmId = [auth.currentUser.uid, targetUid].sort().join('_');
    activeDmId = dmId;

    if(document.getElementById('active-server-name')) document.getElementById('active-server-name').innerText = "Direct Messages";
    if(document.getElementById('active-channel-name')) document.getElementById('active-channel-name').innerText = `@ ${targetName}`;
    if(document.getElementById('chat-form')) document.getElementById('chat-form').style.display = 'block';
    
    document.querySelectorAll('.channel-item').forEach(el => el.classList.remove('active'));
    document.getElementById('channel-list').innerHTML = `<div class="channel-item active" style="color:var(--crimson);">@ ${targetName}</div>`;

    await setDoc(doc(db, "dms", dmId), { participants: [auth.currentUser.uid, targetUid] }, { merge: true });

    if(chatterMessagesUnsub) chatterMessagesUnsub();
    const box = document.getElementById('chat-box');
    if(!box) return;
    box.innerHTML = "Loading DM...";

    chatterMessagesUnsub = onSnapshot(query(collection(db, "dms", dmId, "messages"), orderBy("timestamp", "asc")), snap => {
        box.innerHTML = "";
        snap.forEach(mDoc => {
            const m = mDoc.data();
            const nameToUse = m.senderName || m.senderEmail.split('@')[0];
            const pfpToUse = m.senderPfp || DEFAULT_PFP;
            box.innerHTML += `
            <div class="msg">
                <img src="${pfpToUse}" class="chat-pfp">
                <div class="msg-content">
                    <span class="msg-sender">${nameToUse}</span>
                    <div class="msg-text">${m.text}</div>
                </div>
            </div>`;
        });
        box.scrollTop = box.scrollHeight;
    });
};

window.selectChannel = function(channelId, channelName, element) {
    activeChatType = 'server';
    activeChannelId = channelId;
    if(document.getElementById('active-channel-name')) document.getElementById('active-channel-name').innerText = `# ${channelName}`;
    if(document.getElementById('chat-form')) document.getElementById('chat-form').style.display = 'block';
    
    document.querySelectorAll('.channel-item').forEach(el => el.classList.remove('active'));
    if(element) element.classList.add('active');

    const amIAdmin = activeServerAdmins.includes(auth.currentUser.uid) || isGlobalAdmin;
    const myName = auth.currentUser.displayName || auth.currentUser.email.split('@')[0];

    if(chatterMessagesUnsub) chatterMessagesUnsub();
    const box = document.getElementById('chat-box');
    if(!box) return;

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
            }

            box.innerHTML += `
                <div class="msg">
                    <img src="${pfpToUse}" class="chat-pfp" style="cursor:pointer;" onclick="openDM('${m.senderUid}', '${nameToUse.replace(/'/g, "\\'")}')" title="Click to message">
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
};

window.selectServer = function(serverId, serverData, element) {
    if(document.getElementById('chat-box')) document.getElementById('chat-box').style.display = 'flex';
    if(document.getElementById('discovery-box')) document.getElementById('discovery-box').style.display = 'none';

    activeChatType = 'server';
    activeServerId = serverId;
    activeServerAdmins = serverData.admins || [serverData.owner];
    activeChannelId = null;
    
    if(document.getElementById('active-server-name')) document.getElementById('active-server-name').innerText = serverData.name;
    
    const amIAdmin = activeServerAdmins.includes(auth.currentUser.uid) || serverData.owner === auth.currentUser.uid || isGlobalAdmin;
    
    if(document.getElementById('add-channel-btn')) document.getElementById('add-channel-btn').style.display = amIAdmin ? 'block' : 'none';
    if(document.getElementById('server-settings-btn')) document.getElementById('server-settings-btn').style.display = amIAdmin ? 'block' : 'none';
    
    if(document.getElementById('chat-form')) document.getElementById('chat-form').style.display = 'none';
    if(document.getElementById('chat-box')) document.getElementById('chat-box').innerHTML = "";
    
    document.querySelectorAll('.server-icon').forEach(el => el.classList.remove('active'));
    if(element) element.classList.add('active');

    if(chatterChannelsUnsub) chatterChannelsUnsub();
    const channelList = document.getElementById('channel-list');
    if(!channelList) return;

    chatterChannelsUnsub = onSnapshot(query(collection(db, "discord_servers", serverId, "channels"), orderBy("timestamp", "asc")), snap => {
        channelList.innerHTML = "";
        snap.forEach(docSnap => {
            const cData = docSnap.data();
            const el = document.createElement('div');
            el.className = `channel-item ${activeChannelId === docSnap.id ? 'active' : ''}`;
            el.innerText = cData.name;
            el.onclick = (e) => { e.preventDefault(); window.selectChannel(docSnap.id, cData.name, el); };
            channelList.appendChild(el);
        });
    });
};

window.fetchNews = async function() {
    const feed = document.getElementById('news-feed');
    if(!feed) return;
    try {
        const snap = await getDocs(query(collection(db, "news"), orderBy("timestamp", "desc")));
        feed.innerHTML = "";
        if(snap.empty) { feed.innerHTML = "<p style='color:#aaa;'>No updates posted yet.</p>"; return; }
        snap.forEach(d => {
            const data = d.data();
            feed.innerHTML += `<div class="news-card"><small style="color:var(--crimson);">${data.date}</small><h3 style="margin:5px 0;">${data.title}</h3><div>${marked.parse(data.body)}</div></div>`;
        });
    } catch(e) { feed.innerHTML = `<p style="color:var(--crimson);">Error fetching updates.</p>`; }
};

window.initChatter = function() {
    if(chatterServersUnsub) return;
    const serverList = document.getElementById('server-list');
    if(!serverList) return;

    const myServersQuery = query(collection(db, "discord_servers"), where("members", "array-contains", auth.currentUser.uid));
    
    chatterServersUnsub = onSnapshot(myServersQuery, snap => {
        serverList.innerHTML = "";
        snap.forEach(docSnap => {
            const data = docSnap.data();
            const el = document.createElement('div');
            el.className = `server-icon ${activeServerId === docSnap.id ? 'active' : ''}`;
            el.title = data.name;
            
            if(data.photoURL) { el.innerHTML = `<img src="${data.photoURL}">`; } 
            else { el.innerText = data.name.substring(0,2).toUpperCase(); }
            
            el.onclick = (e) => { e.preventDefault(); window.selectServer(docSnap.id, data, el); };
            serverList.appendChild(el);
        });
    });
};

window.fetchTickets = async function() {
    if(!auth.currentUser) return;
    const list = document.getElementById('ticket-list');
    if(!list) return;

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
            item.innerHTML = `<strong>${d.subject}</strong> <span style="float:right; color:${d.status === 'Open' ? '#4ade80' : '#94a3b8'}">${d.status}</span><br><small>${d.userEmail}</small>`;
            item.onclick = () => window.openThread(tDoc.id, d);
            list.appendChild(item);
        });
    } catch(err) { 
        list.innerHTML = `<p style="color:var(--crimson);">Error fetching tickets.</p>`;
    }
};

window.openThread = function(id, data) {
    activeTicketId = id;
    if(document.getElementById('list-view')) document.getElementById('list-view').style.display = 'none';
    if(document.getElementById('thread-view')) document.getElementById('thread-view').style.display = 'block';
    if(document.getElementById('active-subject')) document.getElementById('active-subject').innerText = data.subject;
    
    if (data.status === "Closed") {
        if(document.getElementById('ticket-chat-form')) document.getElementById('ticket-chat-form').style.display = 'none';
        if(document.getElementById('admin-close-area')) document.getElementById('admin-close-area').style.display = 'none';
        if(document.getElementById('resolution-box')) document.getElementById('resolution-box').style.display = 'block';
        if(document.getElementById('resolution-text')) document.getElementById('resolution-text').innerText = data.closeReason || "No reason recorded.";
    } else {
        if(document.getElementById('ticket-chat-form')) document.getElementById('ticket-chat-form').style.display = 'flex';
        if(document.getElementById('resolution-box')) document.getElementById('resolution-box').style.display = 'none';
        if(document.getElementById('admin-close-area')) document.getElementById('admin-close-area').style.display = isGlobalAdmin ? 'block' : 'none';
    }

    let isInitialLoad = true;
    if(ticketChatUnsubscribe) ticketChatUnsubscribe();
    
    ticketChatUnsubscribe = onSnapshot(query(collection(db, "tickets", id, "messages"), orderBy("timestamp", "asc")), snap => {
        const box = document.getElementById('ticket-chat-box');
        if(!box) return;
        box.innerHTML = "";
        snap.forEach(mDoc => {
            const m = mDoc.data();
            const isMe = m.sender === auth.currentUser.email;
            box.innerHTML += `<div style="align-self:${isMe ? 'flex-end' : 'flex-start'}; background:${isMe ? 'var(--crimson)' : 'rgba(0,0,0,0.3)'}; padding:8px 12px; border-radius:8px; max-width:80%; font-size:0.9rem; border: 1px solid var(--glass-border);">
                <small style="display:block; opacity:0.7; font-size:0.6rem;">${m.senderName || m.sender}</small>${m.text}</div>`;
        });
        box.scrollTop = box.scrollHeight;
    });
};

// ==========================================
// --- AUTH & INITIALIZATION ---
// ==========================================

onAuthStateChanged(auth, user => {
    const navAuth = document.getElementById('nav-auth-link');
    if(user) {
        requestNotificationPermission();
        isGlobalAdmin = (user.email.toLowerCase() === ADMIN_EMAIL.toLowerCase());

        if(navAuth) navAuth.innerText = "Dashboard";
        if(document.getElementById('login-container')) document.getElementById('login-container').style.display = 'none';
        if(document.getElementById('dashboard-container')) document.getElementById('dashboard-container').style.display = 'block';
        if(document.getElementById('ticket-locked')) document.getElementById('ticket-locked').style.display = 'none';
        if(document.getElementById('ticket-system')) document.getElementById('ticket-system').style.display = 'block';
        if(document.getElementById('chatter-locked')) document.getElementById('chatter-locked').style.display = 'none';
        if(document.getElementById('chatter-system')) document.getElementById('chatter-system').style.display = 'flex';
        
        if(document.getElementById('user-display-email')) document.getElementById('user-display-email').innerText = user.email;
        if(document.getElementById('display-name')) document.getElementById('display-name').value = user.displayName || "";
        if(document.getElementById('dashboard-pfp-preview')) document.getElementById('dashboard-pfp-preview').src = user.photoURL || DEFAULT_PFP;

        if(document.getElementById('admin-panel')) document.getElementById('admin-panel').style.display = isGlobalAdmin ? 'block' : 'none';
        if(document.getElementById('admin-home-editor')) document.getElementById('admin-home-editor').style.display = isGlobalAdmin ? 'block' : 'none';
    } else {
        isGlobalAdmin = false;
        if(navAuth) navAuth.innerText = "Login";
        if(document.getElementById('login-container')) document.getElementById('login-container').style.display = 'block';
        if(document.getElementById('dashboard-container')) document.getElementById('dashboard-container').style.display = 'none';
        if(document.getElementById('ticket-locked')) document.getElementById('ticket-locked').style.display = 'block';
        if(document.getElementById('ticket-system')) document.getElementById('ticket-system').style.display = 'none';
        if(document.getElementById('chatter-locked')) document.getElementById('chatter-locked').style.display = 'flex';
        if(document.getElementById('chatter-system')) document.getElementById('chatter-system').style.display = 'none';
        
        if(document.getElementById('admin-home-editor')) document.getElementById('admin-home-editor').style.display = 'none';
    }
});

// --- IMAGE UPLOAD LOGIC ---
const pfpDropZone = document.getElementById('pfp-drop-zone');
const pfpFileInput = document.getElementById('pfp-file-input');
if(pfpDropZone && pfpFileInput) {
    pfpDropZone.addEventListener('click', () => pfpFileInput.click());
    pfpFileInput.addEventListener('change', (e) => handleImageUpload(e.target.files[0], 'pfp'));
    pfpDropZone.addEventListener('dragover', (e) => { e.preventDefault(); pfpDropZone.classList.add('dragover'); });
    pfpDropZone.addEventListener('dragleave', () => pfpDropZone.classList.remove('dragover'));
    pfpDropZone.addEventListener('drop', (e) => { e.preventDefault(); pfpDropZone.classList.remove('dragover'); if (e.dataTransfer.files.length) handleImageUpload(e.dataTransfer.files[0], 'pfp'); });
}

const serverDropZone = document.getElementById('server-drop-zone');
const serverFileInput = document.getElementById('server-file-input');
if(serverDropZone && serverFileInput) {
    serverDropZone.addEventListener('click', () => serverFileInput.click());
    serverFileInput.addEventListener('change', (e) => handleImageUpload(e.target.files[0], 'server'));
    serverDropZone.addEventListener('dragover', (e) => { e.preventDefault(); serverDropZone.classList.add('dragover'); });
    serverDropZone.addEventListener('dragleave', () => serverDropZone.classList.remove('dragover'));
    serverDropZone.addEventListener('drop', (e) => { e.preventDefault(); serverDropZone.classList.remove('dragover'); if (e.dataTransfer.files.length) handleImageUpload(e.dataTransfer.files[0], 'server'); });
}

const homeDropZone = document.getElementById('home-drop-zone');
const homeFileInput = document.getElementById('home-file-input');
if(homeDropZone && homeFileInput) {
    homeDropZone.addEventListener('click', () => homeFileInput.click());
    homeFileInput.addEventListener('change', (e) => handleImageUpload(e.target.files[0], 'home'));
    homeDropZone.addEventListener('dragover', (e) => { e.preventDefault(); homeDropZone.classList.add('dragover'); });
    homeDropZone.addEventListener('dragleave', () => homeDropZone.classList.remove('dragover'));
    homeDropZone.addEventListener('drop', (e) => { e.preventDefault(); homeDropZone.classList.remove('dragover'); if (e.dataTransfer.files.length) handleImageUpload(e.dataTransfer.files[0], 'home'); });
}

async function handleImageUpload(file, type) {
    if (!file || !file.type.startsWith('image/')) return alert("Please upload a valid image file.");

    if (type === 'home') {
        if (!auth.currentUser || auth.currentUser.email.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
            alert("Security Block: Only the Global Admin can modify the homepage.");
            return;
        }
    }

    let statusEl, previewEl;
    
    if (type === 'pfp') {
        statusEl = document.getElementById('upload-status');
        previewEl = document.getElementById('dashboard-pfp-preview');
    } else if (type === 'server') {
        if(!activeServerId) return;
        statusEl = document.getElementById('server-upload-status');
        previewEl = document.getElementById('server-icon-preview');
    } else if (type === 'home') {
        statusEl = document.getElementById('home-upload-status');
    }

    if(statusEl) {
        statusEl.style.display = 'block';
        statusEl.innerText = "Uploading to server...";
    }

    try {
        const formData = new FormData();
        formData.append("image", file);

        const response = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, {
            method: "POST",
            body: formData
        });

        const data = await response.json();
        
        if (!data.success) throw new Error("Error, unable to upload");

        const downloadURL = data.data.url;

        if(previewEl) {
            previewEl.src = downloadURL;
            previewEl.style.display = 'block';
        }

        if (type === 'pfp') {
            const displayPfp = document.getElementById('display-pfp');
            if(displayPfp) displayPfp.value = downloadURL;
            if(statusEl) statusEl.innerText = "Done! Click 'Save Profile Info'.";
        } else if (type === 'server') {
            await updateDoc(doc(db, "discord_servers", activeServerId), { photoURL: downloadURL });
            if(statusEl) statusEl.innerText = "Server Icon Updated!";
        } else if (type === 'home') {
            await addDoc(collection(db, "home_images"), { 
                url: downloadURL, 
                timestamp: serverTimestamp() 
            });
            if(statusEl) statusEl.innerText = "Published to Homepage!";
            window.fetchHomeImages(); 
        }
        
        setTimeout(() => { if(statusEl) statusEl.style.display = 'none'; }, 4000);
    } catch (error) {
        if(statusEl) statusEl.innerText = "Upload Failed";
        console.error("IMGBB Error:", error);
    }
}

// Initialize Liquid Light blob on first load
setTimeout(() => {
    window.routeTo('home');
}, 100);
