import React from 'react';
import { Switch } from 'react-native';
import { ui } from '../theme';

// The one switch look: filled accent track with a white knob when on, the
// neutral track when off. Pass value/onValueChange/accessibilityLabel as for
// Switch.
export default function Toggle(props) {
  return (
    <Switch
      trackColor={{ false: ui.track, true: ui.accent }}
      thumbColor={ui.onAccent}
      // react-native-web ignores thumbColor and paints its own teal default.
      activeThumbColor={ui.onAccent}
      ios_backgroundColor={ui.track}
      {...props}
    />
  );
}
