import React from 'react';
import { getSessionFromRequest } from '@/lib/auth';
import { PricingClient } from './PricingClient';

export default async function PricingPage() {
  const session = await getSessionFromRequest();
  const isLoggedIn = Boolean(session);

  return <PricingClient initialIsLoggedIn={isLoggedIn} />;
}
