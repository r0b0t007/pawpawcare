import React, { forwardRef, useState } from 'react';
import { View, Text, TextInput, Pressable } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ui, radii } from '../theme';

const HIT = { top: 8, bottom: 8, left: 8, right: 8 };

// One labelled input: the label sits above (never a placeholder-as-label), the
// border turns accent on focus, and `secure` adds a show/hide toggle so a
// password can be checked instead of retyped. Pass `revealed` (+ `onToggleReveal`)
// to control that from outside — e.g. one toggle revealing both of sign-up's
// password fields — and `showToggle={false}` on the field without the button.
// `children` render under the field (hints, helper links, live checks). Any
// other prop goes straight to the TextInput, and the ref reaches it (for
// Return-to-next-field chains).
const TextField = forwardRef(function TextField(
  {
    label, secure = false, revealed, onToggleReveal, showToggle = true, toggleLabel,
    children, style, inputStyle, onFocus, onBlur, accessibilityLabel, ...inputProps
  },
  ref,
) {
  const [focused, setFocused] = useState(false);
  const [ownShown, setOwnShown] = useState(false);
  const shown = revealed ?? ownShown;
  const toggle = onToggleReveal ?? (() => setOwnShown((v) => !v));
  const withToggle = secure && showToggle;

  return (
    <View style={style}>
      {label ? (
        <Text style={{ fontFamily: 'PlusJakartaSans_700Bold', fontSize: 13, color: ui.ink, marginBottom: 8 }}>
          {label}
        </Text>
      ) : null}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          borderWidth: 1.5,
          borderColor: focused ? ui.accent : ui.inputBorder,
          backgroundColor: ui.surface,
          borderRadius: radii.md,
          borderCurve: 'continuous',
          paddingRight: withToggle ? 14 : 0,
        }}
      >
        <TextInput
          ref={ref}
          placeholderTextColor={ui.placeholder}
          {...inputProps}
          secureTextEntry={secure && !shown}
          accessibilityLabel={accessibilityLabel ?? label}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={[
            {
              flex: 1,
              paddingVertical: 14,
              paddingHorizontal: 14,
              fontFamily: 'PlusJakartaSans_500Medium',
              fontSize: 15,
              color: ui.ink,
            },
            inputStyle,
          ]}
        />
        {withToggle ? (
          <Pressable
            onPress={toggle}
            hitSlop={HIT}
            accessibilityRole="button"
            accessibilityLabel={`${shown ? 'Hide' : 'Show'} ${toggleLabel || 'password'}`}
          >
            <MaterialCommunityIcons name={shown ? 'eye-off-outline' : 'eye-outline'} size={20} color={ui.subtle} />
          </Pressable>
        ) : null}
      </View>
      {children}
    </View>
  );
});

export default TextField;
