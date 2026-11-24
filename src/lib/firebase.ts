import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDoc,
  getDocFromServer,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  limit,
  onSnapshot,
  serverTimestamp,
  increment,
  Unsubscribe,
  Timestamp,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import {
  AgentArtifactRecord,
  AgentCategory,
  ChatMessage,
  ChatModelId,
  ChatSession,
  ImageAspectRatio,
  ImageCreationRecord,
  ImageModelId,
  ImageSizeOption,
  MapsLinkItem,
  UserProfile,
} from '../types';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
testConnection();

export function sanitizeId(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
  return cleaned || `id_${Date.now()}`;
}

export function createClientId(prefix: string): string {
  const rand =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/[^a-zA-Z0-9_-]/g, '')
      : `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  return sanitizeId(`${prefix}_${rand}`);
}

export async function signInWithGoogle(): Promise<User> {
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

export async function signOutUser(): Promise<void> {
  await signOut(auth);
}

export function observeAuth(callback: (user: User | null) => void): Unsubscribe {
  return onAuthStateChanged(auth, callback);
}

const VALID_CHAT_MODELS: ChatModelId[] = [
  'gemini-4-hydrogen',
  'gemini-4-carbon',
  'gemini-4-neon',
  'gemini-3.1-flash-lite',
];

function safeChatModel(model: string): ChatModelId {
  return VALID_CHAT_MODELS.includes(model as ChatModelId)
    ? (model as ChatModelId)
    : 'gemini-4-hydrogen';
}

function toMillis(ts: unknown): number {
  if (ts instanceof Timestamp) return ts.toMillis();
  if (ts && typeof (ts as { toMillis?: () => number }).toMillis === 'function') {
    return (ts as { toMillis: () => number }).toMillis();
  }
  return Date.now();
}

export async function ensureUserProfile(
  user: User,
  defaultTheme: 'light' | 'dark'
): Promise<UserProfile> {
  const uid = sanitizeId(user.uid);
  const userPath = `users/${uid}`;
  const ref = doc(db, 'users', uid);

  try {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const data = snap.data();
      return {
        uid,
        displayName: String(data.displayName || user.displayName || 'User').slice(0, 100),
        photoURL: typeof data.photoURL === 'string' ? data.photoURL.slice(0, 500) : '',
        preferredModel: safeChatModel(String(data.preferredModel || 'gemini-4-hydrogen')),
        theme: data.theme === 'dark' ? 'dark' : 'light',
      };
    }

    const displayName = (user.displayName || user.email?.split('@')[0] || 'After AI User').slice(
      0,
      100
    );
    const photoURL = (user.photoURL || '').slice(0, 500);
    const payload = {
      uid,
      displayName,
      photoURL,
      preferredModel: 'gemini-4-hydrogen' as ChatModelId,
      theme: defaultTheme,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    await setDoc(ref, payload);
    return {
      uid,
      displayName,
      photoURL,
      preferredModel: 'gemini-4-hydrogen',
      theme: defaultTheme,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, userPath);
  }
}

export async function updateUserPreferences(
  uid: string,
  updates: { preferredModel?: ChatModelId; theme?: 'light' | 'dark' }
): Promise<void> {
  const safeUid = sanitizeId(uid);
  const userPath = `users/${safeUid}`;
  try {
    const payload: Record<string, unknown> = { updatedAt: serverTimestamp() };
    if (updates.preferredModel) payload.preferredModel = safeChatModel(updates.preferredModel);
    if (updates.theme) payload.theme = updates.theme === 'dark' ? 'dark' : 'light';
    await updateDoc(doc(db, 'users', safeUid), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, userPath);
  }
}

export function subscribeToChats(
  uid: string,
  onData: (chats: ChatSession[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const safeUid = sanitizeId(uid);
  const path = `users/${safeUid}/chats`;
  const q = query(
    collection(db, 'users', safeUid, 'chats'),
    where('userId', '==', safeUid),
    limit(50)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const list: ChatSession[] = snapshot.docs
        .map((d) => {
          const data = d.data();
          return {
            id: d.id,
            userId: String(data.userId || safeUid),
            title: String(data.title || 'New conversation'),
            model: safeChatModel(String(data.model || 'gemini-4-hydrogen')),
            systemInstruction: String(data.systemInstruction || ''),
            messageCount: Number(data.messageCount || 0),
            createdAtMs: toMillis(data.createdAt),
            updatedAtMs: toMillis(data.updatedAt),
          };
        })
        .sort((a, b) => b.updatedAtMs - a.updatedAtMs);
      onData(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (e) {
        if (onError && e instanceof Error) onError(e);
      }
    }
  );
}

export async function createChatSession(
  uid: string,
  chatId: string,
  title: string,
  model: ChatModelId,
  systemInstruction: string
): Promise<void> {
  const safeUid = sanitizeId(uid);
  const safeChatId = sanitizeId(chatId);
  const path = `users/${safeUid}/chats/${safeChatId}`;
  try {
    await setDoc(doc(db, 'users', safeUid, 'chats', safeChatId), {
      id: safeChatId,
      userId: safeUid,
      title: (title.trim() || 'New conversation').slice(0, 120),
      model: safeChatModel(model),
      systemInstruction: systemInstruction.slice(0, 2000),
      messageCount: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateChatSession(
  uid: string,
  chatId: string,
  updates: {
    title?: string;
    model?: ChatModelId;
    systemInstruction?: string;
    incrementMessages?: number;
  }
): Promise<void> {
  const safeUid = sanitizeId(uid);
  const safeChatId = sanitizeId(chatId);
  const path = `users/${safeUid}/chats/${safeChatId}`;
  try {
    const payload: Record<string, unknown> = {
      updatedAt: serverTimestamp(),
    };
    if (typeof updates.title === 'string') {
      payload.title = (updates.title.trim() || 'New conversation').slice(0, 120);
    }
    if (updates.model) {
      payload.model = safeChatModel(updates.model);
    }
    if (typeof updates.systemInstruction === 'string') {
      payload.systemInstruction = updates.systemInstruction.slice(0, 2000);
    }
    if (typeof updates.incrementMessages === 'number' && updates.incrementMessages > 0) {
      payload.messageCount = increment(updates.incrementMessages);
    }
    await updateDoc(doc(db, 'users', safeUid, 'chats', safeChatId), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteChatSession(uid: string, chatId: string): Promise<void> {
  const safeUid = sanitizeId(uid);
  const safeChatId = sanitizeId(chatId);
  const path = `users/${safeUid}/chats/${safeChatId}`;
  try {
    await deleteDoc(doc(db, 'users', safeUid, 'chats', safeChatId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export function subscribeToMessages(
  uid: string,
  chatId: string,
  onData: (messages: ChatMessage[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const safeUid = sanitizeId(uid);
  const safeChatId = sanitizeId(chatId);
  const path = `users/${safeUid}/chats/${safeChatId}/messages`;
  const q = query(
    collection(db, 'users', safeUid, 'chats', safeChatId, 'messages'),
    where('userId', '==', safeUid),
    limit(200)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const list: ChatMessage[] = snapshot.docs
        .map((d) => {
          const data = d.data();
          return {
            id: d.id,
            userId: String(data.userId || safeUid),
            chatId: String(data.chatId || safeChatId),
            role: data.role === 'assistant' ? ('assistant' as const) : ('user' as const),
            content: String(data.content || ''),
            model: String(data.model || 'gemini-4-hydrogen'),
            thinkingUsed: Boolean(data.thinkingUsed),
            mapsLinks: Array.isArray(data.mapsLinks)
              ? (data.mapsLinks as MapsLinkItem[])
              : undefined,
            attachmentLabel:
              typeof data.attachmentLabel === 'string' ? data.attachmentLabel : undefined,
            createdAtMs: toMillis(data.createdAt),
          };
        })
        .sort((a, b) => a.createdAtMs - b.createdAtMs);
      onData(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (e) {
        if (onError && e instanceof Error) onError(e);
      }
    }
  );
}

export async function saveChatMessage(
  uid: string,
  chatId: string,
  msg: {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    model: string;
    thinkingUsed: boolean;
    mapsLinks?: MapsLinkItem[];
    attachmentLabel?: string;
  }
): Promise<void> {
  const safeUid = sanitizeId(uid);
  const safeChatId = sanitizeId(chatId);
  const safeMsgId = sanitizeId(msg.id);
  const path = `users/${safeUid}/chats/${safeChatId}/messages/${safeMsgId}`;

  try {
    const payload: Record<string, unknown> = {
      id: safeMsgId,
      userId: safeUid,
      chatId: safeChatId,
      role: msg.role === 'assistant' ? 'assistant' : 'user',
      content: (msg.content || ' ').slice(0, 60000),
      model: msg.model.slice(0, 64),
      thinkingUsed: Boolean(msg.thinkingUsed),
      createdAt: serverTimestamp(),
    };

    if (msg.mapsLinks && msg.mapsLinks.length > 0) {
      payload.mapsLinks = msg.mapsLinks.slice(0, 10).map((link) => ({
        title: String(link.title || 'Google Maps').slice(0, 200),
        uri: String(link.uri || '').slice(0, 600),
      }));
    }

    if (msg.attachmentLabel && msg.attachmentLabel.trim().length > 0) {
      payload.attachmentLabel = msg.attachmentLabel.trim().slice(0, 200);
    }

    await setDoc(
      doc(db, 'users', safeUid, 'chats', safeChatId, 'messages', safeMsgId),
      payload
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export function subscribeToCreations(
  uid: string,
  onData: (items: ImageCreationRecord[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const safeUid = sanitizeId(uid);
  const path = `users/${safeUid}/creations`;
  const q = query(
    collection(db, 'users', safeUid, 'creations'),
    where('userId', '==', safeUid),
    limit(30)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const list: ImageCreationRecord[] = snapshot.docs
        .map((d) => {
          const data = d.data();
          return {
            id: d.id,
            userId: String(data.userId || safeUid),
            prompt: String(data.prompt || ''),
            model: data.model as ImageModelId,
            aspectRatio: (data.aspectRatio || '1:1') as ImageAspectRatio,
            imageSize: (data.imageSize || '1K') as ImageSizeOption,
            mode: data.mode === 'edit' ? ('edit' as const) : ('generate' as const),
            createdAtMs: toMillis(data.createdAt),
          };
        })
        .sort((a, b) => b.createdAtMs - a.createdAtMs);
      onData(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (e) {
        if (onError && e instanceof Error) onError(e);
      }
    }
  );
}

export async function saveImageCreation(
  uid: string,
  item: {
    id: string;
    prompt: string;
    model: ImageModelId;
    aspectRatio: ImageAspectRatio;
    imageSize: ImageSizeOption;
    mode: 'generate' | 'edit';
  }
): Promise<void> {
  const safeUid = sanitizeId(uid);
  const safeCreationId = sanitizeId(item.id);
  const path = `users/${safeUid}/creations/${safeCreationId}`;
  try {
    await setDoc(doc(db, 'users', safeUid, 'creations', safeCreationId), {
      id: safeCreationId,
      userId: safeUid,
      prompt: item.prompt.trim().slice(0, 2000),
      model: item.model,
      aspectRatio: item.aspectRatio,
      imageSize: item.imageSize,
      mode: item.mode,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

function safeAgentCategory(cat: unknown): AgentCategory {
  return cat === 'app' || cat === 'website' ? cat : 'auto';
}

export function subscribeToArtifacts(
  uid: string,
  onData: (items: AgentArtifactRecord[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const safeUid = sanitizeId(uid);
  const path = `users/${safeUid}/artifacts`;
  const q = query(
    collection(db, 'users', safeUid, 'artifacts'),
    where('userId', '==', safeUid),
    limit(25)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const list: AgentArtifactRecord[] = snapshot.docs
        .map((d) => {
          const data = d.data();
          return {
            id: d.id,
            userId: String(data.userId || safeUid),
            title: String(data.title || 'After AI Build'),
            category: safeAgentCategory(data.category),
            prompt: String(data.prompt || ''),
            summary: String(data.summary || ''),
            html: String(data.html || ''),
            model: String(data.model || 'gemini-4-hydrogen'),
            createdAtMs: toMillis(data.createdAt),
            updatedAtMs: toMillis(data.updatedAt),
          };
        })
        .sort((a, b) => b.updatedAtMs - a.updatedAtMs);
      onData(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (e) {
        if (onError && e instanceof Error) onError(e);
      }
    }
  );
}

export async function saveAgentArtifact(
  uid: string,
  item: {
    id: string;
    title: string;
    category: AgentCategory;
    prompt: string;
    summary: string;
    html: string;
    model: string;
    isUpdate?: boolean;
  }
): Promise<void> {
  const safeUid = sanitizeId(uid);
  const safeId = sanitizeId(item.id);
  const path = `users/${safeUid}/artifacts/${safeId}`;
  const ref = doc(db, 'users', safeUid, 'artifacts', safeId);

  try {
    const cleanTitle = (item.title.trim() || 'After AI Build').slice(0, 120);
    const cleanCategory = safeAgentCategory(item.category);
    const cleanPrompt = (item.prompt.trim() || 'Build interactive artifact').slice(0, 2000);
    const cleanSummary = item.summary.trim().slice(0, 8000);
    const cleanHtml = item.html.slice(0, 250000);
    const cleanModel = (item.model.trim() || 'gemini-4-hydrogen').slice(0, 64);

    if (item.isUpdate) {
      await updateDoc(ref, {
        title: cleanTitle,
        category: cleanCategory,
        prompt: cleanPrompt,
        summary: cleanSummary,
        html: cleanHtml,
        model: cleanModel,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(ref, {
        id: safeId,
        userId: safeUid,
        title: cleanTitle,
        category: cleanCategory,
        prompt: cleanPrompt,
        summary: cleanSummary,
        html: cleanHtml,
        model: cleanModel,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(
      error,
      item.isUpdate ? OperationType.UPDATE : OperationType.CREATE,
      path
    );
  }
}

export async function deleteAgentArtifact(uid: string, artifactId: string): Promise<void> {
  const safeUid = sanitizeId(uid);
  const safeId = sanitizeId(artifactId);
  const path = `users/${safeUid}/artifacts/${safeId}`;
  try {
    await deleteDoc(doc(db, 'users', safeUid, 'artifacts', safeId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}
