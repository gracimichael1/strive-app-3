import React, { Suspense } from 'react';
import { TierProvider } from './context/TierContext';
import './styles/global.css';

const LegacyApp = React.lazy(() => import('./LegacyApp'));

export default function App() {
  return (
    <TierProvider>
      <Suspense fallback={<div style={{ background: '#070c16', minHeight: '100vh' }} />}>
        <LegacyApp />
      </Suspense>
    </TierProvider>
  );
}
