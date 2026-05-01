import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore, collection, addDoc, getDoc, getDocs, doc, setDoc, onSnapshot, query, where, orderBy, serverTimestamp, updateDoc, arrayUnion } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyBSSJKDrFJ1_qlliZqgw34CY2TSaKOxxxM",
    authDomain: "crimsonflame-8169e.firebaseapp.com",
    projectId: "crimsonflame-8169e",
    storageBucket: "crimsonflame-8169e.firebasestorage.app",
    messagingSenderId: "406321213530",
    appId: "1:406321213530:web:92d27a69d34d147393a863"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const servers = { iceServers: [{ urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] }] };

let pc = null; let localStream = null; let remoteStream = null;
let currentUser = null; let myUsername = "";
let activeChatId = null; let activeChatData = null;
let messagesUnsub = null; let callUnsub = null;
let iceQueue = [];

const DEFAULT_PFP = "https://cdn-icons-png.flaticon.com/512/149/149071.png";
const friendsList = document.getElementById('friends-list');
const chatList = document.getElementById('chat-list');
const messagesBox = document.getElementById('messages-box');
const messageForm = document.getElementById('message-form');
const messageInput = document.getElementById('message-input');
const startCallBtn = document.getElementById('startCallBtn');
const activeChatName = document.getElementById('active-chat-name');

window.showCustomPrompt = function(title, desc, placeholder, onConfirm) {
    const overlay = document.getElementById('custom-prompt');
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

window.showCustomAlert = function(message) {
    const overlay = document.getElementById('custom-alert');
    document.getElementById('custom-alert-message').innerText = message;
    overlay.classList.add('active');
    document.getElementById('custom-alert-ok').onclick = () => overlay.classList.remove('active');
};

const sfx = { msg: new Audio('assets/sounds/msgRecieved.wav'), sent: new Audio('assets/sounds/callSent.wav'), receive: new Audio('assets/sounds/callRecieve.wav') };
sfx.msg.load(); sfx.sent.load(); sfx.receive.load();
sfx.receive.onerror = () => { sfx.receive = new Audio('assets/sounds/callSent.wav'); };

function playSound(type) { if (!sfx[type]) return; sfx[type].currentTime = 0; sfx[type].play().catch(() => {}); }

function formatDiscordTime(timestamp) {
    if(!timestamp) return 'Just now';
    return timestamp.toDate().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
}

onAuthStateChanged(auth, async (user) => {
    if (user && (user.emailVerified || user.providerData.some(p => p.providerId === 'google.com'))) {
        currentUser = user; myUsername = user.displayName || user.email.split('@')[0];
        await setDoc(doc(db, "users", currentUser.uid), { uid: currentUser.uid, username: myUsername.toLowerCase(), displayName: myUsername }, { merge: true });
        loadFriends(); loadChats();
    } else { window.location.href = "dashboard.html"; }
});

function loadFriends() {
    onSnapshot(doc(db, "users", currentUser.uid), (docSnap) => {
        friendsList.innerHTML = ""; const data = docSnap.data();
        if(!data || !data.friends || data.friends.length === 0) return;
        data.friends.forEach(friend => {
            const el = document.createElement('div'); el.className = 'friend-item';
            const pfpToUse = friend.photoURL || DEFAULT_PFP;
            // FIXED PFP sizing in friends list
            el.innerHTML = `<img src="${pfpToUse}" class="chat-pfp" style="width:24px; height:24px;"> ${friend.displayName}`;
            el.onclick = () => createOrOpenDirectChat(friend.uid, friend.displayName);
            friendsList.appendChild(el);
        });
    });
}

document.getElementById('addFriendBtn').onclick = () => {
    window.showCustomPrompt("Add Friend", "Enter their exact username.", "Username...", async (targetUsername) => {
        targetUsername = targetUsername.toLowerCase();
        if(targetUsername === myUsername.toLowerCase()) return window.showCustomAlert("You can't add yourself!");
        const snap = await getDocs(query(collection(db, "users"), where("username", "==", targetUsername)));
        if(snap.empty) { window.showCustomAlert(`User "${targetUsername}" not found.`); } 
        else {
            const friendData = snap.docs[0].data();
            await updateDoc(doc(db, "users", currentUser.uid), { friends: arrayUnion({ uid: friendData.uid, displayName: friendData.displayName }) });
            window.showCustomAlert(`Added ${friendData.displayName}!`);
        }
    });
};

function loadChats() {
    onSnapshot(query(collection(db, "dialog_chats"), where("participants", "array-contains", currentUser.uid)), snap => {
        chatList.innerHTML = "";
        snap.forEach(docSnap => {
            const data = docSnap.data();
            const el = document.createElement('div'); el.className = `channel-item ${activeChatId === docSnap.id ? 'active' : ''}`;
            const chatName = data.type === 'direct' ? (data.participantNames.find(n => n !== myUsername) || "User") : (data.name || "Group");
            el.innerHTML = `<img src="${DEFAULT_PFP}" class="chat-pfp" style="width:24px; height:24px;"> ${chatName}`;
            el.onclick = () => openChat(docSnap.id, data, el, chatName);
            chatList.appendChild(el);
        });
    });
}

async function createOrOpenDirectChat(targetUid, targetName) {
    const snap = await getDocs(query(collection(db, "dialog_chats"), where("type", "==", "direct"), where("participants", "array-contains", currentUser.uid)));
    let existingId = null; let existingData = null;
    snap.forEach(d => { if(d.data().participants.includes(targetUid)){ existingId = d.id; existingData = d.data(); } });
    if(existingId) { openChat(existingId, existingData, null, targetName); } 
    else { await addDoc(collection(db, "dialog_chats"), { participants: [currentUser.uid, targetUid], participantNames: [myUsername, targetName], type: 'direct', createdAt: serverTimestamp() }); }
}

document.getElementById('newChatBtn').onclick = () => {
    window.showCustomPrompt("New Chat", "Enter username.", "Username...", async (targetUsername) => {
        const snap = await getDocs(query(collection(db, "users"), where("username", "==", targetUsername.toLowerCase())));
        if(snap.empty) window.showCustomAlert(`User not found.`); else createOrOpenDirectChat(snap.docs[0].data().uid, snap.docs[0].data().displayName);
    });
};

function openChat(chatId, data, element, nameOverride) {
    activeChatId = chatId; activeChatData = data;
    document.querySelectorAll('.channel-item').forEach(el => el.classList.remove('active'));
    if(element) element.classList.add('active');
    
    activeChatName.innerText = `@ ${nameOverride}`;
    messageForm.style.display = 'block'; startCallBtn.style.display = (data.type === 'direct') ? 'block' : 'none';

    if (messagesUnsub) messagesUnsub();
    let isInit = true;
    messagesUnsub = onSnapshot(query(collection(db, "dialog_chats", chatId, "messages"), orderBy("timestamp", "asc")), snap => {
        messagesBox.innerHTML = "";
        snap.forEach(mDoc => {
            const m = mDoc.data();
            const pfpToUse = m.senderPfp || DEFAULT_PFP;
            const timeStr = formatDiscordTime(m.timestamp);

            // FIXED PFP sizing utilizing the chat-pfp CSS class
            messagesBox.innerHTML += `
                <div class="msg">
                    <img src="${pfpToUse}" class="chat-pfp">
                    <div class="msg-content">
                        <div class="msg-header">
                            <span class="msg-sender">${m.senderName}</span> 
                            <span class="msg-timestamp">${timeStr}</span>
                        </div>
                        <div class="msg-text">${m.text}</div>
                    </div>
                </div>`;
        });
        messagesBox.scrollTop = messagesBox.scrollHeight;
        if (!isInit) { snap.docChanges().forEach(c => { if (c.type === 'added' && c.doc.data().senderUid !== currentUser.uid) playSound('msg'); }); }
        isInit = false;
    });
    listenForCalls(chatId);
}

messageForm.onsubmit = async (e) => {
    e.preventDefault(); if(!messageInput.value.trim() || !activeChatId) return;
    await addDoc(collection(db, "dialog_chats", activeChatId, "messages"), { text: messageInput.value.trim(), senderUid: currentUser.uid, senderName: myUsername, senderPfp: currentUser.photoURL || DEFAULT_PFP, timestamp: serverTimestamp() });
    messageInput.value = "";
};

// --- WEBRTC ---
function processIceQueue() { iceQueue.forEach(c => pc.addIceCandidate(c).catch(e=>console.log(e))); iceQueue = []; }
async function initMedia() {
    try { localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true }); document.getElementById('localVideo').srcObject = localStream; } 
    catch (e) { localStream = new MediaStream(); }
    remoteStream = new MediaStream(); document.getElementById('remoteVideo').srcObject = remoteStream;
    pc = new RTCPeerConnection(servers);
    localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));
    pc.ontrack = (event) => { event.streams[0].getTracks().forEach((track) => remoteStream.addTrack(track)); };
}

function listenForCalls(chatId) {
    if(callUnsub) callUnsub();
    callUnsub = onSnapshot(doc(db, 'dialog_chats', chatId), (docSnap) => {
        const data = docSnap.data(); if(!data) return;
        if (data.offer && data.callerUid !== currentUser.uid && !pc) {
            playSound('receive'); document.getElementById('video-overlay').style.display = 'flex'; document.getElementById('incoming-call-ui').style.display = 'block';
        }
        if (pc && !pc.currentRemoteDescription && data.answer) {
            pc.setRemoteDescription(new RTCSessionDescription(data.answer)).then(() => processIceQueue());
        }
    });
}

startCallBtn.onclick = async () => {
    playSound('sent'); document.getElementById('video-overlay').style.display = 'flex'; document.getElementById('incoming-call-ui').style.display = 'none';
    await initMedia(); iceQueue = []; 
    const chatDoc = doc(db, 'dialog_chats', activeChatId);
    pc.onicecandidate = (e) => { e.candidate && addDoc(collection(chatDoc, 'offerCandidates'), e.candidate.toJSON()); };
    const offer = await pc.createOffer(); await pc.setLocalDescription(offer);
    await updateDoc(chatDoc, { offer: { sdp: offer.sdp, type: offer.type }, callerUid: currentUser.uid });
    onSnapshot(collection(chatDoc, 'answerCandidates'), (snap) => {
        snap.docChanges().forEach((c) => { if (c.type === 'added') { const cand = new RTCIceCandidate(c.doc.data()); if (pc.remoteDescription) pc.addIceCandidate(cand); else iceQueue.push(cand); } });
    });
};

document.getElementById('answerCallBtn').onclick = async () => {
    document.getElementById('incoming-call-ui').style.display = 'none'; await initMedia(); iceQueue = [];
    const chatDoc = doc(db, 'dialog_chats', activeChatId);
    pc.onicecandidate = (e) => { e.candidate && addDoc(collection(chatDoc, 'answerCandidates'), e.candidate.toJSON()); };
    const offer = (await getDoc(chatDoc)).data().offer; await pc.setRemoteDescription(new RTCSessionDescription(offer));
    const ans = await pc.createAnswer(); await pc.setLocalDescription(ans);
    await updateDoc(chatDoc, { answer: { type: ans.type, sdp: ans.sdp } });
    onSnapshot(collection(chatDoc, 'offerCandidates'), (snap) => {
        snap.docChanges().forEach((c) => { if (c.type === 'added') { const cand = new RTCIceCandidate(c.doc.data()); if (pc.remoteDescription) pc.addIceCandidate(cand); else iceQueue.push(cand); } });
    });
};

const resetCallState = async () => {
    if(pc) pc.close(); if(localStream) localStream.getTracks().forEach(t => t.stop());
    pc = null; localStream = null; remoteStream = null; iceQueue = []; 
    document.getElementById('video-overlay').style.display = 'none'; document.getElementById('incoming-call-ui').style.display = 'none';
    if (activeChatId) await updateDoc(doc(db, 'dialog_chats', activeChatId), { offer: null, answer: null, callerUid: null });
};
document.getElementById('declineCallBtn').onclick = resetCallState; document.getElementById('hangupBtn').onclick = resetCallState;
