"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadImageAsync = uploadImageAsync;
exports.ensureRemoteUri = ensureRemoteUri;
const react_native_1 = require("react-native");
const storage_1 = require("firebase/storage");
const firebaseConfig_1 = require("./firebaseConfig");
const perfLogger_1 = require("./perfLogger");
// Upload a local image URI to Firebase Storage at the given path.
async function uploadImageAsync(uri, path) {
    const endPerf = (0, perfLogger_1.perfStart)({
        screen: 'StorageService',
        phase: 'DATA',
        label: 'uploadImageAsync',
        meta: { path },
    });
    const resp = await fetch(uri);
    const blob = await resp.blob();
    const storageRef = (0, storage_1.ref)(firebaseConfig_1.storage, path);
    const metadata = { contentType: 'image/jpeg' };
    await (0, storage_1.uploadBytes)(storageRef, blob, metadata);
    const url = await (0, storage_1.getDownloadURL)(storageRef);
    endPerf({ size: blob.size, status: resp.status });
    return url;
}
// If a URI is local (not http), upload it and return the remote URL.
// If upload fails, returns the original URI so the UI can still render.
async function ensureRemoteUri(uri, uid, path, onPersist) {
    const endPerf = (0, perfLogger_1.perfStart)({
        screen: 'StorageService',
        phase: 'DATA',
        label: 'ensureRemoteUri',
        meta: { hasUri: !!uri, hasUid: !!uid },
    });
    if (!uri || !uid) {
        endPerf({ outcome: 'skip' });
        return uri;
    }
    if (uri.startsWith('http')) {
        endPerf({ outcome: 'cached' });
        return uri;
    }
    if (react_native_1.Platform.OS === 'web' && !uri.startsWith('data:')) {
        endPerf({ outcome: 'skip-web-local' });
        return undefined;
    }
    try {
        const stampedPath = path.replace(/(\.[a-zA-Z]+)?$/, `-${Date.now()}$1`);
        const remote = await uploadImageAsync(uri, stampedPath);
        if (onPersist) {
            await onPersist(remote);
        }
        endPerf({ outcome: 'uploaded' });
        return remote;
    }
    catch (e) {
        console.log('Failed to upgrade local image to remote', e?.message ?? e);
        endPerf({ outcome: 'failed' });
        return uri;
    }
}
