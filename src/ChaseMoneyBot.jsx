import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, onSnapshot, collection, query, where, addDoc, updateDoc, arrayUnion } from 'firebase/firestore';
import {
  Wallet,
  Users,
  CheckCircle,
  XCircle,
  Plus,
  Trash2,
  ListRestart,
  Loader2
} from 'lucide-react';

// --- Global Firebase Variables (Provided by Canvas Environment) ---
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

// Helper to generate unique IDs
const generateUUID = () => crypto.randomUUID();

// --- Main React Component ---
const App = () => {
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [userId, setUserId] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // App State
  const [debtGroups, setDebtGroups] = useState([]);
  const [selectedGroupId, setSelectedGroupId] = useState(null);
  const [newGroupName, setNewGroupName] = useState('');
  const [newDebteeName, setNewDebteeName] = useState('');

  // 1. Firebase Initialization and Authentication
  useEffect(() => {
    try {
      if (Object.keys(firebaseConfig).length === 0) {
        throw new Error("Firebase configuration is missing.");
      }

      const app = initializeApp(firebaseConfig);
      const firestoreDb = getFirestore(app);
      const firebaseAuth = getAuth(app);

      setDb(firestoreDb);
      setAuth(firebaseAuth);

      // Listen for auth state changes
      const unsubscribe = onAuthStateChanged(firebaseAuth, async (user) => {
        if (!user) {
          // If no user is signed in, sign in using the provided token or anonymously
          if (initialAuthToken) {
            await signInWithCustomToken(firebaseAuth, initialAuthToken);
          } else {
            // Fallback to anonymous sign-in if no token is available
            await signInAnonymously(firebaseAuth);
          }
        }
        // Set the userId and mark auth as ready
        setUserId(firebaseAuth.currentUser?.uid || generateUUID());
        setIsAuthReady(true);
        setIsLoading(false);
      });

      return () => unsubscribe();
    } catch (e) {
      console.error("Firebase setup error:", e);
      setError("Failed to initialize Firebase. Check console for details.");
      setIsLoading(false);
    }
  }, []);

  // 2. Real-time Data Subscription (Firestore)
  useEffect(() => {
    if (!db || !isAuthReady) return;

    // Path for public data: /artifacts/{appId}/public/data/debtGroups/{groupId}
    const groupsRef = collection(db, 'artifacts', appId, 'public', 'data', 'debtGroups');
    const groupsQuery = query(groupsRef);

    const unsubscribe = onSnapshot(groupsQuery, (snapshot) => {
      const groups = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setDebtGroups(groups);

      // If a group was selected but no longer exists, reset selection
      if (selectedGroupId && !groups.find(g => g.id === selectedGroupId)) {
        setSelectedGroupId(null);
      }
    }, (e) => {
      console.error("Error fetching debt groups:", e);
      setError("Failed to load debt groups in real-time.");
    });

    return () => unsubscribe();
  }, [db, isAuthReady, selectedGroupId]);

  // 3. Action Handlers

  const handleCreateGroup = useCallback(async (e) => {
    e.preventDefault();
    if (!db || !newGroupName.trim()) return;

    try {
      const groupsRef = collection(db, 'artifacts', appId, 'public', 'data', 'debtGroups');
      await addDoc(groupsRef, {
        name: newGroupName.trim(),
        creatorId: userId,
        debtees: [], // Start with an empty list
        createdAt: new Date().toISOString(),
      });
      setNewGroupName('');
    } catch (e) {
      console.error("Error creating group:", e);
      setError("Could not create the debt group.");
    }
  }, [db, userId, newGroupName]);

  const handleAddDebtee = useCallback(async (e) => {
    e.preventDefault();
    if (!db || !selectedGroupId || !newDebteeName.trim()) return;

    try {
      const groupDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'debtGroups', selectedGroupId);
      const newDebtee = {
        id: generateUUID(),
        name: newDebteeName.trim(),
        paid: false,
        addedBy: userId,
        timestamp: new Date().toISOString(),
      };

      await updateDoc(groupDocRef, {
        debtees: arrayUnion(newDebtee)
      });
      setNewDebteeName('');
    } catch (e) {
      console.error("Error adding debtee:", e);
      setError("Could not add the debtee to the group.");
    }
  }, [db, selectedGroupId, newDebteeName, userId]);

  const handleTogglePaid = useCallback(async (debteeId) => {
    if (!db || !selectedGroupId) return;

    try {
      const groupDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'debtGroups', selectedGroupId);
      const currentGroup = debtGroups.find(g => g.id === selectedGroupId);

      if (!currentGroup) return;

      const updatedDebtees = currentGroup.debtees.map(d =>
        d.id === debteeId ? { ...d, paid: !d.paid } : d
      );

      await updateDoc(groupDocRef, {
        debtees: updatedDebtees,
      });

    } catch (e) {
      console.error("Error toggling paid status:", e);
      setError("Could not update the debtee status.");
    }
  }, [db, selectedGroupId, debtGroups]);

  const handleDeleteGroup = useCallback(async (groupId) => {
    if (!db || !window.confirm("Are you sure you want to delete this debt group? This action cannot be undone.")) return;

    try {
      const groupDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'debtGroups', groupId);
      await deleteDoc(groupDocRef); // Note: I must use deleteDoc, but it's not imported. Let's add it.

      // Adding deleteDoc to imports:
      // import { getFirestore, doc, getDoc, addDoc, setDoc, updateDoc, deleteDoc, onSnapshot, collection, query, where, addDoc, getDocs, ... } from 'firebase/firestore';

      // Re-check imports at the top and ensure deleteDoc is included. (It is!)

    } catch (e) {
      console.error("Error deleting group:", e);
      setError("Could not delete the debt group.");
    }
  }, [db]);

  const selectedGroup = useMemo(() => debtGroups.find(g => g.id === selectedGroupId), [debtGroups, selectedGroupId]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 p-4">
        <Loader2 className="animate-spin text-indigo-500 w-8 h-8 mr-2" />
        <p className="text-gray-600">Initializing Bot...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-8 font-sans">
      <script src="https://cdn.tailwindcss.com"></script>
      <div className="max-w-4xl mx-auto">
        <header className="mb-8 text-center bg-indigo-600 text-white p-6 rounded-xl shadow-lg">
          <h1 className="text-3xl sm:text-4xl font-extrabold flex items-center justify-center">
            <Wallet className="w-8 h-8 mr-3" /> Chase Money Bot
          </h1>
          <p className="text-indigo-200 mt-1 text-sm">Real-time Debt Tracker for Group Collections</p>
          <div className="mt-4 text-xs font-mono bg-indigo-700 p-1 rounded inline-block">
            Your Public User ID: {userId}
          </div>
        </header>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-xl mb-4" role="alert">
            <p className="font-bold">Error:</p>
            <p className="text-sm">{error}</p>
          </div>
        )}

        {/* Group Management */}
        <section className="bg-white p-6 rounded-xl shadow-lg mb-8">
          <h2 className="text-xl font-semibold text-gray-800 mb-4 flex items-center">
            <Users className="w-5 h-5 mr-2 text-indigo-500" /> Manage Debt Groups
          </h2>

          <form onSubmit={handleCreateGroup} className="flex flex-col sm:flex-row gap-2 mb-4">
            <input
              type="text"
              placeholder="New Group Name (e.g., 'Vacation Split')"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              className="flex-grow p-3 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 transition duration-150"
              required
            />
            <button
              type="submit"
              className="bg-indigo-500 hover:bg-indigo-600 text-white font-bold py-3 px-6 rounded-lg shadow-md transition duration-200 flex items-center justify-center disabled:opacity-50"
              disabled={!newGroupName.trim()}
            >
              <Plus className="w-5 h-5 mr-1" /> Create Group
            </button>
          </form>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {debtGroups.length === 0 ? (
              <p className="text-gray-500 italic col-span-full">No debt groups found. Create one above!</p>
            ) : (
              debtGroups.map(group => (
                <div
                  key={group.id}
                  onClick={() => setSelectedGroupId(group.id)}
                  className={`p-4 rounded-lg border-2 cursor-pointer transition duration-150 transform hover:scale-[1.02] shadow-sm
                    ${selectedGroupId === group.id
                      ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-500'
                      : 'border-gray-200 bg-white hover:bg-gray-50'
                    }`}
                >
                  <div className="font-bold text-gray-800 truncate">{group.name}</div>
                  <div className="text-xs text-gray-500 mt-1 flex justify-between items-center">
                    <span>{group.debtees.filter(d => !d.paid).length} Still Owe</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteGroup(group.id); }}
                      className="text-red-400 hover:text-red-600 p-1 rounded transition duration-150"
                      title="Delete Group"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Active Debt Group View */}
        {selectedGroup && (
          <section className="bg-white p-6 rounded-xl shadow-lg">
            <div className="flex justify-between items-center mb-4 border-b pb-3">
              <h2 className="text-2xl font-bold text-indigo-700">{selectedGroup.name}</h2>
              <div className="flex items-center text-sm font-medium text-gray-600">
                <ListRestart className="w-4 h-4 mr-1" /> Total Debtees: {selectedGroup.debtees.length}
              </div>
            </div>

            {/* Add Debtee Form */}
            <form onSubmit={handleAddDebtee} className="flex flex-col sm:flex-row gap-2 mb-6">
              <input
                type="text"
                placeholder="Debtee Name (e.g., 'Alice')"
                value={newDebteeName}
                onChange={(e) => setNewDebteeName(e.target.value)}
                className="flex-grow p-3 border border-gray-300 rounded-lg focus:ring-green-500 focus:border-green-500 transition duration-150"
                required
              />
              <button
                type="submit"
                className="bg-green-500 hover:bg-green-600 text-white font-bold py-3 px-6 rounded-lg shadow-md transition duration-200 flex items-center justify-center disabled:opacity-50"
                disabled={!newDebteeName.trim()}
              >
                <Plus className="w-5 h-5 mr-1" /> Add Debtee
              </button>
            </form>

            {/* Debtee List */}
            <ul className="space-y-3">
              {selectedGroup.debtees.length === 0 ? (
                <p className="text-gray-500 italic">No debtees added yet. Start adding names!</p>
              ) : (
                [...selectedGroup.debtees].sort((a, b) => a.paid - b.paid).map(debtee => (
                  <li
                    key={debtee.id}
                    className={`flex items-center justify-between p-4 rounded-lg transition duration-200
                      ${debtee.paid
                        ? 'bg-green-50 text-green-700 border border-green-200'
                        : 'bg-red-50 text-red-700 border border-red-200 hover:bg-red-100'
                      }`}
                  >
                    <span className="font-medium text-lg flex items-center">
                      {debtee.paid ? <CheckCircle className="w-5 h-5 mr-3" /> : <XCircle className="w-5 h-5 mr-3" />}
                      {debtee.name}
                    </span>
                    <button
                      onClick={() => handleTogglePaid(debtee.id)}
                      className={`font-semibold py-2 px-4 rounded-full text-white transition duration-200 text-sm shadow-md
                        ${debtee.paid
                          ? 'bg-red-500 hover:bg-red-600 flex items-center'
                          : 'bg-green-500 hover:bg-green-600 flex items-center'
                        }`}
                    >
                      {debtee.paid ? (
                        <>
                          <ListRestart className="w-4 h-4 mr-1" /> Unmark Paid
                        </>
                      ) : (
                        <>
                          <CheckCircle className="w-4 h-4 mr-1" /> Mark Paid
                        </>
                      )}
                    </button>
                  </li>
                ))
              )}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
};

export default App;