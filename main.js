import './style.css';
import firebase from 'firebase/app';
import 'firebase/firestore';
import CryptoJS from 'crypto-js';

const firebaseConfig = {
  apiKey: "AIzaSyCV48aXLqGf68pd6X0BYQqB7xzuk2M3Dxc",
  authDomain: "davinc-arch.firebaseapp.com",
  projectId: "davinc-arch",
  storageBucket: "davinc-arch.appspot.com",
  messagingSenderId: "527665746775",
  appId: "1:527665746775:web:111727767825c7a629e412"
};

// Initialize Firebase
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const firestore = firebase.firestore();

// STUN servers for WebRTC
const servers = {
  iceServers: [
    {
      urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'],
    },
  ],
  iceCandidatePoolSize: 10,
};

// Global State
const peerConnections = {};
let localStream = null;
let remoteStream = null;

// HTML elements
const webcamButton = document.getElementById('webcamButton');
const webcamVideo = document.getElementById('webcamVideo');
const callButton = document.getElementById('callButton');
const callInput = document.getElementById('callInput');
const answerButton = document.getElementById('answerButton');
const remoteVideo = document.getElementById('remoteVideo');
const hangupButton = document.getElementById('hangupButton');

// Utility function to create peer connections
const createPeerConnection = (id) => {
  const pc = new RTCPeerConnection(servers);

  pc.onicecandidate = event => {
    if (event.candidate) {
      console.log(`New ICE Candidate for ${id}:`, event.candidate);
      // Add ICE candidate to Firestore
      const candidateCollection = firestore.collection('calls').doc(id).collection('candidates');
      candidateCollection.add(event.candidate.toJSON());
    }
  };

  pc.ontrack = event => {
    event.streams[0].getTracks().forEach(track => {
      remoteStream.addTrack(track);
    });
  };

  return pc;
};

// 1. Setup media sources
webcamButton.onclick = async () => {
  localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  remoteStream = new MediaStream();

  localStream.getTracks().forEach(track => {
    Object.values(peerConnections).forEach(pc => {
      pc.addTrack(track, localStream);
    });
  });

  webcamVideo.srcObject = localStream;
  remoteVideo.srcObject = remoteStream;

  callButton.disabled = false;
  answerButton.disabled = false;
  webcamButton.disabled = true;
};

// 2. Create an offer
callButton.onclick = async () => {
  const timestamp = new Date().getTime();
  const callHash = CryptoJS.SHA256(String(timestamp)).toString();
  console.log(`Generated Call Hash (Caller ID): ${callHash}`);

  const callDoc = firestore.collection('calls').doc(callHash);
  const offerCandidates = callDoc.collection('offerCandidates');
  const answerCandidates = callDoc.collection('answerCandidates');

  callInput.value = callHash;

  peerConnections[callHash] = createPeerConnection(callHash);

  // Get candidates for caller, save to db
  peerConnections[callHash].onicecandidate = event => {
    if (event.candidate) {
      console.log('New ICE Candidate (Offerer):', event.candidate);
      offerCandidates.add(event.candidate.toJSON());
    }
  };

  const offerDescription = await peerConnections[callHash].createOffer();
  await peerConnections[callHash].setLocalDescription(offerDescription);

  const offer = {
    sdp: offerDescription.sdp,
    type: offerDescription.type,
    offerHash: callHash,
  };

  await callDoc.set({ offer });

  // Listen for remote answer
  callDoc.onSnapshot(snapshot => {
    const data = snapshot.data();
    if (!peerConnections[callHash].currentRemoteDescription && data?.answer) {
      const answerDescription = new RTCSessionDescription(data.answer);
      peerConnections[callHash].setRemoteDescription(answerDescription);
    }
  });

  // When answered, add candidate to peer connection
  answerCandidates.onSnapshot(snapshot => {
    snapshot.docChanges().forEach(change => {
      if (change.type === 'added') {
        const candidate = new RTCIceCandidate(change.doc.data());
        peerConnections[callHash].addIceCandidate(candidate);
      }
    });
  });

  hangupButton.disabled = false;
};

// 3. Answer the call with the unique ID
answerButton.onclick = async () => {
  const callId = callInput.value;
  const callDoc = firestore.collection('calls').doc(callId);
  const answerCandidates = callDoc.collection('answerCandidates');
  const offerCandidates = callDoc.collection('offerCandidates');

  peerConnections[callId] = createPeerConnection(callId);

  // Get candidates for callee, save to db
  peerConnections[callId].onicecandidate = event => {
    if (event.candidate) {
      console.log('New ICE Candidate (Answerer):', event.candidate);
      answerCandidates.add(event.candidate.toJSON());
    }
  };

  const callData = (await callDoc.get()).data();
  const offerDescription = callData.offer;

  await peerConnections[callId].setRemoteDescription(new RTCSessionDescription(offerDescription));

  const answerDescription = await peerConnections[callId].createAnswer();
  await peerConnections[callId].setLocalDescription(answerDescription);

  const answer = {
    type: answerDescription.type,
    sdp: answerDescription.sdp,
    answerHash: CryptoJS.SHA256(String(new Date().getTime())).toString(),
  };

  await callDoc.update({ answer });

  // Listen for offer candidates
  offerCandidates.onSnapshot(snapshot => {
    snapshot.docChanges().forEach(change => {
      if (change.type === 'added') {
        const candidate = new RTCIceCandidate(change.doc.data());
        peerConnections[callId].addIceCandidate(candidate);
      }
    });
  });
};

// 4. Relaying messages between peers
const relayMessageBetweenPeers = (sourcePeer, targetPeer, message) => {
  console.log(`Relaying message from ${sourcePeer} to ${targetPeer}:`, message);
  // Logic for relaying ICE candidates, SDP, or any other messages between peers
};

