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

// --- RESTORED POPUP PROMPT ---
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

// ... Auth State & Friends loading remain sound, but ensuring PFP on friend item ...

function loadFriends() {
    onSnapshot(doc(db, "users", currentUser.uid), (docSnap) => {
        friendsList.innerHTML = ""; const data = docSnap.data();
        if(!data || !data.friends || data.friends.length === 0) return;
        data.friends.forEach(friend => {
            const el = document.createElement('div'); el.className = 'friend-item';
            // Restoring PFP on Friend List
            const pfpToUse = friend.photoURL || DEFAULT_PFP;
            el.innerHTML = `<img src="${pfpToUse}" class="dc-avatar" style="width:24px; height:24px;"> ${friend.displayName}`;
            el.onclick = () => createOrOpenDirectChat(friend.uid, friend.displayName);
            friendsList.appendChild(el);
        });
    });
}

// ... createOrOpenDirectChat & newChatBtn remain sound ...

// --- DISCORD PFP FIX ---
function openChat(chatId, data, element, nameOverride) {
    activeChatId = chatId; activeChatData = data;
    document.querySelectorAll('.channel-item').forEach(el => el.classList.remove('active'));
    if(element) element.classList.add('active');
    
    activeChatName.innerText = `@ ${nameOverride}`;
    messageForm.style.display = 'block'; startCallBtn.style.display = (data.type === 'direct') ? 'block' : 'none';

    if (messagesUnsub) messagesUnsub();
    messagesUnsub = onSnapshot(query(collection(db, "dialog_chats", chatId, "messages"), orderBy("timestamp", "asc")), snap => {
        messagesBox.innerHTML = "";
        snap.forEach(mDoc => {
            const m = mDoc.data();
            // Restoring PFP, Username, Time format matching style.css (Discord UI)
            const pfpToUse = m.senderPfp || DEFAULT_PFP;
            const timeStr = m.timestamp ? m.timestamp.toDate().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : "Just now";

            messagesBox.innerHTML += `
                <div class="dc-msg">
                    <img src="${pfpToUse}" class="dc-avatar">
                    <div class="dc-msg-content">
                        <div class="dc-msg-header"><span class="dc-username">${m.senderName}</span> <span class="dc-timestamp">${timeStr}</span></div>
                        <div class="dc-msg-text">${m.text}</div>
                    </div>
                </div>`;
        });
        messagesBox.scrollTop = messagesBox.scrollHeight;
    });
    listenForCalls(chatId);
}

// ... WebRTC & Call logic remains sound ...
