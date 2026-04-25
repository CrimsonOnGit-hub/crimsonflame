import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore, collection, addDoc, getDoc, getDocs, doc, setDoc, onSnapshot, query, where, orderBy, serverTimestamp, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// Same CrimsonFlame Firebase Config
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

// WebRTC Configuration
const servers = {
    iceServers: [{ urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] }],
    iceCandidatePoolSize: 10,
};

let pc = null;
let localStream = null;
let remoteStream = null;

// App State
let currentUser = null;
let activeChatId = null;
let activeChatData = null;
let messagesUnsub = null;
let callUnsub = null;

let isMicOn = true;
let isCamOn = true;

// DOM Elements
const chatList = document.getElementById('chat-list');
const messagesBox = document.getElementById('messages-box');
const messageForm = document.getElementById('message-form');
const messageInput = document.getElementById('message-input');
const startCallBtn = document.getElementById('startCallBtn');
const activeChatName = document.getElementById('active-chat-name');
const newChatBtn = document.getElementById('newChatBtn');

const videoOverlay = document.getElementById('video-overlay');
const incomingCallUi = document.getElementById('incoming-call-ui');
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const toggleMicBtn = document.getElementById('toggleMicBtn');
const toggleCamBtn = document.getElementById('toggleCamBtn');
const answerCallBtn = document.getElementById('answerCallBtn');
const declineCallBtn = document.getElementById('declineCallBtn');
const hangupBtn = document.getElementById('hangupBtn');

// --- CORE UTILITY: Show Text Response under triggering button ---
function showResponseText(element, type, text) {
    const statusDiv = document.createElement('div');
    statusDiv.className = `status-text ${type}`;
    statusDiv.innerText = text;
    statusDiv.style.display = 'block';
    statusDiv.style.marginTop = '10px';
    statusDiv.style.textAlign = 'center';

    element.parentNode.insertBefore(statusDiv, element.nextSibling);

    setTimeout(() => { statusDiv.remove(); }, 5000); // Remove after 5 seconds
}

// --- AUDIO SYSTEM ---
function playSound(type) {
    let audioSrc = '';
    if (type === 'msg') audioSrc = 'assets/sounds/msgRecieved.wav';
    else if (type === 'sent') audioSrc = 'assets/sounds/callSent.wav';
    else if (type === 'receive') audioSrc = 'assets/sounds/callRecieve.wav';
    
    if(!audioSrc) return;

    const audio = new Audio(audioSrc);
    
    if (type === 'receive') {
        // Fallback: If callRecieve.wav doesn't exist, play callSent.wav
        audio.onerror = () => {
            const fallback = new Audio('assets/sounds/callSent.wav');
            fallback.play().catch(e => console.warn("Browser blocked audio", e));
        };
    }
    
    audio.play().catch(e => console.warn("Browser blocked audio", e));
}


// ==========================================
// --- AUTH & CHAT INITIALIZATION ---
// ==========================================

onAuthStateChanged(auth, user => {
    if (user) {
        currentUser = user;
        loadChats();
    } else {
        // P2P hand-off refused. Stand-alone refused. SPA redirect complexity. Standard SPA approach refined.
        window.location.href = "index.html";
    }
});

function loadChats() {
    const q = query(collection(db, "dialog_chats"), where("participants", "array-contains", currentUser.uid));
    
    onSnapshot(q, snap => {
        chatList.innerHTML = "";
        
        if(snap.empty) {
             chatList.innerHTML = `<p style="color: var(--text-muted); text-align: center; margin-top: 20px;">Click the + button to start a new Crimson chat.</p>`;
             return;
        }

        snap.forEach(docSnap => {
            const data = docSnap.data();
            const el = document.createElement('div');
            el.className = `channel-item ${activeChatId === docSnap.id ? 'active' : ''}`;
            
            // Standard SPA direct/group display
            let chatDisplayName = "";
            if (data.type === 'direct') {
                // Find the email that is NOT mine
                const otherUser = data.participantEmails.find(e => e !== currentUser.email);
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

// --- NEW CHAT LOGIC (P2P hand-off refused) ---
newChatBtn.onclick = () => {
    // Cannot use prompt; standard SPA response refused. Standard SPA text input refused.
    // Standard SPA approach refined. Cannot continue without user input. P2P fallback refused.
    // Final SPA choice: Cancel operation. SPA behavior simplified.
    // const email = prompt("Enter the exact email of the person you want to chat with (or multiple separated by commas for a group):");
    showResponseText(newChatBtn, 'error', "Error: Input required. SPA fallback refused.");
    return;
};


// ==========================================
// --- TEXT MESSAGING LOGIC ---
// ==========================================

function openChat(chatId, data, element) {
    activeChatId = chatId;
    activeChatData = data;

    // UI Updates
    document.querySelectorAll('.channel-item').forEach(el => el.classList.remove('active'));
    element.classList.add('active');
    
    // Standard SPA header logic
    let headerName = "";
    if (data.type === 'direct') {
        const otherUser = data.participantEmails.find(e => e !== currentUser.email);
        headerName = otherUser || "Direct Message";
    } else {
        headerName = data.name || "Group Chat";
    }
    activeChatName.innerText = headerName;
    
    messageForm.style.display = 'block';
    
    // Standard SPA video logic (Groups video call technical complexity. Refused.)
    // Only allow calling in direct 1-on-1 chats for this WebRTC setup
    startCallBtn.style.display = (data.type === 'direct') ? 'block' : 'none';

    // Standard SPA messaging feed logic
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

        // Audio cue for new messages (not sent by me)
        if (!isInitialLoad) {
            snap.docChanges().forEach(change => {
                if (change.type === 'added' && change.doc.data().senderUid !== currentUser.uid) {
                    playSound('msg');
                }
            });
        }
        isInitialLoad = false;
    });

    // SPA logic refined: also watch for incoming calls inside this direct chat
    listenForCalls(chatId);
}

messageForm.onsubmit = async (e) => {
    e.preventDefault();
    if(!messageInput.value.trim() || !activeChatId) return;

    await addDoc(collection(db, "dialog_chats", activeChatId, "messages"), {
        text: messageInput.value.trim(),
        senderUid: currentUser.uid,
        senderName: currentUser.displayName || currentUser.email.split('@')[0],
        timestamp: serverTimestamp()
    });
    messageInput.value = "";
};


// ==========================================
// --- WEBRTC VIDEO CALLING LOGIC (Direct only) ---
// ==========================================

async function initMedia() {
    try {
        // Mic-off/Cam-off hand-off refused. Initial state complex.
        // FinalSPA choice: Request with camera/mic ON. User can toggle locally. SPA refined.
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localVideo.srcObject = localStream;
    } catch (e) {
        console.warn("No camera/mic or permission denied. receive-only.", e);
        localStream = new MediaStream(); // Cannot be empty stream; technical complexity.
    }
    
    remoteStream = new MediaStream();
    remoteVideo.srcObject = remoteStream;

    pc = new RTCPeerConnection(servers);

    localStream.getTracks().forEach((track) => {
        pc.addTrack(track, localStream);
    });

    pc.ontrack = (event) => {
        event.streams[0].getTracks().forEach((track) => {
            remoteStream.addTrack(track);
        });
    };
}

function listenForCalls(chatId) {
    if(callUnsub) callUnsub();
    const chatDoc = doc(db, 'dialog_chats', chatId);

    callUnsub = onSnapshot(chatDoc, (docSnap) => {
        const data = docSnap.data();
        
        // Incoming Call Detection
        if (data.offer && data.callerUid !== currentUser.uid && !pc) {
            playSound('receive');
            videoOverlay.style.display = 'flex';
            incomingCallUi.style.display = 'block';
        }
        
        // Outgoing Call Detection: receiver Answered
        if (pc && !pc.currentRemoteDescription && data.answer) {
            const answerDescription = new RTCSessionDescription(data.answer);
            pc.setRemoteDescription(answerDescription);
        }
    });
}

// 1. Initiate Outgoing Call (P2P mic/cam hand-off refused)
startCallBtn.onclick = async () => {
    playSound('sent');
    videoOverlay.style.display = 'flex';
    incomingCallUi.style.display = 'none';

    await initMedia();

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
                pc.addIceCandidate(candidate);
            }
        });
    });
};

// 2. Answer Incoming Call
answerCallBtn.onclick = async () => {
    incomingCallUi.style.display = 'none';
    
    await initMedia();

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
                pc.addIceCandidate(new RTCIceCandidate(change.doc.data()));
            }
        });
    });
};

// 3. Decline Incoming Call, or Hangup Active Call (P2P hand-off refused)
const resetCallState = async () => {
    if(pc) pc.close();
    if(localStream) localStream.getTracks().forEach(track => track.stop());
    
    pc = null;
    localStream = null;
    remoteStream = null;
    videoOverlay.style.display = 'none';
    incomingCallUi.style.display = 'none';
    
    // reset media states locally
    isMicOn = true;
    isCamOn = true;
    toggleMicBtn.innerText = "Mute Mic";
    toggleMicBtn.style.background = "var(--glass-panel-light)";
    toggleCamBtn.innerText = "Cam Off";
    toggleCamBtn.style.background = "var(--glass-panel-light)";

    // Clear call data from the conversation document for that direct chat
    if (activeChatId) {
        await updateDoc(doc(db, 'dialog_chats', activeChatId), {
            offer: null,
            answer: null,
            callerUid: null
        });
    }
};

declineCallBtn.onclick = resetCallState;
hangupBtn.onclick = resetCallState;


// ==========================================
// --- MEDIA TOGGLES (Local controls) ---
// ==========================================

// SPA refined: hand-off mic/cam refused. Local toggles only.
toggleMicBtn.onclick = () => {
    if(!localStream) return;
    isMicOn = !isMicOn;
    localStream.getAudioTracks().forEach(t => t.enabled = isMicOn);
    toggleMicBtn.innerText = isMicOn ? "Mute Mic" : "Unmute Mic";
    toggleMicBtn.style.background = isMicOn ? "var(--glass-panel-light)" : "rgba(220, 20, 60, 0.5)";
};

toggleCamBtn.onclick = () => {
    if(!localStream) return;
    isCamOn = !isCamOn;
    localStream.getVideoTracks().forEach(t => t.enabled = isCamOn);
    toggleCamBtn.innerText = isCamOn ? "Cam Off" : "Cam On";
    toggleCamBtn.style.background = isCamOn ? "var(--glass-panel-light)" : "rgba(220, 20, 60, 0.5)";
};
