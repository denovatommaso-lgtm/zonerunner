"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.monthlyChallengesDocRef = monthlyChallengesDocRef;
exports.loadMonthlyChallengesState = loadMonthlyChallengesState;
exports.saveMonthlyChallengesState = saveMonthlyChallengesState;
exports.subscribeMonthlyChallengesState = subscribeMonthlyChallengesState;
const firestore_1 = require("firebase/firestore");
const firebaseConfig_1 = require("./firebaseConfig");
const perfLogger_1 = require("./perfLogger");
function monthlyChallengesDocRef(userId) {
    // Separate doc to avoid write contention with the main profile doc.
    // Path: users/{uid}/state/monthlyChallenges
    return (0, firestore_1.doc)(firebaseConfig_1.db, 'users', userId, 'state', 'monthlyChallenges');
}
async function loadMonthlyChallengesState(userId) {
    const endPerf = (0, perfLogger_1.perfStart)({
        screen: "MonthlyChallengesStore",
        phase: "DATA",
        label: "loadMonthlyChallengesState",
        meta: { userId },
    });
    const snap = await (0, firestore_1.getDoc)(monthlyChallengesDocRef(userId));
    if (!snap.exists()) {
        endPerf({ count: 0 });
        return null;
    }
    const data = snap.data()?.monthlyChallenges ?? snap.data();
    endPerf({ bytes: (0, perfLogger_1.perfBytes)(data) });
    return data;
}
async function saveMonthlyChallengesState(userId, state) {
    // Store state as the whole document body to keep reads simple.
    await (0, firestore_1.setDoc)(monthlyChallengesDocRef(userId), state, { merge: false });
}
function subscribeMonthlyChallengesState(userId, onValue, onError) {
    return (0, firestore_1.onSnapshot)(monthlyChallengesDocRef(userId), (snap) => {
        if (!snap.exists()) {
            (0, perfLogger_1.perfLog)({
                screen: "MonthlyChallengesStore",
                phase: "DATA",
                label: "monthlyChallenges:snapshot-empty",
                durationMs: 0,
            });
            onValue(null);
            return;
        }
        (0, perfLogger_1.perfLog)({
            screen: "MonthlyChallengesStore",
            phase: "DATA",
            label: "monthlyChallenges:snapshot",
            durationMs: 0,
        });
        onValue(snap.data());
    }, (err) => {
        if (onError)
            onError(err);
        else if (__DEV__)
            console.log('monthlyChallenges snapshot failed', err);
    });
}
