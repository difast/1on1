import React from 'react';
import { useAuth } from '../../src/context/auth';
import LeadAnalyticsScreen from '../../src/screens/LeadAnalyticsScreen';
import MemberAnalyticsScreen from '../../src/screens/MemberAnalyticsScreen';

export default function AnalyticsTab() {
  const { user } = useAuth();
  if (user?.role === 'team_lead') return <LeadAnalyticsScreen />;
  return <MemberAnalyticsScreen />;
}
