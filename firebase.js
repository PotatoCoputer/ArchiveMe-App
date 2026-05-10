
import { initializeApp, getApps, getApp } from 'firebase/app';
import { initializeAuth, getReactNativePersistence } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { initializeFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: 'AIzaSyBdpv2dNS45ey5y0OPPEvo2I01lF_hHmx0',
  authDomain: 'archiveme-46f61.firebaseapp.com',
  projectId: 'archiveme-46f61',
  storageBucket: 'archiveme-46f61.appspot.com',
  messagingSenderId: '701249097523',
  appId: '1:701249097523:web:5ca0944dcdfa35285f3846',
};


const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();


export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage),
});


export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
  useFetchStreams: false, 
});

export const storage = getStorage(app);
