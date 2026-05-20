import React from 'react';
import { useAuth } from '../../src/context/auth';
import LeadMeetingsScreen from '../../src/screens/LeadMeetingsScreen';
import MemberMeetingsScreen from '../../src/screens/MemberMeetingsScreen';

export default function MeetingsTab() {
  const { user } = useAuth();
  if (user?.role === 'team_lead') return <LeadMeetingsScreen />;
  return <MemberMeetingsScreen />;
}
