import React from 'react';
import { useAuth } from '../../src/context/auth';
import LeadTeamsScreen from '../../src/screens/LeadTeamsScreen';
import MemberOverviewScreen from '../../src/screens/MemberOverviewScreen';

export default function HomeTab() {
  const { user, activeRole } = useAuth();
  if ((activeRole ?? user?.role) === 'team_lead') return <LeadTeamsScreen />;
  return <MemberOverviewScreen />;
}
