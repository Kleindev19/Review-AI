
import type {
  SavedReviewerVisual,
} from "./reviewerVisualReader";

// ==========================================
// STUDYROOM - OFFLINE REVIEWER STORAGE
// ==========================================

const DB_NAME = "studyroom-offline";
const DB_VERSION = 1;
const STORE_NAME = "reviewers";

const MAX_OFFLINE_IMAGE_BYTES =
  30 * 1024 * 1024;

// ==========================================
// TYPES
// ==========================================

export type OfflineReviewerData = {
  id: string;
  title: string;
  subject: string | null;
  content: string;
  source_type: string;
  source_label: string | null;
  is_ai_generated: boolean;
  created_date: string;
  updated_date: string;
};

type OfflineStoredVisual = {
  metadata: Omit<SavedReviewerVisual, "url">;
  blob: Blob;
};

export type OfflineReviewerRecord = {
  id: string;
  reviewer: OfflineReviewerData;
  savedAt: number;
  visuals: OfflineStoredVisual[];
};

// ==========================================
// OPEN INDEXEDDB
// ==========================================

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(
      new Error(
        "Offline storage is not available in this browser."
      )
    );
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(
      DB_NAME,
      DB_VERSION
    );

    request.onupgradeneeded = () => {
      const db = request.result;

      if (
        !db.objectStoreNames.contains(
          STORE_NAME
        )
      ) {
        db.createObjectStore(STORE_NAME, {
          keyPath: "id",
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
            "Could not open offline reviewer database."
          )
      );
    };

    request.onblocked = () => {
      reject(
        new Error(
          "Offline reviewer database is blocked. Close other StudyRoom tabs and retry."
        )
      );
    };
  });
}

// ==========================================
// GET ONE OFFLINE REVIEWER
// ==========================================

export async function getOfflineReviewer(
  id: string
): Promise<OfflineReviewerRecord | null> {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(
      STORE_NAME,
      "readonly"
    );

    const request = transaction
      .objectStore(STORE_NAME)
      .get(id);

    request.onsuccess = () => {
      resolve(
        (request.result as
          | OfflineReviewerRecord
          | undefined) ?? null
      );
    };

    request.onerror = () => {
      reject(
        request.error ??
          new Error(
            "Could not load offline reviewer."
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
// GET ALL OFFLINE REVIEWERS
// ==========================================

export async function getAllOfflineReviewers(): Promise<
  OfflineReviewerRecord[]
> {
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
        request.result as OfflineReviewerRecord[];

      resolve(
        records.sort(
          (a, b) =>
            b.savedAt - a.savedAt
        )
      );
    };

    request.onerror = () => {
      reject(
        request.error ??
          new Error(
            "Could not load offline reviewer library."
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
// SAVE RECORD TO INDEXEDDB
// ==========================================

async function writeRecord(
  record: OfflineReviewerRecord
): Promise<void> {
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
            "Could not save offline reviewer."
          )
      );
    };

    transaction.onabort = () => {
      db.close();

      reject(
        transaction.error ??
          new Error(
            "Offline reviewer save was cancelled."
          )
      );
    };
  });
}

// ==========================================
// SAVE REVIEWER FOR OFFLINE READING
// ==========================================

export async function saveReviewerForOffline(
  reviewer: OfflineReviewerData,
  visuals: SavedReviewerVisual[]
): Promise<void> {
  if (
    !reviewer ||
    typeof reviewer.id !== "string" ||
    !reviewer.id.trim()
  ) {
    throw new Error(
      "Invalid reviewer information."
    );
  }

  if (!Array.isArray(visuals)) {
    throw new Error(
      "Invalid reviewer diagrams."
    );
  }

  const storedVisuals: OfflineStoredVisual[] = [];

  let totalBytes = 0;

  const sortedVisuals = [...visuals].sort(
    (a, b) =>
      a.pageNumber - b.pageNumber
  );

  // Download actual image data.
  // Supabase signed URLs can expire.

  for (const visual of sortedVisuals) {
    const { url, ...metadata } = visual;

    const response = await fetch(url, {
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(
        `Could not download diagram on page ${visual.pageNumber}.`
      );
    }

    const blob = await response.blob();

    if (!blob.type.startsWith("image/")) {
      throw new Error(
        `Page ${visual.pageNumber} did not return an image.`
      );
    }

    totalBytes += blob.size;

    if (totalBytes > MAX_OFFLINE_IMAGE_BYTES) {
      throw new Error(
        "Downloaded diagrams exceed the 30 MB offline limit."
      );
    }

    storedVisuals.push({
      metadata,
      blob,
    });
  }

  await writeRecord({
    id: reviewer.id,
    reviewer,
    savedAt: Date.now(),
    visuals: storedVisuals,
  });
}

// ==========================================
// DELETE OFFLINE REVIEWER
// ==========================================

export async function deleteOfflineReviewer(
  id: string
): Promise<void> {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(
      STORE_NAME,
      "readwrite"
    );

    transaction
      .objectStore(STORE_NAME)
      .delete(id);

    transaction.oncomplete = () => {
      db.close();
      resolve();
    };

    transaction.onerror = () => {
      db.close();

      reject(
        transaction.error ??
          new Error(
            "Could not delete offline reviewer."
          )
      );
    };

    transaction.onabort = () => {
      db.close();

      reject(
        transaction.error ??
          new Error(
            "Offline reviewer deletion was cancelled."
          )
      );
    };
  });
}

// ==========================================
// CREATE TEMPORARY LOCAL IMAGE URLS
// ==========================================

export function createOfflineVisualUrls(
  record: OfflineReviewerRecord
): {
  visuals: SavedReviewerVisual[];
  revoke: () => void;
} {
  const urls: string[] = [];

  const visuals = record.visuals.map(
    ({ metadata, blob }) => {
      const url = URL.createObjectURL(
        blob
      );

      urls.push(url);

      return {
        ...metadata,
        url,
      } as SavedReviewerVisual;
    }
  );

  return {
    visuals,

    revoke: () => {
      urls.forEach((url) => {
        URL.revokeObjectURL(url);
      });
    },
  };
}
