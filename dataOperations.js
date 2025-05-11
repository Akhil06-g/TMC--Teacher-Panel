import { getDatabase, ref, set, push, remove, onValue } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-database.js";
import * as Auth from "./auth.js";

const database = getDatabase(Auth.app);

export async function saveData(path, data) {
    const newRef = push(ref(database, path));
    await set(newRef, data);
    return newRef.key;
}

export async function updateData(path, data) {
    await set(ref(database, path), data);
}

export async function deleteData(path) {
    await remove(ref(database, path));
}

export function listenToData(path, callback) {
    onValue(ref(database, path), (snapshot) => {
        const data = snapshot.val();
        callback(data ? Object.entries(data).map(([key, value]) => ({ ...value, id: key })) : []);
    });
}
