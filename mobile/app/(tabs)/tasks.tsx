import React from 'react';
import { useAuth } from '../../src/context/auth';
import MemberTasksScreen from '../../src/screens/MemberTasksScreen';
import LeadTasksScreen from '../../src/screens/LeadTasksScreen';

export default function TasksTab() {
  const { user, activeRole } = useAuth();
  const isLead = (activeRole ?? user?.role) === 'team_lead';
  return isLead ? <LeadTasksScreen /> : <MemberTasksScreen />;
}
