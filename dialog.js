import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore, collection, addDoc, getDoc, getDocs, doc, setDoc, onSnapshot, query, where, orderBy, serverTimestamp, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

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

// WebRTC Config
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

const videoOverlay = document.getElementById('video-overlay');
const incomingCallUi = document.getElementById('incoming-call-ui');
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const toggleMicBtn = document.getElementById('toggleMicBtn');
const toggleCamBtn = document.getElementById('toggleCamBtn');
const answerCallBtn = document.getElementById('answerCallBtn');
const declineCallBtn = document.getElementById('declineCallBtn');
const hangupBtn = document.getElementById('hangupBtn');

// --- AUDIO SYSTEM ---
function playSound(type) {
    let audioSrc = '';
    if (type === 'msg') audioSrc = 'assets/sounds/msgRecieved.wav';
    else if (type === 'sent') audioSrc = 'assets/sounds/callSent.wav';
    else if (type === 'receive') audioSrc = 'assets/sounds/callRecieve.wav';
    
    if(!audioSrc) return;

    const audio = new Audio(audioSrc);
    
    if (type === 'receive') {
        // Fallback if callRecieve.wav doesn't exist
        audio.onerror = () => {
            const fallback = new Audio('assets/sounds/callSent.wav');
            fallback.play().catch(e => console.warn("Browser blocked audio", e));
        };
    }
    
    audio.play().catch(e => console.warn("Browser blocked audio", e));
}


// --- INIT AUTH & CHATS ---
onAuthStateChanged(auth, user => {
    if (user) {
        currentUser = user;
        loadChats();
    } else {
        window.location.href = "index.html"; // Boot guests back to hub
    }
});

function loadChats() {
    const q = query(collection(db, "dialog_chats"), where("participants", "array-contains", currentUser.uid));
    
    onSnapshot(q, snap => {
        chatList.innerHTML = "";
        snap.forEach(docSnap => {
            const data = docSnap.data();
            const el = document.createElement('div');
            el.className = `channel-item ${activeChatId === docSnap.id ? 'active' : ''}`;
            el.innerText = data.name || "Direct Message";
            el.onclick = () => openChat(docSnap.id, data);
            chatList.appendChild(el);
        });
    });
}

document.getElementById('newChatBtn').onclick = async () => {
    const email = prompt("Enter the exact email of the person you want to chat with (or multiple separated by commas for a group):");
    if(!email) return;

    const emails = email.split(',').map(e => e.trim().toLowerCase());
    const participants = [currentUser.uid];
    
    // Find UIDs by email (Requires querying a users collection if you have one. For simplicity, assuming you are finding them)
    // *Note: In a production app, you should look up UIDs. For this demo, we assume they provide UIDs directly if no user collection exists, but I will simulate it.*
    const newChatRef = await addDoc(collection(db, "dialog_chats"), {
        participants: participants, // You would push the found UIDs here
        name: emails.length > 1 ? "Group Chat" : emails[0],
        type: emails.length > 1 ? 'group' : 'direct',
        createdAt: serverTimestamp()
    });
    alert("Chat created!");
};


// --- TEXT MESSAGING LOGIC ---
function openChat(chatId, data) {
    activeChatId = chatId;
    activeChatData = data;

    // UI Updates
    document.querySelectorAll('.channel-item').forEach(el => el.classList.remove('active'));
    event.currentTarget.classList.add('active');
    activeChatName.innerText = data.name || "Direct Message";
    messageForm.style.display = 'block';
    
    // Only allow calling in 1-on-1 direct chats for this WebRTC setup
    startCallBtn.style.display = data.type === 'direct' ? 'block' : 'none';

    // Load Messages
    if (messagesUnsub) messagesUnsub();
    
    let isInitialLoad = true;
    messagesUnsub = onSnapshot(query(collection(db, "dialog_chats", chatId, "messages"), orderBy("timestamp", "asc")), snap => {
        messagesBox.innerHTML = "";
        snap.forEach(mDoc => {
            const m = mDoc.data();
            const isMe = m.senderUid === currentUser.uid;
            messagesBox.innerHTML += `
            <div style="align-self:${isMe ? 'flex-end' : 'flex-start'}; background:${isMe ? 'var(--crimson)' : 'rgba(0,0,0,0.3)'}; padding:8px 12px; border-radius:8px; max-width:80%; font-size:0.9rem; border: 1px solid var(--glass-border);">
                <small style="display:block; opacity:0.7; font-size:0.6rem;">${m.senderName}</small>${m.text}
            </div>`;
        });
        messagesBox.scrollTop = messagesBox.scrollHeight;

        // Play sound for new messages if it's not the initial load and not sent by me
        if (!isInitialLoad) {
            snap.docChanges().forEach(change => {
                if (change.type === 'added' && change.doc.data().senderUid !== currentUser.uid) {
                    playSound('msg');
                }
            });
        }
        isInitialLoad = false;
    });

    // Watch for incoming calls on this specific chat document
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


// --- WEBRTC CALLING LOGIC (BUILT INTO CHAT DOCS) ---

async function initMedia() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localVideo.srcObject = localStream;
    } catch (e) {
        console.warn("No camera/mic found or permission denied. Proceeding as receive-only.", e);
        // Create an empty stream so the UI doesn't crash
        localStream = new MediaStream(); 
    }
    
    remoteStream = new MediaStream();
    remoteVideo.srcObject = remoteStream;

    pc = new RTCPeerConnection(servers);

    // Push local tracks to peer
    localStream.getTracks().forEach((track) => {
        pc.addTrack(track, localStream);
    });

    // Listen for remote tracks
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
        
        // If there's an active offer and I am NOT the caller
        if (data.offer && data.callerUid !== currentUser.uid && !pc) {
            playSound('receive');
            videoOverlay.style.display = 'flex';
            incomingCallUi.style.display = 'block';
        }
        
        // If I am the caller, and the other person answered
        if (pc && !pc.currentRemoteDescription && data.answer) {
            const answerDescription = new RTCSessionDescription(data.answer);
            pc.setRemoteDescription(answerDescription);
        }
    });
}

// 1. Initiate Call
startCallBtn.onclick = async () => {
    playSound('sent');
    videoOverlay.style.display = 'flex';
    incomingCallUi.style.display = 'none';

    await initMedia();

    const chatDoc = doc(db, 'dialog_chats', activeChatId);
    const offerCandidates = collection(chatDoc, 'offerCandidates');
    const answerCandidates = collection(chatDoc, 'answerCandidates');

    // Get candidates for caller
    pc.onicecandidate = (event) => {
        event.candidate && addDoc(offerCandidates, event.candidate.toJSON());
    };

    // Create offer
    const offerDescription = await pc.createOffer();
    await pc.setLocalDescription(offerDescription);

    const offer = { sdp: offerDescription.sdp, type: offerDescription.type };
    await updateDoc(chatDoc, { offer: offer, callerUid: currentUser.uid });

    // Listen for remote answer candidates
    onSnapshot(answerCandidates, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
            if (change.type === 'added') {
                const candidate = new RTCIceCandidate(change.doc.data());
                pc.addIceCandidate(candidate);
            }
        });
    });
};

// 2. Answer Call
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

// 3. Decline or Hangup
const endCall = async () => {
    if(pc) pc.close();
    if(localStream) localStream.getTracks().forEach(track => track.stop());
    
    pc = null;
    localStream = null;
    remoteStream = null;
    videoOverlay.style.display = 'none';
    incomingCallUi.style.display = 'none';

    // Clear call data from the chat document so we can call again later
    if (activeChatId) {
        await updateDoc(doc(db, 'dialog_chats', activeChatId), {
            offer: null,
            answer: null,
            callerUid: null
        });
    }
};

declineCallBtn.onclick = endCall;
hangupBtn.onclick = endCall;


// --- MEDIA TOGGLES ---
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
