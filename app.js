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
let activeDmId = null;

let chatterServersUnsub = null;
let chatterChannelsUnsub = null;
let chatterMessagesUnsub = null;
let ticketChatUnsubscribe = null;
let activeTicketId = null;
let isLogin = true;

window.showCustomPrompt = function(title, desc, placeholder, onConfirm) {
    const overlay = document.getElementById('custom-prompt');
    const input = document.getElementById('custom-prompt-input');
    const cancelBtn = document.getElementById('custom-prompt-cancel');
    const confirmBtn = document.getElementById('custom-prompt-confirm');

    document.getElementById('custom-prompt-title').innerText = title;
    document.getElementById('custom-prompt-desc').innerText = desc;
    input.style.display = 'block';
    input.placeholder = placeholder;
    input.value = "";
    overlay.classList.add('active');
    input.focus();

    cancelBtn.onclick = () => overlay.classList.remove('active');
    const submitAction = () => {
        if(input.value.trim() !== "") { overlay.classList.remove('active'); onConfirm(input.value.trim()); }
    };
    confirmBtn.onclick = submitAction;
    input.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); submitAction(); } };
};

window.showCustomConfirm = function(title, desc, onConfirm) {
    const overlay = document.getElementById('custom-prompt');
    const input = document.getElementById('custom-prompt-input');
    const cancelBtn = document.getElementById('custom-prompt-cancel');
    const confirmBtn = document.getElementById('custom-prompt-confirm');

    document.getElementById('custom-prompt-title').innerText = title;
    document.getElementById('custom-prompt-desc').innerText = desc;
    input.style.display = 'none'; 
    overlay.classList.add('active');

    cancelBtn.onclick = () => { overlay.classList.remove('active'); input.style.display = 'block'; };
    confirmBtn.onclick = () => { overlay.classList.remove('active'); input.style.display = 'block'; onConfirm(); };
};

window.showCustomAlert = function(message) {
    const overlay = document.getElementById('custom-alert');
    document.getElementById('custom-alert-message').innerText = message;
    overlay.classList.add('active');
    document.getElementById('custom-alert-ok').onclick = () => overlay.classList.remove('active');
};

function formatDiscordTime(timestamp) {
    if(!timestamp) return 'Just now';
    const d = timestamp.toDate();
    return d.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
}

window.submitLogin = async function(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    try {
        if(isLogin) {
            const userCredential = await signInWithEmailAndPassword(auth, document.getElementById('email').value, document.getElementById('password').value);
            if (!userCredential.user.emailVerified) {
                await sendEmailVerification(userCredential.user);
                await signOut(auth);
                window.showCustomAlert("Email not verified. A new link has been sent.");
            } else { window.routeTo('home'); }
        } else {
            const userCredential = await createUserWithEmailAndPassword(auth, document.getElementById('email').value, document.getElementById('password').value);
            await sendEmailVerification(userCredential.user);
            await signOut(auth);
            window.showCustomAlert("Account created! Check your inbox.");
            window.toggleLoginMode();
        }
    } catch (err) { window.showCustomAlert(`Error: ${err.message}`); } finally { btn.disabled = false; }
};

window.loginWithGoogle = async function(e) {
    e.preventDefault();
    try { await signInWithPopup(auth, googleProvider); window.routeTo('home'); } 
    catch (err) { window.showCustomAlert("Google Login Error: " + err.message); }
};

window.logOutUser = function() { signOut(auth); window.routeTo('home'); };
window.toggleLoginMode = function() {
    isLogin = !isLogin;
    document.getElementById('auth-title').innerText = isLogin ? "Account Login" : "Register Account";
    document.getElementById('toggle-auth').innerText = isLogin ? "Register here" : "Login here";
};

// --- CHAT & BOT ENGINE ---

window.submitChat = async function(e) {
    e.preventDefault();
    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    if(!text) return;

    // Send original message
    const msgData = {
        text: text, senderUid: auth.currentUser.uid, senderEmail: auth.currentUser.email,
        senderName: auth.currentUser.displayName || auth.currentUser.email.split('@')[0], 
        senderPfp: auth.currentUser.photoURL || DEFAULT_PFP, timestamp: serverTimestamp()
    };

    input.value = "";

    if (activeChatType === 'server' && activeServerId && activeChannelId) {
        const msgRef = collection(db, "discord_servers", activeServerId, "channels", activeChannelId, "messages");
        await addDoc(msgRef, msgData);

        // CLIENT-SIDE BOT ENGINE
        if (activeServerData && activeServerData.bots) {
            activeServerData.bots.forEach(bot => {
                if (text.toLowerCase().includes(bot.trigger.toLowerCase())) {
                    setTimeout(async () => {
                        await addDoc(msgRef, {
                            text: bot.response, senderUid: `bot_${bot.id}`, senderEmail: 'bot@system.local',
                            senderName: bot.name, senderPfp: 'https://cdn-icons-png.flaticon.com/512/4712/4712035.png',
                            isBot: true, timestamp: serverTimestamp()
                        });
                    }, 600); // Small natural delay
                }
            });
        }
    } else if (activeChatType === 'dm' && activeDmId) {
        await addDoc(collection(db, "dms", activeDmId, "messages"), msgData);
    }
};

window.createBot = function() {
    window.showCustomPrompt("New Bot", "Enter a name for the bot:", "Bot Name...", (botName) => {
        setTimeout(() => {
            window.showCustomPrompt("Bot Trigger", `What word should ${botName} listen for?`, "Trigger word...", (triggerWord) => {
                setTimeout(() => {
                    window.showCustomPrompt("Bot Response", `What should ${botName} say?`, "Response...", async (responseTxt) => {
                        const newBot = { id: Date.now().toString(), name: botName, trigger: triggerWord, response: responseTxt };
                        await updateDoc(doc(db, "discord_servers", activeServerId), { bots: arrayUnion(newBot) });
                        window.renderBotList();
                    });
                }, 300);
            });
        }, 300);
    });
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
    list.innerHTML = "Loading bots...";
    const snap = await getDoc(doc(db, "discord_servers", activeServerId));
    activeServerData = snap.data();
    list.innerHTML = "";
    if(!activeServerData.bots || activeServerData.bots.length === 0) {
        list.innerHTML = "<p style='color:#777; font-size: 0.9rem;'>No bots in this server yet.</p>";
        return;
    }
    activeServerData.bots.forEach(bot => {
        list.innerHTML += `<div class="bot-list-item">
            <div><strong style="color:var(--text-main)">${bot.name}</strong> <span class="bot-tag">APP</span><br>
            <small style="color:var(--text-muted)">Hears: "${bot.trigger}"</small></div>
            <button class="btn-danger" style="padding: 5px 10px; width:auto;" onclick="deleteBot('${bot.id}')">Delete</button>
        </div>`;
    });
};

window.selectChannel = function(channelId, channelName, element) {
    activeChatType = 'server'; activeChannelId = channelId;
    document.getElementById('active-channel-name').innerHTML = `<span style="color:#80848e; margin-right:5px;">#</span> ${channelName}`;
    document.getElementById('chat-form').style.display = 'block';
    
    document.querySelectorAll('.channel-item').forEach(el => el.classList.remove('active'));
    if(element) element.classList.add('active');

    const myName = auth.currentUser.displayName || auth.currentUser.email.split('@')[0];

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
                <div class="dc-msg ${pingClass}">
                    <img src="${m.senderPfp || DEFAULT_PFP}" class="dc-avatar" onclick="window.openDM('${m.senderUid}', '${m.senderName.replace(/'/g, "\\'")}')">
                    <div class="dc-msg-content">
                        <div class="dc-msg-header">
                            <span class="dc-username">${m.senderName}</span>
                            ${botHtml}
                            <span class="dc-timestamp">${timeStr}</span>
                        </div>
                        <div class="dc-msg-text">${formattedText}</div>
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
    
    const amIAdmin = serverData.admins?.includes(auth.currentUser.uid) || serverData.owner === auth.currentUser.uid;
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
    modal.style.display = 'flex';
    const serverSnap = await getDoc(doc(db, "discord_servers", activeServerId));
    activeServerData = serverSnap.data();
    window.renderBotList();
};

window.createServer = async function() {
    if(!auth.currentUser) return;
    window.showCustomPrompt("Create Server", "Enter a name for your new server:", "Server Name...", async (name) => {
        const newServer = await addDoc(collection(db, "discord_servers"), { 
            name: name, owner: auth.currentUser.uid, members: [auth.currentUser.uid], admins: [auth.currentUser.uid], bots: [], timestamp: serverTimestamp()
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
        if(!data.members?.includes(auth.currentUser.uid)) {
            const imgHtml = data.photoURL ? `<img src="${data.photoURL}">` : `<div style="width:80px;height:80px;border-radius:50%;background:rgba(255,255,255,0.1);margin:0 auto 10px;line-height:80px;font-size:1.5rem;">${data.name.substring(0,2).toUpperCase()}</div>`;
            discBox.innerHTML += `<div class="discovery-card">${imgHtml}<h3 style="margin-top:0;">${data.name}</h3><button class="btn-primary" onclick="joinServer('${docSnap.id}')">Join Server</button></div>`;
        }
    });
};

window.joinServer = async function(serverId) {
    await updateDoc(doc(db, "discord_servers", serverId), { members: arrayUnion(auth.currentUser.uid) });
    window.openDiscovery(); 
};

window.initChatter = function() {
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
            if(data.photoURL) { el.innerHTML = `<img src="${data.photoURL}">`; } else { el.innerText = data.name.substring(0,2).toUpperCase(); }
            el.onclick = (e) => { e.preventDefault(); window.selectServer(docSnap.id, data, el); };
            serverList.appendChild(el);
        });
    });
};

// ... Routing & Auth State
window.routeTo = function(page) {
    document.querySelectorAll('.page-content').forEach(p => p.style.display = 'none');
    document.getElementById('page-' + page).style.display = 'block';
    if(page === 'chatter' && auth.currentUser) window.initChatter();
};

onAuthStateChanged(auth, user => {
    if(user && (user.emailVerified || user.providerData.some(p => p.providerId === 'google.com'))) {
        document.getElementById('nav-auth-link').innerText = "Dashboard";
        document.getElementById('login-container').style.display = 'none';
        document.getElementById('dashboard-container').style.display = 'block';
        document.getElementById('chatter-locked').style.display = 'none';
        document.getElementById('chatter-system').style.display = 'flex';
    } else {
        document.getElementById('login-container').style.display = 'block';
        document.getElementById('chatter-locked').style.display = 'flex';
        document.getElementById('chatter-system').style.display = 'none';
    }
});
setTimeout(() => { window.routeTo('home'); }, 100);
