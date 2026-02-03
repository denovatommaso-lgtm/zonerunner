import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { storage } from './firebaseConfig';
import { perfStart } from './perfLogger';

// Upload a local image URI to Firebase Storage at the given path.
export async function uploadImageAsync(uri: string, path: string): Promise<string> {
  const endPerf = perfStart({
    screen: 'StorageService',
    phase: 'DATA',
    label: 'uploadImageAsync',
    meta: { path },
  });
  const resp = await fetch(uri);
  const blob = await resp.blob();
  const storageRef = ref(storage, path);
  const metadata = { contentType: 'image/jpeg' };
  await uploadBytes(storageRef, blob, metadata);
  const url = await getDownloadURL(storageRef);
  endPerf({ size: blob.size, status: resp.status });
  return url;
}

// If a URI is local (not http), upload it and return the remote URL.
// If upload fails, returns the original URI so the UI can still render.
export async function ensureRemoteUri(
  uri: string | undefined,
  uid: string | undefined,
  path: string,
  onPersist?: (remoteUrl: string) => Promise<void>
): Promise<string | undefined> {
  const endPerf = perfStart({
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
  try {
    const stampedPath = path.replace(/(\.[a-zA-Z]+)?$/, `-${Date.now()}$1`);
    const remote = await uploadImageAsync(uri, stampedPath);
    if (onPersist) {
      await onPersist(remote);
    }
    endPerf({ outcome: 'uploaded' });
    return remote;
  } catch (e) {
    console.log('Failed to upgrade local image to remote', (e as any)?.message ?? e);
    endPerf({ outcome: 'failed' });
    return uri;
  }
}
