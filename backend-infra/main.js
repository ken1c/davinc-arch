import './style.css';
import firebase from 'firebase/app';
import 'firebase/firestore';
import CryptoJS from 'crypto-js';

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCV48aXLqGf68pd6X0BYQqB7xzuk2M3Dxc",
  authDomain: "davinc-arch.firebaseapp.com",
  projectId: "davinc-arch",
  storageBucket: "davinc-arch.appspot.com",
  messagingSenderId: "527665746775",
  appId: "1:527665746775:web:111727767825c7a629e412"
};

// Initialize Firebase if it hasn't been initialized already
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const firestore = firebase.firestore();

// STUN servers for WebRTC
const servers = {
  iceServers: [
    { urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] }
  ],
  iceCandidatePoolSize: 10,
};

// Only execute WebRTC in a browser environment
if (typeof window !== 'undefined') {
  // Global state
  const pc = new RTCPeerConnection(servers);
  let localStream = null;
  let remoteStream = new MediaStream();

  // HTML elements
  const webcamButton = document.getElementById('webcamButton');
  const webcamVideo = document.getElementById('webcamVideo');
  const callButton = document.getElementById('callButton');
  const callInput = document.getElementById('callInput');
  const answerButton = document.getElementById('answerButton');
  const remoteVideo = document.getElementById('remoteVideo');
  const hangupButton = document.getElementById('hangupButton');

  // 1. Setup media sources
  webcamButton.onclick = async () => {
    try {
      localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

      pc.ontrack = event => {
        event.streams[0].getTracks().forEach(track => remoteStream.addTrack(track));
      };

      webcamVideo.srcObject = localStream;
      remoteVideo.srcObject = remoteStream;

      callButton.disabled = false;
      answerButton.disabled = false;
      webcamButton.disabled = true;
    } catch (error) {
      console.error('Error accessing media devices:', error);
    }
  };

  // 2. Create an offer
  callButton.onclick = async () => {
    const timestamp = new Date().getTime();
    const callHash = CryptoJS.SHA256(String(timestamp)).toString();

    try {
      const callDoc = firestore.collection('calls').doc(callHash);
      const offerCandidates = callDoc.collection('offerCandidates');
      const answerCandidates = callDoc.collection('answerCandidates');

      callInput.value = callHash;

      // Get ICE candidates for the caller and save to Firestore
      pc.onicecandidate = event => {
        if (event.candidate) {
          offerCandidates.add(event.candidate.toJSON());
        }
      };

      const offerDescription = await pc.createOffer();
      await pc.setLocalDescription(offerDescription);

      const offer = {
        sdp: offerDescription.sdp,
        type: offerDescription.type,
        offerHash: callHash,
      };

      await callDoc.set({ offer });

      // Listen for remote answer
      callDoc.onSnapshot(snapshot => {
        const data = snapshot.data();
        if (!pc.currentRemoteDescription && data?.answer) {
          const answerDescription = new RTCSessionDescription(data.answer);
          pc.setRemoteDescription(answerDescription);
        }
      });

      // When answered, add the answer candidates to the peer connection
      answerCandidates.onSnapshot(snapshot => {
        snapshot.docChanges().forEach(change => {
          if (change.type === 'added') {
            const candidate = new RTCIceCandidate(change.doc.data());
            pc.addIceCandidate(candidate);
          }
        });
      });

      hangupButton.disabled = false;
    } catch (error) {
      console.error('Error creating offer:', error);
    }
  };

  // 3. Answer the call
  answerButton.onclick = async () => {
    const callId = callInput.value;
    try {
      const callDoc = firestore.collection('calls').doc(callId);
      const answerCandidates = callDoc.collection('answerCandidates');
      const offerCandidates = callDoc.collection('offerCandidates');

      // Get ICE candidates for the callee and save to Firestore
      pc.onicecandidate = event => {
        if (event.candidate) {
          answerCandidates.add(event.candidate.toJSON());
        }
      };

      const callData = (await callDoc.get()).data();
      if (callData) {
        const offerDescription = callData.offer;
        await pc.setRemoteDescription(new RTCSessionDescription(offerDescription));

        const answerDescription = await pc.createAnswer();
        await pc.setLocalDescription(answerDescription);

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
              pc.addIceCandidate(candidate);
            }
          });
        });
      }
    } catch (error) {
      console.error('Error answering the call:', error);
    }
  };
}
