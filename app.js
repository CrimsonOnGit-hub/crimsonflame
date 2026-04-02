import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut, setPersistence, browserLocalPersistence, updateProfile } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, query, orderBy, where, doc, onSnapshot, updateDoc, serverTimestamp, arrayUnion, arrayRemove } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
// NEW IMPORTS FOR STORAGE
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
const storage = getStorage(app); // INITIALIZE STORAGE
setPersistence(auth, browserLocalPersistence);

let activeServerId = null;
let activeServerAdmins = []; 
let activeChannelId = null;

let chatterServersUnsub = null;
let chatterChannelsUnsub = null;
let chatterMessagesUnsub = null;

// --- ROUTING ---
window.routeTo = function(page) {
    document.querySelectorAll('.page-content').forEach(p => p.style.display = 'none');
    const target = document.getElementById('page-' + page);
    if(target) target.style.display = 'block';
    
    document.querySelectorAll('nav a').forEach(a => a.style.color = 'white');
    const activeLink = document.querySelector(`nav a[onclick="routeTo('${page}')"]`);
    if(activeLink) activeLink.style.color = 'var(--crimson)';

    if(page === 'chatter' && auth.currentUser) initChatter();
};

// --- AUTH ---
onAuthStateChanged(auth, user => {
    const navAuth = document.getElementById('nav-auth-link');
    if(user) {
        navAuth.innerText = "Dashboard";
        document.getElementById('login-container').style.display = 'none';
        document.getElementById('dashboard-container').style.display = 'block';
        document.getElementById('chatter-locked').style.display = 'none';
        document.getElementById('chatter-system').style.display = 'flex';
        
        document.getElementById('user-display-email').innerText = user.email;
        document.getElementById('display-name').value = user.displayName || "";
        document.getElementById('display-pfp').value = user.photoURL || "";
        document.getElementById('dashboard-pfp-preview').src = user.photoURL || DEFAULT_PFP;
    } else {
        navAuth.innerText = "Login";
        document.getElementById('login-container').style.display = 'block';
        document.getElementById('dashboard-container').style.display = 'none';
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
    const newPfp = document.getElementById('display-pfp').value; // URL from drag-drop
    if (auth.currentUser) {
        await updateProfile(auth.currentUser, { displayName: newName, photoURL: newPfp });
        alert("Profile Updated!");
    }
};

// --- DRAG AND DROP LOGIC: PROFILE PICTURE ---
const pfpDropZone = document.getElementById('pfp-drop-zone');
const pfpFileInput = document.getElementById('pfp-file-input');

pfpDropZone.addEventListener('click', () => pfpFileInput.click());
pfpFileInput.addEventListener('change', (e) => handleImageUpload(e.target.files[0], 'pfp'));

pfpDropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    pfpDropZone.classList.add('dragover');
});
pfpDropZone.addEventListener('dragleave', () => pfpDropZone.classList.remove('dragover'));
pfpDropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    pfpDropZone.classList.remove('dragover');
    if (e.dataTransfer.files.length) handleImageUpload(e.dataTransfer.files[0], 'pfp');
});

// --- DRAG AND DROP LOGIC: SERVER ICON ---
const serverDropZone = document.getElementById('server-drop-zone');
const serverFileInput = document.getElementById('server-file-input');

serverDropZone.addEventListener('click', () => serverFileInput.click());
serverFileInput.addEventListener('change', (e) => handleImageUpload(e.target.files[0], 'server'));

serverDropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    serverDropZone.classList.add('dragover');
});
serverDropZone.addEventListener('dragleave', () => serverDropZone.classList.remove('dragover'));
serverDropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    serverDropZone.classList.remove('dragover');
    if (e.dataTransfer.files.length) handleImageUpload(e.dataTransfer.files[0], 'server');
});

// --- CORE UPLOAD FUNCTION ---
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
    statusEl.innerText = "Uploading...";

    try {
        const storageRef = ref(storage, path);
        await uploadBytesResumable(storageRef, file);
        const downloadURL = await getDownloadURL(storageRef);

        previewEl.src = downloadURL;
        previewEl.style.display = 'block';

        if (type === 'pfp') {
            document.getElementById('display-pfp').value = downloadURL;
            statusEl.innerText = "Upload complete! Click Save Profile.";
        } else if (type === 'server') {
            await updateDoc(doc(db, "discord_servers", activeServerId), { photoURL: downloadURL });
            statusEl.innerText = "Server Icon Updated!";
        }
        
        setTimeout(() => statusEl.style.display = 'none', 3000);
    } catch (error) {
        statusEl.innerText = "Error: " + error.message;
        console.error(error);
    }
}

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
    
    const discBox = document.getElementById('discovery-box');
    discBox.style.display = 'flex';
    discBox.innerHTML = "Loading...";

    const snap = await getDocs(collection(db, "discord_servers"));
    discBox.innerHTML = "";
    snap.forEach(docSnap => {
        const data = docSnap.data();
        if(!data.members?.includes(auth.currentUser.uid) && !data.banned?.includes(auth.currentUser.uid)) {
            const imgHtml = data.photoURL ? `<img src="${data.photoURL}">` : `<div style="width:80px;height:80px;border-radius:50%;background:#222;margin:0 auto 10px;line-height:80px;font-size:1.5rem;font-weight:bold;">${data.name.substring(0,2).toUpperCase()}</div>`;
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
    const amIAdmin = activeServerAdmins.includes(auth.currentUser.uid);
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

// OPEN SERVER SETTINGS MODAL
document.getElementById('server-settings-btn').onclick = () => {
    document.getElementById('server-settings-modal').style.display = 'flex';
    document.getElementById('server-upload-status').style.display = 'none';
};

document.getElementById('add-channel-btn').onclick = async () => {
    if(!activeServerId) return;
    const name = prompt("Enter Channel Name:");
    if(name) {
        await addDoc(collection(db, "discord_servers", activeServerId, "channels"), { name: name.toLowerCase().replace(/\s+/g, '-'), timestamp: serverTimestamp() });
    }
};

function selectChannel(channelId, channelName, element) {
    activeChannelId = channelId;
    document.getElementById('active-channel-name').innerText = `# ${channelName}`;
    document.getElementById('chat-form').style.display = 'block';
    
    document.querySelectorAll('.channel-item').forEach(el => el.classList.remove('active'));
    element.classList.add('active');

    const amIAdmin = activeServerAdmins.includes(auth.currentUser.uid);

    if(chatterMessagesUnsub) chatterMessagesUnsub();
    const box = document.getElementById('chat-box');

    chatterMessagesUnsub = onSnapshot(query(collection(db, "discord_servers", activeServerId, "channels", activeChannelId, "messages"), orderBy("timestamp", "asc")), snap => {
        box.innerHTML = "";
        
        snap.forEach(mDoc => {
            const m = mDoc.data();
            const nameToUse = m.senderName || m.senderEmail.split('@')[0];
            const pfpToUse = m.senderPfp || DEFAULT_PFP;
            
            let formattedText = m.text.replace(/@(\w+)/g, '<span class="mention">@$1</span>');
            
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
                        <div class="msg-text">${formattedText}</div>
                    </div>
                </div>`;
        });
        box.scrollTop = box.scrollHeight;
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
