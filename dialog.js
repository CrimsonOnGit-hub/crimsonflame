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

const servers = {
    iceServers: [{ urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] }],
    iceCandidatePoolSize: 10,
};

let pc = null; 
let localStream = null; 
let remoteStream = null;
let currentUser = null; 
let myUsername = "";
let activeChatId = null; 
let activeChatData = null;
let messagesUnsub = null; 
let callUnsub = null;
let isMicOn = true; 
let isCamOn = true;

let iceQueue = [];

// DOM Elements
const chatList = document.getElementById('chat-list');
const friendsList = document.getElementById('friends-list');
const messagesBox = document.getElementById('messages-box');
const messageForm = document.getElementById('message-form');
const messageInput = document.getElementById('message-input');
const startCallBtn = document.getElementById('startCallBtn');
const activeChatName = document.getElementById('active-chat-name');
const newChatBtn = document.getElementById('newChatBtn');
const addFriendBtn = document.getElementById('addFriendBtn');

const videoOverlay = document.getElementById('video-overlay');
const incomingCallUi = document.getElementById('incoming-call-ui');
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const toggleMicBtn = document.getElementById('toggleMicBtn');
const toggleCamBtn = document.getElementById('toggleCamBtn');
const answerCallBtn = document.getElementById('answerCallBtn');
const declineCallBtn = document.getElementById('declineCallBtn');
const hangupBtn = document.getElementById('hangupBtn');

// --- CUSTOM LIQUID MODALS ---
function showCustomPrompt(title, desc, placeholder, onConfirm) {
    const overlay = document.getElementById('custom-prompt');
    document.getElementById('custom-prompt-title').innerText = title;
    document.getElementById('custom-prompt-desc').innerText = desc;
    
    const input = document.getElementById('custom-prompt-input');
    input.placeholder = placeholder;
    input.value = "";
    
    overlay.classList.add('active');
    input.focus();

    const cancelBtn = document.getElementById('custom-prompt-cancel');
    const confirmBtn = document.getElementById('custom-prompt-confirm');

    const newCancel = cancelBtn.cloneNode(true);
    const newConfirm = confirmBtn.cloneNode(true);
    cancelBtn.replaceWith(newCancel);
    confirmBtn.replaceWith(newConfirm);

    newCancel.onclick = () => overlay.classList.remove('active');
    newConfirm.onclick = () => {
        if(input.value.trim() !== "") {
            overlay.classList.remove('active');
            onConfirm(input.value.trim());
        }
    };
}

function showCustomAlert(message) {
    const overlay = document.getElementById('custom-alert');
    document.getElementById('custom-alert-message').innerText = message;
    overlay.classList.add('active');

    const okBtn = document.getElementById('custom-alert-ok');
    const newOk = okBtn.cloneNode(true);
    okBtn.replaceWith(newOk);
    newOk.onclick = () => overlay.classList.remove('active');
}

// --- AUDIO SYSTEM ---
const sfx = {
    msg: new Audio('assets/sounds/msgRecieved.wav'),
    sent: new Audio('assets/sounds/callSent.wav'),
    receive: new Audio('assets/sounds/callRecieve.wav')
};

function playSound(type) {
    if (!sfx[type]) return;
    sfx[type].currentTime = 0; 
    sfx[type].play().catch(() => {});
}

// ==========================================
// --- AUTH & DATA INITIALIZATION ---
// ==========================================

onAuthStateChanged(auth, async (user) => {
    // Allows email/password OR Google users
    if (user && (user.emailVerified || user.providerData.some(p => p.providerId === 'google.com'))) {
        currentUser = user;
        myUsername = user.displayName || user.email.split('@')[0];
        
        await setDoc(doc(db, "users", currentUser.uid), {
            uid: currentUser.uid,
            username: myUsername.toLowerCase(),
            displayName: myUsername
        }, { merge: true });

        loadFriends();
        loadChats();
    } else {
        window.location.href = "index.html";
    }
});

// --- FRIENDING LOGIC ---
function loadFriends() {
    onSnapshot(doc(db, "users", currentUser.uid), (docSnap) => {
        friendsList.innerHTML = "";
        const data = docSnap.data();
        if(!data || !data.friends || data.friends.length === 0) {
            friendsList.innerHTML = `<p style="color: var(--text-muted); text-align: center; margin-top: 10px; font-size: 0.9rem;">No friends yet.</p>`;
            return;
        }

        data.friends.forEach(friend => {
            const el = document.createElement('div');
            el.className = 'friend-item';
            el.innerHTML = `👤 ${friend.displayName}`;
            el.onclick = () => createOrOpenDirectChat(friend.uid, friend.displayName);
            friendsList.appendChild(el);
        });
    });
}

addFriendBtn.onclick = () => {
    showCustomPrompt("Add Friend", "Enter their exact username.", "Username...", async (targetUsername) => {
        targetUsername = targetUsername.toLowerCase();
        if(targetUsername === myUsername.toLowerCase()) return showCustomAlert("You can't add yourself!");

        const q = query(collection(db, "users"), where("username", "==", targetUsername));
        const snap = await getDocs(q);
        
        if(snap.empty) {
            showCustomAlert(`No user found with the username "${targetUsername}".`);
        } else {
            const friendData = snap.docs[0].data();
            await updateDoc(doc(db, "users", currentUser.uid), {
                friends: arrayUnion({ uid: friendData.uid, displayName: friendData.displayName })
            });
            showCustomAlert(`Added ${friendData.displayName} to your friends list!`);
        }
    });
};

// --- CHAT LOGIC ---
function loadChats() {
    const q = query(collection(db, "dialog_chats"), where("participants", "array-contains", currentUser.uid));
    onSnapshot(q, snap => {
        chatList.innerHTML = "";
        if(snap.empty) {
             chatList.innerHTML = `<p style="color: var(--text-muted); text-align: center; margin-top: 20px;">Click the + button to start a new chat.</p>`;
             return;
        }

        snap.forEach(docSnap => {
            const data = docSnap.data();
            const el = document.createElement('div');
            el.className = `channel-item ${activeChatId === docSnap.id ? 'active' : ''}`;
            
            let chatDisplayName = "";
            if (data.type === 'direct') {
                const otherUser = data.participantNames ? data.participantNames.find(n => n !== myUsername) : "User";
                chatDisplayName = otherUser || "Direct Message";
            } else {
                chatDisplayName = data.name || "Group Chat";
            }

            el.innerText = chatDisplayName;
            el.onclick = () => openChat(docSnap.id, data, el);
            chatList.appendChild(el);
        });
    });
}

async function createOrOpenDirectChat(targetUid, targetName) {
    const q = query(collection(db, "dialog_chats"), where("type", "==", "direct"), where("participants", "array-contains", currentUser.uid));
    const snap = await getDocs(q);
    
    let existingChatId = null;
    let existingChatData = null;

    snap.forEach(docSnap => {
        const d = docSnap.data();
        if(d.participants.includes(targetUid)) {
            existingChatId = docSnap.id;
            existingChatData = d;
        }
    });

    if(existingChatId) {
        const el = Array.from(document.querySelectorAll('.channel-item')).find(item => item.innerText === targetName);
        if(el) openChat(existingChatId, existingChatData, el);
    } else {
        await addDoc(collection(db, "dialog_chats"), {
            participants: [currentUser.uid, targetUid],
            participantNames: [myUsername, targetName],
            type: 'direct',
            createdAt: serverTimestamp()
        });
    }
}

newChatBtn.onclick = () => {
    showCustomPrompt("New Chat", "Enter a username to start a direct message.", "Username...", async (targetUsername) => {
        targetUsername = targetUsername.toLowerCase();
        if(targetUsername === myUsername.toLowerCase()) return showCustomAlert("You can't chat with yourself!");

        const q = query(collection(db, "users"), where("username", "==", targetUsername));
        const snap = await getDocs(q);
        
        if(snap.empty) {
            showCustomAlert(`No user found with the username "${targetUsername}".`);
        } else {
            const friendData = snap.docs[0].data();
            createOrOpenDirectChat(friendData.uid, friendData.displayName);
        }
    });
};

function openChat(chatId, data, element) {
    activeChatId = chatId;
    activeChatData = data;

    document.querySelectorAll('.channel-item').forEach(el => el.classList.remove('active'));
    if(element) element.classList.add('active');
    
    let headerName = "";
    if (data.type === 'direct') {
        const otherUser = data.participantNames ? data.participantNames.find(n => n !== myUsername) : "User";
        headerName = otherUser || "Direct Message";
    } else {
        headerName = data.name || "Group Chat";
    }
    activeChatName.innerText = headerName;
    
    messageForm.style.display = 'block';
    startCallBtn.style.display = (data.type === 'direct') ? 'block' : 'none';

    if (messagesUnsub) messagesUnsub();
    
    let isInitialLoad = true;
    messagesUnsub = onSnapshot(query(collection(db, "dialog_chats", chatId, "messages"), orderBy("timestamp", "asc")), snap => {
        messagesBox.innerHTML = "";
        snap.forEach(mDoc => {
            const m = mDoc.data();
            const isMe = m.senderUid === currentUser.uid;
            messagesBox.innerHTML += `
            <div style="align-self:${isMe ? 'flex-end' : 'flex-start'}; background:${isMe ? 'var(--crimson)' : 'rgba(0,0,0,0.3)'}; padding:8px 12px; border-radius:8px; max-width:80%; font-size:0.9rem; border: 1px solid var(--glass-border); margin-top: 10px;">
                <small style="display:block; opacity:0.7; font-size:0.6rem;">${m.senderName}</small>${m.text}
            </div>`;
        });
        messagesBox.scrollTop = messagesBox.scrollHeight;

        if (!isInitialLoad) {
            snap.docChanges().forEach(change => {
                if (change.type === 'added' && change.doc.data().senderUid !== currentUser.uid) {
                    playSound('msg');
                }
            });
        }
        isInitialLoad = false;
    });

    listenForCalls(chatId);
}

messageForm.onsubmit = async (e) => {
    e.preventDefault();
    if(!messageInput.value.trim() || !activeChatId) return;

    await addDoc(collection(db, "dialog_chats", activeChatId, "messages"), {
        text: messageInput.value.trim(),
        senderUid: currentUser.uid,
        senderName: myUsername,
        timestamp: serverTimestamp()
    });
    messageInput.value = "";
};

messageInput.addEventListener('focus', () => {
    messageInput.parentNode.classList.add('active-focus'); 
});

messageInput.addEventListener('blur', () => {
    messageInput.parentNode.classList.remove('active-focus'); 
});


// ==========================================
// --- WEBRTC VIDEO CALLING ---
// ==========================================

function processIceQueue() {
    iceQueue.forEach(candidate => {
        pc.addIceCandidate(candidate).catch(e => console.error("Error adding queued ICE Candidate:", e));
    });
    iceQueue = [];
}

async function initMedia() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localVideo.srcObject = localStream;
    } catch (e) {
        console.warn("No camera/mic found.", e);
        localStream = new MediaStream(); 
    }
    
    remoteStream = new MediaStream();
    remoteVideo.srcObject = remoteStream;
    pc = new RTCPeerConnection(servers);

    localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));
    pc.ontrack = (event) => { event.streams[0].getTracks().forEach((track) => remoteStream.addTrack(track)); };
}

function listenForCalls(chatId) {
    if(callUnsub) callUnsub();
    const chatDoc = doc(db, 'dialog_chats', chatId);

    callUnsub = onSnapshot(chatDoc, (docSnap) => {
        const data = docSnap.data();
        if(!data) return;
        
        if (data.offer && data.callerUid !== currentUser.uid && !pc) {
            playSound('receive'); // PLAYS ONLY ON INCOMING CALL
            videoOverlay.style.display = 'flex';
            incomingCallUi.style.display = 'block';
        }
        
        if (pc && !pc.currentRemoteDescription && data.answer) {
            const answerDescription = new RTCSessionDescription(data.answer);
            pc.setRemoteDescription(answerDescription).then(() => {
                processIceQueue(); 
            });
        }
    });
}

startCallBtn.onclick = async () => {
    playSound('sent'); // PLAYS ONLY WHEN YOU CLICK "CALL"
    videoOverlay.style.display = 'flex';
    incomingCallUi.style.display = 'none';

    await initMedia();
    iceQueue = []; 

    const chatDoc = doc(db, 'dialog_chats', activeChatId);
    const offerCandidates = collection(chatDoc, 'offerCandidates');
    const answerCandidates = collection(chatDoc, 'answerCandidates');

    pc.onicecandidate = (event) => {
        event.candidate && addDoc(offerCandidates, event.candidate.toJSON());
    };

    const offerDescription = await pc.createOffer();
    await pc.setLocalDescription(offerDescription);

    const offer = { sdp: offerDescription.sdp, type: offerDescription.type };
    await updateDoc(chatDoc, { offer: offer, callerUid: currentUser.uid });

    onSnapshot(answerCandidates, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
            if (change.type === 'added') {
                const candidate = new RTCIceCandidate(change.doc.data());
                if (pc.remoteDescription) {
                    pc.addIceCandidate(candidate);
                } else {
                    iceQueue.push(candidate); 
                }
            }
        });
    });
};

answerCallBtn.onclick = async () => {
    incomingCallUi.style.display = 'none';
    
    await initMedia();
    iceQueue = [];

    const chatDoc = doc(db, 'dialog_chats', activeChatId);
    const offerCandidates = collection(chatDoc, 'offerCandidates');
    const answerCandidates = collection(chatDoc, 'answerCandidates');

    pc.onicecandidate = (event) => {
        event.candidate && addDoc(answerCandidates, event.candidate.toJSON());
    };

    const callData = (await getDoc(chatDoc)).data();
    const offerDescription = callData.offer;
    
    await pc.setRemoteDescription(new RTCSessionDescription(offerDescription));

    const answerDescription = await pc.createAnswer();
    await pc.setLocalDescription(answerDescription);

    const answer = { type: answerDescription.type, sdp: answerDescription.sdp };
    await updateDoc(chatDoc, { answer: answer });

    onSnapshot(offerCandidates, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
            if (change.type === 'added') {
                const candidate = new RTCIceCandidate(change.doc.data());
                if (pc.remoteDescription) {
                    pc.addIceCandidate(candidate);
                } else {
                    iceQueue.push(candidate);
                }
            }
        });
    });
};

const resetCallState = async () => {
    if(pc) pc.close();
    if(localStream) localStream.getTracks().forEach(track => track.stop());
    
    pc = null; localStream = null; remoteStream = null;
    iceQueue = []; 
    videoOverlay.style.display = 'none';
    incomingCallUi.style.display = 'none';
    
    isMicOn = true; isCamOn = true;
    toggleMicBtn.innerText = "Mute Mic";
    toggleMicBtn.style.background = "var(--glass-panel-light)";
    toggleCamBtn.innerText = "Cam Off";
    toggleCamBtn.style.background = "var(--glass-panel-light)";

    if (activeChatId) {
        await updateDoc(doc(db, 'dialog_chats', activeChatId), { offer: null, answer: null, callerUid: null });
    }
};

declineCallBtn.onclick = resetCallState;
hangupBtn.onclick = resetCallState;

toggleMicBtn.onclick = (e) => {
    if(!localStream) return;
    isMicOn = !isMicOn;
    localStream.getAudioTracks().forEach(t => t.enabled = isMicOn);
    e.target.innerText = isMicOn ? "Mute Mic" : "Unmute Mic";
    e.target.style.background = isMicOn ? "var(--glass-panel-light)" : "rgba(220, 20, 60, 0.5)";
};

toggleCamBtn.onclick = (e) => {
    if(!localStream) return;
    isCamOn = !isCamOn;
    localStream.getVideoTracks().forEach(t => t.enabled = isCamOn);
    e.target.innerText = isCamOn ? "Cam Off" : "Cam On";
    e.target.style.background = isCamOn ? "var(--glass-panel-light)" : "rgba(220, 20, 60, 0.5)";
};
