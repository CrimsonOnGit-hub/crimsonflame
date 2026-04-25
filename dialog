import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, collection, doc, setDoc, getDoc, addDoc, onSnapshot, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

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
const db = getFirestore(app);

// WebRTC Configuration (Using Google's free STUN servers to bounce through firewalls)
const servers = {
    iceServers: [
        {
            urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'],
        },
    ],
    iceCandidatePoolSize: 10,
};

// Global State
const pc = new RTCPeerConnection(servers);
let localStream = null;
let remoteStream = null;

// HTML Elements
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const cameraBtn = document.getElementById('cameraBtn');
const callBtn = document.getElementById('callBtn');
const answerBtn = document.getElementById('answerBtn');
const hangupBtn = document.getElementById('hangupBtn');
const callInput = document.getElementById('callInput');
const callIdDisplay = document.getElementById('callIdDisplay');

// 1. Setup Media Sources
cameraBtn.onclick = async () => {
    try {
        // Request video and audio
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        remoteStream = new MediaStream();

        // Push local stream to HTML video element
        localVideo.srcObject = localStream;
        remoteVideo.srcObject = remoteStream;

        // Push tracks from local stream to peer connection
        localStream.getTracks().forEach((track) => {
            pc.addTrack(track, localStream);
        });

        // Listen for remote tracks and add them to the remote video element
        pc.ontrack = (event) => {
            event.streams[0].getTracks().forEach((track) => {
                remoteStream.addTrack(track);
            });
        };

        // Enable UI buttons
        cameraBtn.disabled = true;
        callBtn.disabled = false;
        answerBtn.disabled = false;
        cameraBtn.innerText = "Camera Active";
        cameraBtn.style.background = "#4ade80";
        cameraBtn.style.color = "#111";
    } catch (error) {
        console.error("Error accessing media devices.", error);
        alert("Camera or Microphone access denied. Check your browser permissions.");
    }
};

// 2. Create an Offer (Start a Call)
callBtn.onclick = async () => {
    callBtn.disabled = true;
    answerBtn.disabled = true;
    hangupBtn.disabled = false;

    // Reference Firestore collections
    const callDoc = doc(collection(db, 'calls'));
    const offerCandidates = collection(callDoc, 'offerCandidates');
    const answerCandidates = collection(callDoc, 'answerCandidates');

    callIdDisplay.innerText = callDoc.id;

    // Get candidates for caller, save to db
    pc.onicecandidate = (event) => {
        event.candidate && addDoc(offerCandidates, event.candidate.toJSON());
    };

    // Create offer
    const offerDescription = await pc.createOffer();
    await pc.setLocalDescription(offerDescription);

    const offer = {
        sdp: offerDescription.sdp,
        type: offerDescription.type,
    };

    await setDoc(callDoc, { offer });

    // Listen for remote answer
    onSnapshot(callDoc, (snapshot) => {
        const data = snapshot.data();
        if (!pc.currentRemoteDescription && data?.answer) {
            const answerDescription = new RTCSessionDescription(data.answer);
            pc.setRemoteDescription(answerDescription);
        }
    });

    // When answered, add candidate to peer connection
    onSnapshot(answerCandidates, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
            if (change.type === 'added') {
                const candidate = new RTCIceCandidate(change.doc.data());
                pc.addIceCandidate(candidate);
            }
        });
    });
};

// 3. Answer the Call with the unique ID
answerBtn.onclick = async () => {
    const callId = callInput.value.trim();
    if (!callId) return alert("Please enter a Call ID to join.");

    callBtn.disabled = true;
    answerBtn.disabled = true;
    hangupBtn.disabled = false;

    const callDoc = doc(db, 'calls', callId);
    const answerCandidates = collection(callDoc, 'answerCandidates');
    const offerCandidates = collection(callDoc, 'offerCandidates');

    pc.onicecandidate = (event) => {
        event.candidate && addDoc(answerCandidates, event.candidate.toJSON());
    };

    const callData = (await getDoc(callDoc)).data();

    if (!callData) return alert("Call ID not found!");

    const offerDescription = callData.offer;
    await pc.setRemoteDescription(new RTCSessionDescription(offerDescription));

    const answerDescription = await pc.createAnswer();
    await pc.setLocalDescription(answerDescription);

    const answer = {
        type: answerDescription.type,
        sdp: answerDescription.sdp,
    };

    await updateDoc(callDoc, { answer });

    onSnapshot(offerCandidates, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
            if (change.type === 'added') {
                let data = change.doc.data();
                pc.addIceCandidate(new RTCIceCandidate(data));
            }
        });
    });
};

// 4. Hangup
hangupBtn.onclick = () => {
    pc.close();
    if(localStream) {
        localStream.getTracks().forEach(track => track.stop());
    }
    window.location.reload(); // Refresh to clean slate
};
