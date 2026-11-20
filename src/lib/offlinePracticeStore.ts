
import { supabase } from "./supabaseClient";

// ==========================================
// STUDYROOM - OFFLINE PRACTICE STORAGE
// ==========================================

const DATABASE_NAME = "studyroom-offline-practice";
const DATABASE_VERSION = 1;
const STORE_NAME = "downloads";

// ==========================================
// TYPES
// ==========================================

export type OfflinePracticeKind =
  | "quiz"
  | "flashcard"
  | "quiz-attempt";

export type OfflinePracticeRecord<T> = {
  key: string;
  ownerId: string;
  kind: OfflinePracticeKind;
  itemId: string;
  payload: T;
  savedAt: number;
};

// ==========================================
// GET CURRENT USER ID
// ==========================================

async function currentUserId(): Promise<string> {
  const { data, error } =
    await supabase.auth.getSession();

  if (error) {
    throw new Error(error.message);
  }

  const userId = data.session?.user.id;

  if (!userId) {
    throw new Error(
      "Please sign in while online to access your offline practice materials."
    );
  }

  return userId;
}

// ==========================================
// OPEN INDEXEDDB
// ==========================================

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(
      new Error(
        "IndexedDB is not supported in this browser."
      )
    );
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(
      DATABASE_NAME,
      DATABASE_VERSION
    );

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, {
          keyPath: "key",
        });
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(
        request.error ??
          new Error(
            "Could not open offline practice database."
          )
      );
    };

    request.onblocked = () => {
      reject(
        new Error(
          "Offline database is blocked. Close other StudyRoom tabs and retry."
        )
      );
    };
  });
}

// ==========================================
// GENERATE STORAGE KEY
// ==========================================

function storageKey(
  ownerId: string,
  kind: OfflinePracticeKind,
  itemId: string
): string {
  return `${ownerId}:${kind}:${itemId}`;
}

// ==========================================
// SAVE OFFLINE PRACTICE ITEM
// ==========================================

export async function saveOfflinePractice<
  T extends { id: string }
>(
  kind: OfflinePracticeKind,
  payload: T
): Promise<void> {
  if (
    !payload ||
    typeof payload.id !== "string" ||
    !payload.id.trim()
  ) {
    throw new Error(
      "Invalid offline practice item."
    );
  }

  const ownerId = await currentUserId();

  const record: OfflinePracticeRecord<T> = {
    key: storageKey(
      ownerId,
      kind,
      payload.id
    ),
    ownerId,
    kind,
    itemId: payload.id,
    payload,
    savedAt: Date.now(),
  };

  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(
      STORE_NAME,
      "readwrite"
    );

    transaction
      .objectStore(STORE_NAME)
      .put(record);

    transaction.oncomplete = () => {
      db.close();
      resolve();
    };

    transaction.onerror = () => {
      db.close();

      reject(
        transaction.error ??
          new Error(
            "Could not save offline practice item."
          )
      );
    };

    transaction.onabort = () => {
      db.close();

      reject(
        transaction.error ??
          new Error(
            "Offline save was cancelled."
          )
      );
    };
  });
}

// ==========================================
// GET ONE OFFLINE PRACTICE ITEM
// ==========================================

export async function getOfflinePractice<T>(
  kind: OfflinePracticeKind,
  id: string
): Promise<T | null> {
  const ownerId = await currentUserId();

  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(
      STORE_NAME,
      "readonly"
    );

    const request = transaction
      .objectStore(STORE_NAME)
      .get(
        storageKey(ownerId, kind, id)
      );

    request.onsuccess = () => {
      const result = request.result as
        | OfflinePracticeRecord<T>
        | undefined;

      resolve(
        result?.payload ?? null
      );
    };

    request.onerror = () => {
      reject(
        request.error ??
          new Error(
            "Could not read offline practice item."
          )
      );
    };

    transaction.oncomplete = () => {
      db.close();
    };

    transaction.onabort = () => {
      db.close();
    };
  });
}

// ==========================================
// LIST OFFLINE PRACTICE ITEMS
// ==========================================

export async function listOfflinePractice<T>(
  kind: OfflinePracticeKind
): Promise<OfflinePracticeRecord<T>[]> {
  const ownerId = await currentUserId();

  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(
      STORE_NAME,
      "readonly"
    );

    const request = transaction
      .objectStore(STORE_NAME)
      .getAll();

    request.onsuccess = () => {
      const records =
        request.result as OfflinePracticeRecord<T>[];

      const filtered = records
        .filter(
          (record) =>
            record.ownerId === ownerId &&
            record.kind === kind
        )
        .sort(
          (a, b) =>
            b.savedAt - a.savedAt
        );

      resolve(filtered);
    };

    request.onerror = () => {
      reject(
        request.error ??
          new Error(
            "Could not list offline practice items."
          )
      );
    };

    transaction.oncomplete = () => {
      db.close();
    };

    transaction.onabort = () => {
      db.close();
    };
  });
}

// ==========================================
// REMOVE OFFLINE PRACTICE ITEM
// ==========================================

export async function removeOfflinePractice(
  kind: OfflinePracticeKind,
  id: string
): Promise<void> {
  const ownerId = await currentUserId();

  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(
      STORE_NAME,
      "readwrite"
    );

    transaction
      .objectStore(STORE_NAME)
      .delete(
        storageKey(ownerId, kind, id)
      );

    transaction.oncomplete = () => {
      db.close();
      resolve();
    };

    transaction.onerror = () => {
      db.close();

      reject(
        transaction.error ??
          new Error(
            "Could not remove offline practice item."
          )
      );
    };

    transaction.onabort = () => {
      db.close();

      reject(
        transaction.error ??
          new Error(
            "Offline removal was cancelled."
          )
      );
    };
  });
}
