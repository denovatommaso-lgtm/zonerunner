"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.yearlyChallengesDocRef = yearlyChallengesDocRef;
exports.loadYearlyChallengesState = loadYearlyChallengesState;
exports.saveYearlyChallengesState = saveYearlyChallengesState;
exports.subscribeYearlyChallengesState = subscribeYearlyChallengesState;
const firestore_1 = require("firebase/firestore");
const firebaseConfig_1 = require("./firebaseConfig");
const perfLogger_1 = require("./perfLogger");
function yearlyChallengesDocRef(userId) {
    return (0, firestore_1.doc)(firebaseConfig_1.db, 'users', userId, 'state', 'yearlyChallenges');
}
async function loadYearlyChallengesState(userId) {
    const endPerf = (0, perfLogger_1.perfStart)({
        screen: "YearlyChallengesStore",
        phase: "DATA",
        label: "loadYearlyChallengesState",
        meta: { userId },
    });
    const snap = await (0, firestore_1.getDoc)(yearlyChallengesDocRef(userId));
    if (!snap.exists()) {
        endPerf({ count: 0 });
        return null;
    }
    const data = snap.data();
    endPerf({ bytes: (0, perfLogger_1.perfBytes)(data) });
    return data;
}
async function saveYearlyChallengesState(userId, state) {
    await (0, firestore_1.setDoc)(yearlyChallengesDocRef(userId), state, { merge: false });
}
function subscribeYearlyChallengesState(userId, onValue, onError) {
    return (0, firestore_1.onSnapshot)(yearlyChallengesDocRef(userId), (snap) => {
        if (!snap.exists()) {
            (0, perfLogger_1.perfLog)({
                screen: "YearlyChallengesStore",
                phase: "DATA",
                label: "yearlyChallenges:snapshot-empty",
                durationMs: 0,
            });
            onValue(null);
            return;
        }
        (0, perfLogger_1.perfLog)({
            screen: "YearlyChallengesStore",
            phase: "DATA",
            label: "yearlyChallenges:snapshot",
            durationMs: 0,
        });
        onValue(snap.data());
    }, (err) => {
        if (onError)
            onError(err);
        else if (__DEV__)
            console.log('yearlyChallenges snapshot failed', err);
    });
}
