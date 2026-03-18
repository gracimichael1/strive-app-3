import React from 'react';
import { TierProvider } from './context/TierContext';
import './styles/global.css';
import LegacyApp from './LegacyApp';

export default function App() {
  return (
    <TierProvider>
      <LegacyApp />
    </TierProvider>
  );
}
