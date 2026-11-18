export type StoredMaterial = {
  id: string;
  title: string;
  file_name: string;
  file_type: string;
  size_bytes: number;
  extracted_text: string;
  created_date: string;
  original_file: Blob;
};

const DB_NAME = "studyroom-local";
const STORE_NAME = "materials";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) {
      reject(new Error("IndexedDB is not supported."));
      return;
    }

    const request = indexedDB.open(DB_NAME, 1);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, {
          keyPath: "id",
        });
      }
    };

    request.onsuccess = () => resolve(request.result);

    request.onerror = () =>
      reject(
        request.error ?? new Error("Could not open database.")
      );
  });
}

async function runRequest<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  const db = await openDatabase();

  return new Promise<T>((resolve, reject) => {
    let result!: T;

    try {
      const transaction = db.transaction(
        STORE_NAME,
        mode
      );

      const store = transaction.objectStore(STORE_NAME);
      const request = operation(store);

      request.onsuccess = () => {
        result = request.result;
      };

      transaction.oncomplete = () => {
        db.close();
        resolve(result);
      };

      transaction.onerror = () => {
        const error =
          transaction.error ??
          new Error("Database operation failed.");

        db.close();
        reject(error);
      };

      transaction.onabort = () => {
        const error =
          transaction.error ??
          new Error("Database operation was cancelled.");

        db.close();
        reject(error);
      };
    } catch (error) {
      db.close();
      reject(error);
    }
  });
}

export async function saveMaterial(
  file: File,
  extractedText: string
): Promise<StoredMaterial> {
  const material: StoredMaterial = {
    id: crypto.randomUUID(),
    title: file.name.replace(/\.[^.]+$/, ""),
    file_name: file.name,
    file_type:
      file.name.split(".").pop()?.toLowerCase() ?? "",
    size_bytes: file.size,
    extracted_text: extractedText,
    created_date: new Date().toISOString(),
    original_file: file,
  };

  await runRequest<IDBValidKey>(
    "readwrite",
    (store) => store.put(material)
  );

  return material;
}

export async function listMaterials(): Promise<
  StoredMaterial[]
> {
  const materials = await runRequest<StoredMaterial[]>(
    "readonly",
    (store) => store.getAll()
  );

  return materials.sort(
    (a, b) =>
      new Date(b.created_date).getTime() -
      new Date(a.created_date).getTime()
  );
}

export async function getMaterial(
  id: string
): Promise<StoredMaterial | undefined> {
  return runRequest<StoredMaterial | undefined>(
    "readonly",
    (store) => store.get(id)
  );
}

export async function deleteMaterial(
  id: string
): Promise<void> {
  await runRequest<undefined>(
    "readwrite",
    (store) => store.delete(id)
  );
}


export async function cacheMaterialLocally(
  material: StoredMaterial
): Promise<void> {
  await runRequest<IDBValidKey>(
    "readwrite",
    (store) => store.put(material)
  );
}
