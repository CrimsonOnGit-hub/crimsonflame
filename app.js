import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut, setPersistence, browserLocalPersistence, updateProfile, sendEmailVerification, GoogleAuthProvider, signInWithPopup } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
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
const googleProvider = new GoogleAuthProvider();
setPersistence(auth, browserLocalPersistence);

let activeServerId = null;
let activeServerData = null;
let activeChannelId = null;
let activeChatType = 'server'; 
let currentUser = null;
let isGlobalAdmin = false; 

let chatterServersUnsub = null;
let chatterChannelsUnsub = null;
let chatterMessagesUnsub = null;
let ticketChatUnsubscribe = null;
let activeTicketId = null;
let isLogin = true;

// GLOBAL NODE EDITOR INSTANCE
window.botEditor = null;

// --- CUSTOM LIQUID MODALS GLOBALS ---
window.showCustomPrompt = function(title, desc, placeholder, onConfirm) {
    const overlay = document.getElementById('custom-prompt');
    if(!overlay) return;
    const input = document.getElementById('custom-prompt-input');
    document.getElementById('custom-prompt-title').innerText = title;
    document.getElementById('custom-prompt-desc').innerText = desc;
    input.style.display = 'block'; input.placeholder = placeholder; input.value = "";
    overlay.classList.add('active'); input.focus();

    document.getElementById('custom-prompt-cancel').onclick = () => overlay.classList.remove('active');
    const submitAction = () => { if(input.value.trim() !== "") { overlay.classList.remove('active'); onConfirm(input.value.trim()); } };
    document.getElementById('custom-prompt-confirm').onclick = submitAction;
    input.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); submitAction(); } };
};

window.showCustomConfirm = function(title, desc, onConfirm) {
    const overlay = document.getElementById('custom-prompt');
    if(!overlay) return;
    const input = document.getElementById('custom-prompt-input');
    document.getElementById('custom-prompt-title').innerText = title;
    document.getElementById('custom-prompt-desc').innerText = desc;
    input.style.display = 'none'; 
    overlay.classList.add('active');

    document.getElementById('custom-prompt-cancel').onclick = () => { overlay.classList.remove('active'); input.style.display = 'block'; };
    document.getElementById('custom-prompt-confirm').onclick = () => { overlay.classList.remove('active'); input.style.display = 'block'; onConfirm(); };
};

window.showCustomAlert = function(message) {
    const overlay = document.getElementById('custom-alert');
    if(!overlay) { alert(message); return; } // Fallback if missing
    document.getElementById('custom-alert-message').innerText = message;
    overlay.classList.add('active');
    document.getElementById('custom-alert-ok').onclick = () => overlay.classList.remove('active');
};

function formatDiscordTime(timestamp) {
    if(!timestamp) return 'Just now';
    return timestamp.toDate().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
}

function showResponseText(element, type, text) {
    const statusDiv = document.createElement('div');
    statusDiv.className = `status-text ${type}`;
    statusDiv.innerText = text;
    statusDiv.style.display = 'block';
    statusDiv.style.marginTop = '10px';
    statusDiv.style.textAlign = 'center';
    element.parentNode.insertBefore(statusDiv, element.nextSibling);
    setTimeout(() => { statusDiv.remove(); }, 5000); 
}

// --- AUTH LOGIC ---
window.submitLogin = async function(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true; btn.innerText = "Processing...";
    try {
        if(isLogin) {
            const userCredential = await signInWithEmailAndPassword(auth, document.getElementById('email').value, document.getElementById('password').value);
            if (!userCredential.user.emailVerified) {
                await sendEmailVerification(userCredential.user);
                await signOut(auth);
                showResponseText(btn, 'error', "Email not verified. A new link has been sent.");
            } else { window.routeTo('home'); }
        } else {
            const userCredential = await createUserWithEmailAndPassword(auth, document.getElementById('email').value, document.getElementById('password').value);
            await sendEmailVerification(userCredential.user);
            await signOut(auth);
            showResponseText(btn, 'success', "Account created! Check your inbox.");
            window.toggleLoginMode();
        }
    } catch (err) { showResponseText(btn, 'error', `Error: ${err.message}`); } finally { btn.disabled = false; btn.innerText = "Submit"; }
};

window.loginWithGoogle = async function(e) {
    e.preventDefault();
    try { await signInWithPopup(auth, googleProvider); window.routeTo('home'); } 
    catch (err) { window.showCustomAlert("Google Login Error: " + err.message); }
};

window.submitProfile = async function(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    const newName = document.getElementById('display-name').value;
    const newPfp = document.getElementById('dashboard-pfp-preview').src;
    if (auth.currentUser) {
        await updateProfile(auth.currentUser, { displayName: newName, photoURL: newPfp });
        showResponseText(btn, 'success', "Profile Saved Successfully!");
        await setDoc(doc(db, "users", auth.currentUser.uid), { displayName: newName, photoURL: newPfp }, { merge: true });
    }
};

window.logOutUser = function() { signOut(auth); window.routeTo('home'); };
window.toggleLoginMode = function() {
    isLogin = !isLogin;
    document.getElementById('auth-title').innerText = isLogin ? "Account Login" : "Register Account";
    document.getElementById('toggle-auth').innerText = isLogin ? "Register here" : "Login here";
};

// --- DATA FETCHING ---
window.fetchHomeImages = async function() {
    const gallery = document.getElementById('home-gallery');
    if(!gallery) return;
    try {
        const snap = await getDocs(query(collection(db, "home_images"), orderBy("timestamp", "desc")));
        gallery.innerHTML = "";
        if(snap.empty) { gallery.innerHTML = "<p style='color:#aaa;'>No media published yet.</p>"; return; }
        snap.forEach(d => { gallery.innerHTML += `<img src="${d.data().url}" alt="Homepage Image">`; });
    } catch(err) { gallery.innerHTML = `<p style="color:var(--crimson);">Error loading gallery.</p>`; }
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

window.submitNews = async function(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    await addDoc(collection(db, "news"), {
        title: document.getElementById('news-title').value,
        body: document.getElementById('news-body').value,
        date: new Date().toLocaleDateString(),
        timestamp: serverTimestamp()
    });
    document.getElementById('news-form').reset();
    showResponseText(btn, 'success', "Published to the Grid!");
    window.fetchNews();
};

window.fetchTerms = async function() {
    const termsBox = document.getElementById('terms-content'); if(!termsBox) return;
    try { const res = await fetch('terms.md'); const text = await res.text(); termsBox.innerHTML = marked.parse(text); } 
    catch(e) { termsBox.innerHTML = `<p style="color:var(--crimson);">Error loading terms</p>`; }
};

window.fetchPrivacy = async function() {
    const privacyBox = document.getElementById('privacy-content'); if(!privacyBox) return;
    try { const res = await fetch('privacy.md'); const text = await res.text(); privacyBox.innerHTML = marked.parse(text); } 
    catch(e) { privacyBox.innerHTML = `<p style="color:var(--crimson);">Error loading privacy</p>`; }
};

// --- SUPPORT TICKETS ---
window.fetchTickets = async function() {
    const locked = document.getElementById('support-locked'); if(!locked) return;
    if(!currentUser) { locked.style.display = 'block'; document.getElementById('page-support').style.display = 'none'; return; }
    locked.style.display = 'none'; document.getElementById('page-support').style.display = 'block';

    const list = document.getElementById('ticket-list'); if(!list) return;
    let q = query(collection(db, "tickets"), orderBy("timestamp", "desc"));
    if(!isGlobalAdmin) q = query(collection(db, "tickets"), where("userId", "==", currentUser.uid), orderBy("timestamp", "desc"));
    
    try {
        const snap = await getDocs(q); list.innerHTML = "";
        if(snap.empty) { list.innerHTML = "<p style='color:#aaa;'>No support tickets found.</p>"; return; }
        snap.forEach(tDoc => {
            const d = tDoc.data();
            const item = document.createElement('div');
            item.className = "auth-card";
            item.style.cursor = "pointer";
            item.innerHTML = `<strong style="color:var(--text-main);">${d.subject}</strong> <span style="float:right; color:${d.status === 'Open' ? '#4ade80' : '#94a3b8'}">${d.status}</span><br><small style="color:var(--text-muted);">${d.userEmail}</small>`;
            item.onclick = () => window.openThread(tDoc.id, d);
            list.appendChild(item);
        });
    } catch(err) { list.innerHTML = `<p style="color:var(--crimson);">Error fetching tickets.</p>`; }
};

window.submitTicket = async function(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    await addDoc(collection(db, "tickets"), { userId: currentUser.uid, userEmail: currentUser.email, subject: document.getElementById('ticket-subject').value, message: document.getElementById('ticket-msg').value, status: "Open", timestamp: serverTimestamp() });
    document.getElementById('ticket-form').reset();
    showResponseText(btn, 'success', "Ticket submitted! Support will respond shortly.");
    window.fetchTickets();
};

window.openThread = function(id, data) {
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

    if(ticketChatUnsubscribe) ticketChatUnsubscribe();
    ticketChatUnsubscribe = onSnapshot(query(collection(db, "tickets", id, "messages"), orderBy("timestamp", "asc")), snap => {
        const box = document.getElementById('ticket-chat-box');
        if(!box) return; box.innerHTML = "";
        snap.forEach(mDoc => {
            const m = mDoc.data();
            const isMe = m.sender === currentUser.email;
            box.innerHTML += `<div style="align-self:${isMe ? 'flex-end' : 'flex-start'}; background:${isMe ? 'var(--crimson)' : 'rgba(255,255,255,0.05)'}; padding:8px 12px; border-radius:8px; max-width:80%; margin-bottom:10px; font-size:0.9rem;">
                <small style="display:block; opacity:0.7; font-size:0.6rem;">${m.senderName || m.sender}</small>${m.text}</div>`;
        });
        box.scrollTop = box.scrollHeight;
    });
};

window.closeThreadView = function() {
    document.getElementById('list-view').style.display = 'block';
    document.getElementById('thread-view').style.display = 'none';
    if(ticketChatUnsubscribe) ticketChatUnsubscribe();
    window.fetchTickets();
};

window.closeActiveTicket = async function() {
    window.showCustomPrompt("Close Ticket", "Enter Resolution / Close Reason:", "Reason...", async (r) => {
        await updateDoc(doc(db, "tickets", activeTicketId), { status: "Closed", closeReason: r });
        window.closeThreadView();
    });
};

window.submitTicketChat = async function(e) {
    e.preventDefault();
    const input = document.getElementById('ticket-chat-input');
    await addDoc(collection(db, "tickets", activeTicketId, "messages"), { text: input.value, sender: currentUser.email, senderName: currentUser.displayName || currentUser.email, timestamp: serverTimestamp() });
    input.value = "";
};

// --- CHATTER, BOTS, AND VISUAL PARSING ---

window.startVisualBotBuilder = function() {
    document.getElementById('server-settings-main-view').style.display = 'none';
    document.getElementById('bot-builder-ui').style.display = 'flex';
    document.getElementById('botName').value = "";
    
    const container = document.getElementById('drawflow-container');
    container.innerHTML = ""; 
    
    // Initialize Drawflow
    window.botEditor = new Drawflow(container);
    window.botEditor.start();
};

window.cancelBotBuild = function() {
    document.getElementById('server-settings-main-view').style.display = 'block';
    document.getElementById('bot-builder-ui').style.display = 'none';
};

window.addBotNode = function(type) {
    if(!window.botEditor) return;
    if(type === 'trigger') {
        const html = `<div><div class="title-box">📥 Trigger Node</div><input type="text" df-keyword placeholder="If user says..."></div>`;
        window.botEditor.addNode('trigger', 0, 1, 50, 100, 'trigger', { keyword: '' }, html);
    } else if (type === 'action') {
        const html = `<div><div class="title-box">📤 Action Node</div><input type="text" df-reply placeholder="Bot will reply..."></div>`;
        window.botEditor.addNode('action', 1, 0, 350, 100, 'action', { reply: '' }, html);
    }
};

window.saveVisualBot = async function() {
    const name = document.getElementById('botName').value.trim();
    if(!name) return window.showCustomAlert("Please enter a Bot Name!");
    
    const exportData = window.botEditor.export();
    
    const newBot = { id: Date.now().toString(), name: name, graph: exportData };
    await updateDoc(doc(db, "discord_servers", activeServerId), { bots: arrayUnion(newBot) });
    
    window.showCustomAlert("Bot Graph Saved!");
    window.cancelBotBuild();
    window.renderBotList();
};

window.deleteBot = async function(botId) {
    if(!activeServerData || !activeServerData.bots) return;
    const botToRemove = activeServerData.bots.find(b => b.id === botId);
    if(botToRemove) {
        await updateDoc(doc(db, "discord_servers", activeServerId), { bots: arrayRemove(botToRemove) });
        window.renderBotList();
    }
};

window.renderBotList = async function() {
    const list = document.getElementById('bot-list');
    if(!list) return; list.innerHTML = "Loading bots...";
    const snap = await getDoc(doc(db, "discord_servers", activeServerId));
    activeServerData = snap.data();
    list.innerHTML = "";
    if(!activeServerData.bots || activeServerData.bots.length === 0) { list.innerHTML = "<p style='color:#aaa; font-size: 0.9rem;'>No bots yet.</p>"; return; }
    activeServerData.bots.forEach(bot => {
        list.innerHTML += `<div class="bot-list-item">
            <div><strong style="color:var(--text-main)">${bot.name}</strong> <span class="bot-tag">APP</span><br>
            <small style="color:var(--text-muted)">Logic Graph Active</small></div>
            <button class="btn-danger" style="padding: 5px 10px; width:auto;" onclick="deleteBot('${bot.id}')">Delete</button>
        </div>`;
    });
};

window.submitChat = async function(e) {
    e.preventDefault();
    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    if(!text || !currentUser) return;

    const msgData = {
        text: text, senderUid: currentUser.uid, senderEmail: currentUser.email,
        senderName: currentUser.displayName || currentUser.email.split('@')[0], 
        senderPfp: currentUser.photoURL || DEFAULT_PFP, timestamp: serverTimestamp()
    };
    input.value = "";

    if (activeChatType === 'server' && activeServerId && activeChannelId) {
        const msgRef = collection(db, "discord_servers", activeServerId, "channels", activeChannelId, "messages");
        await addDoc(msgRef, msgData);

        // PARSE THE VISUAL DRAWFLOW GRAPH FOR BOTS
        if (activeServerData && activeServerData.bots) {
            activeServerData.bots.forEach(bot => {
                const nodes = bot.graph.drawflow.Home.data;
                
                // Find all Triggers in the graph
                Object.values(nodes).forEach(node => {
                    if (node.name === 'trigger') {
                        const keyword = node.data.keyword;
                        if (keyword && text.toLowerCase().includes(keyword.toLowerCase())) {
                            
                            // If trigger matches, follow the wire to the next action!
                            const connections = node.outputs['output_1'].connections;
                            connections.forEach(conn => {
                                const nextNode = nodes[conn.node];
                                if (nextNode && nextNode.name === 'action') {
                                    const reply = nextNode.data.reply;
                                    if (reply) {
                                        setTimeout(async () => {
                                            await addDoc(msgRef, {
                                                text: reply, senderUid: `bot_${bot.id}`, senderEmail: 'bot@system.local',
                                                senderName: bot.name, senderPfp: 'https://cdn-icons-png.flaticon.com/512/4712/4712035.png',
                                                isBot: true, timestamp: serverTimestamp()
                                            });
                                        }, 600);
                                    }
                                }
                            });
                        }
                    }
                });
            });
        }
    }
};

window.selectChannel = function(channelId, channelName, element) {
    activeChatType = 'server'; activeChannelId = channelId;
    document.getElementById('active-channel-name').innerHTML = `${channelName}`;
    document.getElementById('chat-form').style.display = 'block';
    
    document.querySelectorAll('.channel-item').forEach(el => el.classList.remove('active'));
    if(element) element.classList.add('active');

    const myName = currentUser?.displayName || currentUser?.email.split('@')[0];

    if(chatterMessagesUnsub) chatterMessagesUnsub();
    const box = document.getElementById('chat-box');
    box.innerHTML = "";

    chatterMessagesUnsub = onSnapshot(query(collection(db, "discord_servers", activeServerId, "channels", activeChannelId, "messages"), orderBy("timestamp", "asc")), snap => {
        box.innerHTML = "";
        snap.forEach(mDoc => {
            const m = mDoc.data();
            const timeStr = formatDiscordTime(m.timestamp);
            const botHtml = m.isBot ? `<span class="bot-tag">✔ APP</span>` : '';
            const isPinged = m.text.includes(`@${myName}`) || m.text.includes('@everyone');
            const pingClass = isPinged ? 'ping-highlight' : '';
            let formattedText = m.text.replace(/@(\w+)/g, '<span class="mention">@$1</span>');

            box.innerHTML += `
                <div class="msg ${pingClass}">
                    <img src="${m.senderPfp || DEFAULT_PFP}" class="chat-pfp">
                    <div class="msg-content">
                        <div class="msg-header">
                            <span class="msg-sender">${m.senderName}</span>
                            ${botHtml}
                            <span class="msg-timestamp">${timeStr}</span>
                        </div>
                        <div class="msg-text">${formattedText}</div>
                    </div>
                </div>`;
        });
        box.scrollTop = box.scrollHeight;
    });
};

window.selectServer = function(serverId, serverData, element) {
    document.getElementById('chat-box').style.display = 'flex';
    document.getElementById('discovery-box').style.display = 'none';

    activeChatType = 'server'; activeServerId = serverId; activeServerData = serverData; activeChannelId = null;
    document.getElementById('active-server-name').innerText = serverData.name;
    
    const box = document.getElementById('chat-box'); if(box) box.innerHTML = ""; // BUG FIX: Instantly clears history

    const amIAdmin = serverData.admins?.includes(currentUser.uid) || serverData.owner === currentUser.uid;
    document.getElementById('add-channel-btn').style.display = amIAdmin ? 'block' : 'none';
    document.getElementById('server-settings-btn').style.display = amIAdmin ? 'block' : 'none';
    document.getElementById('chat-form').style.display = 'none';
    
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
            el.onclick = (e) => { e.preventDefault(); window.selectChannel(docSnap.id, cData.name, el); };
            channelList.appendChild(el);
        });
    });
};

window.openServerSettings = async function() {
    const modal = document.getElementById('server-settings-modal');
    if(!modal) return;
    
    // Reset view to main settings
    document.getElementById('server-settings-main-view').style.display = 'block';
    document.getElementById('bot-builder-ui').style.display = 'none';
    
    modal.style.display = 'flex';
    const serverSnap = await getDoc(doc(db, "discord_servers", activeServerId));
    activeServerData = serverSnap.data();
    
    const url = activeServerData.photoURL || "";
    const preview = document.getElementById('server-icon-preview');
    if(preview) { preview.src = url; preview.style.display = url ? 'block' : 'none'; }
    window.renderBotList();
};

window.createServer = async function() {
    if(!currentUser) return;
    window.showCustomPrompt("Create Server", "Enter a name for your new server:", "Server Name...", async (name) => {
        const newServer = await addDoc(collection(db, "discord_servers"), { 
            name: name, owner: currentUser.uid, members: [currentUser.uid], admins: [currentUser.uid], bots: [], timestamp: serverTimestamp()
        });
        await addDoc(collection(db, "discord_servers", newServer.id, "channels"), { name: "general", timestamp: serverTimestamp() });
    });
};

window.createChannel = async function() {
    if(!activeServerId) return;
    window.showCustomPrompt("Add Channel", "Enter the new channel name:", "Channel Name...", async (name) => {
        await addDoc(collection(db, "discord_servers", activeServerId, "channels"), { name: name.toLowerCase().replace(/\s+/g, '-'), timestamp: serverTimestamp() });
    });
};

window.openDiscovery = async function() {
    document.querySelectorAll('.server-icon').forEach(el => el.classList.remove('active'));
    document.getElementById('btn-discovery').classList.add('active');
    document.getElementById('active-server-name').innerText = "Discovery";
    document.getElementById('channel-list').innerHTML = "";
    document.getElementById('chat-box').style.display = 'none';
    document.getElementById('chat-form').style.display = 'none';
    document.getElementById('active-channel-name').innerText = "Discover Public Servers";
    
    const discBox = document.getElementById('discovery-box');
    discBox.style.display = 'flex'; discBox.innerHTML = "Loading servers...";
    
    const snap = await getDocs(collection(db, "discord_servers"));
    discBox.innerHTML = "";
    snap.forEach(docSnap => {
        const data = docSnap.data();
        if(!data.members?.includes(currentUser.uid)) {
            const imgHtml = data.photoURL ? `<img src="${data.photoURL}">` : `<div style="width:80px;height:80px;border-radius:50%;background:rgba(255,255,255,0.1);margin:0 auto 10px;line-height:80px;font-size:1.5rem; color: white;">${data.name.substring(0,2).toUpperCase()}</div>`;
            discBox.innerHTML += `<div class="discovery-card">${imgHtml}<h3 style="margin-top:0;">${data.name}</h3><button class="btn-primary" onclick="joinServer('${docSnap.id}')">Join Server</button></div>`;
        }
    });
};

window.joinServer = async function(serverId) {
    await updateDoc(doc(db, "discord_servers", serverId), { members: arrayUnion(currentUser.uid) });
    window.openDiscovery(); 
};

window.initChatter = function() {
    if(chatterServersUnsub) return;
    const serverList = document.getElementById('server-list');
    if(!serverList || !currentUser) return;

    const myServersQuery = query(collection(db, "discord_servers"), where("members", "array-contains", currentUser.uid));
    
    chatterServersUnsub = onSnapshot(myServersQuery, snap => {
        serverList.innerHTML = "";
        snap.forEach(docSnap => {
            const data = docSnap.data();
            const el = document.createElement('div');
            el.className = `server-icon ${activeServerId === docSnap.id ? 'active' : ''}`;
            el.title = data.name;
            if(data.photoURL) { el.innerHTML = `<img src="${data.photoURL}">`; } else { el.innerText = data.name.substring(0,2).toUpperCase(); }
            el.onclick = (e) => { e.preventDefault(); window.selectServer(docSnap.id, data, el); };
            serverList.appendChild(el);
        });
    });
};

// --- ROUTING & AUTH STATE ---
window.routeTo = function(page) {
    document.querySelectorAll('.page-content').forEach(p => p.style.display = 'none');
    const pg = document.getElementById('page-' + page);
    if(pg) pg.style.display = 'block';
    
    document.querySelectorAll('.nav-links a').forEach(a => a.classList.remove('active'));
    const activeLink = document.querySelector(`.nav-links a[onclick="routeTo('${page}')"]`);
    if(activeLink) {
        activeLink.classList.add('active');
        const blobMain = document.getElementById('blob-main');
        const blobTrail = document.getElementById('blob-trail');
        if(blobMain && blobTrail) {
            blobMain.style.width = `${activeLink.offsetWidth}px`; 
            blobMain.style.left = `${activeLink.offsetLeft}px`; 
            blobTrail.style.width = `${activeLink.offsetWidth}px`; 
            blobTrail.style.left = `${activeLink.offsetLeft}px`; 
        }
    }

    try {
        if(page === 'home') window.fetchHomeImages();
        if(page === 'updates') window.fetchNews();
        if(page === 'terms') window.fetchTerms();
        if(page === 'privacy') window.fetchPrivacy();
    } catch (e) { console.error(e); }
};

onAuthStateChanged(auth, user => {
    if(user && (user.emailVerified || user.providerData.some(p => p.providerId === 'google.com'))) {
        currentUser = user;
        isGlobalAdmin = (user.email.toLowerCase() === ADMIN_EMAIL.toLowerCase());

        const navAuth = document.getElementById('nav-auth-link');
        if(navAuth) navAuth.innerText = "Dashboard";
        
        const loginC = document.getElementById('login-container'); if(loginC) loginC.style.display = 'none';
        const dashC = document.getElementById('dashboard-container'); if(dashC) dashC.style.display = 'block';
        
        const chatLock = document.getElementById('chatter-locked'); if(chatLock) chatLock.style.display = 'none';
        const chatSys = document.getElementById('chatter-system'); 
        if(chatSys) { chatSys.style.display = 'flex'; window.initChatter(); }

        // Support Sync
        const supLock = document.getElementById('support-locked'); if(supLock) supLock.style.display = 'none';
        const supSys = document.getElementById('page-support'); if(supSys) { supSys.style.display = 'block'; window.fetchTickets(); }

        // Population
        const emailEl = document.getElementById('user-display-email'); if(emailEl) emailEl.innerText = user.email;
        const nameEl = document.getElementById('display-name'); if(nameEl) nameEl.value = user.displayName || "";
        const pfpEl = document.getElementById('dashboard-pfp-preview'); if(pfpEl) pfpEl.src = user.photoURL || DEFAULT_PFP;

        // Admin Controls
        const adminPanel = document.getElementById('admin-panel'); if(adminPanel) adminPanel.style.display = isGlobalAdmin ? 'block' : 'none';
        const adminHome = document.getElementById('admin-home-editor'); if(adminHome) adminHome.style.display = isGlobalAdmin ? 'block' : 'none';
        
        setDoc(doc(db, "users", currentUser.uid), {
            uid: currentUser.uid,
            username: (user.displayName || user.email.split('@')[0]).toLowerCase(),
            displayName: user.displayName || user.email.split('@')[0]
        }, { merge: true });

    } else {
        currentUser = null; isGlobalAdmin = false;
        
        const loginC = document.getElementById('login-container'); if(loginC) loginC.style.display = 'block';
        const dashC = document.getElementById('dashboard-container'); if(dashC) dashC.style.display = 'none';
        
        const chatLock = document.getElementById('chatter-locked'); if(chatLock) chatLock.style.display = 'block';
        const chatSys = document.getElementById('chatter-system'); if(chatSys) chatSys.style.display = 'none';
        
        const supLock = document.getElementById('support-locked'); if(supLock) supLock.style.display = 'block';
        const supSys = document.getElementById('page-support'); if(supSys) supSys.style.display = 'none';

        const adminPanel = document.getElementById('admin-panel'); if(adminPanel) adminPanel.style.display = 'none';
        const adminHome = document.getElementById('admin-home-editor'); if(adminHome) adminHome.style.display = 'none';
    }
});

// --- DRAG AND DROP UPLOADS ---
const pfpDropZone = document.getElementById('pfp-drop-zone');
const pfpFileInput = document.getElementById('pfp-file-input');
if(pfpDropZone && pfpFileInput) {
    pfpDropZone.addEventListener('click', () => pfpFileInput.click());
    pfpFileInput.addEventListener('change', (e) => handleImageUpload(e.target.files[0], 'pfp', pfpDropZone)); 
    pfpDropZone.addEventListener('dragover', (e) => { e.preventDefault(); pfpDropZone.classList.add('dragover'); });
    pfpDropZone.addEventListener('dragleave', () => pfpDropZone.classList.remove('dragover'));
    pfpDropZone.addEventListener('drop', (e) => { e.preventDefault(); pfpDropZone.classList.remove('dragover'); if (e.dataTransfer.files.length) handleImageUpload(e.dataTransfer.files[0], 'pfp', pfpDropZone); });
}

const serverDropZone = document.getElementById('server-drop-zone');
const serverFileInput = document.getElementById('server-file-input');
if(serverDropZone && serverFileInput) {
    serverDropZone.addEventListener('click', () => serverFileInput.click());
    serverFileInput.addEventListener('change', (e) => handleImageUpload(e.target.files[0], 'server', serverDropZone));
    serverDropZone.addEventListener('dragover', (e) => { e.preventDefault(); serverDropZone.classList.add('dragover'); });
    serverDropZone.addEventListener('dragleave', () => serverDropZone.classList.remove('dragover'));
    serverDropZone.addEventListener('drop', (e) => { e.preventDefault(); serverDropZone.classList.remove('dragover'); if (e.dataTransfer.files.length) handleImageUpload(e.dataTransfer.files[0], 'server', serverDropZone); });
}

const homeDropZone = document.getElementById('home-drop-zone');
const homeFileInput = document.getElementById('home-file-input');
if(homeDropZone && homeFileInput) {
    homeDropZone.addEventListener('click', () => homeFileInput.click());
    homeFileInput.addEventListener('change', (e) => handleImageUpload(e.target.files[0], 'home', homeDropZone));
    homeDropZone.addEventListener('dragover', (e) => { e.preventDefault(); homeDropZone.classList.add('dragover'); });
    homeDropZone.addEventListener('dragleave', () => homeDropZone.classList.remove('dragover'));
    homeDropZone.addEventListener('drop', (e) => { e.preventDefault(); homeDropZone.classList.remove('dragover'); if (e.dataTransfer.files.length) handleImageUpload(e.dataTransfer.files[0], 'home', homeDropZone); });
}

async function handleImageUpload(file, type, triggeringElement) {
    if (!file || !file.type.startsWith('image/')) {
        window.showCustomAlert("Error: Not a valid image.");
        return;
    }

    if (type === 'home' && !isGlobalAdmin) {
        window.showCustomAlert("Error: Only Global Admins can modify the homepage gallery.");
        return;
    }

    let statusEl, previewEl;
    if (type === 'pfp') { statusEl = document.getElementById('upload-status'); previewEl = document.getElementById('dashboard-pfp-preview'); } 
    else if (type === 'server') { if(!activeServerId) return; statusEl = document.getElementById('server-upload-status'); previewEl = document.getElementById('server-icon-preview'); } 
    else if (type === 'home') { statusEl = document.getElementById('home-upload-status'); }

    if(statusEl) { statusEl.style.display = 'block'; statusEl.innerText = "Syncing with ImgBB Grid..."; }

    try {
        const formData = new FormData(); formData.append("image", file);
        const response = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, { method: "POST", body: formData });
        const data = await response.json();
        
        if (!data.success) throw new Error("ImgBB Upload Failed");
        const downloadURL = data.data.url;

        if(previewEl) { previewEl.src = downloadURL; previewEl.style.display = 'block'; }

        if (type === 'pfp') {
            if(statusEl) statusEl.innerText = "Synced! Click 'Save Profile Info'.";
        } else if (type === 'server') {
            await updateDoc(doc(db, "discord_servers", activeServerId), { photoURL: downloadURL });
            if(statusEl) statusEl.innerText = "Server Icon Synced!";
        } else if (type === 'home') {
            await addDoc(collection(db, "home_images"), { url: downloadURL, timestamp: serverTimestamp() });
            if(statusEl) statusEl.innerText = "Synced to Homepage!";
            window.fetchHomeImages(); 
        }
        setTimeout(() => { if(statusEl) statusEl.style.display = 'none'; }, 4000);
    } catch (error) {
        if(statusEl) statusEl.innerText = "ImgBB Sync Failed";
        console.error("IMGBB Error:", error);
    }
}

setTimeout(() => { if(document.getElementById('page-home')) window.routeTo('home'); }, 100);
