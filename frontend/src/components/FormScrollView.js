import React from 'react';
import { KeyboardAvoidingView, Platform, ScrollView } from 'react-native';

// The scrolling body of a screen with text inputs. It holds the two keyboard
// rules every form needs, so a new form screen can't forget one:
// - keyboardShouldPersistTaps="handled": with the keyboard up, a tap on a
//   button presses it (by default the first tap only closes the keyboard).
// - KeyboardAvoidingView: the scroll area ends at the keyboard, so fields and
//   buttons below it can still be scrolled into view.
// Props go to the ScrollView. A screen whose main button is pinned below the
// scroll (AddPet's footer) keeps its own KeyboardAvoidingView around both.
export default function FormScrollView({ children, ...scrollProps }) {
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" {...scrollProps}>
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
