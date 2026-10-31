import React from 'react';
import { Stack } from 'expo-router';
import EventTeamScreen from './team';

export default function EventDetailScreen() {
  return <><Stack.Screen options={{ title: 'นัดหมาย' }} /><EventTeamScreen /></>;
}
